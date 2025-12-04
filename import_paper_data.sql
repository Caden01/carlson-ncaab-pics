-- Import paper data from College bball picks.pdf
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)

-- Update user stats (from paper records through Week 3)

-- Update Jacoby (Jacob on paper): 55W - 49L, 1 week won
UPDATE profiles 
SET total_wins = 55, 
    total_losses = 49, 
    total_points = 55,
    weekly_wins = 1
WHERE username = 'Jacoby';

-- Update Caden: 51W - 53L, 1 week won
UPDATE profiles 
SET total_wins = 51, 
    total_losses = 53, 
    total_points = 51,
    weekly_wins = 1
WHERE username = 'Caden';

-- Update David (Dad on paper): 55W - 49L, 1 week won
UPDATE profiles 
SET total_wins = 55, 
    total_losses = 49, 
    total_points = 55,
    weekly_wins = 1
WHERE username LIKE 'David%';

-- Delete existing weekly winners for these weeks (to replace with paper data)
DELETE FROM weekly_winners WHERE week_start IN ('2024-11-11', '2024-11-18', '2024-11-25');

-- Insert weekly winners from paper records

-- Week 1: Caden won (8-7)
INSERT INTO weekly_winners (user_id, week_start, week_end, wins, losses)
SELECT id, '2024-11-11', '2024-11-17', 8, 7
FROM profiles WHERE username = 'Caden';

-- Week 2: David won (14-8)
INSERT INTO weekly_winners (user_id, week_start, week_end, wins, losses)
SELECT id, '2024-11-18', '2024-11-24', 14, 8
FROM profiles WHERE username LIKE 'David%';

-- Week 3: Jacoby won (39-28)
INSERT INTO weekly_winners (user_id, week_start, week_end, wins, losses)
SELECT id, '2024-11-25', '2024-12-01', 39, 28
FROM profiles WHERE username = 'Jacoby';

-- Verify the updates
SELECT username, total_wins, total_losses, total_points, weekly_wins 
FROM profiles 
ORDER BY total_wins DESC;

-- Verify weekly winners
SELECT w.week_start, w.week_end, p.username, w.wins, w.losses
FROM weekly_winners w
JOIN profiles p ON w.user_id = p.id
ORDER BY w.week_start;

