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

const supabase = createClient(supabaseUrl, supabaseKey);

async function listFinishedGames() {
    const { data: games, error } = await supabase
        .from('games')
        .select('id, team_a, team_b, spread')
        .eq('status', 'finished');

    if (error) {
        console.error('Error fetching games:', error);
        return;
    }

    games.forEach(g => {
        console.log(`ID: ${g.id} | ${g.team_a} vs ${g.team_b} | Spread: ${g.spread}`);
    });
}

listFinishedGames();
