export const MAJOR_CONFERENCES = ["2", "4", "7", "8", "23"];
export const REGULAR_SEASON_PHASE = "regular_season";
export const CONFERENCE_TOURNAMENT_PHASE = "conference_tournament";
export const NBA_PLAYOFFS_PHASE = "nba_playoffs";

const CONFERENCE_TOURNAMENT_PATTERNS = [
  /acc tournament/i,
  /big ten tournament/i,
  /big 12 (tournament|championship)/i,
  /sec tournament/i,
  /big east tournament/i,
];

const NBA_PLAYOFF_INCLUDED_PATTERNS = [
  /east .* round/i,
  /west .* round/i,
  /conference semifinals?/i,
  /conference finals?/i,
  /nba finals?/i,
  /playoffs?/i,
];

const NBA_PLAYOFF_EXCLUDED_PATTERNS = [/play-?in/i];

export function getTournamentHeadlineFromCompetition(competition) {
  const notes = competition?.notes ?? [];
  const eventNote = notes.find((note) => typeof note?.headline === "string");

  return eventNote?.headline?.trim() || null;
}

export function hasMajorConferenceTeam(game) {
  const teamAConf =
    game.team_a_conf_id != null ? String(game.team_a_conf_id) : null;
  const teamBConf =
    game.team_b_conf_id != null ? String(game.team_b_conf_id) : null;

  return (
    (teamAConf != null && MAJOR_CONFERENCES.includes(teamAConf)) ||
    (teamBConf != null && MAJOR_CONFERENCES.includes(teamBConf))
  );
}

function getTournamentHeadline(game) {
  return game?.tournament_headline || game?.tournament_name || "";
}

export function hasValidSpread(game) {
  return !(
    game.spread_value === null ||
    game.spread_value === undefined ||
    !game.spread ||
    game.spread === null ||
    (typeof game.spread === "string" && game.spread.toLowerCase().includes("off")) ||
    typeof game.spread_value !== "number" ||
    Number.isNaN(game.spread_value)
  );
}

export function isSpreadTooHigh(game) {
  return hasValidSpread(game) && Math.abs(game.spread_value) > 12;
}

export function isIncludedConferenceTournament(game) {
  const headline = getTournamentHeadline(game);
  return CONFERENCE_TOURNAMENT_PATTERNS.some((pattern) => pattern.test(headline));
}

export function isNbaPlayoffGame(game) {
  const headline = getTournamentHeadline(game);
  if (
    headline &&
    NBA_PLAYOFF_EXCLUDED_PATTERNS.some((pattern) => pattern.test(headline))
  ) {
    return false;
  }

  if (game?.season_type === 3) {
    return true;
  }

  if (!headline) return false;

  return NBA_PLAYOFF_INCLUDED_PATTERNS.some((pattern) => pattern.test(headline));
}

export function shouldIncludeMatchup(game) {
  return isNbaPlayoffGame(game);
}

export function isSpreadLimitExempt(game) {
  return isNbaPlayoffGame(game);
}

export function getGameSeasonPhase(game) {
  if (isNbaPlayoffGame(game)) {
    return NBA_PLAYOFFS_PHASE;
  }

  return isIncludedConferenceTournament(game)
    ? CONFERENCE_TOURNAMENT_PHASE
    : REGULAR_SEASON_PHASE;
}

export function getGameTournamentName(game) {
  if (isNbaPlayoffGame(game)) {
    return game.tournament_headline || "NBA Playoffs";
  }

  return isIncludedConferenceTournament(game) ? game.tournament_headline || null : null;
}

export function isRegularSeasonGame(game) {
  return (
    (game?.season_phase || REGULAR_SEASON_PHASE) === REGULAR_SEASON_PHASE
  );
}

export function isConferenceTournamentGame(game) {
  return game?.season_phase === CONFERENCE_TOURNAMENT_PHASE;
}

export function isNbaPlayoffsPhaseGame(game) {
  return game?.season_phase === NBA_PLAYOFFS_PHASE;
}

// Backwards-compatible aliases for older imports/scripts.
export const MARCH_MADNESS_PHASE = NBA_PLAYOFFS_PHASE;
export const isMarchMadnessGame = isNbaPlayoffGame;
export const isMarchMadnessPhaseGame = isNbaPlayoffsPhaseGame;
