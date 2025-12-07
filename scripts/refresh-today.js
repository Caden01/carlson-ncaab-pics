import { createClient } from "@supabase/supabase-js";
import { fetchDailyGames } from "../src/lib/espn.js";
import fs from "fs";
import path from "path";

// Read .env.local manually (same approach as manual_import.js)
const envPath = path.resolve(".env.local");
const envConfig = fs.readFileSync(envPath, "utf8");
const envVars = {};
envConfig.split("\n").forEach((line) => {
  const [key, value] = line.split("=");
  if (key && value) {
    envVars[key.trim()] = value.trim();
  }
});

const supabaseUrl = envVars.VITE_SUPABASE_URL;
const supabaseKey = envVars.VITE_SUPABASE_ANON_KEY;
const ODDS_API_KEY = envVars.ODDS_API_KEY || envVars.VITE_ODDS_API_KEY || null;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const MAJOR_CONFERENCES = ["2", "4", "7", "8", "23"];

async function removeGamesWithoutSpread() {
  console.log("--- Removing Games Without Valid Spreads ---");
  try {
    // Get today's date
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0]; // YYYY-MM-DD format

    // Find all games for today
    const { data: todaysGames, error: fetchError } = await supabase
      .from("games")
      .select("id, team_a, team_b, spread, external_id")
      .eq("game_date", todayStr);

    if (fetchError) {
      console.error(`Error fetching games: ${fetchError.message}`);
      return;
    }

    if (!todaysGames || todaysGames.length === 0) {
      console.log("No games found for today.");
      return;
    }

    let removedCount = 0;
    let keptCount = 0;
    let hasPicksCount = 0;

    for (const game of todaysGames) {
      // Check if game has a valid spread
      // Parse spread from string format like "TEAM -5.5" or "TEAM +3"
      let spreadValue = null;
      if (game.spread && typeof game.spread === "string") {
        const parts = game.spread.trim().split(/\s+/);
        if (parts.length >= 2) {
          const valueStr = parts[parts.length - 1];
          spreadValue = parseFloat(valueStr);
        }
      }

      const hasInvalidSpread =
        !game.spread ||
        game.spread === null ||
        (typeof game.spread === "string" &&
          game.spread.toLowerCase().includes("off")) ||
        spreadValue === null ||
        isNaN(spreadValue) ||
        Math.abs(spreadValue) > 12;

      if (hasInvalidSpread) {
        // Check if game has picks
        const { data: picks, error: picksError } = await supabase
          .from("picks")
          .select("id")
          .eq("game_id", game.id)
          .limit(1);

        if (picksError) {
          console.error(
            `Error checking picks for ${game.team_a} vs ${game.team_b}: ${picksError.message}`
          );
          continue;
        }

        if (picks && picks.length > 0) {
          console.log(
            `Keeping ${game.team_a} vs ${game.team_b}: Has picks (spread: ${game.spread})`
          );
          hasPicksCount++;
          keptCount++;
        } else {
          // Delete game without picks
          const { error: deleteError } = await supabase
            .from("games")
            .delete()
            .eq("id", game.id);

          if (deleteError) {
            console.error(
              `Error deleting ${game.team_a} vs ${game.team_b}: ${deleteError.message}`
            );
            if (deleteError.code === "42501") {
              console.error(
                "  → Permission denied. Your RLS policies may be blocking deletes."
              );
            }
          } else {
            removedCount++;
            console.log(
              `✓ Removed: ${game.team_a} vs ${game.team_b} (no valid spread)`
            );
          }
        }
      } else {
        keptCount++;
      }
    }

    console.log(`\n=== Cleanup Summary ===`);
    console.log(`Removed: ${removedCount} games without valid spreads`);
    console.log(`Kept: ${keptCount} games with valid spreads`);
    if (hasPicksCount > 0) {
      console.log(
        `Also kept: ${hasPicksCount} games without spreads (have picks)`
      );
    }
  } catch (error) {
    console.error("Error removing games:", error);
    if (
      error.message.includes("permission") ||
      error.message.includes("policy")
    ) {
      console.error(
        "\nThis error suggests RLS policies are blocking the operation."
      );
      console.error(
        "Consider using the admin panel in your app, or use daily-update.js with SERVICE_ROLE_KEY."
      );
    }
  }
}

async function refreshTodaysGames() {
  console.log("--- Refreshing Today's Games ---");
  try {
    // Get today's date in YYYYMMDD format
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0].replace(/-/g, "");

    console.log(`Fetching games for today: ${dateStr}`);
    if (ODDS_API_KEY) {
      console.log("Using hybrid approach: ESPN game data + Odds API spreads");
    } else {
      console.log("Using ESPN only");
    }

    const games = await fetchDailyGames(dateStr, ODDS_API_KEY);

    if (games.length === 0) {
      console.log("No games found for today.");
      return;
    }

    let importedCount = 0;
    let updatedCount = 0;
    let skippedSpread = 0;
    let skippedConference = 0;
    let errorCount = 0;

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
      if (
        !game.external_id ||
        !game.team_a ||
        !game.team_b ||
        !game.start_time
      ) {
        console.log(
          `Skipping game: Missing required fields (external_id: ${game.external_id}, team_a: ${game.team_a}, team_b: ${game.team_b}, start_time: ${game.start_time})`
        );
        continue;
      }

      // Check if game exists
      const { data: existing, error: fetchError } = await supabase
        .from("games")
        .select("id, spread, status")
        .eq("external_id", game.external_id)
        .maybeSingle();

      if (fetchError && fetchError.code !== "PGRST116") {
        // PGRST116 is "not found" which is fine
        console.error(`Error checking game: ${fetchError.message}`);
        errorCount++;
        continue;
      }

      if (!existing) {
        // Insert new game
        const { error: insertError } = await supabase.from("games").insert([
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

        if (insertError) {
          console.error(
            `Error inserting ${game.team_a} vs ${game.team_b}: ${insertError.message}`
          );
          if (insertError.code === "42501") {
            console.error(
              "  → Permission denied. Your RLS policies may be blocking inserts."
            );
          }
          errorCount++;
        } else {
          importedCount++;
          console.log(
            `✓ Imported: ${game.team_a} vs ${game.team_b} (Spread: ${game.spread})`
          );
        }
      } else {
        // Update existing game if spread or status changed
        const needsUpdate =
          existing.spread !== game.spread ||
          existing.status !==
            (game.status === "pre"
              ? "scheduled"
              : game.status === "post"
              ? "finished"
              : "in_progress");

        if (needsUpdate) {
          const { error: updateError } = await supabase
            .from("games")
            .update({
              spread: game.spread,
              status:
                game.status === "pre"
                  ? "scheduled"
                  : game.status === "post"
                  ? "finished"
                  : "in_progress",
              result_a: game.result_a,
              result_b: game.result_b,
              team_a_record: game.team_a_record,
              team_a_rank: game.team_a_rank,
              team_b_record: game.team_b_record,
              team_b_rank: game.team_b_rank,
            })
            .eq("id", existing.id);

          if (updateError) {
            console.error(
              `Error updating ${game.team_a} vs ${game.team_b}: ${updateError.message}`
            );
            if (updateError.code === "42501") {
              console.error(
                "  → Permission denied. Your RLS policies may be blocking updates."
              );
            }
            errorCount++;
          } else {
            updatedCount++;
            console.log(
              `✓ Updated: ${game.team_a} vs ${game.team_b} (Spread: ${game.spread})`
            );
          }
        }
      }
    }

    console.log(`\n=== Refresh Summary ===`);
    console.log(`Imported: ${importedCount} new games`);
    console.log(`Updated: ${updatedCount} existing games`);
    console.log(`Skipped (no valid spread or spread > 12): ${skippedSpread}`);
    console.log(`Skipped (conference): ${skippedConference}`);
    if (errorCount > 0) {
      console.log(`Errors: ${errorCount}`);
      console.log(
        "\nNote: Some operations may have failed due to RLS policies."
      );
      console.log(
        "If you need full admin access, use the daily-update.js script with SERVICE_ROLE_KEY."
      );
    }
  } catch (error) {
    console.error("Error refreshing games:", error);
    if (
      error.message.includes("permission") ||
      error.message.includes("policy")
    ) {
      console.error(
        "\nThis error suggests RLS policies are blocking the operation."
      );
      console.error(
        "Consider using the admin panel in your app, or use daily-update.js with SERVICE_ROLE_KEY."
      );
    }
  }
}

// Run both functions
async function main() {
  await refreshTodaysGames();
  console.log("\n");
  await removeGamesWithoutSpread();
}

main();
