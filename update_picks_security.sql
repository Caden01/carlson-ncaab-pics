-- Drop existing policies that might conflict
drop policy if exists "Enable read access for all users" on picks;
drop policy if exists "Users can view their own picks." on picks;
drop policy if exists "Conditional visibility for picks" on picks;

-- Create the new policy
-- Users can see a pick if:
-- 1. It is their own pick
-- 2. OR the game associated with the pick has started (start_time <= now())
create policy "Conditional visibility for picks"
  on picks for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from games
      where games.id = picks.game_id
      and games.start_time <= now()
    )
  );
