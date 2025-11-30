import { useState } from 'react';
import { 
    View, 
    Text, 
    TouchableOpacity, 
    StyleSheet, 
    ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Trophy } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, fontSize, fontWeight, borderRadius, shadows } from '../theme';

export default function LoginScreen() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const { signInWithGoogle } = useAuth();

    const handleGoogleLogin = async () => {
        try {
            setLoading(true);
            setError(null);
            const { error } = await signInWithGoogle();
            if (error) throw error;
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                {/* Logo and Header */}
                <View style={styles.header}>
                    <View style={styles.logoContainer}>
                        <Trophy size={48} color="white" />
                    </View>
                    <Text style={styles.title}>NCAAB Picks</Text>
                    <Text style={styles.subtitle}>Sign in to make your picks</Text>
                </View>

                {/* Error Message */}
                {error && (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}

                {/* Sign In Button */}
                <View style={styles.buttonContainer}>
                    <TouchableOpacity
                        style={[styles.googleButton, loading && styles.buttonDisabled]}
                        onPress={handleGoogleLogin}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color={colors.textMain} />
                        ) : (
                            <>
                                <View style={styles.googleIcon}>
                                    <Text style={styles.googleIconText}>G</Text>
                                </View>
                                <Text style={styles.buttonText}>Sign in with Google</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Footer */}
                <Text style={styles.footer}>
                    Make your college basketball picks and compete with friends
                </Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bgBody,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: spacing.xxl,
    },
    header: {
        alignItems: 'center',
        marginBottom: spacing.xxxl,
    },
    logoContainer: {
        width: 100,
        height: 100,
        borderRadius: borderRadius.xl,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.xl,
        ...shadows.lg,
    },
    title: {
        fontSize: fontSize.display,
        fontWeight: fontWeight.bold,
        color: colors.textMain,
        marginBottom: spacing.sm,
    },
    subtitle: {
        fontSize: fontSize.lg,
        color: colors.textMuted,
    },
    errorContainer: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.3)',
        borderRadius: borderRadius.md,
        padding: spacing.lg,
        marginBottom: spacing.xl,
    },
    errorText: {
        color: colors.danger,
        fontSize: fontSize.md,
        textAlign: 'center',
    },
    buttonContainer: {
        marginBottom: spacing.xxxl,
    },
    googleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.bgSurface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: borderRadius.lg,
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.xl,
        ...shadows.md,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    googleIcon: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'white',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.md,
    },
    googleIconText: {
        fontSize: fontSize.lg,
        fontWeight: fontWeight.bold,
        color: '#4285F4',
    },
    buttonText: {
        fontSize: fontSize.lg,
        fontWeight: fontWeight.semibold,
        color: colors.textMain,
    },
    footer: {
        fontSize: fontSize.sm,
        color: colors.textMuted,
        textAlign: 'center',
    },
});

