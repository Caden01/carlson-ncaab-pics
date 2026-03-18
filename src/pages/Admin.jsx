import { useState } from "react";
import { supabase } from "../lib/supabase";
import { fetchDailyGames } from "../lib/espn";
import { didTeamCover } from "../lib/gameLogic";
import {
  hasValidSpread,
  isSpreadLimitExempt,
  isRegularSeasonGame,
  isSpreadTooHigh,
  shouldIncludeMatchup,
} from "../lib/gameFilters";
import { Loader2, RefreshCw, Download, ShieldAlert, Sparkles, Database } from "lucide-react";
import ConfirmModal from "../components/ConfirmModal";

export default function Admin() {
  // Use local date
  const getLocalDate = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  };
  const [date, setDate] = useState(getLocalDate());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showRecalcConfirm, setShowRecalcConfirm] = useState(false);

  const handleImportGames = async () => {
    setLoading(true);
    setMessage("");
    try {
      const games = await fetchDailyGames(date);
      if (games.length === 0) {
        setMessage("No games found for this date.");
        return;
      }

      let importedCount = 0;
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

        // Validate required fields
        if (
          !game.external_id ||
          !game.team_a ||
          !game.team_b ||
          !game.start_time
        ) {
          continue;
        }

        // Check if game exists
        const { data: existing, error: existingError } = await supabase
          .from("games")
          .select("id")
          .eq("external_id", game.external_id)
          .maybeSingle();

        // If there's an error (other than "not found"), skip
        if (existingError && existingError.code !== "PGRST116") {
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
            console.error("Error inserting game:", error);
          } else {
            importedCount++;
          }
        } else {
          await supabase
            .from("games")
            .update({
              season_phase: gamePayload.season_phase,
              tournament_name: gamePayload.tournament_name,
              game_date: gamePayload.game_date,
            })
            .eq("id", existing.id);
        }
      }
      setMessage(`Successfully imported ${importedCount} new games.`);
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncScores = async () => {
    setLoading(true);
    setMessage("");
    try {
      // 1. Get all unfinished games from DB
      const { data: activeGames } = await supabase
        .from("games")
        .select("*")
        .neq("status", "finished")
        .not("external_id", "is", null);

      if (!activeGames?.length) {
        setMessage("No active games to sync.");
        return;
      }

      let updatedCount = 0;
      // Group by date to minimize API calls (optimization)
      // For MVP, we'll just fetch today's games or the game's specific date
      // Actually, ESPN endpoint takes a date. We might need to fetch multiple dates if games span days.
      // For simplicity, let's just fetch the date selected in the UI for now,
      // OR iterate through unique dates of active games.

      const uniqueDates = [
        ...new Set(
          activeGames
            .filter((g) => g.start_time) // Filter out null/undefined start_time
            .map((g) => g.start_time.split("T")[0].replace(/-/g, ""))
        ),
      ];

      for (const d of uniqueDates) {
        const espnGames = await fetchDailyGames(d);

        for (const espnGame of espnGames) {
          const dbGame = activeGames.find(
            (g) => g.external_id === espnGame.external_id
          );
          if (dbGame) {
            // Update if status or score changed
            const newStatus =
              espnGame.status === "post"
                ? "finished"
                : espnGame.status === "pre"
                ? "scheduled"
                : "in_progress";
            if (
              dbGame.status !== newStatus ||
              dbGame.result_a !== espnGame.result_a ||
              dbGame.result_b !== espnGame.result_b ||
              dbGame.team_a_record !== espnGame.team_a_record ||
              dbGame.team_b_record !== espnGame.team_b_record
            ) {
              const updates = {
                status: newStatus,
                team_a_record: espnGame.team_a_record,
                team_a_rank: espnGame.team_a_rank,
                team_b_record: espnGame.team_b_record,
                team_b_rank: espnGame.team_b_rank,
                season_phase: espnGame.season_phase,
                tournament_name: espnGame.tournament_name,
              };

              // Check if teams are swapped in DB compared to ESPN
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

              // IMPORTANT: Do NOT update spread - it should be locked at import time
              // Only backfill if game somehow has no spread
              if (!dbGame.spread && espnGame.spread) {
                updates.spread = espnGame.spread;
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

      setMessage(`Synced scores. Updated ${updatedCount} games.`);
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const calculatePoints = async (gameId, gameData) => {
    if (!isRegularSeasonGame(gameData)) {
      return;
    }

    // Get all picks for this game
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
        // Use shared logic to determine if the picked team covered
        const isWin = didTeamCover(gameData, pick.selected_team);

        if (isWin === null) continue;

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("total_points, total_wins, total_losses")
          .eq("id", pick.user_id)
          .maybeSingle();

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
  };

  const handleRecalculateStats = async () => {
    setLoading(true);
    setMessage("Resetting stats...");

    try {
      // 1. Reset all profiles
      const { error: resetError } = await supabase
        .from("profiles")
        .update({ total_points: 0, total_wins: 0, total_losses: 0 })
        .neq("id", "00000000-0000-0000-0000-000000000000"); // Update all rows

      if (resetError) throw resetError;

      // 2. Get all finished games
      const { data: finishedGames, error: gamesError } = await supabase
        .from("games")
        .select("*")
        .eq("status", "finished");

      if (gamesError) throw gamesError;

      const regularSeasonGames = (finishedGames || []).filter(isRegularSeasonGame);

      setMessage(
        `Recalculating for ${regularSeasonGames.length} regular-season games...`
      );

      let processedGames = 0;
      for (const game of regularSeasonGames) {
        await calculatePoints(game.id, game);
        processedGames++;
      }

      setMessage(
        `Successfully recalculated stats for ${processedGames} games.`
      );
    } catch (error) {
      console.error("Error recalculating:", error);
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const messageTone =
    message && !message.toLowerCase().startsWith("error") ? "success" : "error";

  return (
    <div className="dashboard-container app-page-content">
      <section className="app-page-hero">
        <div className="app-page-hero-copy">
          <div className="app-page-eyebrow">
            <Sparkles size={14} />
            Operations console
          </div>
          <div className="app-page-title-row">
            <div className="app-page-icon">
              <ShieldAlert size={22} />
            </div>
            <div>
              <h1 className="app-page-title">Admin Panel</h1>
              <p className="app-page-subtitle">
                Manage imports, sync live results, and recalculate standings
                without leaving the recap-style shell.
              </p>
            </div>
          </div>
        </div>
        <div className="app-page-hero-side">
          <div className="app-page-meta-grid">
            <div className="app-page-meta-card">
              <span>Import Date</span>
              <strong>{date}</strong>
            </div>
            <div className="app-page-meta-card">
              <span>Status</span>
              <strong>{loading ? "Running" : "Idle"}</strong>
            </div>
            <div className="app-page-meta-card">
              <span>Mode</span>
              <strong>Manual</strong>
            </div>
          </div>
          <p className="helper-text">
            Use this screen for one-off operational tasks. Regular-season
            standings recalculations still exclude tournament games.
          </p>
        </div>
      </section>

      <section className="app-page-panel">
        <div className="page-panels-grid">
          <div className="page-stack">
            <div className="app-page-eyebrow">
              <Database size={14} />
              ESPN integration
            </div>
            <h2 style={{ margin: 0 }}>Run import and sync actions</h2>
            <p className="helper-text">
              Import fresh slates by date, sync unfinished games, or fully
              rebuild leaderboard totals from finished regular-season results.
            </p>
          </div>
          <div className="page-stack">
            <div className="app-field">
              <label htmlFor="admin-date">Date (YYYYMMDD)</label>
              <input
                id="admin-date"
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="20251126"
                className="app-input"
              />
            </div>
          </div>
        </div>

        <div className="page-actions" style={{ marginTop: "1rem" }}>
          <button
            onClick={handleImportGames}
            disabled={loading}
            className="app-button btn-primary"
          >
            {loading ? <Loader2 className="animate-spin" /> : <Download size={18} />}
            Import Games
          </button>

          <button
            onClick={handleSyncScores}
            disabled={loading}
            className="app-button app-button-secondary"
          >
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw size={18} />}
            Sync Scores
          </button>

          <button
            onClick={() => setShowRecalcConfirm(true)}
            disabled={loading}
            className="app-button"
            style={{
              background: "rgba(127, 29, 29, 0.4)",
              color: "#fecaca",
              borderColor: "rgba(248, 113, 113, 0.35)",
            }}
          >
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw size={18} />}
            Recalculate All Stats
          </button>
        </div>

        {message && (
          <div
            className={`app-message ${messageTone === "success" ? "success" : ""}`}
            style={{ marginTop: "1rem" }}
          >
            {message}
          </div>
        )}
      </section>

      <ConfirmModal
        isOpen={showRecalcConfirm}
        onClose={() => setShowRecalcConfirm(false)}
        onConfirm={handleRecalculateStats}
        title="Recalculate All Stats"
        message="This will reset all user stats and recalculate them based on finished games. This action cannot be undone."
        confirmText="Recalculate"
        variant="danger"
      />
    </div>
  );
}
