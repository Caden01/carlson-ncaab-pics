-- Check for duplicate weekly winners
-- Run this first to see what duplicates exist

-- Show all weekly winners with duplicate ranking
SELECT 
  w.id,
  w.week_start,
  w.week_end,
  p.username,
  w.wins,
  w.losses,
  w.created_at,
  ROW_NUMBER() OVER (PARTITION BY w.week_start ORDER BY w.created_at ASC) as duplicate_rank
FROM weekly_winners w
JOIN profiles p ON w.user_id = p.id
ORDER BY w.week_start DESC, w.created_at ASC;

-- Show which weeks have duplicates
SELECT 
  week_start,
  COUNT(*) as count,
  STRING_AGG(p.username || ' (id: ' || w.id || ')', ', ' ORDER BY w.created_at) as winners
FROM weekly_winners w
JOIN profiles p ON w.user_id = p.id
GROUP BY week_start
HAVING COUNT(*) > 1
ORDER BY week_start DESC;
