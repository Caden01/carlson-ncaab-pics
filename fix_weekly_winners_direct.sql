-- Direct fix for duplicate weekly winners
-- This bypasses potential RLS issues by using explicit IDs

-- STEP 1: First, let's see exactly what week 5 duplicates exist
-- Replace '2025-XX-XX' with the actual week_start date for week 5
-- Run this query first to see the duplicates:

SELECT 
  w.id,
  w.week_start,
  w.week_end,
  p.username,
  w.wins,
  w.losses,
  w.created_at
FROM weekly_winners w
JOIN profiles p ON w.user_id = p.id
WHERE w.week_start = (
  SELECT week_start 
  FROM weekly_winners 
  GROUP BY week_start 
  HAVING COUNT(*) > 1 
  ORDER BY week_start DESC 
  LIMIT 1
)
ORDER BY w.created_at ASC;

-- STEP 2: Once you see the results above, manually delete the duplicate IDs
-- Keep the one with the EARLIEST created_at, delete the others
-- Example (replace these IDs with the actual duplicate IDs from step 1):
-- DELETE FROM weekly_winners WHERE id IN (123, 456);

-- OR use this automated approach (but it might be blocked by RLS):

-- Find all weeks with duplicates and delete the later entries
DO $$
DECLARE
  duplicate_id BIGINT;
  week_to_fix DATE;
BEGIN
  -- Find the first week with duplicates
  SELECT week_start INTO week_to_fix
  FROM weekly_winners
  GROUP BY week_start
  HAVING COUNT(*) > 1
  ORDER BY week_start DESC
  LIMIT 1;
  
  IF week_to_fix IS NOT NULL THEN
    -- Delete all but the first (earliest) entry for this week
    FOR duplicate_id IN 
      SELECT id
      FROM (
        SELECT 
          id,
          ROW_NUMBER() OVER (ORDER BY created_at ASC) as rn
        FROM weekly_winners
        WHERE week_start = week_to_fix
      ) ranked
      WHERE rn > 1
    LOOP
      DELETE FROM weekly_winners WHERE id = duplicate_id;
      RAISE NOTICE 'Deleted duplicate ID: %', duplicate_id;
    END LOOP;
  END IF;
END $$;

-- STEP 3: Recalculate weekly_wins for Caden specifically (or all users)
-- Update all users' weekly_wins based on actual unique weeks won
UPDATE profiles
SET weekly_wins = (
  SELECT COUNT(DISTINCT week_start)
  FROM weekly_winners
  WHERE weekly_winners.user_id = profiles.id
);

-- STEP 4: Verify the fix
SELECT 
  p.username,
  p.weekly_wins,
  COUNT(DISTINCT w.week_start) as actual_weeks_won
FROM profiles p
LEFT JOIN weekly_winners w ON p.id = w.user_id
GROUP BY p.id, p.username, p.weekly_wins
ORDER BY p.weekly_wins DESC;

-- Show all weekly winners to confirm no duplicates
SELECT 
  w.week_start,
  COUNT(*) as count,
  STRING_AGG(p.username, ', ') as winners
FROM weekly_winners w
JOIN profiles p ON w.user_id = p.id
GROUP BY w.week_start
ORDER BY w.week_start DESC;
