/**
 * Determines if a team covered the spread in a game.
 * @param {object} game - The game object containing scores, spread, and team info.
 * @param {string} teamName - The name of the team to check.
 * @returns {boolean|null} - True if covered, false if not, null if game not finished or invalid spread.
 */
export const didTeamCover = (game, teamName) => {
  if (game.status !== "finished" && game.status !== "post") return null;
  if (!game.spread || !game.spread.includes(" ")) return null;

  // Parse spread string (e.g., "KAN -5.5")
  // Use regex to split on whitespace and filter out empty strings
  // This handles cases with multiple spaces (e.g., "KAN  -5.5")
  const parts = game.spread
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  // Ensure we have at least 2 parts (team abbreviation and spread value)
  if (parts.length < 2) return null;

  const spreadTeamAbbrev = parts[0];
  // The spread value should be the last part (handles multi-word team names)
  const spreadValue = parseFloat(parts[parts.length - 1]);

  if (isNaN(spreadValue)) return null;

  // Determine which team is the "spread team" (the one associated with the abbreviation)
  let isSpreadTeam = false;
  if (game.team_a_abbrev === spreadTeamAbbrev) {
    if (teamName === game.team_a) isSpreadTeam = true;
  } else if (game.team_b_abbrev === spreadTeamAbbrev) {
    if (teamName === game.team_b) isSpreadTeam = true;
  } else {
    // Fallback: sometimes abbreviations might not match exactly or might be missing.
    // If we can't match, we can't safely determine cover.
    // However, usually the spread string uses standard abbreviations.
    // Let's try to match by first letter or common sense if abbrev is missing?
    // For now, strict matching is safer.
    return null;
  }

  // Calculate margin from the perspective of the team we are checking
  // Ensure scores are valid numbers
  if (game.result_a == null || game.result_b == null) return null;

  const margin =
    teamName === game.team_a
      ? game.result_a - game.result_b
      : game.result_b - game.result_a;

  // If the team we are checking is the one in the spread string (e.g. KAN in "KAN -5.5"),
  // then we add the spread value to their margin.
  // Example: KAN wins by 6. Spread is -5.5. Margin 6 + (-5.5) = 0.5 > 0. Cover.
  // Example: KAN wins by 5. Spread is -5.5. Margin 5 + (-5.5) = -0.5 < 0. No cover.
  //
  // If the team we are checking is NOT the spread team (the opponent),
  // then their "effective spread" is the negation of the spread value.
  // Example: Opponent loses by 6. Spread was KAN -5.5.
  // Opponent margin is -6. Effective spread for opponent is +5.5.
  // -6 + 5.5 = -0.5 < 0. No cover.

  const effectiveSpread = isSpreadTeam ? spreadValue : -spreadValue;

  return margin + effectiveSpread > 0;
};
