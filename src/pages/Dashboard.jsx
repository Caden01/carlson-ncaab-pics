import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Loader2, Lock, CheckCircle, XCircle, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

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
    }, [user, selectedDate]);

    const fetchGamesAndPicks = async () => {
        try {
            setLoading(true);

            // Fetch games for selected date
            // We need to filter by start_time range for the selected date
            // Note: This assumes games are stored in UTC. 

            const { data: gamesData, error: gamesError } = await supabase
                .from('games')
                .select('*')
                .gte('start_time', new Date(selectedDate).toISOString())
                .lt('start_time', new Date(new Date(selectedDate).getTime() + 86400000).toISOString())
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

            // If successful, the optimistic update is fine.
        } catch (error) {
            console.error('Error saving pick:', error);
            // Revert on error
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

        // Parse spread: e.g., "WKU -18.5"
        const parts = game.spread.split(' ');
        const spreadTeamAbbrev = parts[0]; // Use abbrev for matching
        const spreadValue = parseFloat(parts[1]);

        if (isNaN(spreadValue)) return null;

        // Determine if team is the spread team
        let isSpreadTeam = false;
        if (game.team_a_abbrev === spreadTeamAbbrev) {
            if (team === game.team_a) isSpreadTeam = true;
        } else if (game.team_b_abbrev === spreadTeamAbbrev) {
            if (team === game.team_b) isSpreadTeam = true;
        }

        // Calculate margin for the selected 'team'
        // If 'team' is team_a, margin is team_a_score - team_b_score
        // If 'team' is team_b, margin is team_b_score - team_a_score
        const margin = team === game.team_a
            ? game.result_a - game.result_b
            : game.result_b - game.result_a;

        // If this is the spread team (favorite usually has minus), add spread (which is negative)
        // If this is the underdog, they are covering if (margin > -spread) effectively.

        let effectiveSpread = 0;
        if (isSpreadTeam) {
            effectiveSpread = spreadValue;
        } else {
            // If the current team is not the spread team, the effective spread for them is the opposite
            effectiveSpread = -spreadValue;
        }

        return (margin + effectiveSpread) > 0;
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
                                            {new Date(game.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                                        className={`team-btn ${userPick === game.team_a ? 'selected' : ''} ${isLocked ? 'locked' : ''}`}
                                        onClick={() => !isLocked && handlePick(game.id, game.team_a)}
                                        disabled={isLocked}
                                    >
                                        <span>{game.team_a}</span>
                                        {game.status === 'finished' && checkCover(game, game.team_a) && (
                                            <span className="cover-badge">Covered</span>
                                        )}
                                    </button>
                                    <div className="vs-badge">VS</div>
                                    <button
                                        className={`team-btn ${userPick === game.team_b ? 'selected' : ''} ${isLocked ? 'locked' : ''}`}
                                        onClick={() => !isLocked && handlePick(game.id, game.team_b)}
                                        disabled={isLocked}
                                    >
                                        <span>{game.team_b}</span>
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
