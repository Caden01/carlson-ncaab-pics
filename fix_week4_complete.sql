-- Fix Week 4: Add records to season totals and determine champion
-- Week 4: Dec 2-8, 2025
-- Run this in Supabase SQL Editor

-- Step 1: Calculate week 4 records for each user
WITH week4_games AS (
    SELECT id, team_a, team_b, team_a_abbrev, team_b_abbrev, result_a, result_b, spread
    FROM games
    WHERE game_date >= '2025-12-02'
      AND game_date <= '2025-12-08'
      AND status = 'finished'
),
week4_picks AS (
    SELECT 
        p.user_id,
        p.selected_team,
        g.id as game_id,
        g.team_a,
        g.team_b,
        g.team_a_abbrev,
        g.team_b_abbrev,
        g.result_a,
        g.result_b,
        g.spread,
        -- Calculate if pick is correct
        CASE 
            WHEN g.spread IS NULL OR position(' ' in g.spread) = 0 THEN NULL
            ELSE 
                (CASE 
                    -- Team A covered?
                    WHEN (
                        (g.team_a_abbrev = split_part(g.spread, ' ', 1) AND (g.result_a - g.result_b + split_part(g.spread, ' ', 2)::numeric) > 0) OR
                        (g.team_b_abbrev = split_part(g.spread, ' ', 1) AND (g.result_a - g.result_b - split_part(g.spread, ' ', 2)::numeric) > 0)
                    ) THEN p.selected_team = g.team_a
                    -- Team B covered?
                    WHEN (
                        (g.team_b_abbrev = split_part(g.spread, ' ', 1) AND (g.result_b - g.result_a + split_part(g.spread, ' ', 2)::numeric) > 0) OR
                        (g.team_a_abbrev = split_part(g.spread, ' ', 1) AND (g.result_b - g.result_a - split_part(g.spread, ' ', 2)::numeric) > 0)
                    ) THEN p.selected_team = g.team_b
                    ELSE FALSE
                END)
        END as is_correct
    FROM picks p
    JOIN week4_games g ON p.game_id = g.id
),
week4_records AS (
    SELECT 
        user_id,
        COUNT(*) FILTER (WHERE is_correct = TRUE) as wins,
        COUNT(*) FILTER (WHERE is_correct = FALSE) as losses
    FROM week4_picks
    WHERE is_correct IS NOT NULL
    GROUP BY user_id
)
-- Step 2: Update season totals (add week 4 records)
UPDATE profiles p
SET 
    total_wins = COALESCE(p.total_wins, 0) + COALESCE(w.wins, 0),
    total_losses = COALESCE(p.total_losses, 0) + COALESCE(w.losses, 0),
    total_points = total_wins
FROM week4_records w
WHERE p.id = w.user_id;

-- Step 3: Delete existing week 4 winner if it exists
DELETE FROM weekly_winners WHERE week_start = '2025-12-02';

-- Step 4: Determine week 4 champion and insert weekly_winners
WITH week4_games AS (
    SELECT id, team_a, team_b, team_a_abbrev, team_b_abbrev, result_a, result_b, spread
    FROM games
    WHERE game_date >= '2025-12-02'
      AND game_date <= '2025-12-08'
      AND status = 'finished'
),
week4_picks AS (
    SELECT 
        p.user_id,
        p.selected_team,
        g.id as game_id,
        g.team_a,
        g.team_b,
        g.team_a_abbrev,
        g.team_b_abbrev,
        g.result_a,
        g.result_b,
        g.spread,
        CASE 
            WHEN g.spread IS NULL OR position(' ' in g.spread) = 0 THEN NULL
            ELSE 
                (CASE 
                    WHEN (
                        (g.team_a_abbrev = split_part(g.spread, ' ', 1) AND (g.result_a - g.result_b + split_part(g.spread, ' ', 2)::numeric) > 0) OR
                        (g.team_b_abbrev = split_part(g.spread, ' ', 1) AND (g.result_a - g.result_b - split_part(g.spread, ' ', 2)::numeric) > 0)
                    ) THEN p.selected_team = g.team_a
                    WHEN (
                        (g.team_b_abbrev = split_part(g.spread, ' ', 1) AND (g.result_b - g.result_a + split_part(g.spread, ' ', 2)::numeric) > 0) OR
                        (g.team_a_abbrev = split_part(g.spread, ' ', 1) AND (g.result_b - g.result_a - split_part(g.spread, ' ', 2)::numeric) > 0)
                    ) THEN p.selected_team = g.team_b
                    ELSE FALSE
                END)
        END as is_correct
    FROM picks p
    JOIN week4_games g ON p.game_id = g.id
),
week4_records AS (
    SELECT 
        user_id,
        COUNT(*) FILTER (WHERE is_correct = TRUE) as wins,
        COUNT(*) FILTER (WHERE is_correct = FALSE) as losses
    FROM week4_picks
    WHERE is_correct IS NOT NULL
    GROUP BY user_id
),
week4_winner AS (
    SELECT 
        user_id,
        wins,
        losses,
        ROW_NUMBER() OVER (
            ORDER BY wins DESC, losses ASC
        ) as rank
    FROM week4_records
    WHERE wins > 0
)
-- Insert the week 4 winner
INSERT INTO weekly_winners (user_id, week_start, week_end, wins, losses)
SELECT user_id, '2025-12-02', '2025-12-08', wins, losses
FROM week4_winner
WHERE rank = 1;

-- Step 5: Update weekly_wins for all users to match their actual weekly_winners count
-- This ensures accuracy and handles the week 4 winner
UPDATE profiles p
SET weekly_wins = (
    SELECT COUNT(*) 
    FROM weekly_winners ww 
    WHERE ww.user_id = p.id
);

-- Step 6: Verify the results
SELECT 
    '=== Week 4 Records ===' as section,
    NULL::text as username,
    NULL::integer as wins,
    NULL::integer as losses,
    NULL::date as week_start;

SELECT 
    p.username,
    COALESCE(w.wins, 0) as week4_wins,
    COALESCE(w.losses, 0) as week4_losses
FROM profiles p
LEFT JOIN (
    WITH week4_games AS (
        SELECT id, team_a, team_b, team_a_abbrev, team_b_abbrev, result_a, result_b, spread
        FROM games
        WHERE game_date >= '2025-12-02'
          AND game_date <= '2025-12-08'
          AND status = 'finished'
    ),
    week4_picks AS (
        SELECT 
            p.user_id,
            p.selected_team,
            g.id as game_id,
            g.team_a,
            g.team_b,
            g.team_a_abbrev,
            g.team_b_abbrev,
            g.result_a,
            g.result_b,
            g.spread,
            CASE 
                WHEN g.spread IS NULL OR position(' ' in g.spread) = 0 THEN NULL
                ELSE 
                    (CASE 
                        WHEN (
                            (g.team_a_abbrev = split_part(g.spread, ' ', 1) AND (g.result_a - g.result_b + split_part(g.spread, ' ', 2)::numeric) > 0) OR
                            (g.team_b_abbrev = split_part(g.spread, ' ', 1) AND (g.result_a - g.result_b - split_part(g.spread, ' ', 2)::numeric) > 0)
                        ) THEN p.selected_team = g.team_a
                        WHEN (
                            (g.team_b_abbrev = split_part(g.spread, ' ', 1) AND (g.result_b - g.result_a + split_part(g.spread, ' ', 2)::numeric) > 0) OR
                            (g.team_a_abbrev = split_part(g.spread, ' ', 1) AND (g.result_b - g.result_a - split_part(g.spread, ' ', 2)::numeric) > 0)
                        ) THEN p.selected_team = g.team_b
                        ELSE FALSE
                    END)
            END as is_correct
        FROM picks p
        JOIN week4_games g ON p.game_id = g.id
    )
    SELECT 
        user_id,
        COUNT(*) FILTER (WHERE is_correct = TRUE) as wins,
        COUNT(*) FILTER (WHERE is_correct = FALSE) as losses
    FROM week4_picks
    WHERE is_correct IS NOT NULL
    GROUP BY user_id
) w ON p.id = w.user_id
ORDER BY COALESCE(w.wins, 0) DESC, COALESCE(w.losses, 0) ASC;

SELECT 
    '=== Updated Season Totals ===' as section,
    NULL::text as username,
    NULL::integer as total_wins,
    NULL::integer as total_losses,
    NULL::integer as weekly_wins;

SELECT 
    username,
    total_wins,
    total_losses,
    total_points,
    weekly_wins
FROM profiles
ORDER BY total_wins DESC;

SELECT 
    '=== Week 4 Champion ===' as section,
    NULL::text as username,
    NULL::integer as wins,
    NULL::integer as losses,
    NULL::date as week_start;

SELECT 
    p.username,
    w.wins,
    w.losses,
    w.week_start
FROM weekly_winners w
JOIN profiles p ON w.user_id = p.id
WHERE w.week_start = '2025-12-02';
