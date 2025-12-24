-- Fix Season Totals - December 23, 2025
-- Run this in Supabase SQL Editor to update the season leaderboard
-- Uses weekly_records table as the source of truth
-- NOTE: weekly_wins now counts ALL wins for a user (ties count for everyone)

-- Step 1: See current state vs what it should be
SELECT 
  p.username,
  p.total_wins as current_wins,
  p.total_losses as current_losses,
  p.weekly_wins as current_weekly_wins,
  COALESCE(SUM(wr.wins), 0) as correct_wins,
  COALESCE(SUM(wr.losses), 0) as correct_losses,
  COALESCE(ww.count, 0) as correct_weekly_wins
FROM profiles p
LEFT JOIN weekly_records wr ON p.id = wr.user_id
LEFT JOIN (
  SELECT user_id, COUNT(*) as count 
  FROM weekly_winners 
  GROUP BY user_id
) ww ON p.id = ww.user_id
GROUP BY p.id, p.username, p.total_wins, p.total_losses, p.weekly_wins, ww.count
ORDER BY COALESCE(SUM(wr.wins), 0) DESC;

-- Step 2: Update profiles with correct totals from weekly_records
UPDATE profiles p
SET 
  total_wins = COALESCE((
    SELECT SUM(wins) FROM weekly_records WHERE user_id = p.id
  ), 0),
  total_losses = COALESCE((
    SELECT SUM(losses) FROM weekly_records WHERE user_id = p.id
  ), 0),
  total_points = COALESCE((
    SELECT SUM(wins) FROM weekly_records WHERE user_id = p.id
  ), 0),
  weekly_wins = COALESCE((
    SELECT COUNT(*) FROM weekly_winners WHERE user_id = p.id
  ), 0);

-- Step 3: Verify the update worked
SELECT 
  username,
  total_wins,
  total_losses,
  total_points,
  weekly_wins,
  ROUND(total_wins::numeric / NULLIF(total_wins + total_losses, 0) * 100, 1) as win_pct
FROM profiles 
ORDER BY total_wins DESC;
