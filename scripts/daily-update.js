import { createClient } from '@supabase/supabase-js';
import { fetchDailyGames } from '../src/lib/espn.js';

// Initialize Supabase client with Service Role Key for admin access (bypass RLS)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const MAJOR_CONFERENCES = ['2', '4', '7', '8', '23'];

async function syncActiveGames() {
    console.log('--- Syncing Active Games ---');
    try {
        // 1. Get all unfinished games from DB
        const { data: activeGames, error } = await supabase
            .from('games')
            .select('*')
            .neq('status', 'finished')
            .not('external_id', 'is', null);

        if (error) throw error;
        if (!activeGames?.length) {
            console.log('No active games to sync.');
            return;
        }

        console.log(`Found ${activeGames.length} active games.`);

        // Group by date to minimize API calls
        const uniqueDates = [...new Set(activeGames.map(g => g.start_time.split('T')[0].replace(/-/g, '')))];

        let updatedCount = 0;
        for (const date of uniqueDates) {
            console.log(`Fetching games for date: ${date}`);
            const espnGames = await fetchDailyGames(date);

            for (const espnGame of espnGames) {
                const dbGame = activeGames.find(g => g.external_id === espnGame.external_id);
                if (dbGame) {
                    // Update if status, score, spread, or details changed
                    if (dbGame.status !== (espnGame.status === 'post' ? 'finished' : 'in_progress') ||
                        dbGame.result_a !== espnGame.result_a ||
                        dbGame.result_b !== espnGame.result_b ||
                        dbGame.spread !== espnGame.spread ||
                        dbGame.team_a_rank !== espnGame.team_a_rank ||
                        dbGame.team_b_rank !== espnGame.team_b_rank) {

                        const newStatus = espnGame.status === 'post' ? 'finished' : 'in_progress';

                        await supabase.from('games').update({
                            status: newStatus,
                            result_a: espnGame.result_a,
                            result_b: espnGame.result_b,
                            spread: espnGame.spread,
                            team_a_record: espnGame.team_a_record,
                            team_a_rank: espnGame.team_a_rank,
                            team_b_record: espnGame.team_b_record,
                            team_b_rank: espnGame.team_b_rank,
                            team_a_abbrev: espnGame.team_a_abbrev,
                            team_b_abbrev: espnGame.team_b_abbrev
                        }).eq('id', dbGame.id);

                        updatedCount++;

                        // If game finished, calculate points
                        if (newStatus === 'finished' && dbGame.status !== 'finished') {
                            await calculatePoints(dbGame.id, espnGame);
                        }
                    }
                }
            }
        }
        console.log(`Synced ${updatedCount} games.`);
    } catch (error) {
        console.error('Error syncing games:', error);
    }
}

async function importTodaysGames() {
    console.log('--- Importing Today\'s Games ---');
    try {
        // Get today's date in YYYYMMDD format (PST/PDT roughly, or just UTC)
        // The user asked for 6:00 AM PST. 
        // If this runs at 6AM PST, "today" is the current date.
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');

        console.log(`Fetching games for today: ${dateStr}`);
        const games = await fetchDailyGames(dateStr);

        if (games.length === 0) {
            console.log('No games found for today.');
            return;
        }

        let importedCount = 0;
        for (const game of games) {
            // Filter: Only import games with spread <= 12. Skip if no spread.
            if (!game.spread_value || Math.abs(game.spread_value) > 12) {
                console.log(`Skipping ${game.team_a} vs ${game.team_b}: Spread ${game.spread_value} > 12 or missing`);
                continue;
            }

            // Filter: Must include at least one team from major conferences
            // Convert to strings since ESPN API returns conference IDs as numbers
            const teamAConf = String(game.team_a_conf_id);
            const teamBConf = String(game.team_b_conf_id);
            if (!MAJOR_CONFERENCES.includes(teamAConf) && !MAJOR_CONFERENCES.includes(teamBConf)) {
                console.log(`Skipping ${game.team_a} vs ${game.team_b}: Conf ${teamAConf}/${teamBConf} not major`);
                continue;
            }

            // Check if game exists
            const { data: existing } = await supabase
                .from('games')
                .select('id')
                .eq('external_id', game.external_id)
                .single();

            if (!existing) {
                const { error } = await supabase.from('games').insert([{
                    external_id: game.external_id,
                    team_a: game.team_a,
                    team_b: game.team_b,
                    start_time: game.start_time,
                    status: game.status === 'pre' ? 'scheduled' : (game.status === 'post' ? 'finished' : 'in_progress'),
                    result_a: game.result_a,
                    result_b: game.result_b,
                    spread: game.spread,
                    team_a_record: game.team_a_record,
                    team_a_rank: game.team_a_rank,
                    team_b_record: game.team_b_record,
                    team_b_rank: game.team_b_rank,
                    team_a_abbrev: game.team_a_abbrev,
                    team_b_abbrev: game.team_b_abbrev,
                    game_date: game.game_date
                }]);
                if (!error) importedCount++;
                else console.error('Error inserting game:', error);
            }
        }
        console.log(`Imported ${importedCount} new games.`);
    } catch (error) {
        console.error('Error importing games:', error);
    }
}

async function calculatePoints(gameId, gameData) {
    // Determine winner (Straight Up for now, based on existing logic)
    // Wait, does the user want points for Spread or Straight Up?
    // The original requirement was "pick winners". 
    // The spread was added as info. 
    // The Admin.jsx logic uses straight up winner. I will stick to that.

    const winner = gameData.result_a > gameData.result_b ? gameData.team_a : gameData.team_b;

    const { data: picks } = await supabase
        .from('picks')
        .select('user_id, selected_team')
        .eq('game_id', gameId);

    if (!picks) return;

    for (const pick of picks) {
        const isWin = pick.selected_team === winner;

        const { data: profile } = await supabase
            .from('profiles')
            .select('total_points, total_wins, total_losses')
            .eq('id', pick.user_id)
            .single();

        if (profile) {
            const updates = {};

            if (isWin) {
                updates.total_points = (profile.total_points || 0) + 1;
                updates.total_wins = (profile.total_wins || 0) + 1;
            } else {
                updates.total_losses = (profile.total_losses || 0) + 1;
            }

            await supabase
                .from('profiles')
                .update(updates)
                .eq('id', pick.user_id);
        }
    }
}

async function main() {
    await syncActiveGames();
    await importTodaysGames();
}

main();
