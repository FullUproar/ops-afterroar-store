// validate-profile.mjs
// ============================================================================
// Pure-function validator for seidr game profiles.
//
// A "game profile" is a 24-dim vector + per-dim confidence + provenance
// metadata. This module enforces the shape and the value ranges so that
// the LLM-generated profiles (or any other source) can be programmatically
// validated before they hit the rec_seidr_game_profile table.
//
// Used by:
//   - scripts/profile-game.mjs (live LLM pipeline) -- validate before DB write
//   - tests/                                       -- assertion machinery
//   - rec router (future, production-side)          -- defense in depth
//
// Single source of truth for the dimension list is data/dimensions.json;
// this module accepts an injectable dimension list so it stays decoupled
// from disk reads (allows pure-function testing with synthetic dim sets).
// ============================================================================

/**
 * Validate a single game profile object.
 *
 * @param {object} profile             - the profile to validate
 * @param {string[]} requiredDimIds    - the 24 dimension IDs that must be present
 * @returns {{ ok: boolean, errors: string[] }}
 *   - ok: true if no errors found
 *   - errors: array of human-readable validation error messages (empty if ok)
 *
 * Validation rules:
 *   1. game_id is a positive integer
 *   2. dim_vector is an object with exactly the required dim IDs as keys
 *   3. Each dim_vector value is a finite number in [-1, 1]
 *   4. confidence_per_dim is an object with the same keys as dim_vector
 *   5. Each confidence_per_dim value is a finite number in [0, 1]
 *   6. source_provenance is one of: llm_generated, manually_curated, play_inferred, hybrid
 *   7. If model_version, prompt_version, generated_at are present they're non-empty strings
 */
export function validateProfile(profile, requiredDimIds) {
  const errors = [];

  if (!profile || typeof profile !== 'object') {
    return { ok: false, errors: ['profile is not an object'] };
  }

  if (!Array.isArray(requiredDimIds) || requiredDimIds.length === 0) {
    return { ok: false, errors: ['requiredDimIds is not a non-empty array'] };
  }

  // game_id
  if (!Number.isInteger(profile.game_id) || profile.game_id <= 0) {
    errors.push(`game_id must be a positive integer; got ${JSON.stringify(profile.game_id)}`);
  }

  // dim_vector — shape
  const dv = profile.dim_vector;
  if (!dv || typeof dv !== 'object' || Array.isArray(dv)) {
    errors.push('dim_vector must be a plain object');
  } else {
    const dvKeys = new Set(Object.keys(dv));
    const required = new Set(requiredDimIds);
    for (const id of requiredDimIds) {
      if (!dvKeys.has(id)) {
        errors.push(`dim_vector missing required dimension: ${id}`);
      }
    }
    for (const k of dvKeys) {
      if (!required.has(k)) {
        errors.push(`dim_vector has unexpected key: ${k}`);
      }
    }
    // dim_vector — values
    for (const id of requiredDimIds) {
      const v = dv[id];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        errors.push(`dim_vector.${id} must be a finite number; got ${JSON.stringify(v)}`);
      } else if (v < -1 || v > 1) {
        errors.push(`dim_vector.${id} out of range [-1,1]; got ${v}`);
      }
    }
  }

  // confidence_per_dim — shape and values
  const cf = profile.confidence_per_dim;
  if (!cf || typeof cf !== 'object' || Array.isArray(cf)) {
    errors.push('confidence_per_dim must be a plain object');
  } else {
    const cfKeys = new Set(Object.keys(cf));
    const required = new Set(requiredDimIds);
    for (const id of requiredDimIds) {
      if (!cfKeys.has(id)) {
        errors.push(`confidence_per_dim missing required dimension: ${id}`);
      }
    }
    for (const k of cfKeys) {
      if (!required.has(k)) {
        errors.push(`confidence_per_dim has unexpected key: ${k}`);
      }
    }
    for (const id of requiredDimIds) {
      const v = cf[id];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        errors.push(`confidence_per_dim.${id} must be a finite number; got ${JSON.stringify(v)}`);
      } else if (v < 0 || v > 1) {
        errors.push(`confidence_per_dim.${id} out of range [0,1]; got ${v}`);
      }
    }
  }

  // source_provenance
  const validProvenance = new Set(['llm_generated', 'manually_curated', 'play_inferred', 'hybrid']);
  if (!validProvenance.has(profile.source_provenance)) {
    errors.push(
      `source_provenance must be one of ${[...validProvenance].join('|')}; got ${JSON.stringify(profile.source_provenance)}`
    );
  }

  // optional metadata — if present, must be non-empty strings
  for (const optKey of ['model_version', 'prompt_version']) {
    if (profile[optKey] !== undefined && profile[optKey] !== null) {
      if (typeof profile[optKey] !== 'string' || profile[optKey].length === 0) {
        errors.push(`${optKey} must be a non-empty string when present`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Validate a collection of profiles. Returns an aggregate result.
 *
 * @param {object[]} profiles
 * @param {string[]} requiredDimIds
 * @returns {{ ok: boolean, errors: { game_id: number|null, errors: string[] }[] }}
 */
export function validateProfiles(profiles, requiredDimIds) {
  if (!Array.isArray(profiles)) {
    return { ok: false, errors: [{ game_id: null, errors: ['profiles is not an array'] }] };
  }
  const results = profiles.map(p => ({
    game_id: p && typeof p === 'object' ? p.game_id ?? null : null,
    ...validateProfile(p, requiredDimIds),
  }));
  const failures = results.filter(r => !r.ok);
  if (failures.length === 0) {
    return { ok: true, errors: [] };
  }
  return {
    ok: false,
    errors: failures.map(f => ({ game_id: f.game_id, errors: f.errors })),
  };
}

/**
 * Convenience helper: load the canonical 24 dimension IDs from a parsed
 * dimensions.json structure. The IDs are the .id of each entry in
 * .dimensions[].
 */
export function extractDimIds(dimensionsJson) {
  if (!dimensionsJson || !Array.isArray(dimensionsJson.dimensions)) {
    throw new Error('dimensionsJson does not contain a .dimensions array');
  }
  return dimensionsJson.dimensions.map(d => d.id);
}
