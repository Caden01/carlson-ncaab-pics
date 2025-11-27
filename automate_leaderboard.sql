-- Function to recalculate stats for users involved in a game
CREATE OR REPLACE FUNCTION public.calculate_points_trigger()
RETURNS TRIGGER AS $$
DECLARE
    user_record RECORD;
    calc_wins INTEGER;
    calc_losses INTEGER;
BEGIN
    -- Only run if the game is finished
    IF NEW.status = 'finished' THEN
        
        -- Find all users who picked this game
        FOR user_record IN SELECT DISTINCT user_id FROM public.picks WHERE game_id = NEW.id LOOP
            
            -- Recalculate stats for this user based on ALL their picks in finished games
            SELECT 
                COUNT(*) FILTER (WHERE is_correct) as wins,
                COUNT(*) FILTER (WHERE NOT is_correct) as losses
            INTO calc_wins, calc_losses
            FROM (
                SELECT 
                    p.user_id,
                    -- Logic to determine if pick is correct (embedded here for simplicity and robustness)
                    CASE 
                        WHEN g.status != 'finished' THEN NULL
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
                FROM public.picks p
                JOIN public.games g ON p.game_id = g.id
                WHERE p.user_id = user_record.user_id AND g.status = 'finished'
            ) as user_picks
            WHERE is_correct IS NOT NULL; -- Only count determined outcomes

            -- Update Profile with recalculated totals
            UPDATE public.profiles
            SET total_points = calc_wins, -- Assuming 1 point per win
                total_wins = calc_wins,
                total_losses = calc_losses
            WHERE id = user_record.user_id;
            
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create Trigger
DROP TRIGGER IF EXISTS on_game_finish ON public.games;
CREATE TRIGGER on_game_finish
    AFTER UPDATE ON public.games
    FOR EACH ROW
    EXECUTE FUNCTION public.calculate_points_trigger();
