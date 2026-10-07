/* The hosted OpenAI-compatible services in providers.COMPAT_PRESETS, one adapter each.
 *
 * Same request shape as the generic compatible endpoint — `max_tokens`, temperature 0, JSON
 * mode with the plain-JSON fallback — because that is what these services implement. Only the
 * id differs, and with it the built-in base URL and the variable the key travels in.
 */
import { httpAdapter } from './http.js';
import { chatCompletionsSpec } from './openai.js';
import { COMPAT_PRESETS } from '../providers.js';

export const PRESET_ADAPTERS = Object.freeze(Object.fromEntries(
  Object.keys(COMPAT_PRESETS).map(id => [id, httpAdapter(chatCompletionsSpec(id, { maxTokensField: 'max_tokens', temperature: 0 }))])
));
export default PRESET_ADAPTERS;
