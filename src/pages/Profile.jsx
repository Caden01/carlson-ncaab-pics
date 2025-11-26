import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Loader2, User, Save } from 'lucide-react';

export default function Profile() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [username, setUsername] = useState('');
    const [message, setMessage] = useState(null);

    useEffect(() => {
        if (user) {
            getProfile();
        }
    }, [user]);

    const getProfile = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', user.id)
                .single();

            if (error) throw error;

            if (data) {
                setUsername(data.username || '');
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const updateProfile = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            setMessage(null);

            const { error } = await supabase
                .from('profiles')
                .update({ username })
                .eq('id', user.id);

            if (error) throw error;
            setMessage({ type: 'success', text: 'Profile updated successfully!' });
        } catch (error) {
            console.error('Error updating profile:', error);
            setMessage({ type: 'error', text: 'Error updating profile. Please try again.' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="animate-spin text-primary" size={40} />
            </div>
        );
    }

    return (
        <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-blue-50 rounded-full text-blue-600">
                    <User size={24} />
                </div>
                <h1 className="text-2xl font-bold text-gray-900">Your Profile</h1>
            </div>

            {message && (
                <div className={`p-4 mb-6 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {message.text}
                </div>
            )}

            <form onSubmit={updateProfile} className="space-y-6">
                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                    </label>
                    <input
                        id="email"
                        type="text"
                        value={user.email}
                        disabled
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-500 cursor-not-allowed"
                    />
                </div>

                <div>
                    <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                        Username (Display Name)
                    </label>
                    <input
                        id="username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter your display name"
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                        This is how you will appear on the leaderboard.
                    </p>
                </div>

                <button
                    type="submit"
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                    {saving ? (
                        <Loader2 className="animate-spin" size={20} />
                    ) : (
                        <>
                            <Save size={20} />
                            Save Changes
                        </>
                    )}
                </button>
            </form>
        </div>
    );
}
