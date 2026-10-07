/* The providers that speak plain HTTPS, described once for both runtimes.
 *
 * The server's config.PROVIDERS spreads these rows in next to the runtime-backed providers
 * (Claude Agent SDK, Codex CLI); the phone reads them directly for its own picker. Keeping the
 * facts in one place is what stops the two ever offering different endpoints or defaults.
 *
 * `defaultModel` is a starting point, not a pin. Every one of these providers lists its models
 * over the same API, and the UI offers that list — a name typed here goes stale, a list does
 * not. `compatible` has no default at all: an OpenAI-compatible endpoint is whatever the owner
 * pointed it at, so the model has to come from what that endpoint actually serves.
 */
const BASE_PROVIDERS = {
  anthropic: Object.freeze({
    label: 'Anthropic API', runtime: 'HTTPS', http: true,
    apiKeyEnv: 'ANTHROPIC_API_KEY', oauthEnv: null,
    defaultBase: 'https://api.anthropic.com',
    defaultModel: 'claude-opus-5-5',
    keyPlaceholder: 'sk-ant-…'
  }),
  openai: Object.freeze({
    label: 'OpenAI API', runtime: 'HTTPS', http: true,
    apiKeyEnv: 'OPENAI_API_KEY', oauthEnv: null,
    defaultBase: 'https://api.openai.com',
    defaultModel: 'gpt-6.1-sol',
    keyPlaceholder: 'sk-…'
  }),
  gemini: Object.freeze({
    label: 'Google Gemini', runtime: 'HTTPS', http: true,
    apiKeyEnv: 'GEMINI_API_KEY', oauthEnv: null,
    defaultBase: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-3.8-flash',
    keyPlaceholder: 'AIza… or AQ.…'
  }),
  // Ollama, LM Studio, vLLM, OpenRouter, a corporate gateway: anything that serves the
  // Chat Completions shape. The base URL is the whole configuration; a key is optional
  // because a model on your own LAN usually has none.
  compatible: Object.freeze({
    label: 'OpenAI-compatible endpoint', runtime: 'HTTPS', http: true,
    apiKeyEnv: 'OPENAI_COMPAT_API_KEY', oauthEnv: null,
    defaultBase: null, baseUrl: true, keyOptional: true,
    defaultModel: null,
    keyPlaceholder: '(optional)'
  })
};

/* Hosted services that speak the same Chat Completions shape as `compatible`, with their
 * endpoint built in so all that is left to paste is a key. Each runs on the compatible adapter's
 * request shape (core/adapters/presets.js); nothing else in the codebase knows which one it is.
 * No default model: these catalogues change monthly, and "List models" asks the provider. */
const preset = (label, defaultBase, keyPlaceholder, apiKeyEnv) => Object.freeze({
  label, runtime: 'HTTPS', http: true, compat: true,
  apiKeyEnv, oauthEnv: null, defaultBase, defaultModel: null, keyPlaceholder
});
export const COMPAT_PRESETS = Object.freeze({
  openrouter: preset('OpenRouter', 'https://openrouter.ai/api/v1', 'sk-or-…', 'OPENROUTER_API_KEY'),
  deepinfra: preset('DeepInfra', 'https://api.deepinfra.com/v1/openai', 'DeepInfra API token', 'DEEPINFRA_API_KEY'),
  groq: preset('Groq', 'https://api.groq.com/openai/v1', 'gsk_…', 'GROQ_API_KEY'),
  together: preset('Together AI', 'https://api.together.xyz/v1', 'Together API key', 'TOGETHER_API_KEY'),
  mistral: preset('Mistral', 'https://api.mistral.ai/v1', 'Mistral API key', 'MISTRAL_API_KEY'),
  xai: preset('xAI (Grok)', 'https://api.x.ai/v1', 'xai-…', 'XAI_API_KEY'),
  deepseek: preset('DeepSeek', 'https://api.deepseek.com/v1', 'sk-…', 'DEEPSEEK_API_KEY'),
  fireworks: preset('Fireworks AI', 'https://api.fireworks.ai/inference/v1', 'fw_…', 'FIREWORKS_API_KEY'),
  cerebras: preset('Cerebras', 'https://api.cerebras.ai/v1', 'csk-…', 'CEREBRAS_API_KEY')
});

export const HTTP_PROVIDERS = Object.freeze({ ...BASE_PROVIDERS, ...COMPAT_PRESETS });
export const HTTP_PROVIDER_IDS = Object.freeze(Object.keys(HTTP_PROVIDERS));

/** The base URL a provider will actually be called at: the configured override, else the default. */
export function baseUrlFor(id, cfg) {
  const meta = HTTP_PROVIDERS[id];
  const set = cfg && cfg.providerOptions && cfg.providerOptions[id] && cfg.providerOptions[id].baseUrl;
  const raw = (typeof set === 'string' && set.trim()) || (meta && meta.defaultBase) || '';
  return raw.replace(/\/+$/, '');
}

/**
 * Only http(s), only a parseable URL, and never credentials in it — a base URL is admin
 * configuration, but "admin-configured" and "safe to log" are different properties, and the
 * host is written into the job log so an operator can see where jobs went.
 */
export function validateBaseUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return { ok: true, value: null };
  let u;
  try { u = new URL(s); } catch { return { ok: false, error: 'not a valid URL' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'only http:// and https:// endpoints are supported' };
  if (u.username || u.password) return { ok: false, error: 'put the key in the credential field, not in the URL' };
  if (u.search || u.hash) return { ok: false, error: 'a base URL has no query string' };
  return { ok: true, value: u.toString().replace(/\/+$/, '') };
}
