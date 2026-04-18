export const E2E_BYPASS_KEY = "__e2e_auth_bypass";

export function isE2EBypassEnabled() {
  return (
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    window.localStorage.getItem(E2E_BYPASS_KEY) === "1"
  );
}

export function clearE2EBypass() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(E2E_BYPASS_KEY);
  }
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

export const E2E_USER = {
  id: "e2e-user",
  email: "e2e@example.com",
  user_metadata: {
    username: "E2E Tester",
  },
};

export function getE2EProfiles() {
  return [
    {
      id: "e2e-user",
      username: "E2E Tester",
      email: "e2e@example.com",
      is_admin: true,
      total_points: 12,
      total_wins: 12,
      total_losses: 6,
    },
    {
      id: "user-2",
      username: "Jordan",
      email: "jordan@example.com",
      is_admin: false,
      total_points: 10,
      total_wins: 10,
      total_losses: 8,
    },
    {
      id: "user-3",
      username: "Casey",
      email: "casey@example.com",
      is_admin: false,
      total_points: 8,
      total_wins: 8,
      total_losses: 10,
    },
  ];
}

export function createE2EState() {
  const today = shiftDate(0);
  const yesterday = shiftDate(-1);
  const threeDaysAgo = shiftDate(-3);

  const profiles = getE2EProfiles();
  const games = [
    {
      id: 101,
      external_id: "e2e-game-101",
      team_a: "Milwaukee Bucks",
      team_b: "New York Knicks",
      start_time: `${today}T23:00:00.000Z`,
      status: "scheduled",
      result_a: null,
      result_b: null,
      spread: "MIL -4.5",
      team_a_record: "49-33",
      team_b_record: "51-31",
      team_a_rank: null,
      team_b_rank: null,
      team_a_abbrev: "MIL",
      team_b_abbrev: "NY",
      season_phase: "nba_playoffs",
      tournament_name: "East 1st Round - Game 3",
      game_date: today,
    },
    {
      id: 102,
      external_id: "e2e-game-102",
      team_a: "Los Angeles Lakers",
      team_b: "Denver Nuggets",
      start_time: `${yesterday}T23:30:00.000Z`,
      status: "finished",
      result_a: 112,
      result_b: 108,
      spread: "LAL -3.5",
      team_a_record: "47-35",
      team_b_record: "54-28",
      team_a_rank: null,
      team_b_rank: null,
      team_a_abbrev: "LAL",
      team_b_abbrev: "DEN",
      season_phase: "nba_playoffs",
      tournament_name: "West 1st Round - Game 1",
      game_date: yesterday,
    },
    {
      id: 103,
      external_id: "e2e-game-103",
      team_a: "Indiana Pacers",
      team_b: "Cleveland Cavaliers",
      start_time: `${threeDaysAgo}T19:00:00.000Z`,
      status: "finished",
      result_a: 101,
      result_b: 109,
      spread: "CLE -6.5",
      team_a_record: "48-34",
      team_b_record: "60-22",
      team_a_rank: null,
      team_b_rank: null,
      team_a_abbrev: "IND",
      team_b_abbrev: "CLE",
      season_phase: "nba_playoffs",
      tournament_name: "East 1st Round - Game 1",
      game_date: threeDaysAgo,
    },
    {
      id: 104,
      external_id: "e2e-game-104",
      team_a: "Phoenix Suns",
      team_b: "Golden State Warriors",
      start_time: `${threeDaysAgo}T21:00:00.000Z`,
      status: "finished",
      result_a: 114,
      result_b: 118,
      spread: "PHX -1.5",
      team_a_record: "46-36",
      team_b_record: "50-32",
      team_a_rank: null,
      team_b_rank: null,
      team_a_abbrev: "PHX",
      team_b_abbrev: "GS",
      season_phase: "regular_season",
      tournament_name: null,
      game_date: threeDaysAgo,
    },
  ];

  const picks = [
    { user_id: "e2e-user", game_id: 101, selected_team: "Milwaukee Bucks" },
    { user_id: "user-2", game_id: 101, selected_team: "New York Knicks" },
    { user_id: "user-3", game_id: 101, selected_team: "Milwaukee Bucks" },
    { user_id: "e2e-user", game_id: 102, selected_team: "Los Angeles Lakers" },
    { user_id: "user-2", game_id: 102, selected_team: "Denver Nuggets" },
    { user_id: "user-3", game_id: 102, selected_team: "Los Angeles Lakers" },
    { user_id: "e2e-user", game_id: 103, selected_team: "Indiana Pacers" },
    { user_id: "user-2", game_id: 103, selected_team: "Cleveland Cavaliers" },
    { user_id: "user-3", game_id: 103, selected_team: "Indiana Pacers" },
    { user_id: "e2e-user", game_id: 104, selected_team: "Golden State Warriors" },
    { user_id: "user-2", game_id: 104, selected_team: "Golden State Warriors" },
    { user_id: "user-3", game_id: 104, selected_team: "Phoenix Suns" },
  ];

  const weeklyWinners = [
    {
      id: "winner-1",
      user_id: "e2e-user",
      week_start: threeDaysAgo,
      week_end: yesterday,
      wins: 2,
      losses: 0,
      season_phase: "regular_season",
    },
  ];

  return { profiles, games, picks, weeklyWinners };
}
