-- Delete the incorrect week 4 entry (has wrong year 2025 instead of 2024)
-- Week 4 is currently ongoing, so it shouldn't have a winner yet
DELETE FROM weekly_winners 
WHERE week_start = '2025-11-24';

-- Verify the fix
SELECT w.week_start, w.week_end, p.username, w.wins, w.losses
FROM weekly_winners w
JOIN profiles p ON w.user_id = p.id
ORDER BY w.week_start;

