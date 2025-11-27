-- Drop existing insert/update policies to replace them
drop policy if exists "Users can insert their own picks." on picks;
drop policy if exists "Users can update their own picks." on picks;

-- Create new insert policy
create policy "Users can insert their own picks or admins can insert for all"
on picks for insert
with check (
  -- User is inserting for themselves
  auth.uid() = user_id
  OR
  -- User is an admin
  exists (
    select 1 from profiles
    where id = auth.uid()
    and is_admin = true
  )
);

-- Create new update policy
create policy "Users can update their own picks or admins can update for all"
on picks for update
using (
  -- User is updating their own pick
  auth.uid() = user_id
  OR
  -- User is an admin
  exists (
    select 1 from profiles
    where id = auth.uid()
    and is_admin = true
  )
);
