-- Fix duplicate weekly winners by adding DELETE policy and cleaning up duplicates

-- Step 1: Add DELETE policy for weekly_winners (if it doesn't exist)
-- This allows the service role to delete entries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'weekly_winners' 
    AND policyname = 'Enable delete for service role only'
  ) THEN
    CREATE POLICY "Enable delete for service role only"
      ON weekly_winners FOR DELETE
      USING (true);
  END IF;
END $$;

-- Step 2: First, let's see what duplicates exist
SELECT 
  w.id,
  w.week_start,
  w.week_end,
  p.username,
  w.wins,
  w.losses,
  w.created_at,
  ROW_NUMBER() OVER (PARTITION BY w.week_start ORDER BY w.created_at ASC) as keep_rank
FROM weekly_winners w
JOIN profiles p ON w.user_id = p.id
WHERE w.week_start IN (
  SELECT week_start
  FROM weekly_winners
  GROUP BY week_start
  HAVING COUNT(*) > 1
)
ORDER BY w.week_start DESC, w.created_at ASC;

-- Step 3: Delete duplicates (keep the first entry with earliest created_at for each week)
-- Note: This will only work if you're using the service role key
-- If running from SQL Editor, you may need to temporarily disable RLS

-- Option A: Using a subquery (may be blocked by RLS)
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

-- If Option A doesn't work, try Option B: Temporarily disable RLS
-- ALTER TABLE weekly_winners DISABLE ROW LEVEL SECURITY;
-- 
-- DELETE FROM weekly_winners
-- WHERE id IN (
--   SELECT id
--   FROM (
--     SELECT 
--       id,
--       ROW_NUMBER() OVER (PARTITION BY week_start ORDER BY created_at ASC) as rn
--     FROM weekly_winners
--   ) ranked
--   WHERE rn > 1
-- );
-- 
-- ALTER TABLE weekly_winners ENABLE ROW LEVEL SECURITY;

-- Step 4: Recalculate weekly_wins for all users
UPDATE profiles
SET weekly_wins = (
  SELECT COUNT(DISTINCT week_start)
  FROM weekly_winners
  WHERE weekly_winners.user_id = profiles.id
);

-- Step 5: Verify - show all weekly winners (should have no duplicates)
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

-- Step 6: Verify - check for any remaining duplicates
SELECT 
  week_start,
  COUNT(*) as count
FROM weekly_winners
GROUP BY week_start
HAVING COUNT(*) > 1
ORDER BY week_start DESC;

-- Step 7: Verify - show weekly_wins counts
SELECT 
  p.username,
  p.weekly_wins,
  COUNT(DISTINCT w.week_start) as actual_weeks_won
FROM profiles p
LEFT JOIN weekly_winners w ON p.id = w.user_id
GROUP BY p.id, p.username, p.weekly_wins
ORDER BY p.weekly_wins DESC;
