import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchDailyGames } from '../lib/espn';
import { didTeamCover } from '../lib/gameLogic';
import { Loader2, RefreshCw, Download } from 'lucide-react';

export default function Admin() {
    // Use local date
    const getLocalDate = () => {
        const d = new Date();
        const offset = d.getTimezoneOffset() * 60000;
        const localDate = new Date(d.getTime() - offset);
        return localDate.toISOString().split('T')[0].replace(/-/g, '');
    };
    const [date, setDate] = useState(getLocalDate());
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const handleImportGames = async () => {
        setLoading(true);
        setMessage('');
        try {
            const games = await fetchDailyGames(date);
            if (games.length === 0) {
                setMessage('No games found for this date.');
                return;
            }

            let importedCount = 0;
            for (const game of games) {
                // Filter: Only import games with spread <= 12. Skip if no spread.
                if (!game.spread_value || Math.abs(game.spread_value) > 12) {
                    continue;
                }

                // Filter: Must include at least one team from major conferences
                // SEC=8, Big Ten=7, Big 12=8, Big East=4, ACC=2
                // Note: SEC and Big 12 might share ID 8 in some contexts or I need to verify IDs.
                // Let's use a list of known IDs. 
                // SEC: 8, Big 10: 7, Big 12: 8 (Wait, need to verify IDs).
                // Actually, let's just define the allowed IDs.
                // ACC: 2, Big East: 4, Big Ten: 7, Big 12: 8, SEC: 23 (SEC is usually 23, Big 12 is 8)
                // Let's verify IDs first or use a broad list.
                const MAJOR_CONFERENCES = ['2', '4', '7', '8', '23'];
                if (!MAJOR_CONFERENCES.includes(game.team_a_conf_id) && !MAJOR_CONFERENCES.includes(game.team_b_conf_id)) {
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
        setMessage('');
        try {
            // 1. Get all unfinished games from DB
            const { data: activeGames } = await supabase
                .from('games')
                .select('*')
                .neq('status', 'finished')
                .not('external_id', 'is', null);

            if (!activeGames?.length) {
                setMessage('No active games to sync.');
                return;
            }

            let updatedCount = 0;
            // Group by date to minimize API calls (optimization)
            // For MVP, we'll just fetch today's games or the game's specific date
            // Actually, ESPN endpoint takes a date. We might need to fetch multiple dates if games span days.
            // For simplicity, let's just fetch the date selected in the UI for now, 
            // OR iterate through unique dates of active games.

            const uniqueDates = [...new Set(activeGames.map(g => g.start_time.split('T')[0].replace(/-/g, '')))];

            for (const d of uniqueDates) {
                const espnGames = await fetchDailyGames(d);

                for (const espnGame of espnGames) {
                    const dbGame = activeGames.find(g => g.external_id === espnGame.external_id);
                    if (dbGame) {
                        // Update if status or score changed
                        if (dbGame.status !== (espnGame.status === 'post' ? 'finished' : 'in_progress') ||
                            dbGame.result_a !== espnGame.result_a ||
                            dbGame.result_b !== espnGame.result_b ||
                            dbGame.spread !== espnGame.spread ||
                            dbGame.team_a_record !== espnGame.team_a_record ||
                            dbGame.team_b_record !== espnGame.team_b_record) {

                            const newStatus = espnGame.status === 'post' ? 'finished' : 'in_progress';

                            const updates = {
                                status: newStatus,
                                result_a: espnGame.result_a,
                                result_b: espnGame.result_b,
                                team_a_record: espnGame.team_a_record,
                                team_a_rank: espnGame.team_a_rank,
                                team_b_record: espnGame.team_b_record,
                                team_b_rank: espnGame.team_b_rank,
                                team_a_abbrev: espnGame.team_a_abbrev,
                                team_b_abbrev: espnGame.team_b_abbrev
                            };

                            // Only update spread if it's available from ESPN (to avoid overwriting with null)
                            if (espnGame.spread) {
                                updates.spread = espnGame.spread;
                            }

                            await supabase.from('games').update(updates).eq('id', dbGame.id);

                            updatedCount++;

                            // If game finished, calculate points
                            if (newStatus === 'finished' && dbGame.status !== 'finished') {
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
        // Get all picks for this game
        const { data: picks } = await supabase
            .from('picks')
            .select('user_id, selected_team')
            .eq('game_id', gameId);

        if (!picks) return;

        for (const pick of picks) {
            // Use shared logic to determine if the picked team covered
            const isWin = didTeamCover(gameData, pick.selected_team);

            if (isWin === null) continue;

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
    };

    const handleRecalculateStats = async () => {
        if (!confirm('Are you sure? This will reset all user stats and recalculate them based on finished games.')) return;

        setLoading(true);
        setMessage('Resetting stats...');

        try {
            // 1. Reset all profiles
            const { error: resetError } = await supabase
                .from('profiles')
                .update({ total_points: 0, total_wins: 0, total_losses: 0 })
                .neq('id', '00000000-0000-0000-0000-000000000000'); // Update all rows

            if (resetError) throw resetError;

            // 2. Get all finished games
            const { data: finishedGames, error: gamesError } = await supabase
                .from('games')
                .select('*')
                .eq('status', 'finished');

            if (gamesError) throw gamesError;

            setMessage(`Recalculating for ${finishedGames.length} finished games...`);

            let processedGames = 0;
            for (const game of finishedGames) {
                await calculatePoints(game.id, game);
                processedGames++;
            }

            setMessage(`Successfully recalculated stats for ${processedGames} games.`);
        } catch (error) {
            console.error('Error recalculating:', error);
            setMessage(`Error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <h1>Admin Panel</h1>
                <p>Manage games and scores.</p>
            </header>

            <div className="auth-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
                <h2>ESPN Integration</h2>

                <div className="form-group">
                    <label>Date (YYYYMMDD)</label>
                    <input
                        type="text"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        placeholder="20251126"
                    />
                </div>

                <div className="flex gap-4 mb-4">
                    <button
                        onClick={handleImportGames}
                        disabled={loading}
                        className="btn btn-primary flex-1 flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <Download size={20} />}
                        Import Games
                    </button>

                    <button
                        onClick={handleSyncScores}
                        disabled={loading}
                        className="btn btn-primary flex-1 flex items-center justify-center gap-2"
                        style={{ backgroundColor: '#0f172a' }} // Slate 900
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <RefreshCw size={20} />}
                        Sync Scores
                    </button>
                </div>

                <div className="mb-4">
                    <button
                        onClick={handleRecalculateStats}
                        disabled={loading}
                        className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <RefreshCw size={20} />}
                        Recalculate All Stats
                    </button>
                </div>

                {message && (
                    <div className={`auth-error ${message.includes('Success') || message.includes('Synced') ? 'bg-green-50 text-green-700 border-green-200' : ''}`}>
                        {message}
                    </div>
                )}
            </div>
        </div>
    );
}
