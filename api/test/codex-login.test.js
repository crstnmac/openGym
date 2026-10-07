/* Signing Codex in with a ChatGPT subscription.
 *
 * The CLI itself cannot run here (no network, no `coach` user), so these tests drive the module
 * with a fake child process that prints what `codex login --device-auth` prints and then exits
 * the way the real one does. What they pin down: the code and link are read correctly out of
 * coloured output, a successful login files a `chatgpt-cli` credential that only marks the login
 * (the tokens stay in the CLI's own cache), a failed or cancelled one files nothing, and the
 * credential is treated as one person's subscription.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { tempData } from './helpers.mjs';

tempData();
const credHome = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-auth-test-'));
process.env.COACH_CREDENTIAL_DIR = credHome;

const cfg = await import('../coach/config.js');
const login = await import('../coach/codex-login.js');
const { forcePrivilegeVerdict } = await import('../coach/adapters/spawn.js');
const { argvFor } = await import('../coach/adapters/codex.js');

const BLUE = '\x1b[94m', GRAY = '\x1b[90m', RESET = '\x1b[0m';
const PRINTED = `\n1. Open this link in your browser and sign in to your account\n   ${BLUE}https://auth.openai.com/codex/device${RESET}\n\n` +
  `2. Enter this one-time code ${GRAY}(expires in 15 minutes)${RESET}\n   ${BLUE}ABCD-12345${RESET}\n`;

/** A stand-in for the CLI's child process, driven by the test. */
function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.stdout.setEncoding = () => {}; child.stderr.setEncoding = () => {};
  child.killed = false;
  child.kill = () => { child.killed = true; setImmediate(() => child.emit('close', null)); };
  return child;
}

let spawned;
beforeEach(() => {
  login._reset();
  cfg.reset();
  cfg.save({ enabled: true, provider: 'codex', authMode: 'instance', auth: {}, boundUid: {} });
  try { fs.rmSync(path.join(credHome, 'auth.json')); } catch { /* none */ }
  forcePrivilegeVerdict({ ok: true, dropped: false, why: 'test' });
  spawned = [];
  login._setSpawn((cmd, argv, opts) => { const c = fakeChild(); spawned.push({ cmd, argv, opts, child: c }); return c; });
});

test('reads the link and the one-time code out of the coloured CLI output', () => {
  assert.deepEqual(login.parseDeviceOutput(PRINTED), { url: 'https://auth.openai.com/codex/device', code: 'ABCD-12345' });
  assert.deepEqual(login.parseDeviceOutput('nothing yet'), { url: null, code: null });
});

test('start runs the device login in CREDENTIAL_HOME with file storage and returns the code', async () => {
  const p = login.start({ account: 'me@example.test' });
  const { cmd, argv, opts, child } = spawned[0];
  assert.equal(cmd, 'codex');
  assert.deepEqual(argv, ['login', '--device-auth', '-c', 'cli_auth_credentials_store="file"']);
  assert.equal(opts.env.CODEX_HOME, credHome);
  assert.equal(opts.env.HOME, credHome);
  assert.equal(Object.keys(opts.env).sort().join(','), 'CODEX_HOME,HOME,PATH', 'nothing from the server environment');
  child.stdout.emit('data', PRINTED);
  const r = await p;
  assert.equal(r.status, 'pending');
  assert.equal(r.url, 'https://auth.openai.com/codex/device');
  assert.equal(r.code, 'ABCD-12345');
  // A second click while it is pending is the same login, not a second CLI.
  const again = await login.start();
  assert.equal(again.code, 'ABCD-12345');
  assert.equal(spawned.length, 1);
});

test('an approved login files a chatgpt-cli marker, never the tokens', async () => {
  const p = login.start({ account: 'me@example.test' });
  const { child } = spawned[0];
  child.stdout.emit('data', PRINTED);
  await p;
  fs.writeFileSync(path.join(credHome, 'auth.json'), JSON.stringify({ tokens: { refresh_token: 'rt-secret' } }));
  child.emit('close', 0);
  assert.equal(login.status().status, 'done');
  const rec = cfg.authFor(cfg.load(), 'codex');
  assert.equal(rec.type, 'chatgpt-cli');
  assert.equal(rec.account, 'me@example.test');
  assert.doesNotMatch(fs.readFileSync(path.join(process.env.DATA_DIR, 'coach.json'), 'utf8'), /rt-secret/);
  // It resolves like any other credential, and is one person's subscription.
  const c = cfg.credentialFor('alice');
  assert.equal(c.ok, true);
  assert.equal(cfg.isPersonalCredential(c.type), true);
  cfg.bindInstanceCredential('alice');
  assert.equal(cfg.credentialFor('bob').reason, 'shared-account');
});

test('a job never gets the marker as an API key — only CODEX_HOME', () => {
  cfg.saveAuth('codex', { type: 'chatgpt-cli', account: 'x', data: cfg.encrypt({ token: 'chatgpt-cli' }) });
  const env = cfg.jobEnv('/tmp/job', cfg.credentialFor('alice'));
  assert.equal(env.CODEX_API_KEY, undefined);
  assert.equal(env.CODEX_HOME, credHome);
});

test('a failed or expired login files nothing and reports the CLI\'s last line', async () => {
  const p = login.start();
  const { child } = spawned[0];
  child.stdout.emit('data', PRINTED);
  await p;
  child.stderr.emit('data', 'Error logging in with device code: device auth timed out after 15 minutes\n');
  child.emit('close', 1);
  const s = login.status();
  assert.equal(s.status, 'failed');
  assert.match(s.error, /timed out/);
  assert.equal(cfg.authFor(cfg.load(), 'codex'), null);
});

test('exit 0 without a written cache is not a login', async () => {
  const p = login.start();
  spawned[0].child.stdout.emit('data', PRINTED);
  await p;
  spawned[0].child.emit('close', 0);
  assert.equal(login.status().status, 'failed');
  assert.equal(cfg.authFor(cfg.load(), 'codex'), null);
});

test('cancel stops the CLI and files nothing', async () => {
  const p = login.start();
  const { child } = spawned[0];
  child.stdout.emit('data', PRINTED);
  await p;
  assert.equal(login.cancel().status, 'cancelled');
  assert.equal(child.killed, true);
  await new Promise(r => setImmediate(r));
  assert.equal(login.status().status, 'cancelled');
  assert.equal(cfg.authFor(cfg.load(), 'codex'), null);
});

test('no privilege drop, no login', async () => {
  forcePrivilegeVerdict({ ok: false, dropped: false, why: 'no `coach` user exists in this image' });
  const r = await login.start();
  assert.equal(r.status, 'failed');
  assert.equal(spawned.length, 0);
});

test('a missing CLI says which image to build', async () => {
  const p = login.start();
  const err = Object.assign(new Error('spawn codex ENOENT'), { code: 'ENOENT' });
  spawned[0].child.emit('error', err);
  const r = await p;
  assert.equal(r.status, 'failed');
  assert.match(r.error, /API_TARGET=coach/);
});

test('every Codex job reads its login from the file store', () => {
  assert.deepEqual(argvFor(null).slice(-2), ['-c', 'cli_auth_credentials_store="file"']);
});
