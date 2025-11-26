import { createClient } from '@supabase/supabase-js';
import { fetchDailyGames } from './src/lib/espn.js';
import fs from 'fs';
import path from 'path';

// Read .env.local manually
const envPath = path.resolve('.env.local');
const envConfig = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envConfig.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
        envVars[key.trim()] = value.trim();
    }
});

const supabaseUrl = envVars.VITE_SUPABASE_URL;
const supabaseKey = envVars.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const MAJOR_CONFERENCES = ['2', '4', '7', '8', '23'];

async function importGames() {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');

    console.log(`Fetching games for ${dateStr}...`);
    const games = await fetchDailyGames(dateStr);

    console.log(`Found ${games.length} total games from ESPN`);

    let importedCount = 0;
    let skippedNoSpread = 0;
    let skippedSpreadTooHigh = 0;
    let skippedConference = 0;

    for (const game of games) {
        // Filter: Only import games with spread <= 12. Skip if no spread.
        if (!game.spread_value) {
            skippedNoSpread++;
            continue;
        }

        if (Math.abs(game.spread_value) > 12) {
            skippedSpreadTooHigh++;
            continue;
        }

        // Filter: Must include at least one team from major conferences
        if (!MAJOR_CONFERENCES.includes(game.team_a_conf_id) && !MAJOR_CONFERENCES.includes(game.team_b_conf_id)) {
            skippedConference++;
            continue;
        }

        // Check if game exists
        const { data: existing } = await supabase
            .from('games')
            .select('id')
            .eq('external_id', game.external_id)
            .single();

        if (!existing) {
            const { error } = await supabase.from('games').insert([{
                external_id: game.external_id,
                team_a: game.team_a,
                team_b: game.team_b,
                start_time: game.start_time,
                status: game.status === 'pre' ? 'scheduled' : (game.status === 'post' ? 'finished' : 'in_progress'),
                result_a: game.result_a,
                result_b: game.result_b,
                spread: game.spread,
                team_a_record: game.team_a_record,
                team_a_rank: game.team_a_rank,
                team_b_record: game.team_b_record,
                team_b_rank: game.team_b_rank,
                team_a_abbrev: game.team_a_abbrev,
                team_b_abbrev: game.team_b_abbrev,
                game_date: game.game_date
            }]);

            if (!error) {
                importedCount++;
                console.log(`✓ Imported: ${game.team_a} vs ${game.team_b} (Spread: ${game.spread})`);
            } else {
                console.error('Error inserting game:', error);
            }
        }
    }

    console.log('\n=== Import Summary ===');
    console.log(`Imported: ${importedCount} games`);
    console.log(`Skipped (no spread): ${skippedNoSpread}`);
    console.log(`Skipped (spread > 12): ${skippedSpreadTooHigh}`);
    console.log(`Skipped (conference): ${skippedConference}`);
}

importGames();
