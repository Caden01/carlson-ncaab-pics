import { createClient } from "@supabase/supabase-js";
import { fetchDailyGames } from "../src/lib/espn.js";

// Optional: Use The Odds API for more reliable spread data
// Get a free API key at https://the-odds-api.com/ (500 requests/month free)
// Add ODDS_API_KEY to your GitHub Actions secrets or environment variables
const ODDS_API_KEY = process.env.ODDS_API_KEY || null;

// Initialize Supabase client with Service Role Key for admin access (bypass RLS)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const MAJOR_CONFERENCES = ["2", "4", "7", "8", "23"];

// Helper to determine if a team covered the spread
function didTeamCover(game, teamName) {
  if (game.status !== "finished" && game.status !== "post") return null;
  if (!game.spread || !game.spread.includes(" ")) return null;

  const parts = game.spread.split(" ");
  const spreadTeamAbbrev = parts[0];
  const spreadValue = parseFloat(parts[1]);

  if (isNaN(spreadValue)) return null;

  let isSpreadTeam = false;
  if (game.team_a_abbrev === spreadTeamAbbrev) {
    if (teamName === game.team_a) isSpreadTeam = true;
  } else if (game.team_b_abbrev === spreadTeamAbbrev) {
    if (teamName === game.team_b) isSpreadTeam = true;
  } else {
    return null;
  }

  const margin =
    teamName === game.team_a
      ? game.result_a - game.result_b
      : game.result_b - game.result_a;

  const effectiveSpread = isSpreadTeam ? spreadValue : -spreadValue;
  return margin + effectiveSpread > 0;
}

// Get Monday of a given week
function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split("T")[0];
}

// Get Sunday of a given week
function getWeekEnd(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? 0 : 7);
  const sunday = new Date(d.setDate(diff));
  return sunday.toISOString().split("T")[0];
}

async function syncActiveGames() {
  console.log("--- Syncing Active Games ---");
  try {
    // 1. Get all unfinished games from DB
    const { data: activeGames, error } = await supabase
      .from("games")
      .select("*")
      .neq("status", "finished")
      .not("external_id", "is", null);

    if (error) throw error;
    if (!activeGames?.length) {
      console.log("No active games to sync.");
      return;
    }

    console.log(`Found ${activeGames.length} active games.`);

    // Group by date to minimize API calls
    const uniqueDates = [
      ...new Set(
        activeGames
          .filter((g) => g.start_time) // Filter out null/undefined start_time
          .map((g) => g.start_time.split("T")[0].replace(/-/g, ""))
      ),
    ];

    let updatedCount = 0;
    let removedCount = 0;

    for (const date of uniqueDates) {
      console.log(`Fetching games for date: ${date}`);
      // Use hybrid approach if Odds API key is available
      const espnGames = await fetchDailyGames(date, ODDS_API_KEY);

      for (const espnGame of espnGames) {
        const dbGame = activeGames.find(
          (g) => g.external_id === espnGame.external_id
        );
        if (dbGame) {
          // Check if spread was previously missing but now exists and is > 12
          // If so, remove the game (only if it has no picks)
          if (
            !dbGame.spread &&
            espnGame.spread_value &&
            Math.abs(espnGame.spread_value) > 12
          ) {
            // Check if game has picks
            const { data: picks } = await supabase
              .from("picks")
              .select("id")
              .eq("game_id", dbGame.id)
              .limit(1);

            if (!picks || picks.length === 0) {
              console.log(
                `Removing ${espnGame.team_a} vs ${espnGame.team_b}: spread ${espnGame.spread_value} > 12`
              );
              await supabase.from("games").delete().eq("id", dbGame.id);
              removedCount++;
              continue;
            }
          }

          // Update if status, score, spread, or details changed
          if (
            dbGame.status !==
              (espnGame.status === "post" ? "finished" : "in_progress") ||
            dbGame.result_a !== espnGame.result_a ||
            dbGame.result_b !== espnGame.result_b ||
            dbGame.spread !== espnGame.spread ||
            dbGame.team_a_rank !== espnGame.team_a_rank ||
            dbGame.team_b_rank !== espnGame.team_b_rank
          ) {
            const newStatus =
              espnGame.status === "post" ? "finished" : "in_progress";

            const { error: updateError } = await supabase
              .from("games")
              .update({
                status: newStatus,
                result_a: espnGame.result_a,
                result_b: espnGame.result_b,
                spread: espnGame.spread,
                team_a_record: espnGame.team_a_record,
                team_a_rank: espnGame.team_a_rank,
                team_b_record: espnGame.team_b_record,
                team_b_rank: espnGame.team_b_rank,
                team_a_abbrev: espnGame.team_a_abbrev,
                team_b_abbrev: espnGame.team_b_abbrev,
              })
              .eq("id", dbGame.id);

            if (updateError) {
              console.error("Error updating game:", dbGame.id, updateError);
            } else {
              updatedCount++;
            }

            // If game finished, calculate points
            if (newStatus === "finished" && dbGame.status !== "finished") {
              await calculatePoints(dbGame.id, espnGame);
            }
          }
        }
      }
    }
    console.log(
      `Synced ${updatedCount} games, removed ${removedCount} games (spread > 12).`
    );
  } catch (error) {
    console.error("Error syncing games:", error);
  }
}

async function importTodaysGames() {
  console.log("--- Importing Today's Games ---");
  try {
    // Get today's date in YYYYMMDD format (PST/PDT roughly, or just UTC)
    // The user asked for 6:00 AM PST.
    // If this runs at 6AM PST, "today" is the current date.
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0].replace(/-/g, "");

    console.log(`Fetching games for today: ${dateStr}`);
    // Use hybrid approach if Odds API key is available, otherwise ESPN only
    const games = await fetchDailyGames(dateStr, ODDS_API_KEY);
    if (ODDS_API_KEY) {
      console.log("Using hybrid approach: ESPN game data + Odds API spreads");
    } else {
      console.log(
        "Using ESPN only (set ODDS_API_KEY to use Odds API for spreads)"
      );
    }

    if (games.length === 0) {
      console.log("No games found for today.");
      return;
    }

    let importedCount = 0;
    let skippedSpread = 0;
    let skippedConference = 0;
    let pendingSpread = 0;

    for (const game of games) {
      // Filter: Must include at least one team from major conferences
      // Convert to strings since ESPN API returns conference IDs as numbers
      const teamAConf = String(game.team_a_conf_id);
      const teamBConf = String(game.team_b_conf_id);
      if (
        !MAJOR_CONFERENCES.includes(teamAConf) &&
        !MAJOR_CONFERENCES.includes(teamBConf)
      ) {
        console.log(
          `Skipping ${game.team_a} vs ${game.team_b}: Conf ${teamAConf}/${teamBConf} not major`
        );
        skippedConference++;
        continue;
      }

      // Filter: Skip games without a valid spread
      // Check if spread is null, undefined, or set to "off"
      if (
        !game.spread_value ||
        game.spread_value === null ||
        !game.spread ||
        game.spread === null ||
        (typeof game.spread === "string" &&
          game.spread.toLowerCase().includes("off"))
      ) {
        console.log(
          `Skipping ${game.team_a} vs ${game.team_b}: No valid spread (spread: ${game.spread}, spread_value: ${game.spread_value})`
        );
        skippedSpread++;
        continue;
      }

      // Filter: If spread exists, only import games with spread <= 12
      if (Math.abs(game.spread_value) > 12) {
        console.log(
          `Skipping ${game.team_a} vs ${game.team_b}: Spread ${game.spread_value} > 12`
        );
        skippedSpread++;
        continue;
      }

      // Check if game exists
      const { data: existing } = await supabase
        .from("games")
        .select("id")
        .eq("external_id", game.external_id)
        .single();

      if (!existing) {
        const { error } = await supabase.from("games").insert([
          {
            external_id: game.external_id,
            team_a: game.team_a,
            team_b: game.team_b,
            start_time: game.start_time,
            status:
              game.status === "pre"
                ? "scheduled"
                : game.status === "post"
                ? "finished"
                : "in_progress",
            result_a: game.result_a,
            result_b: game.result_b,
            spread: game.spread,
            team_a_record: game.team_a_record,
            team_a_rank: game.team_a_rank,
            team_b_record: game.team_b_record,
            team_b_rank: game.team_b_rank,
            team_a_abbrev: game.team_a_abbrev,
            team_b_abbrev: game.team_b_abbrev,
            game_date: game.game_date,
          },
        ]);
        if (!error) importedCount++;
        else console.error("Error inserting game:", error);
      }
    }
    console.log(`\n=== Import Summary ===`);
    console.log(`Imported: ${importedCount} new games`);
    console.log(`Pending spread: ${pendingSpread} games (will update later)`);
    console.log(`Skipped (spread > 12): ${skippedSpread}`);
    console.log(`Skipped (conference): ${skippedConference}`);
  } catch (error) {
    console.error("Error importing games:", error);
  }
}

async function calculatePoints(gameId, gameData) {
  // Use spread/cover logic to determine wins

  const { data: picks, error: picksError } = await supabase
    .from("picks")
    .select("user_id, selected_team")
    .eq("game_id", gameId);

  if (picksError) {
    console.error("Error fetching picks for game:", gameId, picksError);
    return;
  }

  if (!picks) return;

  for (const pick of picks) {
    try {
      const isWin = didTeamCover(gameData, pick.selected_team);

      // Skip if we can't determine the result (missing spread data, etc.)
      if (isWin === null) continue;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("total_points, total_wins, total_losses")
        .eq("id", pick.user_id)
        .single();

      if (profileError) {
        console.error(
          "Error fetching profile for user:",
          pick.user_id,
          profileError
        );
        continue;
      }

      if (profile) {
        const updates = {};

        if (isWin) {
          updates.total_points = (profile.total_points || 0) + 1;
          updates.total_wins = (profile.total_wins || 0) + 1;
        } else {
          updates.total_losses = (profile.total_losses || 0) + 1;
        }

        const { error: updateError } = await supabase
          .from("profiles")
          .update(updates)
          .eq("id", pick.user_id);

        if (updateError) {
          console.error(
            "Error updating profile for user:",
            pick.user_id,
            updateError
          );
        }
      }
    } catch (error) {
      console.error("Error processing pick for user:", pick.user_id, error);
    }
  }
}

async function calculateWeeklyWinner() {
  console.log("--- Checking Weekly Winners ---");
  try {
    // Get last week's date range (previous Monday to Sunday)
    const today = new Date();
    const lastWeekDate = new Date(today);
    lastWeekDate.setDate(today.getDate() - 7);

    const weekStart = getWeekStart(lastWeekDate);
    const weekEnd = getWeekEnd(lastWeekDate);

    console.log(`Checking week: ${weekStart} to ${weekEnd}`);

    // Check if we already have a winner for this week
    const { data: existingWinner } = await supabase
      .from("weekly_winners")
      .select("id")
      .eq("week_start", weekStart)
      .single();

    if (existingWinner) {
      console.log("Weekly winner already calculated for this week.");
      return;
    }

    // Get all finished games for that week
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("*")
      .gte("game_date", weekStart)
      .lte("game_date", weekEnd)
      .eq("status", "finished");

    if (gamesError) throw gamesError;

    if (!games || games.length === 0) {
      console.log("No finished games for this week.");
      return;
    }

    const gameIds = games.map((g) => g.id);

    // Get all picks for these games
    const { data: picks, error: picksError } = await supabase
      .from("picks")
      .select("user_id, game_id, selected_team")
      .in("game_id", gameIds);

    if (picksError) throw picksError;

    // Calculate wins/losses for each user
    const userRecords = {};

    (picks || []).forEach((pick) => {
      const game = games.find((g) => g.id === pick.game_id);
      if (!game) return;

      const covered = didTeamCover(game, pick.selected_team);
      if (covered === null) return;

      if (!userRecords[pick.user_id]) {
        userRecords[pick.user_id] = { wins: 0, losses: 0 };
      }

      if (covered) {
        userRecords[pick.user_id].wins++;
      } else {
        userRecords[pick.user_id].losses++;
      }
    });

    // Find the winner (most wins, then fewest losses as tiebreaker)
    let winnerId = null;
    let winnerWins = 0;
    let winnerLosses = Infinity;

    for (const [userId, record] of Object.entries(userRecords)) {
      if (
        record.wins > winnerWins ||
        (record.wins === winnerWins && record.losses < winnerLosses)
      ) {
        winnerId = userId;
        winnerWins = record.wins;
        winnerLosses = record.losses;
      }
    }

    if (!winnerId || winnerWins === 0) {
      console.log("No winner for this week (no one made picks or no wins).");
      return;
    }

    console.log(
      `Weekly winner: ${winnerId} with ${winnerWins}-${winnerLosses}`
    );

    // Insert weekly winner
    const { error: insertError } = await supabase
      .from("weekly_winners")
      .insert({
        user_id: winnerId,
        week_start: weekStart,
        week_end: weekEnd,
        wins: winnerWins,
        losses: winnerLosses,
      });

    if (insertError) {
      console.error("Error inserting weekly winner:", insertError);
      return;
    }

    // Increment weekly_wins on the winner's profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("weekly_wins")
      .eq("id", winnerId)
      .single();

    if (profile) {
      await supabase
        .from("profiles")
        .update({ weekly_wins: (profile.weekly_wins || 0) + 1 })
        .eq("id", winnerId);
    }

    console.log("Weekly winner recorded successfully!");
  } catch (error) {
    console.error("Error calculating weekly winner:", error);
  }
}

async function main() {
  await syncActiveGames();
  await importTodaysGames();
  await calculateWeeklyWinner();
}

main();
