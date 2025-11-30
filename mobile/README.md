# NCAAB Picks Mobile App

React Native (Expo) mobile app for making NCAAB basketball picks.

## Quick Start

### Prerequisites

- Node.js 18+
- [Expo Go](https://expo.dev/client) app on your phone (for development)
- iOS Simulator (Mac) or Android Emulator (optional)

### Setup

1. Install dependencies:

```bash
cd mobile
npm install
```

2. Create environment file:

```bash
cp .env.example .env
```

3. Add your Supabase credentials to `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Start the development server:

```bash
npx expo start
```

5. Scan the QR code with Expo Go (Android) or Camera app (iOS)

## Features

- **Dashboard**: View daily games, make picks, see other users' picks
- **Leaderboard**: Daily, weekly, and season standings
- **Profile**: Update your display name
- **Admin**: Import games and sync scores (admin only)

## Building for Distribution

### Quick APK Build (Direct Android Distribution)

Build an APK you can share directly with users (no Play Store needed):

```bash
# 1. Install EAS CLI (one time)
npm install -g eas-cli

# 2. Login to Expo (one time)
eas login

# 3. Configure project (one time - follow prompts)
eas build:configure

# 4. Build APK for direct distribution
eas build --platform android --profile preview
```

After the build completes (~10-15 min), you'll get a download link for the APK. Share this file with users to install directly on their Android devices.

### Build Profiles

| Profile | Output | Use Case |
|---------|--------|----------|
| `preview` | APK | Direct sharing, testing |
| `development` | APK (debug) | Development with dev client |
| `production` | AAB | Google Play Store submission |

### Using EAS Build for Stores

```bash
# Build for Play Store (AAB format)
eas build --platform android --profile production

# Build for App Store
eas build --platform ios --profile production

# Submit to stores
eas submit --platform android
eas submit --platform ios
```

### Local Build (No Expo Account Required)

For Android:

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
# APK will be in android/app/build/outputs/apk/release/
```

For iOS (requires Mac with Xcode):

```bash
npx expo run:ios --configuration Release
```

## OAuth Setup for Google Sign-In

For the Google Sign-In to work on mobile, you'll need to:

1. Add the redirect URI to your Supabase project:
   - Go to Supabase Dashboard → Authentication → URL Configuration
   - Add `ncaabpicks://` to the redirect URLs

2. For production builds, you may need to configure Google OAuth credentials in the Google Cloud Console with your app's bundle ID/package name.

## Project Structure

```
mobile/
├── App.js                 # Entry point with navigation
├── app.json               # Expo configuration
├── package.json
├── src/
│   ├── components/        # Reusable components
│   │   ├── Avatar.js
│   │   └── TabBar.js
│   ├── context/
│   │   └── AuthContext.js # Auth state management
│   ├── lib/               # Shared utilities (same as web)
│   │   ├── espn.js
│   │   ├── gameImport.js
│   │   ├── gameLogic.js
│   │   ├── supabase.js
│   │   └── utils.js
│   ├── screens/           # App screens
│   │   ├── AdminScreen.js
│   │   ├── DashboardScreen.js
│   │   ├── LeaderboardScreen.js
│   │   ├── LoginScreen.js
│   │   └── ProfileScreen.js
│   └── theme.js           # Colors, spacing, typography
└── assets/                # App icons and splash screens
```

## Troubleshooting

### "Unable to resolve module" errors

Clear the Metro bundler cache:

```bash
npx expo start --clear
```

### Authentication not working

Make sure you've:
1. Added `ncaabpicks://` to Supabase redirect URLs
2. Set up your `.env` file correctly

### App crashes on startup

Check that all environment variables are set and valid.

