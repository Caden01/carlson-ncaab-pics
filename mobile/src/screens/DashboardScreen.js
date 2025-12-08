import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Lock,
  CheckCircle,
  XCircle,
  Trophy,
  User,
  Settings,
} from "lucide-react-native";

import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { fetchDailyGames } from "../lib/espn";
import { didTeamCover } from "../lib/gameLogic";
import { importGamesForDate } from "../lib/gameImport";
import { getLocalDate, formatDisplayDate, formatTime } from "../lib/utils";
import Avatar from "../components/Avatar";
import {
  colors,
  spacing,
  fontSize,
  fontWeight,
  borderRadius,
  shadows,
} from "../theme";

export default function DashboardScreen({ navigation }) {
  const { user, isAdmin } = useAuth();
  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getLocalDate());

  const gamesRef = useRef(games);
  useEffect(() => {
    gamesRef.current = games;
  }, [games]);

  useEffect(() => {
    if (user) {
      fetchGamesAndPicks();
    }

    // Real-time subscription for game updates
    const subscription = supabase
      .channel("public:games")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games" },
        (payload) => {
          if (payload.new && payload.new.id) {
            setGames((prevGames) =>
              prevGames.map((game) =>
                game.id === payload.new.id ? { ...game, ...payload.new } : game
              )
            );
          }
        }
      )
      .subscribe();

    // Polling for live scores
    const interval = setInterval(async () => {
      const currentGames = gamesRef.current;
      const hasActiveGames = currentGames.some(
        (g) => g.status === "in_progress"
      );
      if (hasActiveGames && selectedDate === getLocalDate()) {
        await syncLiveScores();
      }
    }, 60000);

    return () => {
      supabase.removeChannel(subscription);
      clearInterval(interval);
    };
  }, [user, selectedDate]);

  // Set up header with navigation buttons
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerButtons}>
          <TouchableOpacity
            onPress={() => navigation.navigate("Leaderboard")}
            style={styles.headerButton}
          >
            <Trophy size={22} color={colors.textMain} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate("Profile")}
            style={styles.headerButton}
          >
            <User size={22} color={colors.textMain} />
          </TouchableOpacity>
          {isAdmin && user?.email === "crcgames3@gmail.com" && (
            <TouchableOpacity
              onPress={() => navigation.navigate("Admin")}
              style={styles.headerButton}
            >
              <Settings size={22} color={colors.textMain} />
            </TouchableOpacity>
          )}
        </View>
      ),
    });
  }, [navigation, isAdmin, user]);

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

      // Auto-import if no games found
      if (finalGamesData.length === 0) {
        const dateStr = selectedDate.replace(/-/g, "");
        const importedCount = await importGamesForDate(dateStr);

        if (importedCount > 0) {
          const { data: refetchedGames } = await supabase
            .from("games")
            .select("*")
            .eq("game_date", selectedDate)
            .order("start_time", { ascending: true });

          if (refetchedGames) {
            finalGamesData = refetchedGames;
          }
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

      if (finalGamesData.length > 0) {
        syncLiveScores(finalGamesData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      Alert.alert("Error", "Failed to load games");
    } finally {
      setLoading(false);
      setRefreshing(false);
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
          const newStatus =
            espnGame.status === "post"
              ? "finished"
              : espnGame.status === "pre"
              ? "scheduled"
              : "in_progress";

          if (
            dbGame.status !== newStatus ||
            dbGame.result_a !== espnGame.result_a ||
            dbGame.result_b !== espnGame.result_b
          ) {
            const updates = { status: newStatus };

            if (
              dbGame.team_a === espnGame.team_b &&
              dbGame.team_b === espnGame.team_a
            ) {
              updates.result_a = espnGame.result_b;
              updates.result_b = espnGame.result_a;
            } else {
              updates.result_a = espnGame.result_a;
              updates.result_b = espnGame.result_b;
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
        (p) => p.user_id === user.id
      );

      const newPickObj = {
        game_id: gameId,
        selected_team: team,
        user_id: user.id,
        username: user.user_metadata?.username || user.email || "You",
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
          user_id: user.id,
          game_id: gameId,
          selected_team: team,
        },
        { onConflict: "user_id, game_id" }
      );

      if (error) throw error;
    } catch (error) {
      console.error("Error saving pick:", error);
      setPicks(previousPicks);
      Alert.alert("Error", "Failed to save pick. Please try again.");
    }
  };

  const isGameLocked = (startTime) => {
    if (isAdmin) return false;
    return new Date() >= new Date(startTime);
  };

  const changeDate = (days) => {
    const date = new Date(selectedDate + "T00:00:00");
    date.setDate(date.getDate() + days);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    setSelectedDate(`${year}-${month}-${day}`);
  };

  const getPickStatus = (game, userPick) => {
    if (game.status !== "finished" && game.status !== "post") return null;
    if (!userPick) return null;

    const isWin = didTeamCover(game, userPick);
    if (isWin === null) return null;

    return isWin ? "correct" : "incorrect";
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchGamesAndPicks();
  }, [selectedDate]);

  const renderGameCard = (game) => {
    const isLocked = isGameLocked(game.start_time);
    const gamePicks = picks[game.id] || [];
    const userPickObj = gamePicks.find((p) => p.user_id === user.id);
    const userPick = userPickObj ? userPickObj.selected_team : null;
    const pickStatus = getPickStatus(game, userPick);

    const teamAPicks = gamePicks.filter((p) => p.selected_team === game.team_a);
    const teamBPicks = gamePicks.filter((p) => p.selected_team === game.team_b);

    return (
      <View key={game.id} style={styles.gameCard}>
        {/* Game Header */}
        <View style={styles.gameHeader}>
          <View style={styles.gameTimeContainer}>
            {game.status === "in_progress" ? (
              <Text style={styles.liveText}>LIVE</Text>
            ) : (
              <Text style={styles.gameTime}>{formatTime(game.start_time)}</Text>
            )}
          </View>
          {game.spread && (
            <View style={styles.spreadBadge}>
              <Text style={styles.spreadText}>{game.spread}</Text>
            </View>
          )}
        </View>

        {/* Teams */}
        <View style={styles.teamsContainer}>
          {/* Team A */}
          <TouchableOpacity
            style={[
              styles.teamButton,
              userPick === game.team_a && styles.teamButtonSelected,
              isLocked && styles.teamButtonLocked,
              pickStatus === "correct" &&
                userPick === game.team_a &&
                styles.teamButtonCorrect,
              pickStatus === "incorrect" &&
                userPick === game.team_a &&
                styles.teamButtonIncorrect,
            ]}
            onPress={() => !isLocked && handlePick(game.id, game.team_a)}
            disabled={isLocked}
          >
            <View style={styles.teamInfo}>
              {game.team_a_rank && (
                <Text style={styles.rank}>#{game.team_a_rank}</Text>
              )}
              <Text
                style={[
                  styles.teamName,
                  userPick === game.team_a && styles.teamNameSelected,
                ]}
                numberOfLines={1}
              >
                {game.team_a}
              </Text>
              {game.status !== "scheduled" &&
                game.result_a !== null &&
                game.result_b !== null && (
                  <Text style={styles.teamScore}>{game.result_a}</Text>
                )}
              {game.team_a_record && (
                <Text style={styles.record}>({game.team_a_record})</Text>
              )}
            </View>
            <View style={styles.teamStatus}>
              {pickStatus === "correct" && userPick === game.team_a && (
                <CheckCircle size={18} color={colors.success} />
              )}
              {pickStatus === "incorrect" && userPick === game.team_a && (
                <XCircle size={18} color={colors.danger} />
              )}
              {game.status === "finished" &&
                didTeamCover(game, game.team_a) && (
                  <View style={styles.coverBadge}>
                    <Text style={styles.coverText}>Covered</Text>
                  </View>
                )}
            </View>
          </TouchableOpacity>

          {/* Team A Picks Avatars */}
          {teamAPicks.length > 0 && (
            <View style={styles.picksRow}>
              {teamAPicks.slice(0, 5).map((pick, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.avatarWrapper,
                    idx > 0 && styles.avatarOverlap,
                  ]}
                >
                  <Avatar
                    username={pick.username}
                    size={24}
                    isActive={pick.user_id === user.id}
                  />
                </View>
              ))}
              {teamAPicks.length > 5 && (
                <Text style={styles.moreText}>+{teamAPicks.length - 5}</Text>
              )}
            </View>
          )}

          {/* VS Badge */}
          <View style={styles.vsBadge}>
            <Text style={styles.vsText}>VS</Text>
          </View>

          {/* Team B */}
          <TouchableOpacity
            style={[
              styles.teamButton,
              userPick === game.team_b && styles.teamButtonSelected,
              isLocked && styles.teamButtonLocked,
              pickStatus === "correct" &&
                userPick === game.team_b &&
                styles.teamButtonCorrect,
              pickStatus === "incorrect" &&
                userPick === game.team_b &&
                styles.teamButtonIncorrect,
            ]}
            onPress={() => !isLocked && handlePick(game.id, game.team_b)}
            disabled={isLocked}
          >
            <View style={styles.teamInfo}>
              {game.team_b_rank && (
                <Text style={styles.rank}>#{game.team_b_rank}</Text>
              )}
              <Text
                style={[
                  styles.teamName,
                  userPick === game.team_b && styles.teamNameSelected,
                ]}
                numberOfLines={1}
              >
                {game.team_b}
              </Text>
              {game.status !== "scheduled" &&
                game.result_a !== null &&
                game.result_b !== null && (
                  <Text style={styles.teamScore}>{game.result_b}</Text>
                )}
              {game.team_b_record && (
                <Text style={styles.record}>({game.team_b_record})</Text>
              )}
            </View>
            <View style={styles.teamStatus}>
              {pickStatus === "correct" && userPick === game.team_b && (
                <CheckCircle size={18} color={colors.success} />
              )}
              {pickStatus === "incorrect" && userPick === game.team_b && (
                <XCircle size={18} color={colors.danger} />
              )}
              {game.status === "finished" &&
                didTeamCover(game, game.team_b) && (
                  <View style={styles.coverBadge}>
                    <Text style={styles.coverText}>Covered</Text>
                  </View>
                )}
            </View>
          </TouchableOpacity>

          {/* Team B Picks Avatars */}
          {teamBPicks.length > 0 && (
            <View style={[styles.picksRow, styles.picksRowRight]}>
              {teamBPicks.slice(0, 5).map((pick, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.avatarWrapper,
                    idx > 0 && styles.avatarOverlap,
                  ]}
                >
                  <Avatar
                    username={pick.username}
                    size={24}
                    isActive={pick.user_id === user.id}
                  />
                </View>
              ))}
              {teamBPicks.length > 5 && (
                <Text style={styles.moreText}>+{teamBPicks.length - 5}</Text>
              )}
            </View>
          )}
        </View>

        {/* Locked Indicator */}
        {isLocked && (
          <View style={styles.lockedIndicator}>
            <Lock size={14} color={colors.textMuted} />
            <Text style={styles.lockedText}>Picks Locked</Text>
          </View>
        )}
      </View>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      {/* Date Navigation */}
      <View style={styles.dateNav}>
        <TouchableOpacity
          onPress={() => changeDate(-1)}
          style={styles.dateButton}
        >
          <ChevronLeft size={24} color={colors.textMain} />
        </TouchableOpacity>
        <View style={styles.dateDisplay}>
          <Calendar size={18} color={colors.info} />
          <Text style={styles.dateText}>{formatDisplayDate(selectedDate)}</Text>
        </View>
        <TouchableOpacity
          onPress={() => changeDate(1)}
          style={styles.dateButton}
        >
          <ChevronRight size={24} color={colors.textMain} />
        </TouchableOpacity>
      </View>

      {/* Games List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {games.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              No games scheduled for this date.
            </Text>
          </View>
        ) : (
          games.map(renderGameCard)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBody,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bgBody,
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerButton: {
    padding: spacing.sm,
    marginLeft: spacing.xs,
  },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dateButton: {
    padding: spacing.sm,
  },
  dateDisplay: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  dateText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textMain,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  emptyState: {
    padding: spacing.xxxl,
    alignItems: "center",
    backgroundColor: colors.bgSurface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  gameCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
  },
  gameHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  gameTimeContainer: {
    flex: 1,
  },
  gameTime: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  liveText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.danger,
  },
  spreadBadge: {
    backgroundColor: "rgba(234, 88, 12, 0.15)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(234, 88, 12, 0.3)",
    flexShrink: 0,
  },
  spreadText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  teamScore: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textMain,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    borderRadius: borderRadius.sm,
    flexShrink: 0,
  },
  score: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textMain,
  },
  teamsContainer: {
    gap: spacing.sm,
  },
  teamButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bgBody,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  teamButtonSelected: {
    borderColor: colors.primary,
    backgroundColor: "rgba(234, 88, 12, 0.1)",
  },
  teamButtonLocked: {
    opacity: 0.6,
  },
  teamButtonCorrect: {
    borderColor: colors.success,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
  },
  teamButtonIncorrect: {
    borderColor: colors.danger,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  teamInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  rank: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: fontWeight.semibold,
  },
  teamName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textMain,
    flexShrink: 1,
    minWidth: 80,
  },
  teamNameSelected: {
    color: colors.primary,
  },
  record: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  teamStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  coverBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  coverText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: "white",
  },
  vsBadge: {
    alignSelf: "center",
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginVertical: -spacing.md,
    zIndex: 10,
  },
  vsText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
  },
  picksRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  picksRowRight: {
    justifyContent: "flex-end",
  },
  avatarWrapper: {
    borderWidth: 2,
    borderColor: colors.bgSurface,
    borderRadius: borderRadius.full,
  },
  avatarOverlap: {
    marginLeft: -spacing.sm,
  },
  moreText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginLeft: spacing.xs,
    alignSelf: "center",
  },
  lockedIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  lockedText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
