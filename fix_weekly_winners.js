import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Read environment variables from .env.local if it exists
const envPath = path.resolve(".env.local");
let envVars = {};
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, "utf8");
  envConfig.split("\n").forEach((line) => {
    const [key, value] = line.split("=");
    if (key && value) {
      envVars[key.trim()] = value.trim();
    }
  });
}

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

async function fixWeeklyWinners() {
  console.log("=== Fixing Weekly Winners Duplicates ===\n");

  try {
    // Get all weekly winners ordered by week_start and created_at
    const { data: allWinners, error: fetchError } = await supabase
      .from("weekly_winners")
      .select("*")
      .order("week_start", { ascending: true })
      .order("created_at", { ascending: true });

    if (fetchError) {
      console.error("Error fetching weekly winners:", fetchError);
      return;
    }

    if (!allWinners || allWinners.length === 0) {
      console.log("No weekly winners found.");
      return;
    }

    console.log(`Found ${allWinners.length} total weekly winner entries.\n`);

    // Group by week_start to find duplicates
    const winnersByWeek = {};
    for (const winner of allWinners) {
      if (!winnersByWeek[winner.week_start]) {
        winnersByWeek[winner.week_start] = [];
      }
      winnersByWeek[winner.week_start].push(winner);
    }

    // Find weeks with duplicates
    const duplicateWeeks = {};
    const idsToDelete = [];

    for (const [weekStart, winners] of Object.entries(winnersByWeek)) {
      if (winners.length > 1) {
        duplicateWeeks[weekStart] = winners;
        // Keep the first one (earliest created_at), delete the rest
        const duplicates = winners.slice(1);
        idsToDelete.push(...duplicates.map((w) => w.id));
        console.log(
          `Week ${weekStart}: Found ${winners.length} entries. Keeping first (ID: ${winners[0].id}), removing ${duplicates.length} duplicate(s).`
        );
      }
    }

    if (idsToDelete.length === 0) {
      console.log("No duplicates found. All weekly winners are unique.\n");
    } else {
      console.log(`\nDeleting ${idsToDelete.length} duplicate entries...`);
      const { error: deleteError } = await supabase
        .from("weekly_winners")
        .delete()
        .in("id", idsToDelete);

      if (deleteError) {
        console.error("Error deleting duplicates:", deleteError);
        return;
      }
      console.log("✅ Successfully removed duplicates.\n");
    }

    // Recalculate weekly_wins for all profiles
    console.log("=== Recalculating Weekly Wins Counts ===\n");

    // Get all unique weekly winners (after cleanup)
    const { data: uniqueWinners, error: uniqueError } = await supabase
      .from("weekly_winners")
      .select("user_id")
      .order("week_start", { ascending: true });

    if (uniqueError) {
      console.error("Error fetching unique winners:", uniqueError);
      return;
    }

    // Count wins per user
    const weeklyWinsCount = {};
    for (const winner of uniqueWinners || []) {
      weeklyWinsCount[winner.user_id] =
        (weeklyWinsCount[winner.user_id] || 0) + 1;
    }

    // Get all profiles
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, username, email, weekly_wins");

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      return;
    }

    // Update weekly_wins for each profile
    console.log("Updating weekly_wins counts:\n");
    for (const profile of profiles || []) {
      const correctCount = weeklyWinsCount[profile.id] || 0;
      const currentCount = profile.weekly_wins || 0;

      if (correctCount !== currentCount) {
        console.log(
          `${
            profile.username || profile.email
          }: ${currentCount} → ${correctCount}`
        );
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ weekly_wins: correctCount })
          .eq("id", profile.id);

        if (updateError) {
          console.error(
            `  ❌ Error updating ${profile.username || profile.email}:`,
            updateError
          );
        } else {
          console.log(`  ✅ Updated successfully`);
        }
      } else {
        console.log(
          `${
            profile.username || profile.email
          }: ${currentCount} (already correct)`
        );
      }
    }

    console.log("\n=== Fix Complete ===");
    console.log(`Total unique weeks: ${Object.keys(winnersByWeek).length}`);
    console.log(`Weeks with duplicates: ${Object.keys(duplicateWeeks).length}`);
    console.log(`Duplicates removed: ${idsToDelete.length}`);
  } catch (error) {
    console.error("Error fixing weekly winners:", error);
  }
}

fixWeeklyWinners();
