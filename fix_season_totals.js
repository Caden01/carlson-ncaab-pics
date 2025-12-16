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

// Use service role key for admin access
const supabase = createClient(
  envVars.VITE_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.VITE_SUPABASE_ANON_KEY
);

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
  console.log("=== Fixing Season Totals ===\n");

  // Paper data (Weeks 1-3) - this was recorded on paper before the app
  const paperData = {
    Jacoby: { wins: 55, losses: 49 },
    Caden: { wins: 51, losses: 53 },
    "David ": { wins: 55, losses: 49 },
  };

  // Get all finished games from database (Week 4 onwards: Dec 1+)
  const { data: games, error: gamesError } = await supabase
    .from("games")
    .select("*")
    .gte("game_date", "2025-12-01")
    .eq("status", "finished");

  if (gamesError) {
    console.error("Error fetching games:", gamesError);
    return;
  }

  console.log(`Found ${games?.length || 0} finished games in database\n`);

  const gameIds = games.map((g) => g.id);

  // Get all picks for these games
  const { data: picks, error: picksError } = await supabase
    .from("picks")
    .select("*, profiles(username)")
    .in("game_id", gameIds);

  if (picksError) {
    console.error("Error fetching picks:", picksError);
    return;
  }

  // Calculate records for each user from database picks
  const dbRecords = {};
  for (const pick of picks || []) {
    const game = games.find((g) => g.id === pick.game_id);
    if (!game) continue;

    const covered = didTeamCover(game, pick.selected_team);
    if (covered === null) continue;

    const userId = pick.user_id;
    const username = pick.profiles?.username || "Unknown";

    if (!dbRecords[userId]) {
      dbRecords[userId] = { username, wins: 0, losses: 0 };
    }

    if (covered) {
      dbRecords[userId].wins++;
    } else {
      dbRecords[userId].losses++;
    }
  }

  // Get all profiles
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("*");

  if (profilesError) {
    console.error("Error fetching profiles:", profilesError);
    return;
  }

  // Calculate and update totals for each profile
  for (const profile of profiles) {
    const username = profile.username;
    const paper = paperData[username] || { wins: 0, losses: 0 };
    const db = dbRecords[profile.id] || { wins: 0, losses: 0 };

    const newWins = paper.wins + db.wins;
    const newLosses = paper.losses + db.losses;

    console.log(`${username}:`);
    console.log(`  Paper (Wk1-3): ${paper.wins}W-${paper.losses}L`);
    console.log(`  Database picks: ${db.wins}W-${db.losses}L`);
    console.log(`  New Total: ${newWins}W-${newLosses}L`);
    console.log(
      `  Current Stored: ${profile.total_wins}W-${profile.total_losses}L`
    );

    if (newWins !== profile.total_wins || newLosses !== profile.total_losses) {
      console.log(`  *** UPDATING ***`);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          total_wins: newWins,
          total_losses: newLosses,
          total_points: newWins,
        })
        .eq("id", profile.id);

      if (updateError) {
        console.error(`  Error updating: ${updateError.message}`);
      } else {
        console.log(`  ✓ Updated successfully`);
      }
    } else {
      console.log(`  Already correct`);
    }
    console.log("");
  }

  // Also recalculate weekly_wins count from weekly_winners table
  console.log("=== Recalculating Weekly Wins ===\n");

  for (const profile of profiles) {
    const { data: weeklyWins, error: weeklyError } = await supabase
      .from("weekly_winners")
      .select("id")
      .eq("user_id", profile.id);

    if (weeklyError) {
      console.error(
        `Error fetching weekly wins for ${profile.username}:`,
        weeklyError
      );
      continue;
    }

    const count = weeklyWins?.length || 0;

    if (count !== profile.weekly_wins) {
      console.log(
        `${profile.username}: ${profile.weekly_wins} -> ${count} weekly wins`
      );

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ weekly_wins: count })
        .eq("id", profile.id);

      if (updateError) {
        console.error(`  Error updating: ${updateError.message}`);
      } else {
        console.log(`  ✓ Updated`);
      }
    } else {
      console.log(`${profile.username}: ${count} weekly wins (correct)`);
    }
  }

  console.log("\n=== Done ===");

  // Verify final state
  const { data: finalProfiles } = await supabase
    .from("profiles")
    .select("*")
    .order("total_wins", { ascending: false });

  console.log("\n=== Final Season Standings ===");
  finalProfiles.forEach((p, i) => {
    console.log(
      `${i + 1}. ${p.username}: ${p.total_wins}W-${p.total_losses}L (${
        p.weekly_wins || 0
      } weekly wins)`
    );
  });
}

main();
