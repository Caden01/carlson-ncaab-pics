import { fetchDailyGames } from './src/lib/espn.js';

const test = async () => {
    const date = '20251126';

    console.log('--- Testing Default Fetch ---');
    try {
        const response = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${date}`
        );
        const data = await response.json();
        console.log('Default count:', data.events ? data.events.length : 0);
    } catch (e) { console.error(e); }

    console.log('--- Testing Division I (groups=50) ---');
    try {
        const response = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${date}&groups=50&limit=1000`
        );
        const data = await response.json();
        console.log('Div I count:', data.events ? data.events.length : 0);
    } catch (e) { console.error(e); }
};

test();
