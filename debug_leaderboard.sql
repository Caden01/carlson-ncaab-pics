-- Debug script to check values for a specific game
DO $$
DECLARE
    game_record RECORD;
    pick_record RECORD;
    spread_parts TEXT[];
    spread_team_abbrev TEXT;
    spread_value NUMERIC;
    is_correct BOOLEAN;
    calc_wins INTEGER;
    calc_losses INTEGER;
BEGIN
    -- Get the Kansas vs Tennessee game (ID 239 from previous debug)
    SELECT * INTO game_record FROM public.games WHERE id = 239;
    
    RAISE NOTICE 'Game: % vs %', game_record.team_a, game_record.team_b;
    RAISE NOTICE 'Spread: %', game_record.spread;
    RAISE NOTICE 'Abbrevs: A=%, B=%', game_record.team_a_abbrev, game_record.team_b_abbrev;
    RAISE NOTICE 'Scores: % - %', game_record.result_a, game_record.result_b;

    spread_parts := string_to_array(game_record.spread, ' ');
    spread_team_abbrev := spread_parts[1];
    spread_value := spread_parts[2]::NUMERIC;
    
    RAISE NOTICE 'Parsed Spread: Team=%, Value=%', spread_team_abbrev, spread_value;

    -- Check picks for this game
    FOR pick_record IN SELECT * FROM public.picks WHERE game_id = game_record.id LOOP
        RAISE NOTICE 'User % picked %', pick_record.user_id, pick_record.selected_team;
        
        -- Test the logic
        is_correct := FALSE;
        
        -- Team A Logic
        IF (
            (game_record.team_a_abbrev = spread_team_abbrev AND (game_record.result_a - game_record.result_b + spread_value) > 0) OR
            (game_record.team_b_abbrev = spread_team_abbrev AND (game_record.result_a - game_record.result_b - spread_value) > 0)
        ) THEN
            IF pick_record.selected_team = game_record.team_a THEN
                is_correct := TRUE;
            END IF;
        END IF;

        -- Team B Logic
        IF (
            (game_record.team_b_abbrev = spread_team_abbrev AND (game_record.result_b - game_record.result_a + spread_value) > 0) OR
            (game_record.team_a_abbrev = spread_team_abbrev AND (game_record.result_b - game_record.result_a - spread_value) > 0)
        ) THEN
            IF pick_record.selected_team = game_record.team_b THEN
                is_correct := TRUE;
            END IF;
        END IF;
        
        RAISE NOTICE 'Is Correct: %', is_correct;
    END LOOP;

END $$;
