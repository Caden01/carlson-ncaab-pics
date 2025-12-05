-- Fix leaderboard totals
-- The trigger was recalculating from scratch, overwriting paper data
-- We need to disable the trigger and restore correct totals

-- Disable the trigger that's overwriting totals
DROP TRIGGER IF EXISTS on_game_finish ON public.games;

-- Restore correct season totals (Paper Wk1-3 + Week 4)
-- Week 4 had 22 finished games
-- Jacoby: 55 (paper) + 13 (week 4) = 68W, 49 + 10 = 59L
UPDATE profiles 
SET total_wins = 68, 
    total_losses = 59, 
    total_points = 68
WHERE username = 'Jacoby';

-- Caden: 51 (paper) + 15 (week 4) = 66W, 53 + 8 = 61L
UPDATE profiles 
SET total_wins = 66, 
    total_losses = 61, 
    total_points = 66
WHERE username = 'Caden';

-- David: 55 (paper) + 11 (week 4) = 66W, 49 + 12 = 61L
UPDATE profiles 
SET total_wins = 66, 
    total_losses = 61, 
    total_points = 66
WHERE username LIKE 'David%';

-- Verify the updates
SELECT username, total_wins, total_losses, total_points, weekly_wins 
FROM profiles 
ORDER BY total_wins DESC;

