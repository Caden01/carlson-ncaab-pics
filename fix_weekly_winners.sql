-- Fix duplicate weekly winners and recalculate weekly_wins counts
-- This script removes duplicate weekly winner entries, keeping only the earliest one for each week

-- Step 1: Find and delete duplicate weekly winners (keep the earliest created_at for each week)
WITH ranked_winners AS (
  SELECT 
    id,
    week_start,
    user_id,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY week_start ORDER BY created_at ASC) as rn
  FROM weekly_winners
),
duplicates_to_delete AS (
  SELECT id
  FROM ranked_winners
  WHERE rn > 1
)
DELETE FROM weekly_winners
WHERE id IN (SELECT id FROM duplicates_to_delete);

-- Step 2: Recalculate weekly_wins for all profiles based on unique weekly wins
WITH unique_weekly_wins AS (
  SELECT 
    user_id,
    COUNT(DISTINCT week_start) as weekly_wins_count
  FROM weekly_winners
  GROUP BY user_id
)
UPDATE profiles p
SET weekly_wins = COALESCE(uww.weekly_wins_count, 0)
FROM unique_weekly_wins uww
WHERE p.id = uww.user_id;

-- Also set weekly_wins to 0 for users who don't have any weekly wins
UPDATE profiles
SET weekly_wins = 0
WHERE id NOT IN (SELECT DISTINCT user_id FROM weekly_winners);

-- Step 3: Verify the results
SELECT 
  w.week_start,
  w.week_end,
  p.username,
  w.wins,
  w.losses,
  w.created_at
FROM weekly_winners w
JOIN profiles p ON w.user_id = p.id
ORDER BY w.week_start DESC;

-- Show weekly wins counts
SELECT 
  p.username,
  p.weekly_wins,
  COUNT(DISTINCT w.week_start) as actual_weekly_wins
FROM profiles p
LEFT JOIN weekly_winners w ON p.id = w.user_id
GROUP BY p.id, p.username, p.weekly_wins
ORDER BY p.weekly_wins DESC;
