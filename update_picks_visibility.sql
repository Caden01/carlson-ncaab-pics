-- Allow everyone to view all picks
drop policy if exists "Users can view their own picks." on picks;
drop policy if exists "Admins can select all picks" on picks; -- Cleanup previous admin-only policy if it exists

create policy "Enable read access for all users"
  on picks for select
  using ( true );
