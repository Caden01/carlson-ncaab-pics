import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Loader2, Lock, CheckCircle, XCircle, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { fetchDailyGames } from '../lib/espn';

export default function Dashboard() {
    const { user } = useAuth();
    const [games, setGames] = useState([]);
    const [picks, setPicks] = useState({});
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        if (user) {
            fetchGamesAndPicks();
        }

        // Real-time subscription for game updates
        const subscription = supabase
            .channel('public:games')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, (payload) => {
                // Update local state when a game changes
                setGames(prevGames => prevGames.map(game =>
                    game.id === payload.new.id ? { ...game, ...payload.new } : game
                ));
            })
            .subscribe();

        // Polling for live scores (Distributed Worker Pattern)
        // Only poll if there are active games on the selected date
        const interval = setInterval(async () => {
            const hasActiveGames = games.some(g => g.status === 'in_progress');
            if (hasActiveGames && selectedDate === new Date().toISOString().split('T')[0]) {
                await syncLiveScores();
            }
        }, 60000); // Check every minute

        return () => {
            supabase.removeChannel(subscription);
            clearInterval(interval);
        };
    }, [user, selectedDate, games.length]); // Re-run if games length changes to update polling logic

    const fetchGamesAndPicks = async () => {
        try {
            setLoading(true);

            const { data: gamesData, error: gamesError } = await supabase
                .from('games')
                .select('*')
                .eq('game_date', selectedDate)
                .order('start_time', { ascending: true });

            if (gamesError) throw gamesError;

            // Fetch user picks
            const { data: picksData, error: picksError } = await supabase
                .from('picks')
                .select('game_id, selected_team')
                .eq('user_id', user.id);

            if (picksError) throw picksError;

            const picksMap = {};
            picksData.forEach(pick => {
                picksMap[pick.game_id] = pick.selected_team;
            });

            setGames(gamesData || []);
            setPicks(picksMap);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const syncLiveScores = async () => {
        try {
            const dateStr = selectedDate.replace(/-/g, '');
            const espnGames = await fetchDailyGames(dateStr);

            for (const espnGame of espnGames) {
                const dbGame = games.find(g => g.external_id === espnGame.external_id);
                if (dbGame) {
                    // Only update if something changed
                    if (dbGame.status !== (espnGame.status === 'post' ? 'finished' : (espnGame.status === 'pre' ? 'scheduled' : 'in_progress')) ||
                        dbGame.result_a !== espnGame.result_a ||
                        dbGame.result_b !== espnGame.result_b) {

                        const newStatus = espnGame.status === 'post' ? 'finished' : (espnGame.status === 'pre' ? 'scheduled' : 'in_progress');

                        await supabase.from('games').update({
                            status: newStatus,
                            result_a: espnGame.result_a,
                            result_b: espnGame.result_b,
                        }).eq('id', dbGame.id);
                    }
                }
            }
        } catch (error) {
            console.error('Error syncing live scores:', error);
        }
    };

    const handlePick = async (gameId, team) => {
        // Optimistic update
        const previousPick = picks[gameId];
        setPicks(prev => ({ ...prev, [gameId]: team }));

        try {
            const { error } = await supabase
                .from('picks')
                .upsert({
                    user_id: user.id,
                    game_id: gameId,
                    selected_team: team
                }, { onConflict: 'user_id, game_id' });

            if (error) throw error;
        } catch (error) {
            console.error('Error saving pick:', error);
            setPicks(prev => ({ ...prev, [gameId]: previousPick }));
            alert('Failed to save pick. Please try again.');
        }
    };

    const isGameLocked = (startTime) => {
        return new Date() >= new Date(startTime);
    };

    const changeDate = (days) => {
        const date = new Date(selectedDate);
        date.setDate(date.getDate() + days);
        setSelectedDate(date.toISOString().split('T')[0]);
    };

    const checkCover = (game, team) => {
        if (game.status !== 'finished' || !game.spread || !game.spread.includes(' ')) return null;

        const parts = game.spread.split(' ');
        const spreadTeamAbbrev = parts[0];
        const spreadValue = parseFloat(parts[1]);

        if (isNaN(spreadValue)) return null;

        let isSpreadTeam = false;
        if (game.team_a_abbrev === spreadTeamAbbrev) {
            if (team === game.team_a) isSpreadTeam = true;
        } else if (game.team_b_abbrev === spreadTeamAbbrev) {
            if (team === game.team_b) isSpreadTeam = true;
        }

        const margin = team === game.team_a
            ? game.result_a - game.result_b
            : game.result_b - game.result_a;

        let effectiveSpread = isSpreadTeam ? spreadValue : -spreadValue;

        return (margin + effectiveSpread) > 0;
    };

    const getPickStatus = (game, userPick) => {
        if (game.status !== 'finished' || !userPick) return null;

        const winner = game.result_a > game.result_b ? game.team_a : game.team_b;
        return userPick === winner ? 'correct' : 'incorrect';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="animate-spin text-primary" size={40} />
            </div>
        );
    }

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <h1>Dashboard</h1>
                <div className="date-nav">
                    <button onClick={() => changeDate(-1)} className="icon-btn">
                        <ChevronLeft size={24} />
                    </button>
                    <div className="current-date">
                        <Calendar size={20} />
                        <span>{new Date(selectedDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    </div>
                    <button onClick={() => changeDate(1)} className="icon-btn">
                        <ChevronRight size={24} />
                    </button>
                </div>
            </header>

            {games.length === 0 ? (
                <div className="empty-state">
                    <p>No games scheduled for this date.</p>
                </div>
            ) : (
                <div className="games-grid">
                    {games.map(game => {
                        const isLocked = isGameLocked(game.start_time);
                        const userPick = picks[game.id];
                        const pickStatus = getPickStatus(game, userPick);

                        return (
                            <div key={game.id} className="game-card">
                                <div className="game-info">
                                    <div className="teams">
                                        <div className={`team-container ${game.result_a > game.result_b ? 'winner' : ''}`}>
                                            <div className="team-details">
                                                {game.team_a_rank && <span className="team-rank">#{game.team_a_rank}</span>}
                                                <span className="team-name">{game.team_a}</span>
                                            </div>
                                            {game.team_a_record && <span className="team-record">({game.team_a_record})</span>}
                                        </div>
                                        <span className="vs">vs</span>
                                        <div className={`team-container ${game.result_b > game.result_a ? 'winner' : ''}`}>
                                            <div className="team-details">
                                                {game.team_b_rank && <span className="team-rank">#{game.team_b_rank}</span>}
                                                <span className="team-name">{game.team_b}</span>
                                            </div>
                                            {game.team_b_record && <span className="team-record">({game.team_b_record})</span>}
                                        </div>
                                    </div>
                                    <div className="game-meta">
                                        <span className="game-time">
                                            {game.status === 'in_progress' ? (
                                                <span className="text-red-500 font-bold animate-pulse">LIVE</span>
                                            ) : (
                                                new Date(game.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                            )}
                                        </span>
                                        {game.spread && <span className="game-spread">{game.spread}</span>}
                                        {game.status !== 'scheduled' && (
                                            <span className="game-score">
                                                {game.result_a} - {game.result_b}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="teams-container">
                                    <button
                                        className={`team-btn ${userPick === game.team_a ? 'selected' : ''} ${isLocked ? 'locked' : ''} ${pickStatus === 'correct' && userPick === game.team_a ? 'correct-pick' : ''} ${pickStatus === 'incorrect' && userPick === game.team_a ? 'incorrect-pick' : ''}`}
                                        onClick={() => !isLocked && handlePick(game.id, game.team_a)}
                                        disabled={isLocked}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span>{game.team_a}</span>
                                            {pickStatus === 'correct' && userPick === game.team_a && <CheckCircle size={16} className="text-green-600" />}
                                            {pickStatus === 'incorrect' && userPick === game.team_a && <XCircle size={16} className="text-red-500" />}
                                        </div>
                                        {game.status === 'finished' && checkCover(game, game.team_a) && (
                                            <span className="cover-badge">Covered</span>
                                        )}
                                    </button>
                                    <div className="vs-badge">VS</div>
                                    <button
                                        className={`team-btn ${userPick === game.team_b ? 'selected' : ''} ${isLocked ? 'locked' : ''} ${pickStatus === 'correct' && userPick === game.team_b ? 'correct-pick' : ''} ${pickStatus === 'incorrect' && userPick === game.team_b ? 'incorrect-pick' : ''}`}
                                        onClick={() => !isLocked && handlePick(game.id, game.team_b)}
                                        disabled={isLocked}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span>{game.team_b}</span>
                                            {pickStatus === 'correct' && userPick === game.team_b && <CheckCircle size={16} className="text-green-600" />}
                                            {pickStatus === 'incorrect' && userPick === game.team_b && <XCircle size={16} className="text-red-500" />}
                                        </div>
                                        {game.status === 'finished' && checkCover(game, game.team_b) && (
                                            <span className="cover-badge">Covered</span>
                                        )}
                                    </button>
                                </div>
                                {isLocked && (
                                    <div className="locked-indicator">
                                        <Lock size={14} />
                                        <span>Picks Locked</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
