import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Trophy,
  Medal,
  Flame,
  Calendar,
  CalendarDays,
  Crown,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Zap,
} from "lucide-react-native";

import { supabase } from "../lib/supabase";
import { didTeamCover } from "../lib/gameLogic";
import { getLocalDate, formatLocalDate, formatDisplayDate } from "../lib/utils";
import Avatar from "../components/Avatar";
import {
  colors,
  spacing,
  fontSize,
  fontWeight,
  borderRadius,
  shadows,
} from "../theme";

export default function LeaderboardScreen() {
  const [profiles, setProfiles] = useState([]);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [weeklyWinners, setWeeklyWinners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("week");
  const [selectedDate, setSelectedDate] = useState(getLocalDate());
  const [showWeeklyChampions, setShowWeeklyChampions] = useState(false);
  const [expandedWeek, setExpandedWeek] = useState(null);
  const [weekRecords, setWeekRecords] = useState({});

  const getWeekStart = (date = new Date()) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return formatLocalDate(d);
  };

  const getWeekEnd = (date = new Date()) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? 0 : 7);
    d.setDate(diff);
    return formatLocalDate(d);
  };

  const changeDate = (days) => {
    const date = new Date(selectedDate + "T00:00:00");
    date.setDate(date.getDate() + days);
    setSelectedDate(formatLocalDate(date));
  };

  useEffect(() => {
    fetchData();
  }, [activeTab, selectedDate]);

  // Pre-calculate all weekly records when champions section is expanded
  useEffect(() => {
    if (showWeeklyChampions && weeklyWinners.length > 0) {
      weeklyWinners.forEach((winner) => {
        const weekKey = `${winner.week_start}_${winner.week_end}`;
        if (!weekRecords[weekKey]) {
          calculateWeekRecords(winner.week_start, winner.week_end);
        }
      });
    }
  }, [showWeeklyChampions, weeklyWinners]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("total_points", { ascending: false });

      if (profilesError) throw profilesError;
      setProfiles(profilesData || []);

      const { data: winnersData } = await supabase
        .from("weekly_winners")
        .select("*, profiles(username, email)")
        .order("week_start", { ascending: false });

      setWeeklyWinners(winnersData || []);

      await calculateRecords(profilesData || [], activeTab);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const calculateRecords = async (profilesList, period) => {
    try {
      let dateFilter = {};

      if (period === "daily") {
        dateFilter = { start: selectedDate, end: selectedDate };
      } else if (period === "week") {
        dateFilter = { start: getWeekStart(), end: getWeekEnd() };
      }

      if (period === "season") {
        const ranked = profilesList
          .map((profile) => ({
            ...profile,
            wins: profile.total_wins || 0,
            losses: profile.total_losses || 0,
            weeklyWins: profile.weekly_wins || 0,
          }))
          .sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            if (a.losses !== b.losses) return a.losses - b.losses;
            // Tiebreaker: more weekly champions wins
            return (b.weeklyWins || 0) - (a.weeklyWins || 0);
          });
        setLeaderboardData(ranked);
        return;
      }

      const { data: games, error: gamesError } = await supabase
        .from("games")
        .select("*")
        .gte("game_date", dateFilter.start)
        .lte("game_date", dateFilter.end)
        .eq("status", "finished");

      if (gamesError) throw gamesError;

      if (!games || games.length === 0) {
        const ranked = profilesList.map((profile) => ({
          ...profile,
          wins: 0,
          losses: 0,
          weeklyWins: profile.weekly_wins || 0,
          gamesCount: 0,
        }));
        setLeaderboardData(ranked);
        return;
      }

      const gameIds = games.map((g) => g.id);

      const { data: picks, error: picksError } = await supabase
        .from("picks")
        .select("user_id, game_id, selected_team")
        .in("game_id", gameIds);

      if (picksError) throw picksError;

      const userRecords = {};
      profilesList.forEach((p) => {
        userRecords[p.id] = { wins: 0, losses: 0 };
      });

      (picks || []).forEach((pick) => {
        const game = games.find((g) => g.id === pick.game_id);
        if (!game) return;

        const covered = didTeamCover(game, pick.selected_team);
        if (covered === null) return;

        if (!userRecords[pick.user_id]) {
          userRecords[pick.user_id] = { wins: 0, losses: 0 };
        }

        if (covered) {
          userRecords[pick.user_id].wins++;
        } else {
          userRecords[pick.user_id].losses++;
        }
      });

      const ranked = profilesList
        .map((profile) => ({
          ...profile,
          wins: userRecords[profile.id]?.wins || 0,
          losses: userRecords[profile.id]?.losses || 0,
          weeklyWins: profile.weekly_wins || 0,
          gamesCount: games.length,
        }))
        .sort((a, b) => {
          if (b.wins !== a.wins) return b.wins - a.wins;
          if (a.losses !== b.losses) return a.losses - b.losses;
          // Tiebreaker: more weekly champions wins
          return (b.weeklyWins || 0) - (a.weeklyWins || 0);
        });

      setLeaderboardData(ranked);
    } catch (error) {
      console.error("Error calculating records:", error);
    }
  };

  const getTabLabel = () => {
    switch (activeTab) {
      case "daily":
        return formatDisplayDate(selectedDate);
      case "week":
        return "This Week";
      case "season":
        return "Season";
      default:
        return "Standings";
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const calculateWeekRecords = async (weekStart, weekEnd) => {
    const weekKey = `${weekStart}_${weekEnd}`;
    if (weekRecords[weekKey]) {
      return weekRecords[weekKey];
    }

    // Historical records for weeks 1-3 (paper data)
    const historicalRecords = {
      "2025-11-10_2025-11-16": {
        // Week 1
        Jacoby: { wins: 4, losses: 11 },
        Caden: { wins: 8, losses: 7 },
        "David ": { wins: 6, losses: 9 },
      },
      "2025-11-17_2025-11-23": {
        // Week 2
        Jacoby: { wins: 12, losses: 10 },
        Caden: { wins: 10, losses: 12 },
        "David ": { wins: 14, losses: 8 },
      },
      "2025-11-24_2025-11-30": {
        // Week 3
        Jacoby: { wins: 39, losses: 28 },
        Caden: { wins: 33, losses: 34 },
        "David ": { wins: 35, losses: 32 },
      },
    };

    // Check if we have historical records for this week first (prioritize paper data)
    if (historicalRecords[weekKey]) {
      const weekData = historicalRecords[weekKey];
      const records = (profiles || [])
        .map((profile) => {
          const username = profile.username || profile.email || "";
          const usernameTrimmed = username.trim();
          // Try exact match first, then trimmed match
          const record =
            weekData[username] ||
            weekData[usernameTrimmed] ||
            (usernameTrimmed === "David" ? weekData["David "] : null);
          return {
            username: username,
            wins: record ? record.wins : null,
            losses: record ? record.losses : null,
            userId: profile.id,
            isHistorical: true,
          };
        })
        .sort((a, b) => {
          // Sort by wins (desc), then losses (asc)
          if (a.wins !== null && b.wins !== null) {
            if (b.wins !== a.wins) return b.wins - a.wins;
            return a.losses - b.losses;
          }
          if (a.wins !== null) return -1;
          if (b.wins !== null) return 1;
          return (a.username || "").localeCompare(b.username || "");
        });

      setWeekRecords((prev) => ({ ...prev, [weekKey]: records }));
      return records;
    }

    try {
      const { data: games, error: gamesError } = await supabase
        .from("games")
        .select("*")
        .gte("game_date", weekStart)
        .lte("game_date", weekEnd)
        .eq("status", "finished");

      if (gamesError) throw gamesError;
      if (!games || games.length === 0) {
        // No games in database for this week
        // Try to get at least the winner's record from weekly_winners
        const { data: winnerData } = await supabase
          .from("weekly_winners")
          .select("user_id, wins, losses")
          .eq("week_start", weekStart)
          .single();

        if (winnerData) {
          // Show all players, with winner having their record, others showing N/A
          const records = (profiles || [])
            .map((profile) => {
              if (profile.id === winnerData.user_id) {
                return {
                  username: profile.username || profile.email,
                  wins: winnerData.wins,
                  losses: winnerData.losses,
                  userId: profile.id,
                  isHistorical: true,
                };
              }
              return {
                username: profile.username || profile.email,
                wins: null, // N/A
                losses: null,
                userId: profile.id,
                isHistorical: true,
              };
            })
            .sort((a, b) => {
              // Sort winner first, then by name
              if (a.userId === winnerData.user_id) return -1;
              if (b.userId === winnerData.user_id) return 1;
              return (a.username || "").localeCompare(b.username || "");
            });

          setWeekRecords((prev) => ({ ...prev, [weekKey]: records }));
          return records;
        }
        return [];
      }

      const gameIds = games.map((g) => g.id);
      const { data: picks, error: picksError } = await supabase
        .from("picks")
        .select("user_id, game_id, selected_team")
        .in("game_id", gameIds);

      if (picksError) throw picksError;

      const userRecords = {};
      (profiles || []).forEach((p) => {
        userRecords[p.id] = {
          username: p.username || p.email,
          wins: 0,
          losses: 0,
          userId: p.id,
        };
      });

      picks.forEach((pick) => {
        const game = games.find((g) => g.id === pick.game_id);
        if (!game) return;

        const covered = didTeamCover(game, pick.selected_team);
        if (covered === null) return;

        if (!userRecords[pick.user_id]) {
          const profile = (profiles || []).find((p) => p.id === pick.user_id);
          userRecords[pick.user_id] = {
            username: profile?.username || profile?.email || "Unknown",
            wins: 0,
            losses: 0,
            userId: pick.user_id,
          };
        }

        if (covered) {
          userRecords[pick.user_id].wins++;
        } else {
          userRecords[pick.user_id].losses++;
        }
      });

      const records = Object.values(userRecords).sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        return a.losses - b.losses;
      });

      setWeekRecords((prev) => ({ ...prev, [weekKey]: records }));
      return records;
    } catch (error) {
      console.error("Error calculating week records:", error);
      return {};
    }
  };

  const handleWeekClick = async (winner) => {
    const weekKey = `${winner.week_start}_${winner.week_end}`;
    if (expandedWeek === weekKey) {
      setExpandedWeek(null);
    } else {
      setExpandedWeek(weekKey);
      await calculateWeekRecords(winner.week_start, winner.week_end);
    }
  };

  const renderPlayerRow = (profile, index) => {
    const wins = profile.wins || 0;
    const losses = profile.losses || 0;
    const total = wins + losses;
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0";
    const isTopThree = index < 3;
    const isLeader = index === 0 && wins > 0;

    return (
      <View
        key={profile.id}
        style={[
          styles.playerRow,
          isTopThree && styles.playerRowTop,
          isLeader && styles.playerRowLeader,
        ]}
      >
        {/* Rank */}
        <View style={styles.rankContainer}>
          {index === 0 && wins > 0 ? (
            <Trophy size={20} color="#eab308" />
          ) : index === 1 && wins > 0 ? (
            <Medal size={20} color="#94a3b8" />
          ) : index === 2 && wins > 0 ? (
            <Medal size={20} color="#b45309" />
          ) : (
            <Text style={styles.rankText}>#{index + 1}</Text>
          )}
        </View>

        {/* Player Info */}
        <View style={styles.playerInfo}>
          <Avatar username={profile.username || profile.email} size={36} />
          <View style={styles.playerDetails}>
            <Text style={styles.playerName} numberOfLines={1}>
              {profile.username || profile.email}
            </Text>
            {profile.weeklyWins > 0 && activeTab === "season" && (
              <View style={styles.championBadge}>
                <Crown size={10} color="#fbbf24" />
                <Text style={styles.championText}>
                  {profile.weeklyWins}x Champ
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <Text style={styles.recordText}>
            {wins}-{losses}
          </Text>
          <View style={styles.winRateBadge}>
            <Flame size={12} color="#60a5fa" />
            <Text style={styles.winRateText}>{winRate}%</Text>
          </View>
        </View>
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
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.iconBox}>
              <Zap size={20} color="white" />
            </View>
            <Text style={styles.headerTitle}>Leaderboard</Text>
          </View>
          <Text style={styles.headerSubtitle}>
            Track your performance and compete for weekly wins!
          </Text>
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "daily" && styles.tabActive]}
            onPress={() => setActiveTab("daily")}
          >
            <Calendar
              size={16}
              color={activeTab === "daily" ? "white" : colors.textMuted}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === "daily" && styles.tabTextActive,
              ]}
            >
              Daily
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "week" && styles.tabActive]}
            onPress={() => setActiveTab("week")}
          >
            <CalendarDays
              size={16}
              color={activeTab === "week" ? "white" : colors.textMuted}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === "week" && styles.tabTextActive,
              ]}
            >
              Week
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "season" && styles.tabActive]}
            onPress={() => setActiveTab("season")}
          >
            <Trophy
              size={16}
              color={activeTab === "season" ? "white" : colors.textMuted}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === "season" && styles.tabTextActive,
              ]}
            >
              Season
            </Text>
          </TouchableOpacity>
        </View>

        {/* Date Navigation (for Daily tab) */}
        {activeTab === "daily" && (
          <View style={styles.dateNav}>
            <TouchableOpacity
              onPress={() => changeDate(-1)}
              style={styles.dateButton}
            >
              <ChevronLeft size={20} color={colors.textMuted} />
            </TouchableOpacity>
            <View style={styles.dateDisplay}>
              <Calendar size={16} color={colors.info} />
              <Text style={styles.dateText}>
                {formatDisplayDate(selectedDate)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => changeDate(1)}
              style={styles.dateButton}
              disabled={selectedDate >= getLocalDate()}
            >
              <ChevronRight
                size={20}
                color={
                  selectedDate >= getLocalDate()
                    ? colors.border
                    : colors.textMuted
                }
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Weekly Winners - Only show on Season tab */}
        {activeTab === "season" && weeklyWinners.length > 0 && (
          <View style={styles.winnersSection}>
            <TouchableOpacity
              style={styles.winnersHeader}
              onPress={() => setShowWeeklyChampions(!showWeeklyChampions)}
              activeOpacity={0.7}
            >
              <View style={styles.winnersHeaderLeft}>
                <Crown size={18} color="#fbbf24" />
                <Text style={styles.winnersTitle}>Weekly Champions</Text>
              </View>
              <ChevronDown
                size={20}
                color="#94a3b8"
                style={{
                  transform: [
                    { rotate: showWeeklyChampions ? "180deg" : "0deg" },
                  ],
                }}
              />
            </TouchableOpacity>
            {showWeeklyChampions &&
              weeklyWinners.map((winner, idx) => {
                const weekKey = `${winner.week_start}_${winner.week_end}`;
                const isExpanded = expandedWeek === weekKey;
                const allRecords = weekRecords[weekKey] || [];
                // Get the winner's weekly record from calculated records, or use stored value as fallback
                const winnerRecord = allRecords.find(
                  (r) => r.userId === winner.user_id
                ) || {
                  wins:
                    winner.wins !== null && winner.wins !== undefined
                      ? winner.wins
                      : 0,
                  losses:
                    winner.losses !== null && winner.losses !== undefined
                      ? winner.losses
                      : 0,
                };

                return (
                  <View key={winner.id} style={styles.winnerContainer}>
                    <TouchableOpacity
                      style={styles.winnerItem}
                      onPress={() => handleWeekClick(winner)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.winnerWeek}>
                        Week {weeklyWinners.length - idx}:{" "}
                        {formatDisplayDate(winner.week_start)} -{" "}
                        {formatDisplayDate(winner.week_end)}
                      </Text>
                      <View style={styles.winnerInfo}>
                        <Avatar
                          username={
                            winner.profiles?.username || winner.profiles?.email
                          }
                          size={28}
                        />
                        <Text style={styles.winnerName}>
                          {winner.profiles?.username || winner.profiles?.email}
                        </Text>
                        <View style={styles.winnerRecord}>
                          <Text style={styles.winnerRecordText}>
                            {winnerRecord.wins}-{winnerRecord.losses}
                          </Text>
                        </View>
                        <ChevronDown
                          size={16}
                          color="#94a3b8"
                          style={{
                            transform: [
                              { rotate: isExpanded ? "180deg" : "0deg" },
                            ],
                          }}
                        />
                      </View>
                    </TouchableOpacity>
                    {isExpanded && allRecords.length > 0 && (
                      <View style={styles.weekAllRecords}>
                        <Text style={styles.weekRecordsHeader}>
                          All Players
                        </Text>
                        {allRecords.map((record) => {
                          const isWinner = record.userId === winner.user_id;
                          const hasData =
                            record.wins !== null && record.losses !== null;
                          return (
                            <View
                              key={record.userId}
                              style={[
                                styles.weekRecordItem,
                                isWinner && styles.weekRecordItemWinner,
                              ]}
                            >
                              <View style={styles.weekRecordPlayer}>
                                <Avatar username={record.username} size={20} />
                                <Text style={styles.weekRecordName}>
                                  {record.username}
                                </Text>
                                {isWinner && (
                                  <Crown size={12} color="#fbbf24" />
                                )}
                              </View>
                              <Text style={styles.weekRecordScore}>
                                {hasData
                                  ? `${record.wins}-${record.losses}`
                                  : "N/A"}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
          </View>
        )}

        {/* Standings Card */}
        <View style={styles.standingsCard}>
          <View style={styles.standingsHeader}>
            <Text style={styles.standingsTitle}>{getTabLabel()} Standings</Text>
            {(activeTab === "daily" || activeTab === "week") &&
              leaderboardData[0]?.gamesCount !== undefined && (
                <Text style={styles.gamesCount}>
                  {leaderboardData[0].gamesCount} games finished
                </Text>
              )}
          </View>

          {leaderboardData.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                No players yet. Be the first to join!
              </Text>
            </View>
          ) : (
            leaderboardData.map((profile, index) =>
              renderPlayerRow(profile, index)
            )
          )}

          <View style={styles.standingsFooter}>
            <Text style={styles.footerText}>
              Total Players:{" "}
              <Text style={styles.footerValue}>{profiles.length}</Text>
            </Text>
          </View>
        </View>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  header: {
    marginBottom: spacing.xl,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.info,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    color: colors.info,
  },
  headerSubtitle: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  tabActive: {
    backgroundColor: colors.info,
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: "white",
  },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    marginBottom: spacing.lg,
  },
  dateButton: {
    padding: spacing.sm,
  },
  dateDisplay: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  dateText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textMain,
  },
  winnersSection: {
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(234, 179, 8, 0.2)",
  },
  winnersHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.md,
  },
  winnersHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  winnersTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: "#fbbf24",
  },
  winnerContainer: {
    marginBottom: spacing.sm,
  },
  winnerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(30, 41, 59, 0.5)",
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  winnerWeek: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  winnerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  winnerName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textMain,
  },
  winnerRecord: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  winnerRecordText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.success,
  },
  weekAllRecords: {
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    marginLeft: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: "rgba(234, 179, 8, 0.3)",
  },
  weekRecordsHeader: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: fontWeight.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  weekRecordItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(30, 41, 59, 0.3)",
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  weekRecordItemWinner: {
    backgroundColor: "rgba(234, 179, 8, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(234, 179, 8, 0.2)",
  },
  weekRecordPlayer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  weekRecordName: {
    fontWeight: fontWeight.medium,
    color: colors.textMain,
    fontSize: fontSize.sm,
    flex: 1,
  },
  weekRecordScore: {
    fontSize: fontSize.sm,
    color: colors.success,
    fontWeight: fontWeight.bold,
  },
  standingsCard: {
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    borderRadius: borderRadius.lg,
    overflow: "hidden",
  },
  standingsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(51, 65, 85, 0.5)",
    backgroundColor: "rgba(30, 41, 59, 0.3)",
  },
  standingsTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
  },
  gamesCount: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(51, 65, 85, 0.3)",
  },
  playerRowTop: {
    backgroundColor: "rgba(30, 41, 59, 0.2)",
  },
  playerRowLeader: {
    backgroundColor: "rgba(234, 179, 8, 0.1)",
  },
  rankContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: "rgba(30, 41, 59, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  rankText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
  },
  playerInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  playerDetails: {
    flex: 1,
  },
  playerName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textMain,
  },
  championBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(234, 179, 8, 0.15)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  championText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: "#fbbf24",
  },
  statsContainer: {
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  recordText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textMain,
  },
  winRateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: "rgba(59, 130, 246, 0.2)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.3)",
  },
  winRateText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: "#93c5fd",
  },
  emptyState: {
    padding: spacing.xxxl,
    alignItems: "center",
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  standingsFooter: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(51, 65, 85, 0.5)",
    backgroundColor: "rgba(30, 41, 59, 0.3)",
  },
  footerText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  footerValue: {
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
});
