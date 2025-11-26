import { fetchDailyGames } from './src/lib/espn.js';

const test = async () => {
    console.log('Fetching games...');
    // Fetching for a date that likely has games/odds. 
    // If today has no odds yet, we might need to check a different date or just inspect the structure.
    // Using the same date as before.
    const date = '20251126';

    try {
        const response = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${date}`
        );
        const data = await response.json();

        if (data.events && data.events.length > 0) {
            const event = data.events[0];
            console.log('Competition Odds:', JSON.stringify(event.competitions[0].odds, null, 2));
        } else {
            console.log('No events found.');
        }
    } catch (e) {
        console.error(e);
    }
};

test();
