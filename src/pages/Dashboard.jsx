import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
  Loader2,
  Lock,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Users,
  ShieldAlert,
} from "lucide-react";
import { getAvatarGradient } from "../lib/utils";
import { fetchDailyGames } from "../lib/espn";
import { didTeamCover } from "../lib/gameLogic";
import { importGamesForDate } from "../lib/gameImport";

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState({});
  const [loading, setLoading] = useState(true);
  const [allProfiles, setAllProfiles] = useState([]);
  const [actingUser, setActingUser] = useState(null);
  // Use local date to avoid timezone issues (e.g. UTC is tomorrow while local is today)
  const getLocalDate = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    const localDate = new Date(d.getTime() - offset);
    return localDate.toISOString().split("T")[0];
  };
  const [selectedDate, setSelectedDate] = useState(getLocalDate());

  // Track games in a ref for the polling interval (avoids stale closure issues)
  const gamesRef = useRef(games);
  useEffect(() => {
    gamesRef.current = games;
  }, [games]);

  useEffect(() => {
    if (user) {
      fetchGamesAndPicks();
      // Default acting user to self
      setActingUser({
        id: user.id,
        username: user.user_metadata?.username || user.email || "You",
        email: user.email,
      });
    }

    if (isAdmin) {
      fetchProfiles();
    }

    // Real-time subscription for game updates
    const subscription = supabase
      .channel("public:games")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games" },
        (payload) => {
          // Update local state when a game changes
          setGames((prevGames) =>
            prevGames.map((game) =>
              game.id === payload.new.id ? { ...game, ...payload.new } : game
            )
          );
        }
      )
      .subscribe();

    // Polling for live scores (Distributed Worker Pattern)
    // Only poll if there are active games on the selected date
    const interval = setInterval(async () => {
      const currentGames = gamesRef.current;
      const hasActiveGames = currentGames.some(
        (g) => g.status === "in_progress"
      );
      if (hasActiveGames && selectedDate === getLocalDate()) {
        await syncLiveScores();
      }
    }, 60000); // Check every minute

    return () => {
      supabase.removeChannel(subscription);
      clearInterval(interval);
    };
  }, [user, selectedDate]); // Removed games.length - it was causing an infinite loop!

  const fetchGamesAndPicks = async () => {
    try {
      setLoading(true);

      const { data: gamesData, error: gamesError } = await supabase
        .from("games")
        .select("*")
        .eq("game_date", selectedDate)
        .order("start_time", { ascending: true });

      if (gamesError) throw gamesError;

      let finalGamesData = gamesData || [];

      // Auto-import if no games found, but ONLY for today or past dates (not future)
      if (finalGamesData.length === 0) {
        const today = getLocalDate();
        const isFutureDate = selectedDate > today;

        if (!isFutureDate) {
          console.log("No games found in DB, attempting auto-import...");
          const dateStr = selectedDate.replace(/-/g, "");
          const importedCount = await importGamesForDate(dateStr);

          if (importedCount > 0) {
            // Re-fetch games
            const { data: refetchedGames } = await supabase
              .from("games")
              .select("*")
              .eq("game_date", selectedDate)
              .order("start_time", { ascending: true });

            if (refetchedGames) {
              finalGamesData = refetchedGames;
            }
          }
        } else {
          console.log("Not auto-importing for future date:", selectedDate);
        }
      }

      // Fetch ALL picks for these games
      const gameIds = finalGamesData.map((g) => g.id);
      let picksMap = {};

      if (gameIds.length > 0) {
        const { data: picksData, error: picksError } = await supabase
          .from("picks")
          .select("game_id, selected_team, user_id, profiles(username, email)")
          .in("game_id", gameIds);

        if (picksError) throw picksError;

        // Group picks by game_id
        (picksData || []).forEach((pick) => {
          if (!picksMap[pick.game_id]) {
            picksMap[pick.game_id] = [];
          }
          picksMap[pick.game_id].push({
            ...pick,
            username:
              pick.profiles?.username || pick.profiles?.email || "Unknown",
          });
        });
      }

      setGames(finalGamesData);
      setPicks(picksMap);

      // Trigger live score sync with the fetched data
      if (finalGamesData.length > 0) {
        syncLiveScores(finalGamesData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("username", { ascending: true });

      if (error) throw error;
      setAllProfiles(data || []);
    } catch (error) {
      console.error("Error fetching profiles:", error);
    }
  };

  const syncLiveScores = async (currentGames = null) => {
    try {
      const gamesList = currentGames || games;
      const dateStr = selectedDate.replace(/-/g, "");
      const espnGames = await fetchDailyGames(dateStr);

      for (const espnGame of espnGames) {
        const dbGame = gamesList.find(
          (g) => g.external_id === espnGame.external_id
        );
        if (dbGame) {
          // Only update if something changed
          if (
            dbGame.status !==
              (espnGame.status === "post"
                ? "finished"
                : espnGame.status === "pre"
                ? "scheduled"
                : "in_progress") ||
            dbGame.result_a !== espnGame.result_a ||
            dbGame.result_b !== espnGame.result_b
          ) {
            const newStatus =
              espnGame.status === "post"
                ? "finished"
                : espnGame.status === "pre"
                ? "scheduled"
                : "in_progress";

            const updates = {
              status: newStatus,
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

            if (espnGame.spread) {
              updates.spread = espnGame.spread;
            }

            const { error: updateError } = await supabase
              .from("games")
              .update(updates)
              .eq("id", dbGame.id);

            if (updateError) {
              console.error("Error updating game:", dbGame.id, updateError);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error syncing live scores:", error);
    }
  };

  const handlePick = async (gameId, team) => {
    // Optimistic update
    const previousPicks = { ...picks };

    setPicks((prev) => {
      const gamePicks = prev[gameId] ? [...prev[gameId]] : [];
      const existingPickIndex = gamePicks.findIndex(
        (p) => p.user_id === actingUser.id
      );

      const newPickObj = {
        game_id: gameId,
        selected_team: team,
        user_id: actingUser.id,
        username: actingUser.username,
      };

      if (existingPickIndex >= 0) {
        gamePicks[existingPickIndex] = newPickObj;
      } else {
        gamePicks.push(newPickObj);
      }

      return { ...prev, [gameId]: gamePicks };
    });

    try {
      const { error } = await supabase.from("picks").upsert(
        {
          user_id: actingUser.id,
          game_id: gameId,
          selected_team: team,
        },
        { onConflict: "user_id, game_id" }
      );

      if (error) throw error;
    } catch (error) {
      console.error("Error saving pick:", error);
      setPicks(previousPicks);
      alert("Failed to save pick. Please try again.");
    }
  };

  const isGameLocked = (startTime) => {
    if (isAdmin) return false; // Admins can always pick
    return new Date() >= new Date(startTime);
  };

  const changeDate = (days) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + days);
    setSelectedDate(date.toISOString().split("T")[0]);
  };

  const checkCover = (game, team) => {
    return didTeamCover(game, team);
  };

  const getPickStatus = (game, userPick) => {
    if (game.status !== "finished" && game.status !== "post") return null;
    if (!userPick) return null;

    const isWin = didTeamCover(game, userPick);
    if (isWin === null) return null; // Can't determine

    return isWin ? "correct" : "incorrect";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-primary" size={40} />
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Dashboard</h1>
        <div className="date-nav">
          <button onClick={() => changeDate(-1)} className="icon-btn">
            <ChevronLeft size={24} />
          </button>
          <div className="current-date">
            <Calendar size={20} />
            <span>
              {new Date(selectedDate + "T00:00:00").toLocaleDateString(
                undefined,
                { weekday: "short", month: "short", day: "numeric" }
              )}
            </span>
          </div>
          <button onClick={() => changeDate(1)} className="icon-btn">
            <ChevronRight size={24} />
          </button>
        </div>
      </header>

      {isAdmin && allProfiles.length > 0 && (
        <div className="mb-6 p-4 bg-slate-800 rounded-lg border border-slate-700">
          <div className="flex items-center gap-2 mb-2 text-amber-500 font-semibold">
            <ShieldAlert size={20} />
            <span>Admin Override Mode</span>
          </div>
          <div className="flex items-center gap-4">
            <label className="text-sm text-slate-400">Making picks for:</label>
            <div className="relative flex-1 max-w-xs">
              <select
                className="w-full p-2 pl-9 bg-slate-900 border border-slate-700 rounded text-white appearance-none cursor-pointer focus:border-amber-500 outline-none"
                value={actingUser?.id || ""}
                onChange={(e) => {
                  const selected = allProfiles.find(
                    (p) => p.id === e.target.value
                  );
                  if (selected) {
                    setActingUser({
                      id: selected.id,
                      username: selected.username || selected.email,
                      email: selected.email,
                    });
                  }
                }}
              >
                {allProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.username || profile.email}{" "}
                    {profile.id === user.id ? "(You)" : ""}
                  </option>
                ))}
              </select>
              <Users
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
            </div>
          </div>
        </div>
      )}

      {games.length === 0 ? (
        <div className="empty-state">
          <p>No games scheduled for this date.</p>
        </div>
      ) : (
        <div className="games-grid">
          {games.map((game) => {
            const isLocked = isGameLocked(game.start_time);
            const gamePicks = picks[game.id] || [];
            const userPickObj = gamePicks.find(
              (p) => p.user_id === (actingUser?.id || user.id)
            );
            const userPick = userPickObj ? userPickObj.selected_team : null;
            const pickStatus = getPickStatus(game, userPick);

            return (
              <div key={game.id} className="game-card">
                <div className="game-info">
                  <div className="teams">
                    <div
                      className={`team-container ${
                        game.result_a !== null &&
                        game.result_b !== null &&
                        game.result_a > game.result_b
                          ? "winner"
                          : ""
                      }`}
                    >
                      <div className="team-details">
                        {game.team_a_rank && (
                          <span className="team-rank">#{game.team_a_rank}</span>
                        )}
                        <span className="team-name">{game.team_a}</span>
                        {game.status !== "scheduled" &&
                          game.result_a !== null &&
                          game.result_b !== null && (
                            <span className="team-score">{game.result_a}</span>
                          )}
                      </div>
                      {game.team_a_record && (
                        <span className="team-record">
                          ({game.team_a_record})
                        </span>
                      )}
                    </div>
                    <span className="vs">vs</span>
                    <div
                      className={`team-container ${
                        game.result_a !== null &&
                        game.result_b !== null &&
                        game.result_b > game.result_a
                          ? "winner"
                          : ""
                      }`}
                    >
                      <div className="team-details">
                        {game.team_b_rank && (
                          <span className="team-rank">#{game.team_b_rank}</span>
                        )}
                        <span className="team-name">{game.team_b}</span>
                        {game.status !== "scheduled" &&
                          game.result_a !== null &&
                          game.result_b !== null && (
                            <span className="team-score">{game.result_b}</span>
                          )}
                      </div>
                      {game.team_b_record && (
                        <span className="team-record">
                          ({game.team_b_record})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="game-meta">
                    <span className="game-time">
                      {game.status === "in_progress" ? (
                        <span className="text-red-500 font-bold animate-pulse">
                          LIVE
                        </span>
                      ) : game.start_time ? (
                        new Date(game.start_time).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      ) : (
                        "TBD"
                      )}
                    </span>
                    {game.spread && (
                      <span className="game-spread">{game.spread}</span>
                    )}
                  </div>
                </div>
                <div className="teams-container">
                  <div className="team-group">
                    <button
                      className={`team-btn ${
                        userPick === game.team_a ? "selected" : ""
                      } ${isLocked ? "locked" : ""} ${
                        pickStatus === "correct" && userPick === game.team_a
                          ? "correct-pick"
                          : ""
                      } ${
                        pickStatus === "incorrect" && userPick === game.team_a
                          ? "incorrect-pick"
                          : ""
                      }`}
                      onClick={() =>
                        !isLocked && handlePick(game.id, game.team_a)
                      }
                      disabled={isLocked}
                    >
                      <div className="flex items-center gap-2">
                        <span>{game.team_a}</span>
                        {pickStatus === "correct" &&
                          userPick === game.team_a && (
                            <CheckCircle size={16} className="text-green-600" />
                          )}
                        {pickStatus === "incorrect" &&
                          userPick === game.team_a && (
                            <XCircle size={16} className="text-red-500" />
                          )}
                      </div>
                      {game.status === "finished" &&
                        checkCover(game, game.team_a) && (
                          <span className="cover-badge">Covered</span>
                        )}
                    </button>

                    {/* Team A Picks */}
                    {(picks[game.id] || []).filter(
                      (p) => p.selected_team === game.team_a
                    ).length > 0 && (
                      <div className="picks-container">
                        <div className="avatars-group">
                          {(picks[game.id] || [])
                            .filter((p) => p.selected_team === game.team_a)
                            .map((p, i) => (
                              <div key={i} className="avatar-wrapper">
                                <div
                                  className={`avatar ${
                                    p.user_id === (actingUser?.id || user.id)
                                      ? "active"
                                      : ""
                                  }`}
                                  style={{
                                    background: getAvatarGradient(p.username),
                                  }}
                                >
                                  {p.username.charAt(0).toUpperCase()}
                                </div>
                                {/* Tooltip */}
                                <div className="tooltip">
                                  {p.username}
                                  <div className="tooltip-arrow"></div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="vs-badge">VS</div>

                  <div className="team-group">
                    <button
                      className={`team-btn ${
                        userPick === game.team_b ? "selected" : ""
                      } ${isLocked ? "locked" : ""} ${
                        pickStatus === "correct" && userPick === game.team_b
                          ? "correct-pick"
                          : ""
                      } ${
                        pickStatus === "incorrect" && userPick === game.team_b
                          ? "incorrect-pick"
                          : ""
                      }`}
                      onClick={() =>
                        !isLocked && handlePick(game.id, game.team_b)
                      }
                      disabled={isLocked}
                    >
                      <div className="flex items-center gap-2">
                        <span>{game.team_b}</span>
                        {pickStatus === "correct" &&
                          userPick === game.team_b && (
                            <CheckCircle size={16} className="text-green-600" />
                          )}
                        {pickStatus === "incorrect" &&
                          userPick === game.team_b && (
                            <XCircle size={16} className="text-red-500" />
                          )}
                      </div>
                      {game.status === "finished" &&
                        checkCover(game, game.team_b) && (
                          <span className="cover-badge">Covered</span>
                        )}
                    </button>

                    {/* Team B Picks */}
                    {(picks[game.id] || []).filter(
                      (p) => p.selected_team === game.team_b
                    ).length > 0 && (
                      <div className="picks-container right">
                        <div className="avatars-group reverse">
                          {(picks[game.id] || [])
                            .filter((p) => p.selected_team === game.team_b)
                            .map((p, i) => (
                              <div key={i} className="avatar-wrapper">
                                <div
                                  className={`avatar ${
                                    p.user_id === (actingUser?.id || user.id)
                                      ? "active"
                                      : ""
                                  }`}
                                  style={{
                                    background: getAvatarGradient(p.username),
                                  }}
                                >
                                  {p.username.charAt(0).toUpperCase()}
                                </div>
                                {/* Tooltip */}
                                <div className="tooltip">
                                  {p.username}
                                  <div className="tooltip-arrow"></div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {isLocked && (
                  <div className="locked-indicator">
                    <Lock size={14} />
                    <span>Picks Locked</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
