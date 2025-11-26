/**
 * Fetches NCAAB games for a specific date from ESPN's hidden API.
 * @param {string} date - Date string in YYYYMMDD format (e.g., '20251126').
 * @returns {Promise<Array>} - Array of normalized game objects.
 */
export const fetchDailyGames = async (date) => {
    try {
        const response = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${date}&groups=50&limit=1000`
        );

        if (!response.ok) {
            throw new Error('Failed to fetch from ESPN');
        }

        const data = await response.json();
        const events = data.events || [];

        return events.map(event => {
            const competition = event.competitions[0];
            const competitors = competition.competitors;
            const homeTeam = competitors.find(c => c.homeAway === 'home');
            const awayTeam = competitors.find(c => c.homeAway === 'away');

            let spread = null;
            let spread_value = null;
            if (competition.odds && competition.odds.length > 0) {
                spread = competition.odds[0].details;
                spread_value = competition.odds[0].spread;
            }

            const getRecord = (team) => {
                const record = team.records?.find(r => r.type === 'total');
                return record ? record.summary : '';
            };

            const getRank = (team) => {
                return team.curatedRank?.current <= 25 ? team.curatedRank.current : null;
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
                team_b_abbrev: homeTeam.team.abbreviation
            };
        });
    } catch (error) {
        console.error('ESPN API Error:', error);
        return [];
    }
};
