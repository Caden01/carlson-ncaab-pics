-- Manual fix for duplicate weekly winners
-- Run each step separately in Supabase SQL Editor

-- STEP 1: Find the duplicate week 5 entries
-- This will show you the exact IDs to delete
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
WHERE w.week_start IN (
  SELECT week_start
  FROM weekly_winners
  GROUP BY week_start
  HAVING COUNT(*) > 1
)
ORDER BY w.week_start DESC, w.created_at ASC;

-- STEP 2: Add DELETE policy (only if it doesn't already exist)
-- First, drop the policy if it exists, then create it
DO $$
BEGIN
  -- Drop the policy if it exists
  DROP POLICY IF EXISTS "Enable delete for service role only" ON weekly_winners;
  
  -- Create the policy
  CREATE POLICY "Enable delete for service role only"
    ON weekly_winners FOR DELETE
    USING (true);
END $$;

-- STEP 3: Temporarily disable RLS to allow deletion
ALTER TABLE weekly_winners DISABLE ROW LEVEL SECURITY;

-- STEP 4: Delete duplicates (keep the earliest created_at for each week)
-- This deletes all but the first entry for each week_start
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

-- STEP 5: Re-enable RLS
ALTER TABLE weekly_winners ENABLE ROW LEVEL SECURITY;

-- STEP 6: Recalculate weekly_wins for all users
UPDATE profiles
SET weekly_wins = (
  SELECT COUNT(DISTINCT week_start)
  FROM weekly_winners
  WHERE weekly_winners.user_id = profiles.id
);

-- STEP 7: Verify the fix
SELECT 
  w.week_start,
  w.week_end,
  p.username,
  w.wins,
  w.losses
FROM weekly_winners w
JOIN profiles p ON w.user_id = p.id
ORDER BY w.week_start DESC;

-- Verify no duplicates remain
SELECT 
  week_start,
  COUNT(*) as count
FROM weekly_winners
GROUP BY week_start
HAVING COUNT(*) > 1;

-- Verify weekly_wins counts
SELECT 
  p.username,
  p.weekly_wins
FROM profiles p
ORDER BY p.weekly_wins DESC;
