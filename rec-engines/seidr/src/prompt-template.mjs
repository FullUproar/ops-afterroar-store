// prompt-template.mjs
// ============================================================================
// LLM prompt template for game-profile generation.
//
// This module produces the prompt string fed to a language model when
// generating a 24-dim profile for a single game. The template is version-
// tagged so that profiles in the DB can be traced back to the exact prompt
// that produced them. When the prompt changes, bump the version; existing
// profiles are NOT regenerated automatically -- they're marked superseded
// and a fresh run is triggered manually.
//
// Design principles:
//   - Output structure is rigid (JSON only, no prose) so parsing is reliable
//   - Each dimension is described in plain English so the model has context
//   - The model is asked for confidence_per_dim alongside dim_vector --
//     a profile that admits uncertainty is more valuable than one that
//     guesses confidently
//   - The prompt anchors on BGG metadata (mechanics, weight, time, designers)
//     because those are the durable structured signals; descriptions and
//     reviews would amplify hype-bias
//
// Tests live in seidr/tests/prompt-template.test.mjs.
// ============================================================================

export const PROMPT_VERSION = '1.0.0';

/**
 * Render the LLM prompt for profiling a single game.
 *
 * @param {object} game            - parsed BGG metadata (per fetch-bgg.mjs format)
 * @param {object} dimensionsJson  - parsed data/dimensions.json structure
 * @returns {string} prompt
 */
export function renderPrompt(game, dimensionsJson) {
  if (!game || typeof game !== 'object') {
    throw new Error('renderPrompt: game must be an object');
  }
  if (!dimensionsJson || !Array.isArray(dimensionsJson.dimensions)) {
    throw new Error('renderPrompt: dimensionsJson must include a .dimensions array');
  }

  const dimList = dimensionsJson.dimensions
    .map(d => `  - ${d.id} (cluster ${d.cluster}): low="${d.low}" → high="${d.high}"`)
    .join('\n');

  const mechanicsList = (game.mechanics || []).map(m => m.value).join(', ') || '(none listed)';
  const categoriesList = (game.categories || []).map(c => c.value).join(', ') || '(none listed)';
  const designersList = (game.designers || []).map(d => d.value).join(', ') || '(none listed)';

  return `You are profiling a tabletop game across 24 dimensions for a recommendation system. Your output is consumed programmatically; output JSON only with no prose, no markdown fencing, no explanation.

GAME METADATA (from BoardGameGeek):
  Name: ${game.name}
  Year: ${game.year ?? 'unknown'}
  BGG Weight: ${game.weight ?? 'unknown'} (1.0 = trivially light, 5.0 = extremely heavy)
  Player count: ${game.minPlayers ?? '?'}–${game.maxPlayers ?? '?'}
  Playing time: ${game.minPlayTime ?? game.playingTime ?? '?'}–${game.maxPlayTime ?? game.playingTime ?? '?'} minutes
  Designers: ${designersList}
  Mechanics: ${mechanicsList}
  Categories: ${categoriesList}
  BGG Rank: ${game.bggRank ?? 'unranked'}

DIMENSIONS TO SCORE (each is a [-1, 1] axis, with -1 = strongly the "low" pole, +1 = strongly the "high" pole, 0 = neutral or balanced):
${dimList}

OUTPUT REQUIREMENTS:
1. Output a single JSON object with these exact keys: game_id, dim_vector, confidence_per_dim, source_provenance, model_version, prompt_version, narrative
2. game_id must equal ${game.id} exactly
3. dim_vector must be an object whose keys are exactly the 24 dimension IDs above, values are numbers in [-1, 1]
4. confidence_per_dim must mirror dim_vector's keys; values are numbers in [0, 1] reflecting how confidently this dimension can be derived from the BGG metadata above + general game-design knowledge. ~0.95 for mechanically-derivable dims (weight, time, player count, mechanics-implied conflict level); ~0.65 for inferred emotional/motivational dims that need play-experience to confirm. NEVER report a confidence > 0.95 for a dim you couldn't directly observe; admitted uncertainty is more valuable than confident guesses.
5. source_provenance must be the literal string "llm_generated"
6. model_version should be your model identifier (e.g. "claude-sonnet-4-6")
7. prompt_version must be the literal string "${PROMPT_VERSION}"
8. narrative is 2-3 sentences in plain English describing the game in this dimensional space. No marketing language. No score-listing. Describe what the game FEELS like to play.

DIMENSION GUIDANCE:
- For PSY_KILLER, weight by direct conflict mechanics: pure-coop=-0.9, multiplayer-solitaire=-0.7, area-control=+0.5, dudes-on-a-map wargame=+0.8.
- For SOC_COOP_COMP: -1 means pure cooperative, +1 means zero-sum competitive, 0 means semi-cooperative or team-vs-team.
- For MEC_COMPLEXITY use the BGG weight as primary anchor, scaled to [-1, 1]: weight 1.0=-1.0, 2.5=0.0, 4.0=+0.7, 5.0=+1.0. Do not deviate by more than 0.2 unless the weight is clearly miscalibrated.
- For CTX_TIME: 15 min filler=-0.9, 60 min=-0.2, 120 min=+0.5, 4hr+=+0.9.
- For CTX_PLAYER_COUNT: solo/2P-preferring=-0.5, 3-4 sweetspot with broad range=0, party-game-large-group=+0.7.
- For all PSY_* (Big Five OCEAN dims): infer from what kind of player would enjoy this game, not what the game depicts.
- For AES_NARRATIVE: -0.8 if no story (chess), 0 if flavor-rich but no arc, +0.5 if scenario-based (Pandemic Legacy), +0.9 if multi-session campaign with branching.

Output the JSON object now.`;
}

/**
 * Parse and lightly normalize an LLM response.
 *
 * Real LLM responses sometimes include markdown fencing or trailing prose
 * despite the prompt's "JSON only" instruction. This helper strips common
 * variations and returns a parsed object, OR throws with a useful message.
 *
 * @param {string} rawResponse
 * @returns {object} parsed profile
 */
export function parseLLMResponse(rawResponse) {
  if (typeof rawResponse !== 'string' || rawResponse.length === 0) {
    throw new Error('parseLLMResponse: rawResponse must be a non-empty string');
  }

  let cleaned = rawResponse.trim();

  // strip ```json ... ``` markdown fencing if present
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // tolerate one leading/trailing prose line by extracting the outermost {...}
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace > 0 || lastBrace < cleaned.length - 1) {
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`parseLLMResponse: JSON.parse failed: ${err.message}\nRaw response: ${rawResponse.slice(0, 200)}`);
  }
}
