import { useState, useEffect } from 'react';
import { 
    View, 
    Text, 
    TextInput,
    TouchableOpacity, 
    StyleSheet, 
    ScrollView,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Save, Mail, AtSign, LogOut } from 'lucide-react-native';

import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, fontSize, fontWeight, borderRadius, shadows } from '../theme';

export default function ProfileScreen({ navigation }) {
    const { user, signOut } = useAuth();
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

    const updateProfile = async () => {
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

    const handleSignOut = async () => {
        Alert.alert(
            'Sign Out',
            'Are you sure you want to sign out?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Sign Out',
                    style: 'destructive',
                    onPress: async () => {
                        await signOut();
                    }
                }
            ]
        );
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <ScrollView 
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Profile Card */}
                    <View style={styles.card}>
                        {/* Header */}
                        <View style={styles.cardHeader}>
                            <View style={styles.iconContainer}>
                                <User size={32} color="white" />
                            </View>
                            <View>
                                <Text style={styles.headerTitle}>Your Profile</Text>
                                <Text style={styles.headerSubtitle}>Manage your public identity</Text>
                            </View>
                        </View>

                        {/* Content */}
                        <View style={styles.cardContent}>
                            {/* Message */}
                            {message && (
                                <View style={[
                                    styles.messageContainer,
                                    message.type === 'success' ? styles.messageSuccess : styles.messageError
                                ]}>
                                    <View style={[
                                        styles.messageDot,
                                        message.type === 'success' ? styles.dotSuccess : styles.dotError
                                    ]} />
                                    <Text style={[
                                        styles.messageText,
                                        message.type === 'success' ? styles.textSuccess : styles.textError
                                    ]}>
                                        {message.text}
                                    </Text>
                                </View>
                            )}

                            {/* Email Field */}
                            <View style={styles.formGroup}>
                                <Text style={styles.label}>Email Address</Text>
                                <View style={styles.inputContainer}>
                                    <Mail size={18} color={colors.textMuted} style={styles.inputIcon} />
                                    <TextInput
                                        style={[styles.input, styles.inputDisabled]}
                                        value={user.email}
                                        editable={false}
                                    />
                                </View>
                            </View>

                            {/* Username Field */}
                            <View style={styles.formGroup}>
                                <Text style={styles.label}>Display Name</Text>
                                <View style={styles.inputContainer}>
                                    <AtSign size={18} color={colors.textMuted} style={styles.inputIcon} />
                                    <TextInput
                                        style={styles.input}
                                        value={username}
                                        onChangeText={setUsername}
                                        placeholder="Enter your display name"
                                        placeholderTextColor={colors.textMuted}
                                    />
                                </View>
                                <Text style={styles.helperText}>
                                    This name will appear on the leaderboard.
                                </Text>
                            </View>

                            {/* Save Button */}
                            <TouchableOpacity
                                style={[styles.saveButton, saving && styles.buttonDisabled]}
                                onPress={updateProfile}
                                disabled={saving}
                            >
                                {saving ? (
                                    <ActivityIndicator color="white" />
                                ) : (
                                    <>
                                        <Save size={20} color="white" />
                                        <Text style={styles.saveButtonText}>Save Changes</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Sign Out Button */}
                    <TouchableOpacity
                        style={styles.signOutButton}
                        onPress={handleSignOut}
                    >
                        <LogOut size={20} color={colors.danger} />
                        <Text style={styles.signOutText}>Sign Out</Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bgBody,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.bgBody,
    },
    keyboardView: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: spacing.lg,
    },
    card: {
        backgroundColor: colors.bgSurface,
        borderRadius: borderRadius.xl,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
        ...shadows.lg,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg,
        padding: spacing.xl,
        backgroundColor: colors.info,
    },
    iconContainer: {
        width: 56,
        height: 56,
        borderRadius: borderRadius.full,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: fontSize.xl,
        fontWeight: fontWeight.bold,
        color: 'white',
    },
    headerSubtitle: {
        fontSize: fontSize.sm,
        color: 'rgba(255, 255, 255, 0.8)',
        marginTop: 2,
    },
    cardContent: {
        padding: spacing.xl,
    },
    messageContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.lg,
        borderRadius: borderRadius.lg,
        marginBottom: spacing.xl,
        borderWidth: 1,
    },
    messageSuccess: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    messageError: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderColor: 'rgba(239, 68, 68, 0.3)',
    },
    messageDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: spacing.md,
    },
    dotSuccess: {
        backgroundColor: colors.success,
    },
    dotError: {
        backgroundColor: colors.danger,
    },
    messageText: {
        fontSize: fontSize.md,
        flex: 1,
    },
    textSuccess: {
        color: colors.success,
    },
    textError: {
        color: colors.danger,
    },
    formGroup: {
        marginBottom: spacing.xl,
    },
    label: {
        fontSize: fontSize.sm,
        fontWeight: fontWeight.semibold,
        color: colors.textMain,
        marginBottom: spacing.sm,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.bgBody,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderColor: colors.border,
    },
    inputIcon: {
        marginLeft: spacing.lg,
    },
    input: {
        flex: 1,
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.md,
        fontSize: fontSize.md,
        color: colors.textMain,
        fontWeight: fontWeight.medium,
    },
    inputDisabled: {
        color: colors.textMuted,
    },
    helperText: {
        fontSize: fontSize.sm,
        color: colors.textMuted,
        marginTop: spacing.sm,
    },
    saveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.info,
        borderRadius: borderRadius.lg,
        paddingVertical: spacing.lg,
        gap: spacing.sm,
        marginTop: spacing.md,
        ...shadows.md,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    saveButtonText: {
        fontSize: fontSize.lg,
        fontWeight: fontWeight.bold,
        color: 'white',
    },
    signOutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderRadius: borderRadius.lg,
        paddingVertical: spacing.lg,
        gap: spacing.sm,
        marginTop: spacing.xl,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.3)',
    },
    signOutText: {
        fontSize: fontSize.md,
        fontWeight: fontWeight.semibold,
        color: colors.danger,
    },
});

