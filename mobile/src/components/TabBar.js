import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Trophy, User, Settings } from 'lucide-react-native';
import { colors, spacing, fontSize, fontWeight } from '../theme';
import { useAuth } from '../context/AuthContext';

export default function TabBar({ navigation, currentRoute }) {
    const insets = useSafeAreaInsets();
    const { isAdmin, user } = useAuth();

    const tabs = [
        { name: 'Dashboard', icon: Home, label: 'Home' },
        { name: 'Leaderboard', icon: Trophy, label: 'Board' },
        { name: 'Profile', icon: User, label: 'Profile' },
    ];

    // Only show admin tab for specific admin user
    if (isAdmin && user?.email === 'crcgames3@gmail.com') {
        tabs.push({ name: 'Admin', icon: Settings, label: 'Admin' });
    }

    return (
        <View style={[styles.container, { paddingBottom: insets.bottom || spacing.md }]}>
            {tabs.map((tab) => {
                const isActive = currentRoute === tab.name;
                const Icon = tab.icon;
                
                return (
                    <TouchableOpacity
                        key={tab.name}
                        style={styles.tab}
                        onPress={() => navigation.navigate(tab.name)}
                    >
                        <Icon 
                            size={24} 
                            color={isActive ? colors.primary : colors.textMuted} 
                        />
                        <Text style={[
                            styles.label,
                            isActive && styles.labelActive
                        ]}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        backgroundColor: colors.bgSurface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: spacing.sm,
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.xs,
    },
    label: {
        fontSize: fontSize.xs,
        color: colors.textMuted,
        marginTop: spacing.xs,
        fontWeight: fontWeight.medium,
    },
    labelActive: {
        color: colors.primary,
    },
});

