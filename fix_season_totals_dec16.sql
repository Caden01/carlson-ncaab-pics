-- Fix Season Totals - December 16, 2025
-- 
-- Issue: Week 5 (Dec 8-14) results were not added to season totals
-- The weekly winner WAS recorded (Jacoby 20-7) but profile totals weren't updated
--
-- Week 4 Ending Totals (confirmed correct):
--   Jacoby: 99W-86L
--   Caden: 99W-86L  
--   David: 93W-92L
--
-- Week 5 Results:
--   Jacoby: 20W-7L (Weekly Winner)
--   Caden: 13W-14L
--   David: 14W-13L

-- Jacoby: 99 + 20 = 119W, 86 + 7 = 93L
UPDATE profiles SET total_wins = 119, total_losses = 93, total_points = 119 
WHERE id = '7b5b7e59-1dba-4970-aad4-7e58ca9323a8';

-- Caden: 99 + 13 = 112W, 86 + 14 = 100L
UPDATE profiles SET total_wins = 112, total_losses = 100, total_points = 112 
WHERE id = 'd6cc8207-4807-40c8-ab81-5b0089650813';

-- David: 93 + 14 = 107W, 92 + 13 = 105L
UPDATE profiles SET total_wins = 107, total_losses = 105, total_points = 107 
WHERE id = '5f40a2c3-b8f6-408c-958b-6a91a48c599e';

-- Verify the update
SELECT 
    username,
    total_wins,
    total_losses,
    weekly_wins,
    ROUND(total_wins::numeric / (total_wins + total_losses) * 100, 1) as win_pct
FROM profiles
ORDER BY total_wins DESC;
