export const MAJOR_CONFERENCES = ["2", "4", "7", "8", "23"];
export const REGULAR_SEASON_PHASE = "regular_season";
export const CONFERENCE_TOURNAMENT_PHASE = "conference_tournament";
export const MARCH_MADNESS_PHASE = "march_madness";

const CONFERENCE_TOURNAMENT_PATTERNS = [
  /acc tournament/i,
  /big ten tournament/i,
  /big 12 (tournament|championship)/i,
  /sec tournament/i,
  /big east tournament/i,
];

const MARCH_MADNESS_INCLUDED_PATTERNS = [
  /ncaa.*first round/i,
  /ncaa.*1st round/i,
  /ncaa.*second round/i,
  /ncaa.*2nd round/i,
  /ncaa.*sweet\s*16/i,
  /ncaa.*elite\s*8/i,
  /ncaa.*elite\s*eight/i,
  /ncaa.*regional semifinal/i,
  /ncaa.*regional final/i,
  /ncaa.*final four/i,
  /ncaa.*national semifinal/i,
  /ncaa.*national championship/i,
  /march madness/i,
];

const MARCH_MADNESS_EXCLUDED_PATTERNS = [/first four/i, /play-?in/i];

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

export function isMarchMadnessGame(game) {
  const headline = getTournamentHeadline(game);
  if (!headline) return false;
  if (MARCH_MADNESS_EXCLUDED_PATTERNS.some((pattern) => pattern.test(headline))) {
    return false;
  }

  return MARCH_MADNESS_INCLUDED_PATTERNS.some((pattern) => pattern.test(headline));
}

export function shouldIncludeMatchup(game) {
  return isMarchMadnessGame(game) || hasMajorConferenceTeam(game);
}

export function isSpreadLimitExempt(game) {
  return isIncludedConferenceTournament(game) || isMarchMadnessGame(game);
}

export function getGameSeasonPhase(game) {
  if (isMarchMadnessGame(game)) {
    return MARCH_MADNESS_PHASE;
  }

  return isIncludedConferenceTournament(game)
    ? CONFERENCE_TOURNAMENT_PHASE
    : REGULAR_SEASON_PHASE;
}

export function getGameTournamentName(game) {
  if (isMarchMadnessGame(game)) {
    return game.tournament_headline || "March Madness";
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

export function isMarchMadnessPhaseGame(game) {
  return game?.season_phase === MARCH_MADNESS_PHASE;
}
