export const MAJOR_CONFERENCES = ["2", "4", "7", "8", "23"];
export const REGULAR_SEASON_PHASE = "regular_season";
export const CONFERENCE_TOURNAMENT_PHASE = "conference_tournament";

const EXEMPT_TOURNAMENT_PATTERNS = [
  /acc tournament/i,
  /big ten tournament/i,
  /big 12 (tournament|championship)/i,
  /sec tournament/i,
  /big east tournament/i,
];

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
  const headline = game.tournament_headline || "";
  return EXEMPT_TOURNAMENT_PATTERNS.some((pattern) => pattern.test(headline));
}

export function getGameSeasonPhase(game) {
  return isIncludedConferenceTournament(game)
    ? CONFERENCE_TOURNAMENT_PHASE
    : REGULAR_SEASON_PHASE;
}

export function getGameTournamentName(game) {
  return isIncludedConferenceTournament(game)
    ? game.tournament_headline || null
    : null;
}

export function isRegularSeasonGame(game) {
  return (
    (game?.season_phase || REGULAR_SEASON_PHASE) === REGULAR_SEASON_PHASE
  );
}
