import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envPath = path.resolve(".env.local");
const envConfig = fs.readFileSync(envPath, "utf8");
const envVars = {};
envConfig.split("\n").forEach((line) => {
  const [key, value] = line.split("=");
  if (key && value) {
    envVars[key.trim()] = value.trim();
  }
});

// Use service role key for admin operations
const supabaseUrl =
  process.env.SUPABASE_URL || envVars.VITE_SUPABASE_URL || envVars.SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error("Missing SUPABASE_URL environment variable.");
  console.error(
    "Please set SUPABASE_URL in your environment or .env.local file."
  );
  process.exit(1);
}

if (!supabaseServiceKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
  console.error("Please set SUPABASE_SERVICE_ROLE_KEY in your environment.");
  console.error(
    "You can find it in your Supabase dashboard under Settings > API > service_role key"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Helper to determine if a team covered the spread
function didTeamCover(game, teamName) {
  if (game.status !== "finished") return null;
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

async function main() {
  // Week 4: Dec 2-8, 2025
  const weekStart = "2025-12-02";
  const weekEnd = "2025-12-08";

  console.log(`=== Fixing Week 4 (${weekStart} to ${weekEnd}) ===\n`);

  // Step 1: Get finished games for week 4
  const { data: games, error: gamesError } = await supabase
    .from("games")
    .select("*")
    .gte("game_date", weekStart)
    .lte("game_date", weekEnd)
    .eq("status", "finished");

  if (gamesError) {
    console.error("Error fetching games:", gamesError);
    return;
  }

  console.log(`Found ${games?.length || 0} finished games for week 4\n`);

  if (!games || games.length === 0) {
    console.log("No finished games found for week 4. Cannot proceed.");
    return;
  }

  // Step 2: Get all picks for these games
  const gameIds = games.map((g) => g.id);
  const { data: picks, error: picksError } = await supabase
    .from("picks")
    .select("*, profiles(id, username)")
    .in("game_id", gameIds);

  if (picksError) {
    console.error("Error fetching picks:", picksError);
    return;
  }

  // Step 3: Calculate each user's week 4 record
  const userRecords = {};

  for (const pick of picks || []) {
    const game = games.find((g) => g.id === pick.game_id);
    if (!game) continue;

    const covered = didTeamCover(game, pick.selected_team);
    if (covered === null) continue;

    const userId = pick.user_id;
    const username = pick.profiles?.username || "Unknown";

    if (!userRecords[userId]) {
      userRecords[userId] = {
        username,
        wins: 0,
        losses: 0,
      };
    }

    if (covered) {
      userRecords[userId].wins++;
    } else {
      userRecords[userId].losses++;
    }
  }

  console.log("=== Week 4 Records ===");
  for (const [, record] of Object.entries(userRecords)) {
    console.log(`  ${record.username}: ${record.wins}W - ${record.losses}L`);
  }
  console.log("");

  // Step 4: Get current profile totals
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username, total_wins, total_losses, total_points");

  if (profilesError) {
    console.error("Error fetching profiles:", profilesError);
    return;
  }

  // Step 5: Update season totals (add week 4 records)
  console.log("=== Updating Season Totals ===");
  for (const profile of profiles || []) {
    const weekRecord = userRecords[profile.id] || { wins: 0, losses: 0 };
    const newWins = (profile.total_wins || 0) + weekRecord.wins;
    const newLosses = (profile.total_losses || 0) + weekRecord.losses;

    console.log(`${profile.username}:`);
    console.log(`  Current: ${profile.total_wins}W - ${profile.total_losses}L`);
    console.log(`  Week 4: +${weekRecord.wins}W - ${weekRecord.losses}L`);
    console.log(`  New Total: ${newWins}W - ${newLosses}L`);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        total_wins: newWins,
        total_losses: newLosses,
        total_points: newWins,
      })
      .eq("id", profile.id);

    if (updateError) {
      console.error(`  ❌ Error updating ${profile.username}:`, updateError);
    } else {
      console.log(`  ✅ Updated successfully\n`);
    }
  }

  // Step 6: Determine week 4 champion
  console.log("=== Determining Week 4 Champion ===");

  let winnerId = null;
  let winnerWins = 0;
  let winnerLosses = Infinity;
  let winnerUsername = null;

  for (const [userId, record] of Object.entries(userRecords)) {
    if (
      record.wins > winnerWins ||
      (record.wins === winnerWins && record.losses < winnerLosses)
    ) {
      winnerId = userId;
      winnerWins = record.wins;
      winnerLosses = record.losses;
      winnerUsername = record.username;
    }
  }

  if (!winnerId || winnerWins === 0) {
    console.log("No winner for week 4 (no picks or no wins).");
    return;
  }

  console.log(
    `Winner: ${winnerUsername} (${winnerWins}W - ${winnerLosses}L)\n`
  );

  // Step 7: Check if weekly winner already exists
  const { data: existingWinner } = await supabase
    .from("weekly_winners")
    .select("id")
    .eq("week_start", weekStart)
    .maybeSingle();

  if (existingWinner) {
    console.log("Weekly winner already exists for week 4. Updating...");
    const { error: updateError } = await supabase
      .from("weekly_winners")
      .update({
        user_id: winnerId,
        wins: winnerWins,
        losses: winnerLosses,
      })
      .eq("week_start", weekStart);

    if (updateError) {
      console.error("Error updating weekly winner:", updateError);
    } else {
      console.log("✅ Weekly winner updated successfully!");
    }
  } else {
    console.log("Inserting weekly winner...");
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
    } else {
      console.log("✅ Weekly winner inserted successfully!");
    }
  }

  // Step 8: Update weekly_wins on winner's profile (only if we inserted, not updated)
  if (!existingWinner) {
    const { data: winnerProfile } = await supabase
      .from("profiles")
      .select("weekly_wins")
      .eq("id", winnerId)
      .single();

    if (winnerProfile) {
      const newWeeklyWins = (winnerProfile.weekly_wins || 0) + 1;
      const { error: weeklyWinsError } = await supabase
        .from("profiles")
        .update({ weekly_wins: newWeeklyWins })
        .eq("id", winnerId);

      if (weeklyWinsError) {
        console.error("Error updating weekly_wins:", weeklyWinsError);
      } else {
        console.log(
          `✅ Updated ${winnerUsername}'s weekly_wins to ${newWeeklyWins}`
        );
      }
    }
  }

  console.log("\n=== Fix Complete ===");
  console.log("Week 4 records have been added to season totals.");
  console.log(
    `Week 4 champion: ${winnerUsername} (${winnerWins}W - ${winnerLosses}L)`
  );
}

main();
