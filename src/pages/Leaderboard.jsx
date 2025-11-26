import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Trophy } from 'lucide-react';

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

    if (loading) {
        return <div className="loading-screen">Loading leaderboard...</div>;
    }

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <h1>Leaderboard</h1>
                <p>See who's leading the pack.</p>
            </header>

            <div className="leaderboard-card">
                <table className="leaderboard-table">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>User</th>
                            <th className="text-right">Points</th>
                        </tr>
                    </thead>
                    <tbody>
                        {profiles.map((profile, index) => (
                            <tr key={profile.id} className={index < 3 ? 'top-rank' : ''}>
                                <td className="rank-cell">
                                    {index === 0 && <Trophy size={20} className="gold-trophy" />}
                                    {index === 1 && <Trophy size={20} className="silver-trophy" />}
                                    {index === 2 && <Trophy size={20} className="bronze-trophy" />}
                                    <span className="rank-number">{index + 1}</span>
                                </td>
                                <td className="user-cell">
                                    <div className="user-avatar-placeholder">
                                        {profile.email?.charAt(0).toUpperCase()}
                                    </div>
                                    <span>{profile.email}</span>
                                </td>
                                <td className="points-cell">{profile.total_points}</td>
                            </tr>
                        ))}
                        {profiles.length === 0 && (
                            <tr>
                                <td colSpan="3" className="empty-cell">No players yet.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
