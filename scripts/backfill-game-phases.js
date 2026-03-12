import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fetchDailyGames } from "../src/lib/espn.js";

const envPath = path.resolve(".env.local");
const envConfig = fs.readFileSync(envPath, "utf8");
const envVars = {};

envConfig.split("\n").forEach((line) => {
  const idx = line.indexOf("=");
  if (idx > 0) {
    envVars[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
});

const supabaseUrl = envVars.VITE_SUPABASE_URL;
const supabaseKey = envVars.VITE_SUPABASE_ANON_KEY;
const oddsApiKey = envVars.ODDS_API_KEY || envVars.VITE_ODDS_API_KEY || null;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: dbGames, error } = await supabase
    .from("games")
    .select("id, external_id, game_date, season_phase, tournament_name")
    .order("game_date", { ascending: true });

  if (error) {
    console.error("Error loading games:", error);
    process.exit(1);
  }

  const gamesByDate = new Map();
  for (const game of dbGames || []) {
    if (!gamesByDate.has(game.game_date)) {
      gamesByDate.set(game.game_date, []);
    }
    gamesByDate.get(game.game_date).push(game);
  }

  let updatedCount = 0;

  for (const [gameDate, gamesForDate] of gamesByDate.entries()) {
    const espnDate = gameDate.replace(/-/g, "");
    const feedGames = await fetchDailyGames(espnDate, oddsApiKey);
    const feedByExternalId = new Map(
      feedGames.map((game) => [game.external_id, game])
    );

    for (const dbGame of gamesForDate) {
      const feedGame = feedByExternalId.get(dbGame.external_id);
      if (!feedGame) continue;

      if (
        dbGame.season_phase === feedGame.season_phase &&
        (dbGame.tournament_name || null) === (feedGame.tournament_name || null)
      ) {
        continue;
      }

      const { error: updateError } = await supabase
        .from("games")
        .update({
          season_phase: feedGame.season_phase,
          tournament_name: feedGame.tournament_name,
        })
        .eq("id", dbGame.id);

      if (updateError) {
        console.error(
          `Failed to update ${dbGame.external_id} on ${gameDate}:`,
          updateError
        );
        continue;
      }

      updatedCount++;
      console.log(
        `Updated ${dbGame.external_id}: ${feedGame.season_phase}${
          feedGame.tournament_name ? ` (${feedGame.tournament_name})` : ""
        }`
      );
    }
  }

  console.log(`Done. Updated ${updatedCount} game(s).`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
