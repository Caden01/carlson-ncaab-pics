# Using The Odds API for Better Spread Data

## Problem
ESPN's API sometimes doesn't have spreads available when games are first posted, or marks them as "off". This causes games to be skipped even when they'll eventually have valid spreads.

## Solution
Use **The Odds API** which aggregates spreads from multiple sportsbooks and typically has spreads available earlier and more reliably.

## Setup

1. **Sign up for a free API key** at https://the-odds-api.com/
   - Free tier: 500 requests/month
   - Paid tiers available if you need more

2. **Add your API key to environment variables:**
   
   For the daily update script (`scripts/daily-update.js`):
   ```bash
   # Add to your GitHub Actions secrets or .env file
   ODDS_API_KEY=your_api_key_here
   ```

   For the web app:
   ```bash
   # Add to .env.local
   VITE_ODDS_API_KEY=your_api_key_here
   ```

3. **Update the code to use the hybrid approach:**

   The `fetchDailyGames` function in `src/lib/espn.js` now supports an optional `oddsApiKey` parameter. When provided, it will:
   - Use ESPN for game data (scores, teams, records, etc.)
   - Use The Odds API for spread data (more reliable)
   - Fall back to ESPN spreads if Odds API doesn't have the game

## Usage

### In daily-update.js:
```javascript
import { fetchDailyGames } from '../src/lib/espn.js';

// Pass the API key to enable hybrid mode
const games = await fetchDailyGames(dateStr, process.env.ODDS_API_KEY);
```

### In the web app:
```javascript
import { fetchDailyGames } from './lib/espn';

const games = await fetchDailyGames(dateStr, import.meta.env.VITE_ODDS_API_KEY);
```

## Benefits

- ✅ Spreads available earlier (often before ESPN)
- ✅ More reliable spread data (aggregated from multiple sportsbooks)
- ✅ Consensus spreads (most common value across bookmakers)
- ✅ Still uses ESPN for all other game data (scores, records, etc.)
- ✅ Automatic fallback to ESPN if Odds API fails

## Cost

- **Free tier**: 500 requests/month (enough for ~16 requests/day)
- **Paid tiers**: Start at $10/month for 5,000 requests

For a daily update script that runs 1-2 times per day, the free tier should be sufficient.

## Alternative APIs

If The Odds API doesn't work for you, other options include:
- **Sportsbook API** (sportsbookapi.com)
- **JsonOdds** (jsonodds.com)
- **BoltOdds** (boltodds.com)

The implementation pattern would be similar - fetch spreads from the alternative API and merge with ESPN game data.
