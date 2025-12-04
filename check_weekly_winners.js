import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env.local');
const envConfig = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envConfig.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
        envVars[key.trim()] = value.trim();
    }
});

const supabase = createClient(envVars.VITE_SUPABASE_URL, envVars.VITE_SUPABASE_ANON_KEY);

async function main() {
    const { data: winners, error } = await supabase
        .from('weekly_winners')
        .select('*, profiles(username)')
        .order('week_start', { ascending: true });

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('=== Weekly Winners in Database ===\n');
    winners.forEach((w, i) => {
        console.log(`Week ${i + 1}: ${w.week_start} to ${w.week_end}`);
        console.log(`  Winner: ${w.profiles?.username} (${w.wins}-${w.losses})`);
        console.log('');
    });
}

main();

