-- Add unique constraint on week_start to prevent duplicate weekly winners
-- Run this in Supabase SQL Editor

-- First, check there are no duplicates (should return empty)
SELECT week_start, COUNT(*) as count
FROM weekly_winners
GROUP BY week_start
HAVING COUNT(*) > 1;

-- Add unique constraint on week_start
-- This will prevent any future duplicates at the database level
ALTER TABLE weekly_winners
ADD CONSTRAINT weekly_winners_week_start_unique UNIQUE (week_start);

-- Verify the constraint was added
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = 'weekly_winners'::regclass;
