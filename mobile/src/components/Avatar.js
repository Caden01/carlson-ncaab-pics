import { View, Text, StyleSheet } from 'react-native';
import { getAvatarGradient } from '../lib/utils';
import { colors, fontSize, fontWeight, borderRadius } from '../theme';

export default function Avatar({ username, size = 40, isActive = false }) {
    const gradientColors = getAvatarGradient(username);
    const initial = (username || '?').charAt(0).toUpperCase();
    
    const dynamicStyles = {
        container: {
            width: size,
            height: size,
            borderRadius: size / 4,
            backgroundColor: gradientColors[0], // Use first color as solid fallback
        },
        text: {
            fontSize: size * 0.4,
        },
        activeRing: isActive ? {
            borderWidth: 2,
            borderColor: colors.info,
        } : {},
    };

    return (
        <View style={[styles.container, dynamicStyles.container, dynamicStyles.activeRing]}>
            <Text style={[styles.text, dynamicStyles.text]}>{initial}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        color: 'white',
        fontWeight: fontWeight.bold,
    },
});

