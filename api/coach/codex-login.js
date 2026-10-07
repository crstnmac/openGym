/* Sign the Codex CLI in with a ChatGPT subscription, from the admin card.
 *
 * Codex has no token you can paste: a ChatGPT login is a device-code flow that leaves a
 * refreshable cache (auth.json) in $CODEX_HOME. So the server runs `codex login --device-auth`
 * itself, reads the one-time code and the link it prints, and hands those two strings to the
 * admin's browser. The admin approves the code on OpenAI's own page; the CLI, still polling,
 * writes the cache into CREDENTIAL_HOME and exits 0.
 *
 * What this module never sees is the credential. The tokens go from OpenAI to the CLI to a
 * file owned by the `coach` user — the same file every Codex job reads. What gets filed in
 * coach.json is a marker that a login exists and whose it is, so the rest of the Coach (the
 * admin card, credentialFor, the shared-account binding) treats it like any other credential.
 *
 * One login at a time, held in memory: a second start while one is pending returns the
 * pending one, so a double-click cannot leave two CLIs polling for the same account.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as cfgStore from './config.js';
import { unprivilegedIds, canDropPrivileges } from './adapters/spawn.js';

const CLI = 'codex';
// File storage, never the OS keyring: a container has no keyring, and a keyring entry would not
// be readable by the job process anyway. Passed on every Codex invocation, login and jobs alike,
// so the cache is written and read in the same place.
export const STORE_OVERRIDE = ['-c', 'cli_auth_credentials_store="file"'];
export const LOGIN_ARGV = ['login', '--device-auth', ...STORE_OVERRIDE];
export const LOGOUT_ARGV = ['logout', ...STORE_OVERRIDE];
export const CREDENTIAL_TYPE = 'chatgpt-cli';
// The CLI gives up after 15 minutes; this is the backstop if it ever does not.
const LOGIN_TTL_MS = 16 * 60 * 1000;
// How long `start` waits for the CLI to print its code before reporting what it has.
const PRINT_WAIT_MS = 20000;

let current = null;   // { child, status, url, code, error, startedAt, account, timer }

// The CLI colours its output; the code and the link are read from the text underneath.
const stripAnsi = s => String(s || '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

/** Pull the verification link and the one-time code out of whatever the CLI has printed. */
export function parseDeviceOutput(raw) {
  const text = stripAnsi(raw);
  const url = (text.match(/https:\/\/[^\s"')<>]+/) || [])[0] || null;
  // OpenAI's codes are two dash-joined groups of letters and digits (e.g. "ABCD-12345"). The
  // line after "one-time code" is preferred; anything code-shaped elsewhere is the fallback.
  const after = text.split(/one-time code/i)[1] || '';
  const re = /\b[A-Z0-9]{4,}-[A-Z0-9]{4,}\b/;
  const code = (after.match(re) || text.match(re) || [])[0] || null;
  return { url, code };
}

function env() {
  return {
    PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    HOME: cfgStore.CREDENTIAL_HOME,
    CODEX_HOME: cfgStore.CREDENTIAL_HOME
  };
}

export const authFilePath = () => path.join(cfgStore.CREDENTIAL_HOME, 'auth.json');
export const hasLoginCache = () => { try { return fs.statSync(authFilePath()).size > 0; } catch { return false; } };

/** What the admin card polls. Strings only — never the CLI's raw output. */
export function status() {
  if (!current) return { status: 'idle' };
  const { status: s, url, code, error, startedAt } = current;
  return { status: s, url, code, error: error || null, startedAt };
}

function finish(patch) {
  if (!current) return;
  clearTimeout(current.timer);
  Object.assign(current, patch, { child: null });
}

/** Test seam: replace how the CLI is started. */
let spawnImpl = spawn;
export function _setSpawn(fn) { spawnImpl = fn || spawn; }
export function _reset() { if (current?.child) { try { current.child.kill('SIGTERM'); } catch { /* gone */ } } current = null; }

/**
 * Start a device-code login, or return the one already pending. Resolves once the CLI has
 * printed its link and code (or failed, or PRINT_WAIT_MS passed) — the login itself carries on
 * in the background until the admin approves it, it expires, or it is cancelled.
 */
export function start({ account = '' } = {}) {
  if (current && current.status === 'pending') return Promise.resolve(status());
  const priv = canDropPrivileges();
  if (!priv.ok) return Promise.resolve({ status: 'failed', error: priv.why });

  return new Promise(resolve => {
    const ids = unprivilegedIds();
    let child;
    try {
      child = spawnImpl(CLI, LOGIN_ARGV, { env: env(), cwd: cfgStore.CREDENTIAL_HOME, stdio: ['ignore', 'pipe', 'pipe'], ...(ids || {}) });
    } catch (e) {
      current = { status: 'failed', error: `could not start the ${CLI} CLI: ${e.message}`, startedAt: new Date().toISOString() };
      return resolve(status());
    }
    let out = '';
    let answered = false;
    const answer = () => { if (!answered) { answered = true; resolve(status()); } };
    current = {
      child, status: 'pending', url: null, code: null, error: null,
      startedAt: new Date().toISOString(), account: String(account || '').slice(0, 120),
      timer: setTimeout(() => { try { child.kill('SIGTERM'); } catch { /* gone */ } finish({ status: 'failed', error: 'the sign-in expired — start it again' }); }, LOGIN_TTL_MS)
    };
    // Neither timer may hold the process open: a pending sign-in is not a reason to outlive
    // a shutdown, and the test runner waits for every live timer before it exits.
    current.timer.unref?.();
    const mine = current;
    const onData = chunk => {
      out += chunk;
      if (out.length > 20000) out = out.slice(-20000);
      const { url, code } = parseDeviceOutput(out);
      if (url && !mine.url) mine.url = url;
      if (code && !mine.code) mine.code = code;
      if (mine.url && mine.code) answer();
    };
    child.stdout?.setEncoding?.('utf8'); child.stderr?.setEncoding?.('utf8');
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('error', e => {
      if (current !== mine) return;
      finish({ status: 'failed', error: e.code === 'ENOENT' ? `the ${CLI} CLI is not installed in this image — build the api with API_TARGET=coach` : e.message });
      answer();
    });
    child.on('close', code => {
      if (current !== mine || mine.status !== 'pending') return answer();
      if (code === 0 && hasLoginCache()) {
        cfgStore.saveAuth('codex', {
          type: CREDENTIAL_TYPE, account: mine.account || 'ChatGPT account',
          // A marker, not a secret: the tokens live in CREDENTIAL_HOME/auth.json, owned by the
          // `coach` user. Encrypted like every other record so the shape stays uniform.
          data: cfgStore.encrypt({ token: CREDENTIAL_TYPE }),
          connectedAt: new Date().toISOString()
        });
        finish({ status: 'done' });
      } else {
        // The last meaningful line the CLI printed, minus anything that looks like a code.
        const last = stripAnsi(out).split('\n').map(l => l.trim()).filter(l => l && !/^warning:/i.test(l)).pop() || '';
        finish({ status: 'failed', error: (last.replace(/\b[A-Z0-9]{4,}-[A-Z0-9]{4,}\b/g, '…') || `${CLI} login exited ${code}`).slice(0, 300) });
      }
      answer();
    });
    setTimeout(answer, PRINT_WAIT_MS).unref?.();
  });
}

/** Stop a pending login. Nothing is filed; a cache the CLI never finished writing is left alone. */
export function cancel() {
  if (current && current.status === 'pending') {
    try { current.child?.kill('SIGTERM'); } catch { /* gone */ }
    finish({ status: 'cancelled' });
  }
  return status();
}

/** Remove the ChatGPT login cache — the half of "disconnect" that coach.json cannot do. */
export function logout() {
  cancel();
  return new Promise(resolve => {
    let child;
    try {
      child = spawnImpl(CLI, LOGOUT_ARGV, { env: env(), cwd: cfgStore.CREDENTIAL_HOME, stdio: 'ignore', ...(unprivilegedIds() || {}) });
    } catch { return resolve(false); }
    child.on('error', () => resolve(false));
    child.on('close', code => resolve(code === 0));
  });
}
