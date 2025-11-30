import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check active sessions and sets the user
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
            if (session?.user) {
                checkAdmin(session.user.id);
            } else {
                setLoading(false);
            }
        });

        // Listen for changes on auth state (logged in, signed out, etc.)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
            if (session?.user) {
                checkAdmin(session.user.id);
            } else {
                setIsAdmin(false);
                setLoading(false);
            }
        });

        // Handle deep links for OAuth callback
        const handleDeepLink = async (event) => {
            try {
                const url = event?.url;
                if (!url) return;
                
                if (url.includes('access_token') || url.includes('refresh_token')) {
                    // Extract tokens from URL and set session
                    const hashPart = url.split('#')[1];
                    if (hashPart) {
                        const params = new URLSearchParams(hashPart);
                        const accessToken = params.get('access_token');
                        const refreshToken = params.get('refresh_token');
                        
                        if (accessToken && refreshToken) {
                            await supabase.auth.setSession({
                                access_token: accessToken,
                                refresh_token: refreshToken,
                            });
                        }
                    }
                }
            } catch (error) {
                console.error('Error handling deep link:', error);
            }
        };

        const linkingSubscription = Linking.addEventListener('url', handleDeepLink);

        return () => {
            subscription.unsubscribe();
            linkingSubscription.remove();
        };
    }, []);

    const checkAdmin = async (userId) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('is_admin')
                .eq('id', userId)
                .single();

            if (!error && data) {
                setIsAdmin(data.is_admin);
            }
        } catch (error) {
            console.error('Error checking admin status:', error);
        } finally {
            setLoading(false);
        }
    };

    const signInWithGoogle = async () => {
        try {
            const redirectUri = makeRedirectUri({
                scheme: 'ncaabpicks',
            });

            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: redirectUri,
                    skipBrowserRedirect: true,
                },
            });

            if (error) throw error;

            if (data?.url) {
                const result = await WebBrowser.openAuthSessionAsync(
                    data.url,
                    redirectUri
                );

                if (result.type === 'success' && result.url) {
                    // Handle the callback URL
                    try {
                        const hashPart = result.url.split('#')[1];
                        if (hashPart) {
                            const params = new URLSearchParams(hashPart);
                            const accessToken = params.get('access_token');
                            const refreshToken = params.get('refresh_token');

                            if (accessToken && refreshToken) {
                                await supabase.auth.setSession({
                                    access_token: accessToken,
                                    refresh_token: refreshToken,
                                });
                            }
                        }
                    } catch (parseError) {
                        console.error('Error parsing auth callback URL:', parseError);
                    }
                }
            }

            return { error: null };
        } catch (error) {
            console.error('Google sign in error:', error);
            return { error };
        }
    };

    const signOut = async () => {
        setIsAdmin(false);
        return supabase.auth.signOut();
    };

    const value = {
        signInWithGoogle,
        signOut,
        user,
        isAdmin,
        loading,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

