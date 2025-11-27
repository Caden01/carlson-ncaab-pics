import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseAnonKey = envConfig.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function verifyVisibility() {
    console.log('Verifying pick visibility...');

    // 1. Find a future game
    const { data: futureGames, error: futureError } = await supabase
        .from('games')
        .select('id, start_time, team_a, team_b')
        .gt('start_time', new Date().toISOString())
        .limit(1);

    if (futureError) {
        console.error('Error fetching future games:', futureError);
        return;
    }

    if (futureGames.length === 0) {
        console.log('No future games found to test.');
    } else {
        const game = futureGames[0];
        console.log(`\nTesting Future Game: ${game.team_a} vs ${game.team_b} (ID: ${game.id}, Start: ${game.start_time})`);

        // Fetch picks for this game (as anonymous user)
        const { data: picks, error: picksError } = await supabase
            .from('picks')
            .select('*')
            .eq('game_id', game.id);

        if (picksError) {
            console.error('Error fetching picks:', picksError);
        } else {
            console.log(`Picks found: ${picks.length}`);
            if (picks.length === 0) {
                console.log('✅ SUCCESS: No picks visible for future game (or none exist).');
            } else {
                console.log('❌ FAILURE: Picks are visible for future game!');
                console.log(picks);
            }
        }
    }

    // 2. Find a past game
    const { data: pastGames, error: pastError } = await supabase
        .from('games')
        .select('id, start_time, team_a, team_b')
        .lt('start_time', new Date().toISOString())
        .limit(1);

    if (pastError) {
        console.error('Error fetching past games:', pastError);
        return;
    }

    if (pastGames.length === 0) {
        console.log('No past games found to test.');
    } else {
        const game = pastGames[0];
        console.log(`\nTesting Past Game: ${game.team_a} vs ${game.team_b} (ID: ${game.id}, Start: ${game.start_time})`);

        // Fetch picks for this game (as anonymous user)
        const { data: picks, error: picksError } = await supabase
            .from('picks')
            .select('*')
            .eq('game_id', game.id);

        if (picksError) {
            console.error('Error fetching picks:', picksError);
        } else {
            console.log(`Picks found: ${picks.length}`);
            if (picks.length > 0) {
                console.log('✅ SUCCESS: Picks are visible for past game.');
            } else {
                console.log('⚠️ NOTE: No picks found for past game. This might be correct if no one picked it, but verify manually.');
            }
        }
    }
}

verifyVisibility();
