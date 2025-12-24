/**
 * Team name aliases for matching between ESPN and Odds API
 * All keys and values should be lowercase
 */
const TEAM_ALIASES = {
  // Schools with common short/alternate names
  duke: ["duke blue devils"],
  "duke blue devils": ["duke"],
  "texas tech": ["texas tech red raiders"],
  "texas tech red raiders": ["texas tech"],
  "north carolina": ["unc", "north carolina tar heels", "tar heels"],
  "north carolina tar heels": ["north carolina", "unc", "tar heels"],
  unc: ["north carolina", "north carolina tar heels"],
  uconn: ["connecticut", "uconn huskies", "connecticut huskies"],
  connecticut: ["uconn", "uconn huskies", "connecticut huskies"],
  "connecticut huskies": ["uconn", "connecticut", "uconn huskies"],
  "uconn huskies": ["uconn", "connecticut", "connecticut huskies"],
  usc: ["southern california", "usc trojans", "southern california trojans"],
  "southern california": ["usc", "usc trojans"],
  "usc trojans": ["usc", "southern california"],
  lsu: ["louisiana state", "lsu tigers"],
  "louisiana state": ["lsu", "lsu tigers"],
  "lsu tigers": ["lsu", "louisiana state"],
  smu: ["southern methodist", "smu mustangs"],
  "southern methodist": ["smu", "smu mustangs"],
  "smu mustangs": ["smu", "southern methodist"],
  ucf: ["central florida", "ucf knights"],
  "central florida": ["ucf", "ucf knights"],
  "ucf knights": ["ucf", "central florida"],
  "ole miss": ["mississippi", "ole miss rebels"],
  "ole miss rebels": ["ole miss", "mississippi"],
  mississippi: ["ole miss", "ole miss rebels"],
  "mississippi rebels": ["ole miss", "mississippi", "ole miss rebels"],
  pitt: ["pittsburgh", "pitt panthers", "pittsburgh panthers"],
  pittsburgh: ["pitt", "pitt panthers"],
  "pittsburgh panthers": ["pitt", "pittsburgh"],
  "pitt panthers": ["pitt", "pittsburgh"],
  "miami hurricanes": ["miami", "miami fl"],
  "st johns": ["saint johns", "st johns red storm"],
  "saint johns": ["st johns", "st johns red storm"],
  "st johns red storm": ["st johns", "saint johns"],
};

/**
 * Common mascot/suffix words to strip for matching
 */
const MASCOT_WORDS = [
  "blue devils",
  "red raiders",
  "tar heels",
  "wildcats",
  "tigers",
  "bulldogs",
  "bears",
  "longhorns",
  "aggies",
  "sooners",
  "cowboys",
  "horned frogs",
  "jayhawks",
  "cyclones",
  "mountaineers",
  "huskies",
  "ducks",
  "beavers",
  "bruins",
  "trojans",
  "cardinals",
  "sun devils",
  "buffaloes",
  "golden bears",
  "fighting irish",
  "spartans",
  "wolverines",
  "buckeyes",
  "hawkeyes",
  "badgers",
  "gophers",
  "boilermakers",
  "hoosiers",
  "nittany lions",
  "terrapins",
  "scarlet knights",
  "orange",
  "cavaliers",
  "hokies",
  "seminoles",
  "hurricanes",
  "demon deacons",
  "wolfpack",
  "yellow jackets",
  "eagles",
  "owls",
  "mustangs",
  "horned frogs",
  "red storm",
  "golden eagles",
  "pirates",
  "musketeers",
  "bluejays",
  "providence friars",
  "friars",
  "hoyas",
  "volunteers",
  "rebels",
  "commodores",
  "razorbacks",
  "crimson tide",
  "gamecocks",
  "gators",
  "panthers",
  "knights",
  "bearcats",
  "cougars",
  "shockers",
];

/**
 * Normalize a team name for comparison
 */
function normalizeTeamName(name) {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract the school/city name by removing mascot
 */
function extractSchoolName(name) {
  let normalized = normalizeTeamName(name);
  for (const mascot of MASCOT_WORDS) {
    normalized = normalized
      .replace(new RegExp(`\\s*${mascot}\\s*$`, "i"), "")
      .trim();
  }
  return normalized;
}

/**
 * Check if two team names match using multiple strategies
 * @returns {boolean} true if teams match
 */
function teamsMatch(name1, name2) {
  if (!name1 || !name2) return false;

  const n1 = normalizeTeamName(name1);
  const n2 = normalizeTeamName(name2);

  // Strategy 1: Exact match
  if (n1 === n2) return true;

  // Strategy 2: School name match (without mascot) - exact match only
  const school1 = extractSchoolName(name1);
  const school2 = extractSchoolName(name2);
  if (school1 && school2 && school1.length >= 4 && school1 === school2) {
    return true;
  }

  // Strategy 3: Check aliases (both directions)
  const aliases1 = TEAM_ALIASES[n1] || TEAM_ALIASES[school1] || [];
  const aliases2 = TEAM_ALIASES[n2] || TEAM_ALIASES[school2] || [];

  // Check if n2 matches any alias of n1
  for (const alias of aliases1) {
    const normalizedAlias = normalizeTeamName(alias);
    if (normalizedAlias === n2 || normalizedAlias === school2) return true;
  }
  // Check if n1 matches any alias of n2
  for (const alias of aliases2) {
    const normalizedAlias = normalizeTeamName(alias);
    if (normalizedAlias === n1 || normalizedAlias === school1) return true;
  }

  // Strategy 4: Two-word prefix match (e.g., "Texas Tech" matches "Texas Tech Red Raiders")
  // Only for multi-word school names to avoid false positives
  const words1 = n1.split(" ");
  const words2 = n2.split(" ");
  if (words1.length >= 2 && words2.length >= 2) {
    const prefix1 = words1.slice(0, 2).join(" ");
    const prefix2 = words2.slice(0, 2).join(" ");
    if (prefix1 === prefix2) return true;
  }

  // Strategy 5: Full name contains check - but only if the shorter name is substantial
  // and the longer name STARTS WITH the shorter name (to avoid Duke matching Duquesne)
  if (n1.length >= 4 && n2.startsWith(n1 + " ")) return true;
  if (n2.length >= 4 && n1.startsWith(n2 + " ")) return true;

  return false;
}

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

    // Process Odds API games into a list with spread data
    const processedOddsGames = [];
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
              spreadCounts[key].favoritePoint = s.point;
              spreadCounts[key].favoriteTeams.push(s.team);
            } else {
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
            const spreadPoint = consensusSpread.favoritePoint;

            // Determine which Odds API team is the favorite
            let favoriteTeamName = null;
            let isAwayFavorite = false;
            let isHomeFavorite = false;

            for (const favoriteTeam of consensusSpread.favoriteTeams) {
              if (teamsMatch(favoriteTeam, game.away_team)) {
                favoriteTeamName = game.away_team;
                isAwayFavorite = true;
                break;
              }
              if (teamsMatch(favoriteTeam, game.home_team)) {
                favoriteTeamName = game.home_team;
                isHomeFavorite = true;
                break;
              }
            }

            // Fallback: use first favorite team name
            if (!favoriteTeamName && consensusSpread.favoriteTeams.length > 0) {
              favoriteTeamName = consensusSpread.favoriteTeams[0];
              if (teamsMatch(favoriteTeamName, game.away_team)) {
                isAwayFavorite = true;
              } else if (teamsMatch(favoriteTeamName, game.home_team)) {
                isHomeFavorite = true;
              }
            }

            processedOddsGames.push({
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

        // Try to find matching game in Odds API using improved matching
        const espnAwayName = awayTeam.team.displayName;
        const espnHomeName = homeTeam.team.displayName;

        // Search through all odds games for a match
        const oddsData = processedOddsGames.find((oddsGame) => {
          // Check if both teams match (in either order for neutral site games)
          const awayMatchesAway = teamsMatch(
            espnAwayName,
            oddsGame.oddsAwayTeam
          );
          const homeMatchesHome = teamsMatch(
            espnHomeName,
            oddsGame.oddsHomeTeam
          );
          const awayMatchesHome = teamsMatch(
            espnAwayName,
            oddsGame.oddsHomeTeam
          );
          const homeMatchesAway = teamsMatch(
            espnHomeName,
            oddsGame.oddsAwayTeam
          );

          return (
            (awayMatchesAway && homeMatchesHome) ||
            (awayMatchesHome && homeMatchesAway)
          );
        });

        // Use Odds API spread if available, otherwise fall back to ESPN
        let spread = null;
        let spread_value = null;

        if (oddsData && oddsData.spread_value !== null) {
          spread_value = oddsData.spread_value;

          // Determine which ESPN team is the favorite using improved matching
          let espnFavoriteIsAway = false;
          let espnFavoriteIsHome = false;

          // Use stored flags and verify with improved team name matching
          if (oddsData.isAwayFavorite) {
            // Odds API away team is favorite - find which ESPN team it matches
            if (teamsMatch(espnAwayName, oddsData.oddsAwayTeam)) {
              espnFavoriteIsAway = true;
            } else if (teamsMatch(espnHomeName, oddsData.oddsAwayTeam)) {
              // Odds API away team matches ESPN home team (teams swapped)
              espnFavoriteIsHome = true;
            }
          } else if (oddsData.isHomeFavorite) {
            // Odds API home team is favorite - find which ESPN team it matches
            if (teamsMatch(espnHomeName, oddsData.oddsHomeTeam)) {
              espnFavoriteIsHome = true;
            } else if (teamsMatch(espnAwayName, oddsData.oddsHomeTeam)) {
              // Odds API home team matches ESPN away team (teams swapped)
              espnFavoriteIsAway = true;
            }
          }

          // If flags didn't work, try matching by favorite team name directly
          if (
            !espnFavoriteIsAway &&
            !espnFavoriteIsHome &&
            oddsData.favoriteTeamName
          ) {
            if (teamsMatch(espnAwayName, oddsData.favoriteTeamName)) {
              espnFavoriteIsAway = true;
            } else if (teamsMatch(espnHomeName, oddsData.favoriteTeamName)) {
              espnFavoriteIsHome = true;
            }
          }

          // Set the spread using the correct ESPN team abbreviation
          if (espnFavoriteIsAway && awayTeam.team.abbreviation) {
            spread = `${awayTeam.team.abbreviation} ${spread_value}`;
          } else if (espnFavoriteIsHome && homeTeam.team.abbreviation) {
            spread = `${homeTeam.team.abbreviation} ${spread_value}`;
          } else {
            // Can't determine favorite, skip this spread
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
