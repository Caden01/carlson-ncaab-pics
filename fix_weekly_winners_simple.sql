-- Simple fix for duplicate weekly winners
-- This script will remove duplicates and fix weekly_wins counts

-- Step 1: Show what we're about to delete
SELECT 
  'Will delete these duplicates:' as action,
  w.id,
  w.week_start,
  p.username,
  w.created_at
FROM weekly_winners w
JOIN profiles p ON w.user_id = p.id
WHERE w.id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (PARTITION BY week_start ORDER BY created_at ASC) as rn
    FROM weekly_winners
  ) ranked
  WHERE rn > 1
)
ORDER BY w.week_start DESC, w.created_at ASC;

-- Step 2: Delete duplicates (keep only the first entry for each week_start)
DELETE FROM weekly_winners
WHERE id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (PARTITION BY week_start ORDER BY created_at ASC) as rn
    FROM weekly_winners
  ) ranked
  WHERE rn > 1
);

-- Step 3: Recalculate weekly_wins for all users
-- First, update users who have weekly wins
UPDATE profiles
SET weekly_wins = (
  SELECT COUNT(DISTINCT week_start)
  FROM weekly_winners
  WHERE weekly_winners.user_id = profiles.id
);

-- Step 4: Verify - show all weekly winners after cleanup
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

-- Step 5: Verify - show weekly_wins counts
SELECT 
  p.username,
  p.weekly_wins as stored_count,
  COUNT(DISTINCT w.week_start) as actual_count_in_db
FROM profiles p
LEFT JOIN weekly_winners w ON p.id = w.user_id
GROUP BY p.id, p.username, p.weekly_wins
ORDER BY p.weekly_wins DESC;
