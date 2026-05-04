import { supabase } from "./supabase";
import { fetchDailyGames } from "./espn";
import {
  hasValidSpread,
  isSpreadLimitExempt,
  isSpreadTooHigh,
  shouldIncludeMatchup,
} from "./gameFilters";

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
    for (const game of games) {
      if (!shouldIncludeMatchup(game)) {
        const teamAConf =
          game.team_a_conf_id != null ? String(game.team_a_conf_id) : null;
        const teamBConf =
          game.team_b_conf_id != null ? String(game.team_b_conf_id) : null;
        console.log(
          `Skipping ${game.team_a} vs ${game.team_b}: not an NBA playoff matchup (${teamAConf}/${teamBConf})`
        );
        continue;
      }

      if (!hasValidSpread(game)) {
        console.log(
          `Skipping ${game.team_a} vs ${game.team_b}: No valid spread (spread: ${game.spread}, spread_value: ${game.spread_value})`
        );
        continue;
      }

      if (isSpreadTooHigh(game) && !isSpreadLimitExempt(game)) {
        console.log(
          `Skipping ${game.team_a} vs ${game.team_b}: Spread ${game.spread_value} > 12`
        );
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

      const gamePayload = {
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
        season_phase: game.season_phase,
        tournament_name: game.tournament_name,
        game_date: game.game_date,
      };

      if (!existing) {
        const { error } = await supabase.from("games").insert([gamePayload]);
        if (error) {
          console.error(
            `Error inserting game ${game.external_id} (${game.team_a} vs ${game.team_b}):`,
            error.message
          );
        } else {
          importedCount++;
        }
      } else {
        const { error } = await supabase
          .from("games")
          .update({
            season_phase: gamePayload.season_phase,
            tournament_name: gamePayload.tournament_name,
            game_date: gamePayload.game_date,
          })
          .eq("id", existing.id);

        if (error) {
          console.error(
            `Error updating game ${game.external_id} (${game.team_a} vs ${game.team_b}):`,
            error.message
          );
        }
      }
    }
    return importedCount;
  } catch (error) {
    console.error("Error importing games:", error);
    throw error;
  }
};

/**
 * Refreshes spreads for existing games on a specific date.
 * This is intended for manual admin use only.
 *
 * @param {string} dateStr - Date string in YYYYMMDD format.
 * @returns {Promise<number>} - Number of games whose spreads were updated.
 */
export const refreshGameSpreadsForDate = async (dateStr) => {
  try {
    const games = await fetchDailyGames(dateStr);
    if (games.length === 0) return 0;

    let updatedCount = 0;
    for (const game of games) {
      if (!shouldIncludeMatchup(game)) {
        continue;
      }

      if (!hasValidSpread(game)) {
        continue;
      }

      if (isSpreadTooHigh(game) && !isSpreadLimitExempt(game)) {
        continue;
      }

      if (!game.external_id) {
        continue;
      }

      const { data: existing, error: existingError } = await supabase
        .from("games")
        .select("id, spread, status")
        .eq("external_id", game.external_id)
        .maybeSingle();

      if (existingError && existingError.code !== "PGRST116") {
        console.error(
          `Error checking game ${game.external_id} for spread refresh:`,
          existingError.message
        );
        continue;
      }

      // Only refresh spreads for already-imported, unfinished games.
      if (!existing || existing.status === "finished") {
        continue;
      }

      if (existing.spread === game.spread) {
        continue;
      }

      const { error: updateError } = await supabase
        .from("games")
        .update({ spread: game.spread })
        .eq("id", existing.id);

      if (updateError) {
        console.error(
          `Error refreshing spread for game ${game.external_id}:`,
          updateError.message
        );
        continue;
      }

      updatedCount++;
    }

    return updatedCount;
  } catch (error) {
    console.error("Error refreshing game spreads:", error);
    throw error;
  }
};
