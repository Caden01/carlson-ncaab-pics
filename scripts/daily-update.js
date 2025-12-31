import { createClient } from "@supabase/supabase-js";
import { fetchDailyGames } from "../src/lib/espn.js";
import { didTeamCover } from "../src/lib/gameLogic.js";

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

// Format a date as YYYY-MM-DD in PST timezone (consistent across all environments)
function formatDatePST(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

// Get Monday of a given week (in PST)
function getWeekStart(date = new Date()) {
  // First, get the date components in PST
  const pstFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = pstFormatter.formatToParts(date);
  const year = parseInt(parts.find((p) => p.type === "year").value);
  const month = parseInt(parts.find((p) => p.type === "month").value) - 1;
  const day = parseInt(parts.find((p) => p.type === "day").value);

  // Create a date object for noon PST to avoid DST issues
  const d = new Date(year, month, day, 12, 0, 0);
  const dayOfWeek = d.getDay();
  const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return formatDatePST(monday);
}

// Get Sunday of a given week (in PST)
function getWeekEnd(date = new Date()) {
  // First, get the date components in PST
  const pstFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = pstFormatter.formatToParts(date);
  const year = parseInt(parts.find((p) => p.type === "year").value);
  const month = parseInt(parts.find((p) => p.type === "month").value) - 1;
  const day = parseInt(parts.find((p) => p.type === "day").value);

  // Create a date object for noon PST to avoid DST issues
  const d = new Date(year, month, day, 12, 0, 0);
  const dayOfWeek = d.getDay();
  const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? 0 : 7);
  const sunday = new Date(d.setDate(diff));
  return formatDatePST(sunday);
}

// Get current date in PST/PDT
function getPSTDate() {
  const now = new Date();
  // Use Intl.DateTimeFormat for reliable timezone conversion
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === "year").value;
  const month = parts.find((p) => p.type === "month").value;
  const day = parts.find((p) => p.type === "day").value;
  return `${year}-${month}-${day}`;
}

// Get current hour in PST/PDT
function getPSTHour() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    hour12: false,
  });
  return parseInt(formatter.format(now), 10);
}

// Get current day of week in PST/PDT (0 = Sunday, 6 = Saturday)
function getPSTDayOfWeek() {
  // Get the date string in PST, then parse it to get the day of week
  const pstDateStr = getPSTDate();
  const [year, month, day] = pstDateStr.split("-").map(Number);
  const pstDate = new Date(year, month - 1, day);
  return pstDate.getDay(); // 0 = Sunday, 6 = Saturday
}

// Check if we should import games based on current time
// Only import after 7am PST
function shouldImportGames() {
  const pstHour = getPSTHour();
  return pstHour >= 7;
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

          // Update if status, score, or rankings changed (NOT spread - spread is locked at import)
          if (
            dbGame.status !==
              (espnGame.status === "post"
                ? "finished"
                : espnGame.status === "pre"
                ? "scheduled"
                : "in_progress") ||
            dbGame.result_a !== espnGame.result_a ||
            dbGame.result_b !== espnGame.result_b ||
            dbGame.team_a_rank !== espnGame.team_a_rank ||
            dbGame.team_b_rank !== espnGame.team_b_rank
          ) {
            const newStatus =
              espnGame.status === "post" ? "finished" : "in_progress";

            const updates = {
              status: newStatus,
              team_a_record: espnGame.team_a_record,
              team_a_rank: espnGame.team_a_rank,
              team_b_record: espnGame.team_b_record,
              team_b_rank: espnGame.team_b_rank,
            };

            // Check if teams are swapped in DB compared to ESPN
            // This handles neutral site games where Home/Away designation might differ
            if (
              dbGame.team_a === espnGame.team_b &&
              dbGame.team_b === espnGame.team_a
            ) {
              updates.result_a = espnGame.result_b;
              updates.result_b = espnGame.result_a;
              updates.team_a_abbrev = espnGame.team_b_abbrev;
              updates.team_b_abbrev = espnGame.team_a_abbrev;
            } else {
              updates.result_a = espnGame.result_a;
              updates.result_b = espnGame.result_b;
              updates.team_a_abbrev = espnGame.team_a_abbrev;
              updates.team_b_abbrev = espnGame.team_b_abbrev;
            }

            // IMPORTANT: Do NOT update spread on existing games
            // Spreads should be locked in at import time
            // Only update spread if game doesn't have one yet (backfill case)
            if (!dbGame.spread && espnGame.spread) {
              updates.spread = espnGame.spread;
              console.log(`  Backfilling spread for ${dbGame.team_a} vs ${dbGame.team_b}: ${espnGame.spread}`);
            }

            const { error: updateError } = await supabase
              .from("games")
              .update(updates)
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

// Get yesterday's date in PST/PDT
function getYesterdayPSTDate() {
  const now = new Date();
  // Subtract 24 hours
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return formatDatePST(yesterday);
}

async function importGamesForDate(dateStr, dateName) {
  console.log(`\n--- Importing Games for ${dateName}: ${dateStr} ---`);

  // Use hybrid approach if Odds API key is available, otherwise ESPN only
  const games = await fetchDailyGames(dateStr, ODDS_API_KEY);

  if (games.length === 0) {
    console.log(`No games found for ${dateName}.`);
    return { imported: 0, skippedSpread: 0, skippedConference: 0 };
  }

  let importedCount = 0;
  let skippedSpread = 0;
  let skippedConference = 0;

  for (const game of games) {
    // Filter: Must include at least one team from major conferences
    // Ensure we compare strings, handling null/undefined
    const teamAConf =
      game.team_a_conf_id != null ? String(game.team_a_conf_id) : null;
    const teamBConf =
      game.team_b_conf_id != null ? String(game.team_b_conf_id) : null;
    if (
      (teamAConf == null || !MAJOR_CONFERENCES.includes(teamAConf)) &&
      (teamBConf == null || !MAJOR_CONFERENCES.includes(teamBConf))
    ) {
      console.log(
        `Skipping ${game.team_a} vs ${game.team_b}: Conf ${teamAConf}/${teamBConf} not major`
      );
      skippedConference++;
      continue;
    }

    // Filter: Skip games without a valid spread
    // Check if spread is null, undefined, or set to "off"
    // Note: spread_value of 0 (pick'em) is valid, so check explicitly for null/undefined
    if (
      game.spread_value === null ||
      game.spread_value === undefined ||
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
    // Ensure spread_value is a valid number before using Math.abs
    if (
      typeof game.spread_value !== "number" ||
      isNaN(game.spread_value) ||
      Math.abs(game.spread_value) > 12
    ) {
      console.log(
        `Skipping ${game.team_a} vs ${game.team_b}: Spread ${game.spread_value} > 12`
      );
      skippedSpread++;
      continue;
    }

    // Validate required fields before attempting database operations
    if (!game.external_id || !game.team_a || !game.team_b || !game.start_time) {
      console.log(
        `Skipping game: Missing required fields (external_id: ${game.external_id}, team_a: ${game.team_a}, team_b: ${game.team_b}, start_time: ${game.start_time})`
      );
      continue;
    }

    // Check if game exists
    const { data: existing, error: existingError } = await supabase
      .from("games")
      .select("id")
      .eq("external_id", game.external_id)
      .maybeSingle();

    // If there's an error (other than "not found"), log and skip
    if (existingError && existingError.code !== "PGRST116") {
      console.error(
        `Error checking game ${game.external_id}:`,
        existingError.message
      );
      continue;
    }

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

  return { imported: importedCount, skippedSpread, skippedConference };
}

async function importTodaysGames() {
  console.log("--- Importing Today's and Yesterday's Games ---");
  try {
    // Check if we should import games based on time
    if (!shouldImportGames()) {
      const currentHour = getPSTHour();
      const dayOfWeek = getPSTDayOfWeek();
      const dayName = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ][dayOfWeek];
      console.log(
        `Skipping game import: Not yet time to import games for today.`
      );
      console.log(`Current time (PST): ${dayName} ${currentHour}:00`);
      console.log(`Games import after 7am PST`);
      return;
    }

    // Get today's and yesterday's dates in PST/PDT
    const todayPST = getPSTDate();
    const yesterdayPST = getYesterdayPSTDate();
    const todayDateStr = todayPST.replace(/-/g, "");
    const yesterdayDateStr = yesterdayPST.replace(/-/g, "");

    if (ODDS_API_KEY) {
      console.log("Using hybrid approach: ESPN game data + Odds API spreads");
    } else {
      console.log(
        "Using ESPN only (set ODDS_API_KEY to use Odds API for spreads)"
      );
    }

    // Import yesterday's games first (to catch any that were missed)
    const yesterdayResults = await importGamesForDate(
      yesterdayDateStr,
      `yesterday (${yesterdayPST})`
    );

    // Then import today's games
    const todayResults = await importGamesForDate(
      todayDateStr,
      `today (${todayPST})`
    );

    console.log(`\n=== Import Summary ===`);
    console.log(`Yesterday: ${yesterdayResults.imported} new games imported`);
    console.log(`Today: ${todayResults.imported} new games imported`);
    console.log(
      `Total skipped (spread > 12 or no spread): ${
        yesterdayResults.skippedSpread + todayResults.skippedSpread
      }`
    );
    console.log(
      `Total skipped (conference): ${
        yesterdayResults.skippedConference + todayResults.skippedConference
      }`
    );
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

    // Check if we already have winners for this week
    const { data: existingWinners, error: checkError } = await supabase
      .from("weekly_winners")
      .select("id, user_id")
      .eq("week_start", weekStart);

    if (checkError) {
      console.error("Error checking for existing winners:", checkError);
      return;
    }

    if (existingWinners && existingWinners.length > 0) {
      console.log(
        `Weekly winner(s) already calculated for this week (${existingWinners.length} winner(s)).`
      );
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

    // Save ALL users' weekly records to weekly_records table (audit trail)
    // NOTE: Season totals are updated incrementally by calculatePoints() as games finish
    // This weekly_records table provides an audit trail to verify totals
    console.log("Saving weekly records for all users...");
    for (const [userId, record] of Object.entries(userRecords)) {
      const { error: recordError } = await supabase
        .from("weekly_records")
        .upsert(
          {
            user_id: userId,
            week_start: weekStart,
            week_end: weekEnd,
            wins: record.wins,
            losses: record.losses,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,week_start" }
        );

      if (recordError) {
        console.error(`Error saving weekly record for ${userId}:`, recordError);
      } else {
        console.log(`  Saved: ${userId} - ${record.wins}W-${record.losses}L`);
      }
    }

    // Find the best record (most wins, then fewest losses)
    let bestWins = 0;
    let bestLosses = Infinity;

    for (const [, record] of Object.entries(userRecords)) {
      if (
        record.wins > bestWins ||
        (record.wins === bestWins && record.losses < bestLosses)
      ) {
        bestWins = record.wins;
        bestLosses = record.losses;
      }
    }

    if (bestWins === 0) {
      console.log("No winner for this week (no one made picks or no wins).");
      return;
    }

    // Find ALL users with the best record (handles ties)
    const winners = [];
    for (const [userId, record] of Object.entries(userRecords)) {
      if (record.wins === bestWins && record.losses === bestLosses) {
        winners.push(userId);
      }
    }

    console.log(
      `Best record: ${bestWins}-${bestLosses} (${winners.length} winner(s))`
    );

    // Double-check one more time before inserting (race condition protection)
    const { data: finalCheck } = await supabase
      .from("weekly_winners")
      .select("id")
      .eq("week_start", weekStart)
      .limit(1);

    if (finalCheck && finalCheck.length > 0) {
      console.log(
        "Weekly winner was already added (race condition detected). Skipping insert."
      );
      return;
    }

    // Insert ALL winners (handles ties - everyone with the best record gets a win)
    for (const winnerId of winners) {
      const { error: insertError } = await supabase
        .from("weekly_winners")
        .insert({
          user_id: winnerId,
          week_start: weekStart,
          week_end: weekEnd,
          wins: bestWins,
          losses: bestLosses,
        });

      if (insertError) {
        // If it's a unique constraint violation, that's okay - winner already exists
        if (
          insertError.code === "23505" ||
          insertError.message.includes("unique")
        ) {
          console.log(
            `Weekly winner ${winnerId} already exists (unique constraint).`
          );
          continue;
        }
        console.error(
          `Error inserting weekly winner ${winnerId}:`,
          insertError
        );
        continue;
      }

      console.log(`  Recorded winner: ${winnerId} (${bestWins}-${bestLosses})`);

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
    }

    console.log(
      `Weekly winner(s) recorded successfully! (${winners.length} winner(s))`
    );
  } catch (error) {
    console.error("Error calculating weekly winner:", error);
  }
}

async function recalculateSeasonTotals() {
  console.log("--- Recalculating Season Totals ---");
  try {
    // Get all profiles
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, username, total_wins, total_losses, weekly_wins");

    if (profilesError) throw profilesError;
    if (!profiles || profiles.length === 0) {
      console.log("No profiles found.");
      return;
    }

    for (const profile of profiles) {
      // Calculate totals from weekly_records
      const { data: weeklyRecords, error: recordsError } = await supabase
        .from("weekly_records")
        .select("wins, losses")
        .eq("user_id", profile.id);

      if (recordsError) {
        console.error(
          `Error fetching weekly records for ${profile.username}:`,
          recordsError
        );
        continue;
      }

      const totalWins = (weeklyRecords || []).reduce(
        (sum, r) => sum + (r.wins || 0),
        0
      );
      const totalLosses = (weeklyRecords || []).reduce(
        (sum, r) => sum + (r.losses || 0),
        0
      );

      // Count weekly wins from weekly_winners
      const { data: weeklyWins, error: winsError } = await supabase
        .from("weekly_winners")
        .select("id")
        .eq("user_id", profile.id);

      if (winsError) {
        console.error(
          `Error fetching weekly wins for ${profile.username}:`,
          winsError
        );
        continue;
      }

      const weeklyWinsCount = weeklyWins?.length || 0;

      // Check if update is needed
      if (
        profile.total_wins !== totalWins ||
        profile.total_losses !== totalLosses ||
        profile.weekly_wins !== weeklyWinsCount
      ) {
        console.log(`Updating ${profile.username}:`);
        console.log(`  Wins: ${profile.total_wins} -> ${totalWins}`);
        console.log(`  Losses: ${profile.total_losses} -> ${totalLosses}`);
        console.log(
          `  Weekly Wins: ${profile.weekly_wins} -> ${weeklyWinsCount}`
        );

        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            total_wins: totalWins,
            total_losses: totalLosses,
            total_points: totalWins,
            weekly_wins: weeklyWinsCount,
          })
          .eq("id", profile.id);

        if (updateError) {
          console.error(`Error updating ${profile.username}:`, updateError);
        } else {
          console.log(`  ✓ Updated successfully`);
        }
      } else {
        console.log(
          `${profile.username}: ${totalWins}-${totalLosses} (${weeklyWinsCount} weekly wins) - OK`
        );
      }
    }

    console.log("Season totals recalculation complete.");
  } catch (error) {
    console.error("Error recalculating season totals:", error);
  }
}

async function main() {
  await syncActiveGames();
  await importTodaysGames();
  await calculateWeeklyWinner();
  await recalculateSeasonTotals();
}

main();
