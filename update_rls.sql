-- 1. Create a secure function to check admin status (bypasses RLS to avoid recursion)
create or replace function public.is_admin()
returns boolean
language sql
security definer
as $$
  select exists (
    select 1
    from profiles
    where id = auth.uid()
    and is_admin = true
  );
$$;

-- 2. Drop the problematic policies if they exist
drop policy if exists "Admins can update all profiles" on profiles;
drop policy if exists "Admins can select all profiles" on profiles;

-- 3. Re-create policies using the secure function
create policy "Admins can update all profiles"
  on profiles
  for update
  using ( is_admin() );

create policy "Admins can select all profiles"
  on profiles
  for select
  using ( is_admin() );

-- 4. Ensure public read access still exists (in case it was lost)
drop policy if exists "Public profiles are viewable by everyone." on profiles;
create policy "Public profiles are viewable by everyone."
  on profiles
  for select
  using ( true );

-- 5. Allow admins to view ALL picks (New Fix)
drop policy if exists "Admins can select all picks" on picks;
create policy "Admins can select all picks"
  on picks
  for select
  using ( is_admin() );
