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

// Paper data from PDF - cumulative through Week 3
// Name mappings: Jacob -> Jacoby, Dad -> David, Caden -> Caden
const paperData = {
    users: [
        { name: 'Jacoby', wins: 55, losses: 49, weeklyWins: 1 },
        { name: 'Caden', wins: 51, losses: 53, weeklyWins: 1 },
        { name: 'David', wins: 55, losses: 49, weeklyWins: 1 }
    ],
    weeklyWinners: [
        { week: 1, winner: 'Caden', weekStart: '2024-11-11', weekEnd: '2024-11-17', wins: 8, losses: 7 },
        { week: 2, winner: 'David', weekStart: '2024-11-18', weekEnd: '2024-11-24', wins: 14, losses: 8 },
        { week: 3, winner: 'Jacoby', weekStart: '2024-11-25', weekEnd: '2024-12-01', wins: 39, losses: 28 }
    ]
};

async function main() {
    console.log('=== Checking existing users ===\n');

    // First, list all profiles to find the right users
    const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, email, total_wins, total_losses, total_points, weekly_wins');

    if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        return;
    }

    console.log('Current profiles in database:');
    profiles.forEach(p => {
        console.log(`  - ${p.username || p.email}: ${p.total_wins || 0}W - ${p.total_losses || 0}L, ${p.weekly_wins || 0} weeks won (ID: ${p.id})`);
    });

    console.log('\n=== Paper Data to Import ===\n');
    paperData.users.forEach(u => {
        console.log(`  - ${u.name}: ${u.wins}W - ${u.losses}L, ${u.weeklyWins} weeks won`);
    });

    console.log('\nWeekly Winners:');
    paperData.weeklyWinners.forEach(w => {
        console.log(`  - Week ${w.week} (${w.weekStart}): ${w.winner} (${w.wins}-${w.losses})`);
    });

    console.log('\n=== Instructions ===');
    console.log('To import this data, you need to map usernames to user IDs.');
    console.log('Run this script with --import flag after verifying the mappings.');
    console.log('\nExample: node import_paper_data.js --import');

    // Check if --import flag is passed
    if (process.argv.includes('--import')) {
        console.log('\n=== Starting Import ===\n');
        await importData(profiles);
    }
}

async function importData(profiles) {
    // Try to match paper names to profiles (case-insensitive, partial match)
    const findProfile = (name) => {
        const nameLower = name.toLowerCase();
        return profiles.find(p => 
            (p.username && p.username.toLowerCase().includes(nameLower)) ||
            (p.email && p.email.toLowerCase().includes(nameLower))
        );
    };

    // Update user stats
    for (const userData of paperData.users) {
        const profile = findProfile(userData.name);
        
        if (!profile) {
            console.log(`⚠️  Could not find profile for "${userData.name}" - skipping`);
            continue;
        }

        console.log(`Updating ${userData.name} (${profile.username || profile.email})...`);
        
        const { error } = await supabase
            .from('profiles')
            .update({
                total_wins: userData.wins,
                total_losses: userData.losses,
                total_points: userData.wins, // points = wins
                weekly_wins: userData.weeklyWins
            })
            .eq('id', profile.id);

        if (error) {
            console.error(`  ❌ Error updating ${userData.name}:`, error);
        } else {
            console.log(`  ✅ Updated: ${userData.wins}W - ${userData.losses}L, ${userData.weeklyWins} weeks won`);
        }
    }

    // Insert weekly winners
    console.log('\nInserting weekly winners...');
    
    for (const week of paperData.weeklyWinners) {
        const winnerProfile = findProfile(week.winner);
        
        if (!winnerProfile) {
            console.log(`⚠️  Could not find profile for winner "${week.winner}" - skipping week ${week.week}`);
            continue;
        }

        // Check if weekly winner already exists
        const { data: existing } = await supabase
            .from('weekly_winners')
            .select('id')
            .eq('week_start', week.weekStart)
            .single();

        if (existing) {
            console.log(`  ⏭️  Week ${week.week} already has a winner - skipping`);
            continue;
        }

        const { error } = await supabase
            .from('weekly_winners')
            .insert({
                user_id: winnerProfile.id,
                week_start: week.weekStart,
                week_end: week.weekEnd,
                wins: week.wins,
                losses: week.losses
            });

        if (error) {
            console.error(`  ❌ Error inserting week ${week.week}:`, error);
        } else {
            console.log(`  ✅ Week ${week.week}: ${week.winner} (${week.wins}-${week.losses})`);
        }
    }

    console.log('\n=== Import Complete ===');
}

main();

