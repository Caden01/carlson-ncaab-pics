/**
 * Fetches NCAAB games for a specific date from ESPN's hidden API.
 * Optionally uses The Odds API for more reliable spread data.
 *
 * @param {string} date - Date string in YYYYMMDD format (e.g., '20251126').
 * @param {string} oddsApiKey - Optional. If provided, uses hybrid approach with Odds API for spreads.
 * @returns {Promise<Array>} - Array of normalized game objects.
 */
export const fetchDailyGames = async (date, oddsApiKey = null) => {
  // If Odds API key is provided, use hybrid approach
  if (oddsApiKey) {
    return fetchDailyGamesHybrid(date, oddsApiKey);
  }

  // Otherwise, use ESPN only
  try {
    const response = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${date}&groups=50&limit=1000`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch from ESPN");
    }

    const data = await response.json();
    const events = data.events || [];

    return events
      .map((event) => {
        const competition = event.competitions?.[0];
        if (!competition) return null;

        const competitors = competition.competitors || [];
        const homeTeam = competitors.find((c) => c.homeAway === "home");
        const awayTeam = competitors.find((c) => c.homeAway === "away");

        // Skip if we don't have both teams
        if (!homeTeam || !awayTeam) return null;

        // Ensure teams have required properties
        if (!homeTeam.team || !awayTeam.team) return null;

        // Ensure event has status
        if (!event.status?.type) return null;

        let spread = null;
        let spread_value = null;
        if (competition.odds && competition.odds.length > 0) {
          // Look through all odds entries to find the favorite's spread (negative value)
          // ESPN often provides multiple odds entries - one for favorite, one for underdog
          const favoriteOdds = competition.odds.find((odds) => odds.spread < 0);

          if (favoriteOdds) {
            // Found favorite spread directly - validate team and use it
            const spreadDetails = favoriteOdds.details || "";
            const parts = spreadDetails.trim().split(/\s+/);
            if (parts.length >= 2) {
              const spreadTeamIdentifier = parts[0].toUpperCase().trim();
              const awayAbbrev = (awayTeam.team.abbreviation || "")
                .toUpperCase()
                .trim();
              const homeAbbrev = (homeTeam.team.abbreviation || "")
                .toUpperCase()
                .trim();
              const awayName = (awayTeam.team.displayName || "").toUpperCase();
              const homeName = (homeTeam.team.displayName || "").toUpperCase();

              spread_value = favoriteOdds.spread;

              // Determine which team is the favorite by matching the spread details
              // Use strict matching - abbreviation must match exactly or be a word boundary match
              let favoriteAbbrev = null;

              // Method 1: Exact abbreviation match (most reliable)
              if (spreadTeamIdentifier === awayAbbrev) {
                favoriteAbbrev = awayTeam.team.abbreviation;
              } else if (spreadTeamIdentifier === homeAbbrev) {
                favoriteAbbrev = homeTeam.team.abbreviation;
              }
              // Method 2: Check if the spread details contain the abbreviation as a standalone word
              else if (
                awayAbbrev &&
                spreadDetails.toUpperCase().split(/\s+/)[0] === awayAbbrev
              ) {
                favoriteAbbrev = awayTeam.team.abbreviation;
              } else if (
                homeAbbrev &&
                spreadDetails.toUpperCase().split(/\s+/)[0] === homeAbbrev
              ) {
                favoriteAbbrev = homeTeam.team.abbreviation;
              }
              // Method 3: Check if first word of team name matches (for cases like "Duke -5.5")
              else {
                const awayFirstWord = awayName.split(" ")[0];
                const homeFirstWord = homeName.split(" ")[0];
                // Only match if it's a substantial match (at least 3 chars and exact match)
                if (
                  awayFirstWord.length >= 3 &&
                  spreadTeamIdentifier === awayFirstWord
                ) {
                  favoriteAbbrev = awayTeam.team.abbreviation;
                } else if (
                  homeFirstWord.length >= 3 &&
                  spreadTeamIdentifier === homeFirstWord
                ) {
                  favoriteAbbrev = homeTeam.team.abbreviation;
                } else {
                  // Can't determine - use original (might be incorrect)
                  spread = favoriteOdds.details;
                }
              }

              if (favoriteAbbrev) {
                // Reconstruct spread string with correct team abbreviation
                spread = `${favoriteAbbrev} ${spread_value}`;
              }
            } else {
              // Invalid format, skip
              spread = null;
              spread_value = null;
            }
          } else {
            // No favorite spread found, try to convert from underdog spread
            // Only use the first underdog entry if we can't find a favorite
            const underdogOdds = competition.odds.find(
              (odds) => odds.spread > 0
            );
            if (underdogOdds) {
              // Underdog spread (positive) - but check details string first
              // ESPN sometimes has details like "TTU -5.5" even when spread is positive
              const spreadDetails = underdogOdds.details || "";
              const parts = spreadDetails.trim().split(/\s+/);

              // Check if details string contains a negative spread (e.g., "TTU -5.5")
              // This means the team in details is actually the favorite
              if (parts.length >= 2) {
                const detailsSpreadValue = parseFloat(parts[parts.length - 1]);
                if (detailsSpreadValue < 0) {
                  // Details show negative spread, so the team in details is the favorite
                  const favoriteIdentifier = parts
                    .slice(0, -1)
                    .join(" ")
                    .toUpperCase()
                    .trim();
                  const awayAbbrev = (awayTeam.team.abbreviation || "")
                    .toUpperCase()
                    .trim();
                  const homeAbbrev = (homeTeam.team.abbreviation || "")
                    .toUpperCase()
                    .trim();
                  const awayName = (
                    awayTeam.team.displayName || ""
                  ).toUpperCase();
                  const homeName = (
                    homeTeam.team.displayName || ""
                  ).toUpperCase();
                  const spreadUpper = spreadDetails.toUpperCase();

                  // Match the favorite team from details using strict matching
                  let favoriteAbbrev = null;

                  // Method 1: Exact abbreviation match (most reliable)
                  if (favoriteIdentifier === awayAbbrev) {
                    favoriteAbbrev = awayTeam.team.abbreviation;
                  } else if (favoriteIdentifier === homeAbbrev) {
                    favoriteAbbrev = homeTeam.team.abbreviation;
                  }
                  // Method 2: Check if first word of spread details matches abbreviation exactly
                  else if (
                    awayAbbrev &&
                    spreadUpper.split(/\s+/)[0] === awayAbbrev
                  ) {
                    favoriteAbbrev = awayTeam.team.abbreviation;
                  } else if (
                    homeAbbrev &&
                    spreadUpper.split(/\s+/)[0] === homeAbbrev
                  ) {
                    favoriteAbbrev = homeTeam.team.abbreviation;
                  }
                  // Method 3: Check if first word of team name matches exactly
                  else {
                    const awayFirstWord = awayName.split(" ")[0];
                    const homeFirstWord = homeName.split(" ")[0];
                    if (
                      awayFirstWord.length >= 3 &&
                      favoriteIdentifier === awayFirstWord
                    ) {
                      favoriteAbbrev = awayTeam.team.abbreviation;
                    } else if (
                      homeFirstWord.length >= 3 &&
                      favoriteIdentifier === homeFirstWord
                    ) {
                      favoriteAbbrev = homeTeam.team.abbreviation;
                    }
                  }

                  if (favoriteAbbrev) {
                    spread_value = detailsSpreadValue;
                    spread = `${favoriteAbbrev} ${spread_value}`;
                  }
                } else {
                  // Details show positive spread, so team in details is underdog
                  // Convert to favorite spread
                  const underdogIdentifier = parts[0].toUpperCase().trim();
                  const awayAbbrev = (awayTeam.team.abbreviation || "")
                    .toUpperCase()
                    .trim();
                  const homeAbbrev = (homeTeam.team.abbreviation || "")
                    .toUpperCase()
                    .trim();
                  const awayName = (
                    awayTeam.team.displayName || ""
                  ).toUpperCase();
                  const homeName = (
                    homeTeam.team.displayName || ""
                  ).toUpperCase();
                  const spreadUpper = spreadDetails.toUpperCase();

                  // Determine which team is the underdog using strict matching
                  let isAwayUnderdog = false;
                  let isHomeUnderdog = false;

                  // Method 1: Direct abbreviation match (most reliable)
                  if (awayAbbrev && awayAbbrev === underdogIdentifier) {
                    isAwayUnderdog = true;
                  } else if (homeAbbrev && homeAbbrev === underdogIdentifier) {
                    isHomeUnderdog = true;
                  }
                  // Method 2: Check if first word of spread string matches abbreviation exactly
                  else if (
                    awayAbbrev &&
                    spreadUpper.split(/\s+/)[0] === awayAbbrev
                  ) {
                    isAwayUnderdog = true;
                  } else if (
                    homeAbbrev &&
                    spreadUpper.split(/\s+/)[0] === homeAbbrev
                  ) {
                    isHomeUnderdog = true;
                  }
                  // Method 3: Check if first word of team name matches exactly
                  else {
                    const awayFirstWord = awayName.split(" ")[0];
                    const homeFirstWord = homeName.split(" ")[0];
                    if (
                      awayFirstWord.length >= 3 &&
                      underdogIdentifier === awayFirstWord
                    ) {
                      isAwayUnderdog = true;
                    } else if (
                      homeFirstWord.length >= 3 &&
                      underdogIdentifier === homeFirstWord
                    ) {
                      isHomeUnderdog = true;
                    }
                  }

                  // If we identified the underdog, create favorite spread
                  if (isAwayUnderdog) {
                    // Away team is underdog, so home team is favorite
                    spread_value = -Math.abs(underdogOdds.spread);
                    spread = `${homeTeam.team.abbreviation} ${spread_value}`;
                  } else if (isHomeUnderdog) {
                    // Home team is underdog, so away team is favorite
                    spread_value = -Math.abs(underdogOdds.spread);
                    spread = `${awayTeam.team.abbreviation} ${spread_value}`;
                  }
                  // If we can't determine, leave spread as null (better than wrong spread)
                }
              }
            }
          }
        }

        const getRecord = (team) => {
          const record = team?.records?.find((r) => r.type === "total");
          return record ? record.summary : "";
        };

        const getRank = (team) => {
          return team?.curatedRank?.current <= 25
            ? team?.curatedRank?.current
            : null;
        };

        return {
          external_id: event.id,
          start_time: event.date, // ISO string
          status: event.status.type.state, // 'pre', 'in', 'post'
          team_a: awayTeam.team.displayName,
          team_b: homeTeam.team.displayName,
          result_a: awayTeam.score ? parseInt(awayTeam.score, 10) : null,
          result_b: homeTeam.score ? parseInt(homeTeam.score, 10) : null,
          // Helper for UI
          team_a_logo: awayTeam.team.logo,
          team_b_logo: homeTeam.team.logo,
          spread: spread,
          spread_value: spread_value,
          team_a_record: getRecord(awayTeam),
          team_a_rank: getRank(awayTeam),
          team_a_conf_id: awayTeam.team.conferenceId,
          team_a_abbrev: awayTeam.team.abbreviation,
          team_b_record: getRecord(homeTeam),
          team_b_rank: getRank(homeTeam),
          team_b_conf_id: homeTeam.team.conferenceId,
          team_b_abbrev: homeTeam.team.abbreviation,
          game_date: `${date.substring(0, 4)}-${date.substring(
            4,
            6
          )}-${date.substring(6, 8)}`,
        };
      })
      .filter(Boolean); // Remove any null entries
  } catch (error) {
    console.error("ESPN API Error:", error);
    return [];
  }
};

/**
 * Hybrid approach: Use ESPN for game data, Odds API for spreads
 * This gives you the best of both worlds - ESPN's comprehensive game data
 * with The Odds API's reliable spread information.
 */
async function fetchDailyGamesHybrid(date, oddsApiKey) {
  try {
    // Convert date for Odds API
    const year = date.substring(0, 4);
    const month = date.substring(4, 6);
    const day = date.substring(6, 8);
    const isoDate = `${year}-${month}-${day}T00:00:00Z`;

    // Fetch from both APIs in parallel
    const [espnResponse, oddsResponse] = await Promise.all([
      fetch(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${date}&groups=50&limit=1000`
      ).then((r) => r.json()),
      fetch(
        `https://api.the-odds-api.com/v4/sports/basketball_ncaab/odds/?regions=us&markets=spreads&dateFormat=iso&commenceTimeFrom=${isoDate}&commenceTimeTo=${year}-${month}-${day}T23:59:59Z&apiKey=${oddsApiKey}`
      ).then((r) => {
        if (!r.ok) throw new Error(`Odds API error: ${r.status}`);
        return r.json();
      }),
    ]);

    const espnEvents = espnResponse.events || [];
    const oddsGames = oddsResponse || [];

    // Create a map of Odds API games by team names (normalized)
    const oddsMap = new Map();
    oddsGames.forEach((game) => {
      if (game.bookmakers && game.bookmakers.length > 0) {
        // Get consensus spread
        const spreads = [];
        for (const bookmaker of game.bookmakers) {
          const spreadMarket = bookmaker.markets?.find(
            (m) => m.key === "spreads"
          );
          if (spreadMarket && spreadMarket.outcomes) {
            for (const outcome of spreadMarket.outcomes) {
              if (outcome.point !== undefined) {
                spreads.push({
                  team: outcome.name,
                  point: outcome.point,
                });
              }
            }
          }
        }

        if (spreads.length > 0) {
          // Find consensus spread (most common absolute point value)
          // Group by absolute value since favorite has -X and underdog has +X for same game
          const spreadCounts = {};
          spreads.forEach((s) => {
            const absPoint = Math.abs(s.point);
            const key = `${absPoint}`;
            if (!spreadCounts[key]) {
              spreadCounts[key] = {
                absPoint: absPoint,
                favoritePoint: null,
                underdogPoint: null,
                favoriteTeams: [],
                underdogTeams: [],
                count: 0,
              };
            }
            if (s.point < 0) {
              // Favorite (negative spread)
              spreadCounts[key].favoritePoint = s.point;
              spreadCounts[key].favoriteTeams.push(s.team);
            } else {
              // Underdog (positive spread)
              spreadCounts[key].underdogPoint = s.point;
              spreadCounts[key].underdogTeams.push(s.team);
            }
            spreadCounts[key].count++;
          });

          // Find the most common absolute spread value
          let maxCount = 0;
          let consensusSpread = null;
          for (const [, value] of Object.entries(spreadCounts)) {
            if (value.count > maxCount) {
              maxCount = value.count;
              consensusSpread = value;
            }
          }

          if (consensusSpread && consensusSpread.favoritePoint !== null) {
            // Only show the favorite's spread (negative value)
            const spreadPoint = consensusSpread.favoritePoint;
            // Find which team is the favorite (normalize names for matching)
            const normalizeName = (name) =>
              name.toLowerCase().replace(/\s+/g, " ").trim();
            const awayNormalized = normalizeName(game.away_team);
            const homeNormalized = normalizeName(game.home_team);

            // Find the favorite team name from Odds API - try to match to away or home
            let favoriteTeamName = null;
            let isAwayFavorite = false;
            let isHomeFavorite = false;

            // Try to find which team is the favorite by matching favorite team names
            for (const favoriteTeam of consensusSpread.favoriteTeams) {
              const favoriteNormalized = normalizeName(favoriteTeam);

              // Check if this favorite team matches the away team
              if (
                favoriteNormalized === awayNormalized ||
                awayNormalized.includes(favoriteNormalized) ||
                favoriteNormalized.includes(awayNormalized)
              ) {
                favoriteTeamName = game.away_team;
                isAwayFavorite = true;
                break;
              }
              // Check if this favorite team matches the home team
              if (
                favoriteNormalized === homeNormalized ||
                homeNormalized.includes(favoriteNormalized) ||
                favoriteNormalized.includes(homeNormalized)
              ) {
                favoriteTeamName = game.home_team;
                isHomeFavorite = true;
                break;
              }
            }

            // If we couldn't match, use the first favorite team name and try to infer
            if (!favoriteTeamName && consensusSpread.favoriteTeams.length > 0) {
              favoriteTeamName = consensusSpread.favoriteTeams[0];
              const favoriteNormalized = normalizeName(favoriteTeamName);
              // Try fuzzy matching
              if (
                favoriteNormalized === awayNormalized ||
                awayNormalized.includes(favoriteNormalized) ||
                favoriteNormalized.includes(awayNormalized)
              ) {
                isAwayFavorite = true;
              } else if (
                favoriteNormalized === homeNormalized ||
                homeNormalized.includes(favoriteNormalized) ||
                favoriteNormalized.includes(homeNormalized)
              ) {
                isHomeFavorite = true;
              }
            }

            // Create keys for matching (normalize team names)
            const key1 = `${awayNormalized}|${homeNormalized}`;
            const key2 = `${homeNormalized}|${awayNormalized}`;

            // Store which team is favorite along with Odds API team names for better matching
            oddsMap.set(key1, {
              spread_value: spreadPoint,
              favoriteTeamName: favoriteTeamName,
              isAwayFavorite: isAwayFavorite,
              isHomeFavorite: isHomeFavorite,
              oddsAwayTeam: game.away_team,
              oddsHomeTeam: game.home_team,
            });
            oddsMap.set(key2, {
              spread_value: spreadPoint,
              favoriteTeamName: favoriteTeamName,
              isAwayFavorite: isAwayFavorite,
              isHomeFavorite: isHomeFavorite,
              oddsAwayTeam: game.away_team,
              oddsHomeTeam: game.home_team,
            });
          }
        }
      }
    });

    // Merge ESPN data with Odds API spreads
    return espnEvents
      .map((event) => {
        const competition = event.competitions?.[0];
        if (!competition) return null;

        const competitors = competition.competitors || [];
        const homeTeam = competitors.find((c) => c.homeAway === "home");
        const awayTeam = competitors.find((c) => c.homeAway === "away");

        if (!homeTeam || !awayTeam || !homeTeam.team || !awayTeam.team) {
          return null;
        }

        if (!event.status?.type) return null;

        // Try to find matching game in Odds API
        const normalizeName = (name) =>
          name.toLowerCase().replace(/\s+/g, " ").trim();
        const espnAwayName = normalizeName(awayTeam.team.displayName);
        const espnHomeName = normalizeName(homeTeam.team.displayName);
        const key = `${espnAwayName}|${espnHomeName}`;
        const oddsData =
          oddsMap.get(key) || oddsMap.get(`${espnHomeName}|${espnAwayName}`);

        // Use Odds API spread if available, otherwise fall back to ESPN
        let spread = null;
        let spread_value = null;

        if (oddsData && oddsData.spread_value !== null) {
          spread_value = oddsData.spread_value;
          // Determine which ESPN team is the favorite and use their abbreviation
          const espnAwayNormalized = normalizeName(awayTeam.team.displayName);
          const espnHomeNormalized = normalizeName(homeTeam.team.displayName);
          const oddsAwayNormalized = normalizeName(oddsData.oddsAwayTeam || "");
          const oddsHomeNormalized = normalizeName(oddsData.oddsHomeTeam || "");
          const favoriteNormalized = normalizeName(
            oddsData.favoriteTeamName || ""
          );

          // First, try to match ESPN teams to Odds API teams to determine which ESPN team is the favorite
          let espnFavoriteIsAway = false;
          let espnFavoriteIsHome = false;

          // If we have stored flags, use them but verify with team name matching
          if (oddsData.isAwayFavorite) {
            // Verify that the Odds API away team matches an ESPN team
            if (
              espnAwayNormalized === oddsAwayNormalized ||
              espnAwayNormalized.includes(oddsAwayNormalized) ||
              oddsAwayNormalized.includes(espnAwayNormalized)
            ) {
              espnFavoriteIsAway = true;
            } else if (
              espnHomeNormalized === oddsAwayNormalized ||
              espnHomeNormalized.includes(oddsAwayNormalized) ||
              oddsAwayNormalized.includes(espnHomeNormalized)
            ) {
              // Odds API away team actually matches ESPN home team
              espnFavoriteIsHome = true;
            }
          } else if (oddsData.isHomeFavorite) {
            // Verify that the Odds API home team matches an ESPN team
            if (
              espnHomeNormalized === oddsHomeNormalized ||
              espnHomeNormalized.includes(oddsHomeNormalized) ||
              oddsHomeNormalized.includes(espnHomeNormalized)
            ) {
              espnFavoriteIsHome = true;
            } else if (
              espnAwayNormalized === oddsHomeNormalized ||
              espnAwayNormalized.includes(oddsHomeNormalized) ||
              oddsHomeNormalized.includes(espnAwayNormalized)
            ) {
              // Odds API home team actually matches ESPN away team
              espnFavoriteIsAway = true;
            }
          }

          // If flags didn't work, try matching by favorite team name directly
          if (
            !espnFavoriteIsAway &&
            !espnFavoriteIsHome &&
            favoriteNormalized
          ) {
            if (
              espnAwayNormalized === favoriteNormalized ||
              espnAwayNormalized.includes(favoriteNormalized) ||
              favoriteNormalized.includes(espnAwayNormalized)
            ) {
              espnFavoriteIsAway = true;
            } else if (
              espnHomeNormalized === favoriteNormalized ||
              espnHomeNormalized.includes(favoriteNormalized) ||
              favoriteNormalized.includes(espnHomeNormalized)
            ) {
              espnFavoriteIsHome = true;
            }
          }

          // Set the spread using the correct ESPN team abbreviation
          if (espnFavoriteIsAway && awayTeam.team.abbreviation) {
            spread = `${awayTeam.team.abbreviation} ${spread_value}`;
          } else if (espnFavoriteIsHome && homeTeam.team.abbreviation) {
            spread = `${homeTeam.team.abbreviation} ${spread_value}`;
          } else {
            // Can't determine, skip this spread
            spread = null;
            spread_value = null;
          }
        } else if (competition.odds && competition.odds.length > 0) {
          // Look for favorite's spread (negative value) in ESPN odds
          const favoriteOdds = competition.odds.find((odds) => odds.spread < 0);
          if (favoriteOdds) {
            spread = favoriteOdds.details;
            spread_value = favoriteOdds.spread;
          }
          // If no favorite spread found, skip (don't use underdog spread)
        }

        const getRecord = (team) => {
          const record = team?.records?.find((r) => r.type === "total");
          return record ? record.summary : "";
        };

        const getRank = (team) => {
          return team?.curatedRank?.current <= 25
            ? team?.curatedRank?.current
            : null;
        };

        return {
          external_id: event.id,
          start_time: event.date,
          status: event.status.type.state,
          team_a: awayTeam.team.displayName,
          team_b: homeTeam.team.displayName,
          result_a: awayTeam.score ? parseInt(awayTeam.score, 10) : null,
          result_b: homeTeam.score ? parseInt(homeTeam.score, 10) : null,
          spread: spread,
          spread_value: spread_value,
          team_a_record: getRecord(awayTeam),
          team_a_rank: getRank(awayTeam),
          team_a_conf_id: awayTeam.team.conferenceId,
          team_a_abbrev: awayTeam.team.abbreviation,
          team_b_record: getRecord(homeTeam),
          team_b_rank: getRank(homeTeam),
          team_b_conf_id: homeTeam.team.conferenceId,
          team_b_abbrev: homeTeam.team.abbreviation,
          game_date: `${date.substring(0, 4)}-${date.substring(
            4,
            6
          )}-${date.substring(6, 8)}`,
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.error("Hybrid API Error:", error);
    // Fall back to ESPN only on error
    return fetchDailyGames(date);
  }
}
