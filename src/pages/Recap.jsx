import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getAvatarGradient } from "../lib/utils";
import {
  CalendarRange,
  ChevronDown,
  Crown,
  Flame,
  Loader2,
  RefreshCw,
  ShieldQuestion,
  Sparkles,
  Swords,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

const formatDateLabel = (dateString) => {
  if (!dateString) return "N/A";
  return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

const formatPercent = (value) => {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return "N/A";
  return `${num.toFixed(1)}%`;
};

const formatRecord = (wins, losses) => `${wins || 0}-${losses || 0}`;

const buildStyleSummary = (styleStats) => {
  if (!styleStats) return "Still waiting on enough finished picks to define a style.";

  const contrarianRate = Number(styleStats.contrarian_hit_rate ?? -1);
  const majorityRate = Number(styleStats.majority_hit_rate ?? -1);
  const favoriteRate = Number(styleStats.favorite_pick_hit_rate ?? -1);
  const underdogRate = Number(styleStats.underdog_pick_hit_rate ?? -1);

  if (contrarianRate >= 0 && majorityRate >= 0 && contrarianRate > majorityRate + 5) {
    return "Thrived when fading the crowd.";
  }

  if (underdogRate >= 0 && favoriteRate >= 0 && underdogRate > favoriteRate + 5) {
    return "Had a sharper eye for live underdogs than chalk.";
  }

  if (favoriteRate >= 0 && underdogRate >= 0 && favoriteRate > underdogRate + 5) {
    return "Did best when backing the obvious side.";
  }

  return "Played the board with a balanced style all season.";
};

const buildTeamTag = (row) => {
  const picks = Number(row?.total_picks || 0);
  const rate = Number(row?.hit_rate ?? 0);

  if (picks >= 5 && rate >= 65) return "Nailed";
  if (picks >= 5 && rate <= 40) return "Burned";
  return "Mixed";
};

function RecapStat({ label, value, helper, tone = "neutral" }) {
  return (
    <div className={`recap-stat-card recap-tone-${tone}`}>
      <span className="recap-stat-label">{label}</span>
      <strong className="recap-stat-value">{value}</strong>
      {helper && <span className="recap-stat-helper">{helper}</span>}
    </div>
  );
}

function InsightChip({ label, value, subvalue, tone = "neutral" }) {
  return (
    <div className={`recap-chip recap-chip-${tone}`}>
      <span className="recap-chip-label">{label}</span>
      <strong className="recap-chip-value">{value || "N/A"}</strong>
      {subvalue && <span className="recap-chip-subvalue">{subvalue}</span>}
    </div>
  );
}

function StyleRow({ label, wins, losses, rate }) {
  return (
    <div className="recap-style-row">
      <span>{label}</span>
      <span>{formatRecord(wins, losses)}</span>
      <strong>{formatPercent(rate)}</strong>
    </div>
  );
}

export default function Recap() {
  const [seasonRange, setSeasonRange] = useState({
    start: "",
    end: "",
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [finishedGamesCount, setFinishedGamesCount] = useState(0);
  const [overview, setOverview] = useState([]);
  const [teamInsights, setTeamInsights] = useState([]);
  const [streaks, setStreaks] = useState([]);
  const [weeklyHighlights, setWeeklyHighlights] = useState([]);
  const [styleStats, setStyleStats] = useState([]);
  const [expandedPlayers, setExpandedPlayers] = useState({});
  const [teamBreakdowns, setTeamBreakdowns] = useState({});
  const [teamBreakdownLoading, setTeamBreakdownLoading] = useState({});
  const [teamBreakdownErrors, setTeamBreakdownErrors] = useState({});

  const hasRange = seasonRange.start && seasonRange.end;

  useEffect(() => {
    fetchSeasonBounds();
  }, []);

  useEffect(() => {
    if (hasRange) {
      fetchRecap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonRange.start, seasonRange.end]);

  const fetchSeasonBounds = async () => {
    try {
      setLoading(true);
      setError("");

      const [
        { data: earliestGame, error: earliestError },
        { data: latestGame, error: latestError },
      ] = await Promise.all([
        supabase
          .from("games")
          .select("game_date")
          .eq("status", "finished")
          .order("game_date", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("games")
          .select("game_date")
          .eq("status", "finished")
          .order("game_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (earliestError) throw earliestError;
      if (latestError) throw latestError;

      if (!earliestGame?.game_date || !latestGame?.game_date) {
        setError("No finished games found yet, so the recap is empty.");
        return;
      }

      setSeasonRange({
        start: earliestGame.game_date,
        end: latestGame.game_date,
      });
    } catch (err) {
      console.error("Error loading recap date range:", err);
      setError(err.message || "Unable to load recap dates.");
    } finally {
      setLoading(false);
    }
  };

  const fetchRecap = async () => {
    try {
      setRefreshing(true);
      setError("");

      const rpcArgs = {
        p_season_start: seasonRange.start,
        p_season_end: seasonRange.end,
      };

      setExpandedPlayers({});
      setTeamBreakdowns({});
      setTeamBreakdownLoading({});
      setTeamBreakdownErrors({});

      const [
        overviewRes,
        teamInsightsRes,
        streaksRes,
        weeklyHighlightsRes,
        styleStatsRes,
        finishedGamesRes,
      ] = await Promise.all([
        supabase.rpc("get_recap_overview", rpcArgs),
        supabase.rpc("get_recap_team_insights", rpcArgs),
        supabase.rpc("get_recap_streaks", rpcArgs),
        supabase.rpc("get_recap_weekly_highlights", rpcArgs),
        supabase.rpc("get_recap_style_stats", rpcArgs),
        supabase
          .from("games")
          .select("id", { count: "exact", head: true })
          .eq("status", "finished")
          .gte("game_date", seasonRange.start)
          .lte("game_date", seasonRange.end),
      ]);

      const firstError =
        overviewRes.error ||
        teamInsightsRes.error ||
        streaksRes.error ||
        weeklyHighlightsRes.error ||
        styleStatsRes.error ||
        finishedGamesRes.error;

      if (firstError) throw firstError;

      setOverview(overviewRes.data || []);
      setTeamInsights(teamInsightsRes.data || []);
      setStreaks(streaksRes.data || []);
      setWeeklyHighlights(weeklyHighlightsRes.data || []);
      setStyleStats(styleStatsRes.data || []);
      setFinishedGamesCount(finishedGamesRes.count || 0);
    } catch (err) {
      console.error("Error loading recap data:", err);
      setError(err.message || "Unable to load recap stats.");
    } finally {
      setRefreshing(false);
    }
  };

  const fetchTeamBreakdown = async (userId) => {
    try {
      setTeamBreakdownLoading((prev) => ({ ...prev, [userId]: true }));
      setTeamBreakdownErrors((prev) => ({ ...prev, [userId]: "" }));

      const { data, error: rpcError } = await supabase.rpc(
        "get_recap_team_breakdown",
        {
          p_season_start: seasonRange.start,
          p_season_end: seasonRange.end,
          p_user_id: userId,
        }
      );

      if (rpcError) throw rpcError;

      setTeamBreakdowns((prev) => ({
        ...prev,
        [userId]: data || [],
      }));
    } catch (err) {
      console.error("Error loading team breakdown:", err);
      setTeamBreakdownErrors((prev) => ({
        ...prev,
        [userId]: err.message || "Unable to load team breakdown.",
      }));
    } finally {
      setTeamBreakdownLoading((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleTogglePlayer = async (userId) => {
    const isExpanded = expandedPlayers[userId] === true;

    setExpandedPlayers((prev) => ({
      ...prev,
      [userId]: !isExpanded,
    }));

    if (!isExpanded && !teamBreakdowns[userId] && !teamBreakdownLoading[userId]) {
      await fetchTeamBreakdown(userId);
    }
  };

  const mergedPlayers = useMemo(() => {
    const teamMap = new Map(teamInsights.map((item) => [item.user_id, item]));
    const streakMap = new Map(streaks.map((item) => [item.user_id, item]));
    const weeklyMap = new Map(weeklyHighlights.map((item) => [item.user_id, item]));
    const styleMap = new Map(styleStats.map((item) => [item.user_id, item]));

    return overview.map((player) => ({
      ...player,
      teamInsights: teamMap.get(player.user_id),
      streaks: streakMap.get(player.user_id),
      weeklyHighlights: weeklyMap.get(player.user_id),
      styleStats: styleMap.get(player.user_id),
    }));
  }, [overview, teamInsights, streaks, weeklyHighlights, styleStats]);

  if (loading) {
    return (
      <div className="recap-page recap-page-loading">
        <div className="spinner-container">
          <Loader2 className="spinner recap-spinner-icon" size={36} />
          <p>Loading season recap...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="recap-page">
      <div className="recap-content">
        <section className="recap-hero">
          <div className="recap-hero-copy">
            <span className="recap-eyebrow">Regular Season Dossier</span>
            <div className="recap-title-row">
              <div className="recap-hero-icon">
                <Sparkles size={22} />
              </div>
              <h1 className="recap-title">Season Recap</h1>
            </div>
            <p className="recap-subtitle">
              A mix of real stats and personality: who each player read best,
              who kept fooling them, and how their style changed the race.
            </p>
          </div>

          <div className="recap-hero-panel">
            <div className="recap-range-header">
              <div className="recap-range-label">
                <CalendarRange size={16} />
                <span>Date range</span>
              </div>
              <button
                type="button"
                className="recap-refresh-btn"
                onClick={fetchRecap}
                disabled={refreshing || !hasRange}
              >
                <RefreshCw size={15} className={refreshing ? "spinner" : ""} />
                <span>{refreshing ? "Refreshing" : "Refresh"}</span>
              </button>
            </div>

            <div className="recap-range-inputs">
              <label className="recap-date-field">
                <span>Start</span>
                <input
                  type="date"
                  value={seasonRange.start}
                  onChange={(event) =>
                    setSeasonRange((prev) => ({
                      ...prev,
                      start: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="recap-date-field">
                <span>End</span>
                <input
                  type="date"
                  value={seasonRange.end}
                  onChange={(event) =>
                    setSeasonRange((prev) => ({
                      ...prev,
                      end: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="recap-meta-grid">
              <div className="recap-meta-card">
                <span>Finished games</span>
                <strong>{finishedGamesCount}</strong>
              </div>
              <div className="recap-meta-card">
                <span>Players</span>
                <strong>{mergedPlayers.length}</strong>
              </div>
              <div className="recap-meta-card">
                <span>Window</span>
                <strong>
                  {hasRange
                    ? `${formatDateLabel(seasonRange.start)} - ${formatDateLabel(
                        seasonRange.end
                      )}`
                    : "N/A"}
                </strong>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="recap-error-banner">
            <ShieldQuestion size={18} />
            <span>{error}</span>
          </div>
        )}

        <section className="recap-overview-grid">
          {mergedPlayers.map((player) => (
            <article key={player.user_id} className="recap-overview-card">
              <div className="recap-overview-top">
                <div
                  className="recap-overview-avatar"
                  style={{
                    background: getAvatarGradient(player.username),
                  }}
                >
                  {(player.username || "U").charAt(0).toUpperCase()}
                </div>
                <div className="recap-overview-copy">
                  <span className="recap-overview-rank">
                    #{player.season_rank} overall
                  </span>
                  <h2>{player.username}</h2>
                  <p>{buildStyleSummary(player.styleStats)}</p>
                </div>
              </div>

              <div className="recap-overview-stats">
                <RecapStat
                  label="Record"
                  value={formatRecord(player.wins, player.losses)}
                  helper={`${player.picks_made || 0} total picks`}
                  tone="accent"
                />
                <RecapStat
                  label="Hit rate"
                  value={formatPercent(player.hit_rate)}
                  helper="Against the spread"
                  tone="cool"
                />
                <RecapStat
                  label="Weekly titles"
                  value={player.weekly_titles || 0}
                  helper="Best weekly finishes"
                  tone="gold"
                />
              </div>

              <div className="recap-overview-chips">
                <InsightChip
                  label="Most right about"
                  value={player.teamInsights?.best_team}
                  subvalue={`${player.teamInsights?.best_team_correct_picks || 0} correct`}
                  tone="success"
                />
                <InsightChip
                  label="Most wrong about"
                  value={player.teamInsights?.worst_team}
                  subvalue={`${player.teamInsights?.worst_team_incorrect_picks || 0} wrong`}
                  tone="danger"
                />
              </div>
            </article>
          ))}
        </section>

        <section className="recap-player-stack">
          {mergedPlayers.map((player) => (
            <article key={player.user_id} className="recap-player-card">
              <div className="recap-player-header">
                <div className="recap-player-title">
                  <div
                    className="recap-player-avatar"
                    style={{
                      background: getAvatarGradient(player.username),
                    }}
                  >
                    {(player.username || "U").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3>{player.username}</h3>
                    <p>
                      Finished #{player.season_rank} with a{" "}
                      {formatPercent(player.hit_rate)} season clip.
                    </p>
                  </div>
                </div>
                <div className="recap-player-badges">
                  <span className="recap-badge recap-badge-fire">
                    <Flame size={14} />
                    {formatRecord(player.wins, player.losses)}
                  </span>
                  <span className="recap-badge recap-badge-gold">
                    <Crown size={14} />
                    {player.weekly_titles || 0} weekly titles
                  </span>
                  <button
                    type="button"
                    className={`recap-badge recap-badge-toggle ${
                      expandedPlayers[player.user_id] ? "open" : ""
                    }`}
                    onClick={() => handleTogglePlayer(player.user_id)}
                  >
                    <span>Team breakdown</span>
                    <ChevronDown size={14} className="recap-toggle-icon" />
                  </button>
                </div>
              </div>

              <div className="recap-section-grid">
                <section className="recap-panel">
                  <div className="recap-panel-header">
                    <Target size={16} />
                    <span>Team Read</span>
                  </div>
                  <div className="recap-chip-grid">
                    <InsightChip
                      label="Most right about"
                      value={player.teamInsights?.best_team}
                      subvalue={formatRecord(
                        player.teamInsights?.best_team_correct_picks,
                        player.teamInsights?.best_team_incorrect_picks
                      )}
                      tone="success"
                    />
                    <InsightChip
                      label="Most wrong about"
                      value={player.teamInsights?.worst_team}
                      subvalue={formatRecord(
                        player.teamInsights?.worst_team_correct_picks,
                        player.teamInsights?.worst_team_incorrect_picks
                      )}
                      tone="danger"
                    />
                    <InsightChip
                      label="Most trusted"
                      value={player.teamInsights?.most_trusted_team}
                      subvalue={`${formatPercent(
                        player.teamInsights?.most_trusted_hit_rate
                      )} on ${player.teamInsights?.most_trusted_picks || 0} picks`}
                      tone="accent"
                    />
                    <InsightChip
                      label="Fade machine"
                      value={player.teamInsights?.fade_machine_team}
                      subvalue={`${formatPercent(
                        player.teamInsights?.fade_machine_hit_rate
                      )} fade rate`}
                      tone="cool"
                    />
                  </div>
                </section>

                <section className="recap-panel">
                  <div className="recap-panel-header">
                    <TrendingUp size={16} />
                    <span>Momentum</span>
                  </div>
                  <div className="recap-dual-stats">
                    <RecapStat
                      label="Best streak"
                      value={player.streaks?.best_streak || 0}
                      helper={`${formatDateLabel(
                        player.streaks?.best_streak_start
                      )} - ${formatDateLabel(player.streaks?.best_streak_end)}`}
                      tone="success"
                    />
                    <RecapStat
                      label="Cold streak"
                      value={player.streaks?.cold_streak || 0}
                      helper={`${formatDateLabel(
                        player.streaks?.cold_streak_start
                      )} - ${formatDateLabel(player.streaks?.cold_streak_end)}`}
                      tone="danger"
                    />
                  </div>
                </section>

                <section className="recap-panel">
                  <div className="recap-panel-header">
                    <Sparkles size={16} />
                    <span>Weekly Highlights</span>
                  </div>
                  <div className="recap-dual-stats">
                    <RecapStat
                      label="Best week"
                      value={formatRecord(
                        player.weeklyHighlights?.best_week_wins,
                        player.weeklyHighlights?.best_week_losses
                      )}
                      helper={`${formatDateLabel(
                        player.weeklyHighlights?.best_week_start
                      )} - ${formatDateLabel(
                        player.weeklyHighlights?.best_week_end
                      )}`}
                      tone="gold"
                    />
                    <RecapStat
                      label="Worst week"
                      value={formatRecord(
                        player.weeklyHighlights?.worst_week_wins,
                        player.weeklyHighlights?.worst_week_losses
                      )}
                      helper={`${formatDateLabel(
                        player.weeklyHighlights?.worst_week_start
                      )} - ${formatDateLabel(
                        player.weeklyHighlights?.worst_week_end
                      )}`}
                      tone="neutral"
                    />
                  </div>
                </section>

                <section className="recap-panel recap-panel-style">
                  <div className="recap-panel-header">
                    <Swords size={16} />
                    <span>Style Split</span>
                  </div>
                  <div className="recap-style-table">
                    <StyleRow
                      label="Ranked games"
                      wins={player.styleStats?.ranked_game_wins}
                      losses={player.styleStats?.ranked_game_losses}
                      rate={player.styleStats?.ranked_game_hit_rate}
                    />
                    <StyleRow
                      label="Home picks"
                      wins={player.styleStats?.home_pick_wins}
                      losses={player.styleStats?.home_pick_losses}
                      rate={player.styleStats?.home_pick_hit_rate}
                    />
                    <StyleRow
                      label="Away picks"
                      wins={player.styleStats?.away_pick_wins}
                      losses={player.styleStats?.away_pick_losses}
                      rate={player.styleStats?.away_pick_hit_rate}
                    />
                    <StyleRow
                      label="Favorites"
                      wins={player.styleStats?.favorite_pick_wins}
                      losses={player.styleStats?.favorite_pick_losses}
                      rate={player.styleStats?.favorite_pick_hit_rate}
                    />
                    <StyleRow
                      label="Underdogs"
                      wins={player.styleStats?.underdog_pick_wins}
                      losses={player.styleStats?.underdog_pick_losses}
                      rate={player.styleStats?.underdog_pick_hit_rate}
                    />
                    <StyleRow
                      label="Contrarian"
                      wins={player.styleStats?.contrarian_wins}
                      losses={
                        (player.styleStats?.contrarian_picks || 0) -
                        (player.styleStats?.contrarian_wins || 0)
                      }
                      rate={player.styleStats?.contrarian_hit_rate}
                    />
                    <StyleRow
                      label="Majority side"
                      wins={player.styleStats?.majority_wins}
                      losses={
                        (player.styleStats?.majority_picks || 0) -
                        (player.styleStats?.majority_wins || 0)
                      }
                      rate={player.styleStats?.majority_hit_rate}
                    />
                  </div>
                </section>
              </div>

              {expandedPlayers[player.user_id] && (
                <section className="recap-team-breakdown-panel">
                  <div className="recap-panel-header">
                    <Target size={16} />
                    <span>Team-by-Team Breakdown</span>
                  </div>

                  <div className="recap-team-breakdown-caption">
                    Backed record shows games where {player.username} picked that
                    team. Fade record shows games where {player.username} picked
                    against them.
                  </div>

                  {teamBreakdownLoading[player.user_id] ? (
                    <div className="recap-team-breakdown-state">
                      <Loader2 size={16} className="spinner" />
                      <span>Loading team breakdown...</span>
                    </div>
                  ) : teamBreakdownErrors[player.user_id] ? (
                    <div className="recap-team-breakdown-state recap-team-breakdown-error">
                      <ShieldQuestion size={16} />
                      <span>{teamBreakdownErrors[player.user_id]}</span>
                    </div>
                  ) : (
                    <div className="recap-team-breakdown-table">
                      <div className="recap-team-breakdown-head">
                        <span>Team</span>
                        <span>Overall</span>
                        <span>Backed</span>
                        <span>Faded</span>
                        <span>Last pick</span>
                      </div>

                      {(teamBreakdowns[player.user_id] || []).map((row) => (
                        <div key={`${player.user_id}-${row.team}`} className="recap-team-row">
                          <div className="recap-team-cell recap-team-cell-name">
                            <strong>{row.team}</strong>
                            <span
                              className={`recap-team-tag recap-team-tag-${buildTeamTag(
                                row
                              ).toLowerCase()}`}
                            >
                              {buildTeamTag(row)}
                            </span>
                          </div>
                          <div className="recap-team-cell">
                            <strong>{formatRecord(row.total_wins, row.total_losses)}</strong>
                            <span>{formatPercent(row.hit_rate)}</span>
                          </div>
                          <div className="recap-team-cell">
                            <strong>{formatRecord(row.backed_wins, row.backed_losses)}</strong>
                            <span>{row.backed_picks || 0} picks</span>
                          </div>
                          <div className="recap-team-cell">
                            <strong>{formatRecord(row.faded_wins, row.faded_losses)}</strong>
                            <span>{row.faded_picks || 0} fades</span>
                          </div>
                          <div className="recap-team-cell">
                            <strong>{formatDateLabel(row.last_picked_date)}</strong>
                            <span>{row.total_picks || 0} total reads</span>
                          </div>
                        </div>
                      ))}

                      {(!teamBreakdowns[player.user_id] ||
                        teamBreakdowns[player.user_id].length === 0) && (
                        <div className="recap-team-breakdown-state">
                          <span>No team-by-team rows found for this range.</span>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}
            </article>
          ))}
        </section>

        {!error && mergedPlayers.length === 0 && (
          <div className="recap-empty-state">
            <TrendingDown size={20} />
            <span>No recap data yet for the selected date range.</span>
          </div>
        )}
      </div>
    </div>
  );
}
