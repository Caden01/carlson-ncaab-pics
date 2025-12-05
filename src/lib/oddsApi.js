/**
 * Alternative API for fetching NCAAB games with spreads using The Odds API
 * Sign up at https://the-odds-api.com/ to get a free API key (500 requests/month)
 *
 * This API provides more reliable spread data from multiple bookmakers.
 */

/**
 * Fetches NCAAB games for a specific date from The Odds API.
 * @param {string} date - Date string in YYYYMMDD format (e.g., '20251126').
 * @param {string} apiKey - Your Odds API key
 * @returns {Promise<Array>} - Array of normalized game objects matching ESPN format.
 */
export const fetchDailyGamesFromOddsApi = async (date, apiKey) => {
  try {
    // Convert YYYYMMDD to ISO date format
    const year = date.substring(0, 4);
    const month = date.substring(4, 6);
    const day = date.substring(6, 8);
    const isoDate = `${year}-${month}-${day}`;

    // The Odds API endpoint for NCAAB
    const url = `https://api.the-odds-api.com/v4/sports/basketball_ncaab/odds/?regions=us&markets=spreads&dateFormat=iso&apiKey=${apiKey}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch from Odds API: ${response.status}`);
    }

    const data = await response.json();

    // Filter games for the specific date and normalize to match ESPN format
    return data
      .filter((game) => {
        // Filter by date (commence_time is ISO string)
        const gameDate = new Date(game.commence_time)
          .toISOString()
          .split("T")[0]
          .replace(/-/g, "");
        return gameDate === date;
      })
      .map((game) => {
        // Get consensus spread from all bookmakers
        // We'll use the most common spread value, or average if needed
        let spread = null;
        let spread_value = null;
        let spread_team = null;

        if (game.bookmakers && game.bookmakers.length > 0) {
          // Get spreads from all bookmakers
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

          // Use the most common spread (consensus)
          if (spreads.length > 0) {
            // Group by point value and find most common
            const spreadCounts = {};
            spreads.forEach((s) => {
              const key = `${s.point}`;
              if (!spreadCounts[key]) {
                spreadCounts[key] = { point: s.point, teams: [], count: 0 };
              }
              spreadCounts[key].teams.push(s.team);
              spreadCounts[key].count++;
            });

            // Find the most common spread
            let maxCount = 0;
            let consensusSpread = null;
            for (const [key, value] of Object.entries(spreadCounts)) {
              if (value.count > maxCount) {
                maxCount = value.count;
                consensusSpread = value;
              }
            }

            if (consensusSpread) {
              spread_value = consensusSpread.point;
              // Find which team has this spread (usually the favorite)
              const favoriteTeam = consensusSpread.teams.find((team) =>
                [game.home_team, game.away_team].includes(team)
              );
              spread_team = favoriteTeam || consensusSpread.teams[0];
              // Format: "TEAM -X.X" or "TEAM +X.X"
              spread = `${spread_team} ${
                spread_value > 0 ? "+" : ""
              }${spread_value}`;
            }
          }
        }

        // Extract team abbreviations (we'll need to map these)
        // For now, we'll use the full name and you can add a mapping function
        const awayTeam = game.away_team;
        const homeTeam = game.home_team;

        return {
          external_id: game.id,
          start_time: game.commence_time, // ISO string
          status: "pre", // Odds API doesn't provide status, assume pre-game
          team_a: awayTeam,
          team_b: homeTeam,
          result_a: null, // Odds API doesn't provide scores
          result_b: null,
          spread: spread,
          spread_value: spread_value,
          team_a_record: "", // Odds API doesn't provide records
          team_a_rank: null,
          team_b_record: "",
          team_b_rank: null,
          team_a_conf_id: null, // Odds API doesn't provide conference IDs
          team_a_abbrev: awayTeam.split(" ")[0], // Rough abbreviation
          team_b_conf_id: null,
          team_b_abbrev: homeTeam.split(" ")[0],
          game_date: `${year}-${month}-${day}`,
        };
      });
  } catch (error) {
    console.error("Odds API Error:", error);
    return [];
  }
};

/**
 * Hybrid approach: Use ESPN for game data, Odds API for spreads
 * This gives you the best of both worlds - ESPN's comprehensive game data
 * with The Odds API's reliable spread information.
 */
export const fetchDailyGamesHybrid = async (date, oddsApiKey) => {
  try {
    // Fetch from both APIs
    const [espnGames, oddsGames] = await Promise.all([
      fetch(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${date}&groups=50&limit=1000`
      )
        .then((r) => r.json())
        .then((d) => d.events || []),
      fetchDailyGamesFromOddsApi(date, oddsApiKey),
    ]);

    // Create a map of Odds API games by team names
    const oddsMap = new Map();
    oddsGames.forEach((game) => {
      // Use both team names as key (handle different naming)
      const key = `${game.team_a}|${game.team_b}`;
      oddsMap.set(key, game);
    });

    // Merge ESPN data with Odds API spreads
    return espnGames
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
        const espnAwayName = awayTeam.team.displayName;
        const espnHomeName = homeTeam.team.displayName;

        // Try multiple key formats
        let oddsGame =
          oddsMap.get(`${espnAwayName}|${espnHomeName}`) ||
          oddsMap.get(`${espnHomeName}|${espnAwayName}`);

        // If no exact match, try fuzzy matching
        if (!oddsGame) {
          for (const [key, game] of oddsMap.entries()) {
            if (
              (key.includes(espnAwayName) || key.includes(espnHomeName)) &&
              (key.includes(espnHomeName) || key.includes(espnAwayName))
            ) {
              oddsGame = game;
              break;
            }
          }
        }

        // Use Odds API spread if available, otherwise fall back to ESPN
        let spread = null;
        let spread_value = null;

        if (oddsGame && oddsGame.spread_value !== null) {
          spread = oddsGame.spread;
          spread_value = oddsGame.spread_value;
        } else if (competition.odds && competition.odds.length > 0) {
          spread = competition.odds[0].details;
          spread_value = competition.odds[0].spread;
        }

        const getRecord = (team) => {
          const record = team?.records?.find((r) => r.type === "total");
          return record ? record.summary : "";
        };

        const getRank = (team) => {
          return team?.curatedRank?.current <= 25
            ? team.curatedRank.current
            : null;
        };

        return {
          external_id: event.id,
          start_time: event.date,
          status: event.status.type.state,
          team_a: awayTeam.team.displayName,
          team_b: homeTeam.team.displayName,
          result_a: awayTeam.score ? parseInt(awayTeam.score) : null,
          result_b: homeTeam.score ? parseInt(homeTeam.score) : null,
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
    return [];
  }
};
