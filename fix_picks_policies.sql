-- Fix picks RLS policies for admin functionality
-- Run this in Supabase SQL Editor

-- First, drop all existing policies on picks to start fresh
DROP POLICY IF EXISTS "Users can view their own picks." ON picks;
DROP POLICY IF EXISTS "Users can insert their own picks." ON picks;
DROP POLICY IF EXISTS "Users can update their own picks." ON picks;
DROP POLICY IF EXISTS "Users can insert their own picks or admins can insert for all" ON picks;
DROP POLICY IF EXISTS "Users can update their own picks or admins can update for all" ON picks;
DROP POLICY IF EXISTS "Conditional visibility for picks" ON picks;
DROP POLICY IF EXISTS "Enable read access for all users" ON picks;
DROP POLICY IF EXISTS "Admins can select all picks" ON picks;

-- 1. SELECT: Everyone can view all picks (needed for seeing other players' picks)
CREATE POLICY "Anyone can view all picks"
  ON picks FOR SELECT
  USING (true);

-- 2. INSERT: Users can insert their own picks, OR admins can insert for anyone
CREATE POLICY "Users or admins can insert picks"
  ON picks FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND is_admin = true
    )
  );

-- 3. UPDATE: Users can update their own picks, OR admins can update anyone's picks
CREATE POLICY "Users or admins can update picks"
  ON picks FOR UPDATE
  USING (
    auth.uid() = user_id
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND is_admin = true
    )
  );

-- 4. DELETE: Users can delete their own picks, OR admins can delete anyone's picks
CREATE POLICY "Users or admins can delete picks"
  ON picks FOR DELETE
  USING (
    auth.uid() = user_id
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND is_admin = true
    )
  );

