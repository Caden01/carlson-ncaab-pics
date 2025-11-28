import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Trophy, Medal, Zap, Flame, Calendar, CalendarDays, Crown, Award } from 'lucide-react';
import { getAvatarGradient } from '../lib/utils';
import { didTeamCover } from '../lib/gameLogic';

export default function Leaderboard() {
    const [profiles, setProfiles] = useState([]);
    const [leaderboardData, setLeaderboardData] = useState([]);
    const [weeklyWinners, setWeeklyWinners] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('week'); // 'today', 'week', 'season'

    // Format date as YYYY-MM-DD in local timezone
    const formatLocalDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Get Monday of the current week (for week calculations)
    const getWeekStart = (date = new Date()) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
        d.setDate(diff);
        return formatLocalDate(d);
    };

    // Get Sunday of the current week
    const getWeekEnd = (date = new Date()) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? 0 : 7); // Adjust for Sunday
        d.setDate(diff);
        return formatLocalDate(d);
    };

    // Get today's date in local timezone
    const getLocalDate = () => {
        return formatLocalDate(new Date());
    };

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const fetchData = async () => {
        try {
            setLoading(true);

            // Fetch all profiles
            const { data: profilesData, error: profilesError } = await supabase
                .from('profiles')
                .select('*')
                .order('total_points', { ascending: false });

            if (profilesError) throw profilesError;
            setProfiles(profilesData || []);

            // Fetch weekly winners history
            const { data: winnersData } = await supabase
                .from('weekly_winners')
                .select('*, profiles(username, email)')
                .order('week_start', { ascending: false });

            setWeeklyWinners(winnersData || []);

            // Calculate records based on active tab
            await calculateRecords(profilesData || [], activeTab);

        } catch (error) {
            console.error('Error fetching leaderboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const calculateRecords = async (profilesList, period) => {
        try {
            let dateFilter = {};
            const today = getLocalDate();

            if (period === 'today') {
                dateFilter = { start: today, end: today };
            } else if (period === 'week') {
                dateFilter = { start: getWeekStart(), end: getWeekEnd() };
            }
            // 'season' = no date filter, use profile totals

            if (period === 'season') {
                // Use stored totals from profiles
                const ranked = profilesList.map(profile => ({
                    ...profile,
                    wins: profile.total_wins || 0,
                    losses: profile.total_losses || 0,
                    weeklyWins: profile.weekly_wins || 0
                })).sort((a, b) => {
                    // Sort by wins, then by fewer losses, then by win rate
                    if (b.wins !== a.wins) return b.wins - a.wins;
                    if (a.losses !== b.losses) return a.losses - b.losses;
                    return 0;
                });
                setLeaderboardData(ranked);
                return;
            }

            // For today/week, calculate dynamically from picks
            const { data: games, error: gamesError } = await supabase
                .from('games')
                .select('*')
                .gte('game_date', dateFilter.start)
                .lte('game_date', dateFilter.end)
                .eq('status', 'finished');

            if (gamesError) throw gamesError;

            if (!games || games.length === 0) {
                // No finished games in this period
                const ranked = profilesList.map(profile => ({
                    ...profile,
                    wins: 0,
                    losses: 0,
                    weeklyWins: profile.weekly_wins || 0
                }));
                setLeaderboardData(ranked);
                return;
            }

            const gameIds = games.map(g => g.id);

            // Fetch all picks for these games
            const { data: picks, error: picksError } = await supabase
                .from('picks')
                .select('user_id, game_id, selected_team')
                .in('game_id', gameIds);

            if (picksError) throw picksError;

            // Calculate wins/losses for each user
            const userRecords = {};
            profilesList.forEach(p => {
                userRecords[p.id] = { wins: 0, losses: 0 };
            });

            (picks || []).forEach(pick => {
                const game = games.find(g => g.id === pick.game_id);
                if (!game) return;

                const covered = didTeamCover(game, pick.selected_team);
                if (covered === null) return;

                if (!userRecords[pick.user_id]) {
                    userRecords[pick.user_id] = { wins: 0, losses: 0 };
                }

                if (covered) {
                    userRecords[pick.user_id].wins++;
                } else {
                    userRecords[pick.user_id].losses++;
                }
            });

            // Merge with profiles and sort
            const ranked = profilesList.map(profile => ({
                ...profile,
                wins: userRecords[profile.id]?.wins || 0,
                losses: userRecords[profile.id]?.losses || 0,
                weeklyWins: profile.weekly_wins || 0
            })).sort((a, b) => {
                // Sort by wins, then by fewer losses
                if (b.wins !== a.wins) return b.wins - a.wins;
                if (a.losses !== b.losses) return a.losses - b.losses;
                return 0;
            });

            setLeaderboardData(ranked);
        } catch (error) {
            console.error('Error calculating records:', error);
        }
    };

    const getTabLabel = () => {
        switch (activeTab) {
            case 'today': return "Today's Standings";
            case 'week': return "This Week's Standings";
            case 'season': return "Season Standings";
            default: return "Standings";
        }
    };

    if (loading) {
        return (
            <div className="leaderboard-page loading">
                <div className="spinner-container">
                    <div className="spinner-large"></div>
                    <p>Loading leaderboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="leaderboard-page">
            <div className="leaderboard-content">
                <div className="leaderboard-header-section">
                    <div className="header-title-row">
                        <div className="icon-box">
                            <Zap size={24} className="text-white" />
                        </div>
                        <h1 className="header-title">
                            Leaderboard
                        </h1>
                    </div>
                    <p className="header-subtitle">Track your performance and compete for weekly wins!</p>
                </div>

                {/* Tab Navigation */}
                <div className="leaderboard-tabs">
                    <button
                        className={`tab-btn ${activeTab === 'today' ? 'active' : ''}`}
                        onClick={() => setActiveTab('today')}
                    >
                        <Calendar size={16} />
                        <span>Today</span>
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'week' ? 'active' : ''}`}
                        onClick={() => setActiveTab('week')}
                    >
                        <CalendarDays size={16} />
                        <span>This Week</span>
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'season' ? 'active' : ''}`}
                        onClick={() => setActiveTab('season')}
                    >
                        <Trophy size={16} />
                        <span>Season</span>
                    </button>
                </div>

                {/* Weekly Winners Section */}
                {weeklyWinners.length > 0 && (
                    <div className="weekly-winners-section">
                        <div className="weekly-winners-header">
                            <Crown size={20} className="text-yellow-400" />
                            <h2>Weekly Champions</h2>
                        </div>
                        <div className="weekly-winners-list">
                            {weeklyWinners.slice(0, 5).map((winner, idx) => (
                                <div key={winner.id} className="weekly-winner-item">
                                    <div className="winner-week">
                                        {new Date(winner.week_start + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        {' - '}
                                        {new Date(winner.week_end + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    </div>
                                    <div className="winner-info">
                                        <div
                                            className="winner-avatar"
                                            style={{ background: getAvatarGradient(winner.profiles?.username || winner.profiles?.email || 'U') }}
                                        >
                                            {(winner.profiles?.username || winner.profiles?.email || 'U').charAt(0).toUpperCase()}
                                        </div>
                                        <span className="winner-name">{winner.profiles?.username || winner.profiles?.email}</span>
                                        <span className="winner-record">{winner.wins}-{winner.losses}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="leaderboard-card-new">
                    <div className="table-header-label">
                        {getTabLabel()}
                    </div>
                    <div className="table-responsive">
                        <table className="leaderboard-table-new">
                            <thead>
                                <tr>
                                    <th className="th-rank">Rank</th>
                                    <th className="th-player">Player</th>
                                    <th className="th-record">Record</th>
                                    <th className="th-winrate">Win Rate</th>
                                    {activeTab === 'season' && <th className="th-weekly-wins">Weekly Wins</th>}
                                    <th className="th-mobile-stats">Stats</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaderboardData.map((profile, index) => {
                                    const wins = profile.wins || 0;
                                    const losses = profile.losses || 0;
                                    const total = wins + losses;
                                    const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';
                                    const isTopThree = index < 3;
                                    const isLeader = index === 0 && wins > 0;

                                    return (
                                        <tr
                                            key={profile.id}
                                            className={`leaderboard-row ${isTopThree ? 'top-three' : ''} ${isLeader ? 'leader' : ''}`}
                                        >
                                            <td className="td-rank">
                                                <div className="rank-badge">
                                                    {index === 0 && wins > 0 && <Trophy size={20} className="text-yellow-400" />}
                                                    {index === 1 && wins > 0 && <Medal size={20} className="text-slate-300" />}
                                                    {index === 2 && wins > 0 && <Medal size={20} className="text-amber-600" />}
                                                    {(index >= 3 || wins === 0) && (
                                                        <span className="rank-text">#{index + 1}</span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="td-player">
                                                <div className="player-info">
                                                    <div
                                                        className="player-avatar"
                                                        style={{ background: getAvatarGradient(profile.username || profile.email) }}
                                                    >
                                                        <span>
                                                            {(profile.username || profile.email)?.charAt(0).toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <div className="player-details">
                                                        <div className="player-name">
                                                            {profile.username || profile.email}
                                                        </div>
                                                        {profile.weeklyWins > 0 && activeTab === 'season' && (
                                                            <div className="player-badges">
                                                                <span className="weekly-badge">
                                                                    <Crown size={12} />
                                                                    {profile.weeklyWins}x Champ
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="td-record">
                                                <span className="record-text">
                                                    {wins}-{losses}
                                                </span>
                                            </td>

                                            <td className="td-winrate">
                                                <div className="winrate-badge">
                                                    <Flame size={14} className="text-blue-400" />
                                                    <span>{winRate}%</span>
                                                </div>
                                            </td>

                                            {activeTab === 'season' && (
                                                <td className="td-weekly-wins">
                                                    {profile.weeklyWins > 0 ? (
                                                        <div className="weekly-wins-badge">
                                                            <Award size={14} className="text-yellow-400" />
                                                            <span>{profile.weeklyWins}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="no-wins">-</span>
                                                    )}
                                                </td>
                                            )}

                                            <td className="td-mobile-stats">
                                                <div className="mobile-stats-container">
                                                    <span className="record-text">{wins}-{losses}</span>
                                                    <span className="mobile-winrate">{winRate}%</span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {leaderboardData.length === 0 && (
                                    <tr>
                                        <td colSpan={activeTab === 'season' ? 6 : 5} className="empty-message">
                                            No players yet. Be the first to join!
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="leaderboard-footer">
                        <p>
                            Total Players: <span>{profiles.length}</span>
                        </p>
                        <p className="last-updated">Last updated: Just now</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
