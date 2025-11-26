import { fetchDailyGames } from './src/lib/espn.js';

const test = async () => {
    console.log('Fetching games...');
    const games = await fetchDailyGames('20251126');
    console.log('Games found:', games.length);
    if (games.length > 0) {
        console.log('First game:', games[0]);
    }
};

test();
