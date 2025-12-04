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

// Helper to determine if a team covered the spread
function didTeamCover(game, teamName) {
    if (game.status !== 'finished') return null;
    if (!game.spread || !game.spread.includes(' ')) return null;

    const parts = game.spread.split(' ');
    const spreadTeamAbbrev = parts[0];
    const spreadValue = parseFloat(parts[1]);

    if (isNaN(spreadValue)) return null;

    let isSpreadTeam = false;
    if (game.team_a_abbrev === spreadTeamAbbrev) {
        if (teamName === game.team_a) isSpreadTeam = true;
    } else if (game.team_b_abbrev === spreadTeamAbbrev) {
        if (teamName === game.team_b) isSpreadTeam = true;
    } else {
        return null;
    }

    const margin = teamName === game.team_a
        ? game.result_a - game.result_b
        : game.result_b - game.result_a;

    const effectiveSpread = isSpreadTeam ? spreadValue : -spreadValue;
    return (margin + effectiveSpread) > 0;
}

async function main() {
    // Week 4: Dec 2-8, 2025
    const weekStart = '2025-12-02';
    const weekEnd = '2025-12-08';

    console.log(`=== Week 4 Results (${weekStart} to ${weekEnd}) ===\n`);

    // Get finished games this week
    const { data: games, error: gamesError } = await supabase
        .from('games')
        .select('*')
        .gte('game_date', weekStart)
        .lte('game_date', weekEnd)
        .eq('status', 'finished');

    if (gamesError) {
        console.error('Error fetching games:', gamesError);
        return;
    }

    console.log(`Finished games this week: ${games?.length || 0}\n`);

    if (!games || games.length === 0) {
        console.log('No finished games yet this week.');
        return;
    }

    // Get all picks for these games
    const gameIds = games.map(g => g.id);
    const { data: picks, error: picksError } = await supabase
        .from('picks')
        .select('*, profiles(username)')
        .in('game_id', gameIds);

    if (picksError) {
        console.error('Error fetching picks:', picksError);
        return;
    }

    // Calculate each user's record this week
    const userRecords = {};

    for (const pick of (picks || [])) {
        const game = games.find(g => g.id === pick.game_id);
        if (!game) continue;

        const covered = didTeamCover(game, pick.selected_team);
        if (covered === null) continue;

        const username = pick.profiles?.username || 'Unknown';
        if (!userRecords[username]) {
            userRecords[username] = { oduserId: pick.user_id, wins: 0, losses: 0 };
        }

        if (covered) {
            userRecords[username].wins++;
        } else {
            userRecords[username].losses++;
        }
    }

    console.log('Week 4 records so far:');
    for (const [username, record] of Object.entries(userRecords)) {
        console.log(`  ${username}: ${record.wins}W - ${record.losses}L`);
    }

    // Get current profile totals (from paper data through week 3)
    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, total_wins, total_losses, total_points');

    console.log('\n=== Updated Season Totals (Paper + Week 4) ===\n');
    
    const updates = [];
    for (const profile of (profiles || [])) {
        const weekRecord = userRecords[profile.username] || { wins: 0, losses: 0 };
        const newWins = (profile.total_wins || 0) + weekRecord.wins;
        const newLosses = (profile.total_losses || 0) + weekRecord.losses;
        
        console.log(`${profile.username}:`);
        console.log(`  Paper (Wk1-3): ${profile.total_wins}W - ${profile.total_losses}L`);
        console.log(`  Week 4 so far: +${weekRecord.wins}W - ${weekRecord.losses}L`);
        console.log(`  New Total: ${newWins}W - ${newLosses}L`);
        console.log('');
        
        updates.push({
            id: profile.id,
            username: profile.username,
            newWins,
            newLosses
        });
    }

    // Output SQL to update
    console.log('=== SQL to Update Totals ===\n');
    for (const u of updates) {
        console.log(`UPDATE profiles SET total_wins = ${u.newWins}, total_losses = ${u.newLosses}, total_points = ${u.newWins} WHERE username = '${u.username}';`);
    }
}

main();

