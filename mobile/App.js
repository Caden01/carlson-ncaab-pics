import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { colors } from './src/theme';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import LeaderboardScreen from './src/screens/LeaderboardScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AdminScreen from './src/screens/AdminScreen';

const Stack = createNativeStackNavigator();

function AppNavigator() {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <Stack.Navigator
            screenOptions={{
                headerStyle: {
                    backgroundColor: colors.bgSurface,
                },
                headerTintColor: colors.textMain,
                headerTitleStyle: {
                    fontWeight: '600',
                },
                contentStyle: {
                    backgroundColor: colors.bgBody,
                },
            }}
        >
            {user ? (
                <>
                    <Stack.Screen 
                        name="Dashboard" 
                        component={DashboardScreen}
                        options={{ title: 'NCAAB Picks' }}
                    />
                    <Stack.Screen 
                        name="Leaderboard" 
                        component={LeaderboardScreen}
                    />
                    <Stack.Screen 
                        name="Profile" 
                        component={ProfileScreen}
                    />
                    <Stack.Screen 
                        name="Admin" 
                        component={AdminScreen}
                    />
                </>
            ) : (
                <Stack.Screen 
                    name="Login" 
                    component={LoginScreen}
                    options={{ headerShown: false }}
                />
            )}
        </Stack.Navigator>
    );
}

export default function App() {
    return (
        <SafeAreaProvider>
            <AuthProvider>
                <NavigationContainer>
                    <StatusBar style="light" />
                    <AppNavigator />
                </NavigationContainer>
            </AuthProvider>
        </SafeAreaProvider>
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.bgBody,
    },
});

