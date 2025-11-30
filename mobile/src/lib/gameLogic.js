/**
 * Determines if a team covered the spread in a game.
 * @param {object} game - The game object containing scores, spread, and team info.
 * @param {string} teamName - The name of the team to check.
 * @returns {boolean|null} - True if covered, false if not, null if game not finished or invalid spread.
 */
export const didTeamCover = (game, teamName) => {
    if (game.status !== 'finished' && game.status !== 'post') return null;
    if (!game.spread || !game.spread.includes(' ')) return null;

    // Parse spread string (e.g., "KAN -5.5")
    const parts = game.spread.split(' ');
    const spreadTeamAbbrev = parts[0];
    const spreadValue = parseFloat(parts[1]);

    if (isNaN(spreadValue)) return null;

    // Determine which team is the "spread team" (the one associated with the abbreviation)
    let isSpreadTeam = false;
    if (game.team_a_abbrev === spreadTeamAbbrev) {
        if (teamName === game.team_a) isSpreadTeam = true;
    } else if (game.team_b_abbrev === spreadTeamAbbrev) {
        if (teamName === game.team_b) isSpreadTeam = true;
    } else {
        return null;
    }

    // Calculate margin from the perspective of the team we are checking
    const margin = teamName === game.team_a
        ? game.result_a - game.result_b
        : game.result_b - game.result_a;

    const effectiveSpread = isSpreadTeam ? spreadValue : -spreadValue;

    return (margin + effectiveSpread) > 0;
};

