import { createClient } from '@supabase/supabase-js';
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

async function checkGames() {
    const { data, error } = await supabase
        .from('games')
        .select('*')
        .limit(5);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Games count:', data.length);
        if (data.length > 0) {
            console.log('Sample game:', data[0].team_a, 'vs', data[0].team_b);
            console.log('Start time:', data[0].start_time);
            console.log('Game Date:', data[0].game_date);
        } else {
            console.log('No games found in DB.');
        }
    }
}

checkGames();
