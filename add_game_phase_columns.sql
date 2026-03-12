-- Persist whether a game belongs to the regular season or a conference tournament.
-- Run this in Supabase SQL Editor before deploying the related app changes.

alter table public.games
  add column if not exists season_phase text not null default 'regular_season',
  add column if not exists tournament_name text;

create index if not exists idx_games_season_phase
  on public.games (season_phase);

update public.games
set season_phase = 'regular_season'
where season_phase is null;
