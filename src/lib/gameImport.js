import { supabase } from "./supabase";
import { fetchDailyGames } from "./espn";

/**
 * Imports games for a specific date from ESPN into Supabase.
 * Applies filters for major conferences and spreads.
 * @param {string} dateStr - Date string in YYYYMMDD format.
 * @returns {Promise<number>} - Number of games imported.
 */
export const importGamesForDate = async (dateStr) => {
  try {
    const games = await fetchDailyGames(dateStr);
    if (games.length === 0) return 0;

    let importedCount = 0;
    // ACC (2), Big East (4), Big Ten (7), Big 12 (8), SEC (23)
    const MAJOR_CONFERENCES = ["2", "4", "7", "8", "23"];

    for (const game of games) {
      // Filter: Must include at least one team from major conferences
      // Ensure we compare strings
      const teamAConf = String(game.team_a_conf_id);
      const teamBConf = String(game.team_b_conf_id);

      if (
        !MAJOR_CONFERENCES.includes(teamAConf) &&
        !MAJOR_CONFERENCES.includes(teamBConf)
      ) {
        console.log(
          `Skipping ${game.team_a} vs ${game.team_b}: Conf ${teamAConf}/${teamBConf} not major`
        );
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
        continue;
      }

      // Filter: If spread exists, only import games with spread <= 12
      if (Math.abs(game.spread_value) > 12) {
        console.log(
          `Skipping ${game.team_a} vs ${game.team_b}: Spread ${game.spread_value} > 12`
        );
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
      }
    }
    return importedCount;
  } catch (error) {
    console.error("Error importing games:", error);
    throw error;
  }
};
