import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Download, RefreshCw, Settings } from "lucide-react-native";

import { supabase } from "../lib/supabase";
import { fetchDailyGames } from "../lib/espn";
import { didTeamCover } from "../lib/gameLogic";
import {
  colors,
  spacing,
  fontSize,
  fontWeight,
  borderRadius,
  shadows,
} from "../theme";

export default function AdminScreen() {
  const getLocalDateFormatted = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    const localDate = new Date(d.getTime() - offset);
    return localDate.toISOString().split("T")[0].replace(/-/g, "");
  };

  const [date, setDate] = useState(getLocalDateFormatted());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

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
      const MAJOR_CONFERENCES = ["2", "4", "7", "8", "23"];

      for (const game of games) {
        if (
          game.spread_value === null ||
          game.spread_value === undefined ||
          Math.abs(game.spread_value) > 12
        ) {
          continue;
        }

        const teamAConf = String(game.team_a_conf_id);
        const teamBConf = String(game.team_b_conf_id);
        if (
          !MAJOR_CONFERENCES.includes(teamAConf) &&
          !MAJOR_CONFERENCES.includes(teamBConf)
        ) {
          continue;
        }

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
      const uniqueDates = [
        ...new Set(
          activeGames
            .filter((g) => g.start_time)
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
            const newStatus =
              espnGame.status === "post" ? "finished" : "in_progress";

            if (
              dbGame.status !== newStatus ||
              dbGame.result_a !== espnGame.result_a ||
              dbGame.result_b !== espnGame.result_b
            ) {
              const updates = {
                status: newStatus,
                team_a_record: espnGame.team_a_record,
                team_a_rank: espnGame.team_a_rank,
                team_b_record: espnGame.team_b_record,
                team_b_rank: espnGame.team_b_rank,
              };

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
              } else {
                updatedCount++;
              }

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
        const isWin = didTeamCover(gameData, pick.selected_team);
        if (isWin === null) continue;

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("total_points, total_wins, total_losses")
          .eq("id", pick.user_id)
          .single();

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
    Alert.alert(
      "Recalculate Stats",
      "Are you sure? This will reset all user stats and recalculate them based on finished games.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Recalculate",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            setMessage("Resetting stats...");

            try {
              const { error: resetError } = await supabase
                .from("profiles")
                .update({ total_points: 0, total_wins: 0, total_losses: 0 })
                .neq("id", "00000000-0000-0000-0000-000000000000");

              if (resetError) throw resetError;

              const { data: finishedGames, error: gamesError } = await supabase
                .from("games")
                .select("*")
                .eq("status", "finished");

              if (gamesError) throw gamesError;

              setMessage(
                `Recalculating for ${finishedGames.length} finished games...`
              );

              let processedGames = 0;
              for (const game of finishedGames) {
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
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconBox}>
            <Settings size={24} color="white" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Admin Panel</Text>
            <Text style={styles.headerSubtitle}>Manage games and scores</Text>
          </View>
        </View>

        {/* Admin Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ESPN Integration</Text>

          {/* Date Input */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Date (YYYYMMDD)</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="20251126"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
            />
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={handleImportGames}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Download size={20} color="white" />
              )}
              <Text style={styles.buttonText}>Import</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={handleSyncScores}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <RefreshCw size={20} color="white" />
              )}
              <Text style={styles.buttonText}>Sync</Text>
            </TouchableOpacity>
          </View>

          {/* Recalculate Button */}
          <TouchableOpacity
            style={[styles.button, styles.buttonDanger, styles.buttonFull]}
            onPress={handleRecalculateStats}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <RefreshCw size={20} color="white" />
            )}
            <Text style={styles.buttonText}>Recalculate All Stats</Text>
          </TouchableOpacity>

          {/* Message */}
          {message !== "" && (
            <View
              style={[
                styles.messageContainer,
                message.includes("Success") || message.includes("Synced")
                  ? styles.messageSuccess
                  : styles.messageDefault,
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  message.includes("Success") || message.includes("Synced")
                    ? styles.messageTextSuccess
                    : styles.messageTextDefault,
                ]}
              >
                {message}
              </Text>
            </View>
          )}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    color: colors.textMain,
  },
  headerSubtitle: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.bgSurface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textMain,
    marginBottom: spacing.xl,
  },
  formGroup: {
    marginBottom: spacing.xl,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textMain,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.bgBody,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.md,
    color: colors.textMain,
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  buttonFull: {
    flex: undefined,
    width: "100%",
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
  },
  buttonSecondary: {
    backgroundColor: colors.bgBody,
  },
  buttonDanger: {
    backgroundColor: colors.danger,
  },
  buttonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: "white",
  },
  messageContainer: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
  },
  messageDefault: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  messageSuccess: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  messageText: {
    fontSize: fontSize.sm,
  },
  messageTextDefault: {
    color: colors.danger,
  },
  messageTextSuccess: {
    color: colors.success,
  },
});
