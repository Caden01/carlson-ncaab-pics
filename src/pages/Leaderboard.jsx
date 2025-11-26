import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Trophy, Medal, Zap, Flame } from 'lucide-react';

export default function Leaderboard() {
    const [profiles, setProfiles] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLeaderboard();
    }, []);

    const fetchLeaderboard = async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('total_points', { ascending: false });

            if (error) throw error;
            setProfiles(data || []);
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const getAvatarGradient = (index) => {
        const gradients = [
            'linear-gradient(135deg, #3b82f6, #2563eb)', // Blue
            'linear-gradient(135deg, #f97316, #dc2626)', // Orange-Red
            'linear-gradient(135deg, #a855f7, #db2777)', // Purple-Pink
            'linear-gradient(135deg, #06b6d4, #2563eb)', // Cyan-Blue
            'linear-gradient(135deg, #eab308, #ea580c)', // Yellow-Orange
            'linear-gradient(135deg, #64748b, #475569)', // Slate
            'linear-gradient(135deg, #ef4444, #ea580c)', // Red-Orange
            'linear-gradient(135deg, #10b981, #059669)', // Green
        ];
        return gradients[index % gradients.length];
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
                    <p className="header-subtitle">Top performers this season. Who will be crowned champion?</p>
                </div>

                <div className="leaderboard-card-new">
                    <div className="table-responsive">
                        <table className="leaderboard-table-new">
                            <thead>
                                <tr>
                                    <th className="th-rank">Rank</th>
                                    <th className="th-player">Player</th>
                                    <th className="th-record">Record</th>
                                    <th className="th-winrate">Win Rate</th>
                                </tr>
                            </thead>
                            <tbody>
                                {profiles.map((profile, index) => {
                                    const wins = profile.total_wins || 0;
                                    const losses = profile.total_losses || 0;
                                    const total = wins + losses;
                                    const winRate = ((wins / total) * 100 || 0).toFixed(1);
                                    const isTopThree = index < 3;

                                    return (
                                        <tr
                                            key={profile.id}
                                            className={`leaderboard-row ${isTopThree ? 'top-three' : ''}`}
                                        >
                                            <td className="td-rank">
                                                <div className="rank-badge">
                                                    {index === 0 && <Trophy size={20} className="text-yellow-400" />}
                                                    {index === 1 && <Medal size={20} className="text-slate-300" />}
                                                    {index === 2 && <Medal size={20} className="text-amber-600" />}
                                                    {index >= 3 && (
                                                        <span className="rank-text">#{index + 1}</span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="td-player">
                                                <div className="player-info">
                                                    <div
                                                        className="player-avatar"
                                                        style={{ background: getAvatarGradient(index) }}
                                                    >
                                                        <span>
                                                            {(profile.username || profile.email)?.charAt(0).toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <div className="player-name">
                                                        {profile.username || profile.email}
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
                                        </tr>
                                    );
                                })}
                                {profiles.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="empty-message">
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
