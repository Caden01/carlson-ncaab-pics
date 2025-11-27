import { fetchDailyGames } from './src/lib/espn.js';

async function checkEspn() {
    // Date from the sample game: 2025-11-26
    const dateStr = '20251126';
    console.log(`Fetching ESPN games for ${dateStr}...`);

    const games = await fetchDailyGames(dateStr);

    const finishedGames = games.filter(g => g.status === 'post');
    console.log(`Found ${finishedGames.length} finished games.`);

    finishedGames.forEach(g => {
        console.log(`${g.team_a} vs ${g.team_b}: Spread = ${g.spread}`);
    });
}

checkEspn();
