import { lstat, readFile } from 'node:fs/promises';
import { nativeAnthropicProvider } from './chat-anthropic-provider.mjs';
import { nativeResponsesProvider } from './chat-model-provider.mjs';
/** One explicitly configured credential per home; never share a fallback key.
 * @param {any[]} homes */
export async function loadHouseModels(homes) {
  const models = new Map();
  for (const home of homes) {
    if (!home.model) continue;
    const config = home.model;
    if (
      !config ||
      typeof config !== 'object' ||
      Object.keys(config).some((k) => !['provider', 'model', 'keyFile'].includes(k)) ||
      typeof config.keyFile !== 'string' ||
      typeof config.model !== 'string' ||
      !config.model.trim() ||
      config.model.length > 200
    )
      throw Error('Explicit private home model configuration required');
    const st = await lstat(config.keyFile);
    if (!st.isFile() || st.isSymbolicLink() || st.mode & 0o077 || st.size > 2048 || st.size < 16)
      throw Error('Private credential file required');
    const key = (await readFile(config.keyFile, 'utf8')).trim();
    if (key.length < 16 || key.length > 1024 || /\s/.test(key))
      throw Error('Private credential file must contain only its key');
    const settings = { provider: config.provider, model: config.model, key };
    const provider =
      config.provider === 'anthropic'
        ? nativeAnthropicProvider(settings)
        : config.provider === 'openai'
          ? nativeResponsesProvider(settings)
          : null;
    if (!provider) throw Error('Configured home provider unavailable');
    models.set(home.homeId, provider);
  }
  return models;
}
