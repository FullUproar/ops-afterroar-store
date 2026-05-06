// profile-game.mjs
// ============================================================================
// Game-profile generation pipeline.
//
// Pure module, no I/O. Takes:
//   - BGG metadata for a single game
//   - the dimension taxonomy (data/dimensions.json)
//   - an injectable LLM client with a .generate(prompt, options) method
//
// Returns a validated profile object ready for DB write, OR throws.
//
// I/O happens in scripts/profile-game.mjs (the CLI wrapper):
//   - file reads of BGG metadata + dimensions.json
//   - real Anthropic SDK instantiation (when ANTHROPIC_API_KEY is present)
//   - DB write to rec_seidr_game_profile
//
// This separation keeps the pipeline unit-testable with a mock LLM client
// and isolates the production-only Anthropic dependency.
// ============================================================================

import { renderPrompt, parseLLMResponse, PROMPT_VERSION } from './prompt-template.mjs';
import { validateProfile, extractDimIds } from './validate-profile.mjs';

/**
 * Generate one validated profile for a single game.
 *
 * @param {object} game           - parsed BGG metadata
 * @param {object} dimensionsJson - parsed data/dimensions.json
 * @param {object} llmClient      - object with .generate(prompt, options) -> Promise<string>
 * @param {object} [options]
 * @param {string} [options.modelVersionTag] - override the model_version field on the profile
 * @returns {Promise<object>} the validated profile
 *
 * Pipeline:
 *   1. Render the prompt from BGG metadata + dimension taxonomy
 *   2. Call the LLM client; receive raw response string
 *   3. Parse to JSON (tolerating common formatting deviations)
 *   4. Stamp source_provenance, prompt_version, model_version (if missing)
 *   5. Validate against the dimension list
 *   6. Throw if validation fails -- caller decides whether to retry or skip
 */
export async function generateProfile(game, dimensionsJson, llmClient, options = {}) {
  if (!game || typeof game !== 'object') {
    throw new Error('generateProfile: game must be an object');
  }
  if (!dimensionsJson || !Array.isArray(dimensionsJson.dimensions)) {
    throw new Error('generateProfile: dimensionsJson must include a .dimensions array');
  }
  if (!llmClient || typeof llmClient.generate !== 'function') {
    throw new Error('generateProfile: llmClient must have a .generate(prompt, options) method');
  }

  const prompt = renderPrompt(game, dimensionsJson);
  const raw = await llmClient.generate(prompt, { gameId: game.id, gameName: game.name });
  const parsed = parseLLMResponse(raw);

  // stamp metadata. If the LLM included these fields they're authoritative;
  // we only fill missing ones.
  parsed.source_provenance ||= 'llm_generated';
  parsed.prompt_version ||= PROMPT_VERSION;
  if (options.modelVersionTag && !parsed.model_version) {
    parsed.model_version = options.modelVersionTag;
  }

  const dimIds = extractDimIds(dimensionsJson);
  const v = validateProfile(parsed, dimIds);
  if (!v.ok) {
    throw new Error(
      `generateProfile: validation failed for game_id=${game.id} (${game.name}):\n  - ` +
        v.errors.join('\n  - ')
    );
  }

  // Contract check: LLM must echo back the requested game_id. Any deviation
  // is a prompt-following failure that we can't safely paper over.
  if (parsed.game_id !== game.id) {
    throw new Error(
      `generateProfile: LLM returned game_id ${parsed.game_id} for requested game_id ${game.id} (${game.name}). ` +
        `Refusing to write a profile that doesn't match the requested game.`
    );
  }

  return parsed;
}

/**
 * Generate profiles for a batch of games. Sequential (deliberately serial
 * to avoid hammering the LLM rate limit; the production caller can change
 * concurrency strategy if needed).
 *
 * @param {object[]} games           - array of BGG metadata objects
 * @param {object} dimensionsJson
 * @param {object} llmClient
 * @param {object} [options]
 * @returns {Promise<{ ok: object[], failed: { game_id: number, name: string, error: string }[] }>}
 *   - ok: array of validated profiles
 *   - failed: array of failures with diagnostic info
 */
export async function generateBatch(games, dimensionsJson, llmClient, options = {}) {
  if (!Array.isArray(games)) {
    throw new Error('generateBatch: games must be an array');
  }

  const ok = [];
  const failed = [];

  for (const game of games) {
    try {
      const profile = await generateProfile(game, dimensionsJson, llmClient, options);
      ok.push(profile);
    } catch (err) {
      failed.push({
        game_id: game?.id,
        name: game?.name,
        error: err.message,
      });
    }
  }

  return { ok, failed };
}

/**
 * A simple in-memory mock LLM client for tests + dry runs.
 *
 * Constructed with a `responseFor(game) -> string` function. The returned
 * client has a `.generate(prompt, options)` method that returns whatever
 * `responseFor` produces for the (game) referenced by options.gameId.
 *
 * Tests use this with a responseFor that returns canned JSON to verify
 * the pipeline glue without making a real API call.
 */
export function createMockLLMClient(responseFor) {
  if (typeof responseFor !== 'function') {
    throw new Error('createMockLLMClient: responseFor must be a function');
  }
  return {
    generate: async (_prompt, options = {}) => {
      const result = responseFor(options);
      if (typeof result !== 'string') {
        throw new Error(`mock LLM client: responseFor returned non-string for ${JSON.stringify(options)}`);
      }
      return result;
    },
  };
}
