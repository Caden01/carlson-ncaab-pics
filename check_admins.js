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

async function checkAdmins() {
    const { data: admins, error } = await supabase
        .from('profiles')
        .select('id, email, username, is_admin')
        .eq('is_admin', true);

    if (error) {
        console.error('Error fetching admins:', error);
        return;
    }

    console.log(`Found ${admins.length} admins.`);
    if (admins.length > 0) {
        console.log('Admins:', admins);
    } else {
        console.log('No admins found. You might need to set is_admin=true for your user.');
    }
}

checkAdmins();
