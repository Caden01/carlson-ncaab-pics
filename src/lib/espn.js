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
          start_time: event.date, // ISO string
          status: event.status.type.state, // 'pre', 'in', 'post'
          team_a: awayTeam.team.displayName,
          team_b: homeTeam.team.displayName,
          result_a: awayTeam.score ? parseInt(awayTeam.score) : null,
          result_b: homeTeam.score ? parseInt(homeTeam.score) : null,
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
          // Find consensus spread (most common point value)
          const spreadCounts = {};
          spreads.forEach((s) => {
            const key = `${s.point}`;
            if (!spreadCounts[key]) {
              spreadCounts[key] = { point: s.point, teams: [], count: 0 };
            }
            spreadCounts[key].teams.push(s.team);
            spreadCounts[key].count++;
          });

          let maxCount = 0;
          let consensusSpread = null;
          for (const [key, value] of Object.entries(spreadCounts)) {
            if (value.count > maxCount) {
              maxCount = value.count;
              consensusSpread = value;
            }
          }

          if (consensusSpread) {
            const favoriteTeam = consensusSpread.teams.find((team) =>
              [game.home_team, game.away_team].includes(team)
            );
            const spreadTeam = favoriteTeam || consensusSpread.teams[0];
            const spread = `${spreadTeam} ${
              consensusSpread.point > 0 ? "+" : ""
            }${consensusSpread.point}`;

            // Create keys for matching (normalize team names)
            const normalizeName = (name) =>
              name.toLowerCase().replace(/\s+/g, " ").trim();
            const key1 = `${normalizeName(game.away_team)}|${normalizeName(
              game.home_team
            )}`;
            const key2 = `${normalizeName(game.home_team)}|${normalizeName(
              game.away_team
            )}`;

            oddsMap.set(key1, {
              spread,
              spread_value: consensusSpread.point,
            });
            oddsMap.set(key2, {
              spread,
              spread_value: consensusSpread.point,
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
          spread = oddsData.spread;
          spread_value = oddsData.spread_value;
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
    // Fall back to ESPN only on error
    return fetchDailyGames(date);
  }
}
