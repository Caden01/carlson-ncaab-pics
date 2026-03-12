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
      team_a: "Duke",
      team_b: "North Carolina",
      start_time: `${today}T23:00:00.000Z`,
      status: "scheduled",
      result_a: null,
      result_b: null,
      spread: "Duke -4.5",
      team_a_record: "24-8",
      team_b_record: "22-10",
      team_a_rank: 4,
      team_b_rank: 18,
      team_a_abbrev: "DUKE",
      team_b_abbrev: "UNC",
      season_phase: "conference_tournament",
      tournament_name: "ACC Tournament",
      game_date: today,
    },
    {
      id: 102,
      external_id: "e2e-game-102",
      team_a: "Houston",
      team_b: "Kansas",
      start_time: `${yesterday}T23:30:00.000Z`,
      status: "finished",
      result_a: 78,
      result_b: 70,
      spread: "Houston -6.5",
      team_a_record: "27-5",
      team_b_record: "21-11",
      team_a_rank: 2,
      team_b_rank: 23,
      team_a_abbrev: "HOU",
      team_b_abbrev: "KU",
      season_phase: "regular_season",
      tournament_name: null,
      game_date: yesterday,
    },
    {
      id: 103,
      external_id: "e2e-game-103",
      team_a: "Arizona",
      team_b: "UCF",
      start_time: `${threeDaysAgo}T19:00:00.000Z`,
      status: "finished",
      result_a: 74,
      result_b: 68,
      spread: "Arizona -3.5",
      team_a_record: "23-9",
      team_b_record: "19-13",
      team_a_rank: 14,
      team_b_rank: null,
      team_a_abbrev: "ARIZ",
      team_b_abbrev: "UCF",
      season_phase: "conference_tournament",
      tournament_name: "Big 12 Tournament",
      game_date: threeDaysAgo,
    },
    {
      id: 104,
      external_id: "e2e-game-104",
      team_a: "Tennessee",
      team_b: "Florida",
      start_time: `${threeDaysAgo}T21:00:00.000Z`,
      status: "finished",
      result_a: 66,
      result_b: 71,
      spread: "Tennessee -1.5",
      team_a_record: "24-7",
      team_b_record: "22-9",
      team_a_rank: 8,
      team_b_rank: 11,
      team_a_abbrev: "TENN",
      team_b_abbrev: "UF",
      season_phase: "regular_season",
      tournament_name: null,
      game_date: threeDaysAgo,
    },
  ];

  const picks = [
    { user_id: "e2e-user", game_id: 101, selected_team: "Duke" },
    { user_id: "user-2", game_id: 101, selected_team: "North Carolina" },
    { user_id: "user-3", game_id: 101, selected_team: "Duke" },
    { user_id: "e2e-user", game_id: 102, selected_team: "Houston" },
    { user_id: "user-2", game_id: 102, selected_team: "Kansas" },
    { user_id: "user-3", game_id: 102, selected_team: "Houston" },
    { user_id: "e2e-user", game_id: 103, selected_team: "Arizona" },
    { user_id: "user-2", game_id: 103, selected_team: "UCF" },
    { user_id: "user-3", game_id: 103, selected_team: "Arizona" },
    { user_id: "e2e-user", game_id: 104, selected_team: "Florida" },
    { user_id: "user-2", game_id: 104, selected_team: "Florida" },
    { user_id: "user-3", game_id: 104, selected_team: "Tennessee" },
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
