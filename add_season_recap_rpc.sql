-- Season recap helpers for Supabase/Postgres
-- Creates:
--   1. A reusable base view: public.recap_pick_results
--   2. RPC functions for overview, team insights, streaks, weekly highlights, and style stats
--
-- Usage example from Supabase JS:
--   supabase.rpc("get_recap_overview", {
--     p_season_start: "2025-11-10",
--     p_season_end: "2026-03-08",
--     p_phase: "regular_season",
--   });

create or replace view public.recap_pick_results
with (security_invoker = true) as
with parsed_games as (
  select
    g.id as game_id,
    g.game_date,
    g.start_time,
    g.season_phase,
    g.tournament_name,
    g.team_a as away_team,
    g.team_b as home_team,
    g.team_a_abbrev as away_abbrev,
    g.team_b_abbrev as home_abbrev,
    g.team_a_rank as away_rank,
    g.team_b_rank as home_rank,
    g.result_a as away_score,
    g.result_b as home_score,
    g.spread,
    regexp_split_to_array(trim(g.spread), E'\\s+') as spread_parts
  from public.games g
  where g.status = 'finished'
    and g.spread is not null
    and trim(g.spread) <> ''
    and g.result_a is not null
    and g.result_b is not null
),
game_outcomes as (
  select
    pg.game_id,
    pg.game_date,
    pg.start_time,
    pg.season_phase,
    pg.tournament_name,
    pg.away_team,
    pg.home_team,
    pg.away_abbrev,
    pg.home_abbrev,
    pg.away_rank,
    pg.home_rank,
    pg.away_score,
    pg.home_score,
    pg.spread,
    pg.spread_parts[1] as spread_team_abbrev,
    pg.spread_parts[array_length(pg.spread_parts, 1)]::numeric as spread_value,
    case
      when pg.away_abbrev = pg.spread_parts[1] then pg.away_team
      when pg.home_abbrev = pg.spread_parts[1] then pg.home_team
      else null
    end as favorite_team,
    case
      when pg.away_abbrev = pg.spread_parts[1] then pg.home_team
      when pg.home_abbrev = pg.spread_parts[1] then pg.away_team
      else null
    end as underdog_team
  from parsed_games pg
  where array_length(pg.spread_parts, 1) >= 2
    and pg.spread_parts[array_length(pg.spread_parts, 1)] ~ '^[+-]?[0-9]+([.][0-9]+)?$'
),
pick_base as (
  select
    p.id as pick_id,
    p.user_id,
    coalesce(pr.username, pr.email, 'Unknown') as username,
    pr.email,
    p.game_id,
    go.game_date,
    go.start_time,
    go.season_phase,
    go.tournament_name,
    go.away_team,
    go.home_team,
    go.away_abbrev,
    go.home_abbrev,
    go.away_rank,
    go.home_rank,
    go.away_score,
    go.home_score,
    go.spread,
    go.spread_team_abbrev,
    go.spread_value,
    abs(go.spread_value) as abs_spread,
    go.favorite_team,
    go.underdog_team,
    p.selected_team,
    case
      when p.selected_team = go.away_team then go.home_team
      when p.selected_team = go.home_team then go.away_team
      else null
    end as opponent_team,
    case
      when p.selected_team = go.away_team then 'away'
      when p.selected_team = go.home_team then 'home'
      else null
    end as picked_side,
    case
      when p.selected_team = go.favorite_team then true
      when p.selected_team = go.underdog_team then false
      else null
    end as picked_favorite,
    (go.away_rank is not null or go.home_rank is not null) as has_ranked_team,
    (go.away_rank is not null and go.home_rank is not null) as ranked_vs_ranked,
    case
      when p.selected_team = go.away_team then go.away_score - go.home_score
      when p.selected_team = go.home_team then go.home_score - go.away_score
      else null
    end as picked_margin,
    case
      when p.selected_team = go.away_team and go.spread_team_abbrev = go.away_abbrev then go.spread_value
      when p.selected_team = go.away_team and go.spread_team_abbrev = go.home_abbrev then -go.spread_value
      when p.selected_team = go.home_team and go.spread_team_abbrev = go.home_abbrev then go.spread_value
      when p.selected_team = go.home_team and go.spread_team_abbrev = go.away_abbrev then -go.spread_value
      else null
    end as picked_effective_spread
  from public.picks p
  join game_outcomes go
    on go.game_id = p.game_id
  join public.profiles pr
    on pr.id = p.user_id
  where p.selected_team in (go.away_team, go.home_team)
)
select
  pb.pick_id,
  pb.user_id,
  pb.username,
  pb.email,
  pb.game_id,
  pb.game_date,
  pb.start_time,
  pb.away_team,
  pb.home_team,
  pb.away_abbrev,
  pb.home_abbrev,
  pb.away_rank,
  pb.home_rank,
  pb.away_score,
  pb.home_score,
  pb.spread,
  pb.spread_team_abbrev,
  pb.spread_value,
  pb.abs_spread,
  pb.favorite_team,
  pb.underdog_team,
  pb.selected_team,
  pb.opponent_team,
  pb.picked_side,
  pb.picked_favorite,
  pb.has_ranked_team,
  pb.ranked_vs_ranked,
  pb.picked_margin,
  pb.picked_effective_spread,
  case
    when pb.picked_margin is null or pb.picked_effective_spread is null then null
    else (pb.picked_margin + pb.picked_effective_spread) > 0
  end as is_correct,
  pb.season_phase,
  pb.tournament_name
from pick_base pb;


create or replace function public.get_recap_overview(
  p_season_start date,
  p_season_end date,
  p_phase text default 'regular_season'
)
returns table (
  user_id uuid,
  username text,
  wins bigint,
  losses bigint,
  picks_made bigint,
  hit_rate numeric,
  weekly_titles bigint,
  season_rank bigint
)
language sql
stable
as $$
  with filtered as (
    select *
    from public.recap_pick_results
    where game_date between p_season_start and p_season_end
      and coalesce(season_phase, 'regular_season') = p_phase
      and is_correct is not null
  ),
  records as (
    select
      p.id as user_id,
      coalesce(p.username, p.email, 'Unknown') as username,
      coalesce(count(*) filter (where f.is_correct = true), 0) as wins,
      coalesce(count(*) filter (where f.is_correct = false), 0) as losses,
      coalesce(count(f.pick_id), 0) as picks_made
    from public.profiles p
    left join filtered f
      on f.user_id = p.id
    group by p.id, p.username, p.email
  ),
  titles as (
    select
      w.user_id,
      count(*) as weekly_titles
    from public.weekly_winners w
    where p_phase = 'regular_season'
      and w.week_start between p_season_start and p_season_end
    group by w.user_id
  ),
  ranked as (
    select
      r.user_id,
      r.username,
      r.wins,
      r.losses,
      r.picks_made,
      round(100.0 * r.wins / nullif(r.picks_made, 0), 1) as hit_rate,
      coalesce(t.weekly_titles, 0) as weekly_titles,
      dense_rank() over (
        order by r.wins desc, r.losses asc, coalesce(t.weekly_titles, 0) desc, r.username asc
      ) as season_rank
    from records r
    left join titles t
      on t.user_id = r.user_id
  )
  select
    user_id,
    username,
    wins,
    losses,
    picks_made,
    hit_rate,
    weekly_titles,
    season_rank
  from ranked
  order by season_rank, username;
$$;


create or replace function public.get_recap_team_insights(
  p_season_start date,
  p_season_end date,
  p_phase text default 'regular_season'
)
returns table (
  user_id uuid,
  username text,
  best_team text,
  best_team_correct_picks bigint,
  best_team_incorrect_picks bigint,
  best_team_total_picks bigint,
  worst_team text,
  worst_team_incorrect_picks bigint,
  worst_team_correct_picks bigint,
  worst_team_total_picks bigint,
  most_trusted_team text,
  most_trusted_picks bigint,
  most_trusted_wins bigint,
  most_trusted_losses bigint,
  most_trusted_hit_rate numeric,
  fade_machine_team text,
  fade_machine_successful_fades bigint,
  fade_machine_failed_fades bigint,
  fade_machine_total_fades bigint,
  fade_machine_hit_rate numeric
)
language sql
stable
as $$
  with filtered as (
    select *
    from public.recap_pick_results
    where game_date between p_season_start and p_season_end
      and coalesce(season_phase, 'regular_season') = p_phase
      and is_correct is not null
  ),
  team_stats as (
    select
      user_id,
      username,
      selected_team as team,
      count(*) filter (where is_correct = true) as correct_picks,
      count(*) filter (where is_correct = false) as incorrect_picks,
      count(*) as total_picks
    from filtered
    group by user_id, username, selected_team
  ),
  best_team as (
    select *
    from (
      select
        ts.*,
        row_number() over (
          partition by ts.user_id
          order by ts.correct_picks desc, ts.incorrect_picks asc, ts.total_picks desc, ts.team asc
        ) as rn
      from team_stats ts
      where ts.correct_picks > 0
    ) ranked
    where rn = 1
  ),
  worst_team as (
    select *
    from (
      select
        ts.*,
        row_number() over (
          partition by ts.user_id
          order by ts.incorrect_picks desc, ts.correct_picks asc, ts.total_picks desc, ts.team asc
        ) as rn
      from team_stats ts
      where ts.incorrect_picks > 0
    ) ranked
    where rn = 1
  ),
  trusted_team as (
    select *
    from (
      select
        ts.*,
        row_number() over (
          partition by ts.user_id
          order by ts.total_picks desc, ts.correct_picks desc, ts.team asc
        ) as rn
      from team_stats ts
    ) ranked
    where rn = 1
  ),
  fade_stats as (
    select
      user_id,
      username,
      opponent_team as team,
      count(*) filter (where is_correct = true) as successful_fades,
      count(*) filter (where is_correct = false) as failed_fades,
      count(*) as total_fades
    from filtered
    where opponent_team is not null
    group by user_id, username, opponent_team
  ),
  fade_team as (
    select *
    from (
      select
        fs.*,
        row_number() over (
          partition by fs.user_id
          order by fs.successful_fades desc, fs.total_fades desc, fs.team asc
        ) as rn
      from fade_stats fs
    ) ranked
    where rn = 1
  )
  select
    p.id as user_id,
    coalesce(p.username, p.email, 'Unknown') as username,
    bt.team as best_team,
    coalesce(bt.correct_picks, 0) as best_team_correct_picks,
    coalesce(bt.incorrect_picks, 0) as best_team_incorrect_picks,
    coalesce(bt.total_picks, 0) as best_team_total_picks,
    wt.team as worst_team,
    coalesce(wt.incorrect_picks, 0) as worst_team_incorrect_picks,
    coalesce(wt.correct_picks, 0) as worst_team_correct_picks,
    coalesce(wt.total_picks, 0) as worst_team_total_picks,
    tt.team as most_trusted_team,
    coalesce(tt.total_picks, 0) as most_trusted_picks,
    coalesce(tt.correct_picks, 0) as most_trusted_wins,
    coalesce(tt.incorrect_picks, 0) as most_trusted_losses,
    round(100.0 * tt.correct_picks / nullif(tt.total_picks, 0), 1) as most_trusted_hit_rate,
    ft.team as fade_machine_team,
    coalesce(ft.successful_fades, 0) as fade_machine_successful_fades,
    coalesce(ft.failed_fades, 0) as fade_machine_failed_fades,
    coalesce(ft.total_fades, 0) as fade_machine_total_fades,
    round(100.0 * ft.successful_fades / nullif(ft.total_fades, 0), 1) as fade_machine_hit_rate
  from public.profiles p
  left join best_team bt
    on bt.user_id = p.id
  left join worst_team wt
    on wt.user_id = p.id
  left join trusted_team tt
    on tt.user_id = p.id
  left join fade_team ft
    on ft.user_id = p.id
  order by username;
$$;


create or replace function public.get_recap_streaks(
  p_season_start date,
  p_season_end date,
  p_phase text default 'regular_season'
)
returns table (
  user_id uuid,
  username text,
  best_streak bigint,
  best_streak_start date,
  best_streak_end date,
  cold_streak bigint,
  cold_streak_start date,
  cold_streak_end date
)
language sql
stable
as $$
  with filtered as (
    select *
    from public.recap_pick_results
    where game_date between p_season_start and p_season_end
      and coalesce(season_phase, 'regular_season') = p_phase
      and is_correct is not null
  ),
  ordered as (
    select
      f.*,
      row_number() over (
        partition by f.user_id
        order by f.game_date, f.start_time, f.game_id, f.pick_id
      ) as rn_all,
      row_number() over (
        partition by f.user_id, f.is_correct
        order by f.game_date, f.start_time, f.game_id, f.pick_id
      ) as rn_result
    from filtered f
  ),
  streak_groups as (
    select
      o.*,
      o.rn_all - o.rn_result as streak_group
    from ordered o
  ),
  streaks as (
    select
      sg.user_id,
      sg.username,
      sg.is_correct,
      count(*) as streak_length,
      min(sg.game_date) as streak_start,
      max(sg.game_date) as streak_end
    from streak_groups sg
    group by sg.user_id, sg.username, sg.is_correct, sg.streak_group
  ),
  win_streak as (
    select *
    from (
      select
        s.*,
        row_number() over (
          partition by s.user_id
          order by s.streak_length desc, s.streak_start asc
        ) as rn
      from streaks s
      where s.is_correct = true
    ) ranked
    where rn = 1
  ),
  loss_streak as (
    select *
    from (
      select
        s.*,
        row_number() over (
          partition by s.user_id
          order by s.streak_length desc, s.streak_start asc
        ) as rn
      from streaks s
      where s.is_correct = false
    ) ranked
    where rn = 1
  )
  select
    p.id as user_id,
    coalesce(p.username, p.email, 'Unknown') as username,
    coalesce(ws.streak_length, 0) as best_streak,
    ws.streak_start as best_streak_start,
    ws.streak_end as best_streak_end,
    coalesce(ls.streak_length, 0) as cold_streak,
    ls.streak_start as cold_streak_start,
    ls.streak_end as cold_streak_end
  from public.profiles p
  left join win_streak ws
    on ws.user_id = p.id
  left join loss_streak ls
    on ls.user_id = p.id
  order by username;
$$;


create or replace function public.get_recap_weekly_highlights(
  p_season_start date,
  p_season_end date,
  p_phase text default 'regular_season'
)
returns table (
  user_id uuid,
  username text,
  best_week_start date,
  best_week_end date,
  best_week_wins integer,
  best_week_losses integer,
  best_week_hit_rate numeric,
  worst_week_start date,
  worst_week_end date,
  worst_week_wins integer,
  worst_week_losses integer,
  worst_week_hit_rate numeric,
  weekly_titles bigint
)
language sql
stable
as $$
  with weekly as (
    select
      wr.user_id,
      wr.week_start,
      wr.week_end,
      wr.wins,
      wr.losses
    from public.weekly_records wr
    where p_phase = 'regular_season'
      and wr.week_start between p_season_start and p_season_end
  ),
  best_week as (
    select *
    from (
      select
        w.*,
        row_number() over (
          partition by w.user_id
          order by w.wins desc, w.losses asc, w.week_start asc
        ) as rn
      from weekly w
    ) ranked
    where rn = 1
  ),
  worst_week as (
    select *
    from (
      select
        w.*,
        row_number() over (
          partition by w.user_id
          order by w.wins asc, w.losses desc, w.week_start asc
        ) as rn
      from weekly w
    ) ranked
    where rn = 1
  ),
  titles as (
    select
      ww.user_id,
      count(*) as weekly_titles
    from public.weekly_winners ww
    where p_phase = 'regular_season'
      and ww.week_start between p_season_start and p_season_end
    group by ww.user_id
  )
  select
    p.id as user_id,
    coalesce(p.username, p.email, 'Unknown') as username,
    bw.week_start as best_week_start,
    bw.week_end as best_week_end,
    bw.wins as best_week_wins,
    bw.losses as best_week_losses,
    round(100.0 * bw.wins / nullif(bw.wins + bw.losses, 0), 1) as best_week_hit_rate,
    ww.week_start as worst_week_start,
    ww.week_end as worst_week_end,
    ww.wins as worst_week_wins,
    ww.losses as worst_week_losses,
    round(100.0 * ww.wins / nullif(ww.wins + ww.losses, 0), 1) as worst_week_hit_rate,
    coalesce(t.weekly_titles, 0) as weekly_titles
  from public.profiles p
  left join best_week bw
    on bw.user_id = p.id
  left join worst_week ww
    on ww.user_id = p.id
  left join titles t
    on t.user_id = p.id
  order by username;
$$;


create or replace function public.get_recap_style_stats(
  p_season_start date,
  p_season_end date,
  p_phase text default 'regular_season'
)
returns table (
  user_id uuid,
  username text,
  ranked_game_wins bigint,
  ranked_game_losses bigint,
  ranked_game_hit_rate numeric,
  home_pick_wins bigint,
  home_pick_losses bigint,
  home_pick_hit_rate numeric,
  away_pick_wins bigint,
  away_pick_losses bigint,
  away_pick_hit_rate numeric,
  favorite_pick_wins bigint,
  favorite_pick_losses bigint,
  favorite_pick_hit_rate numeric,
  underdog_pick_wins bigint,
  underdog_pick_losses bigint,
  underdog_pick_hit_rate numeric,
  contrarian_picks bigint,
  contrarian_wins bigint,
  contrarian_hit_rate numeric,
  majority_picks bigint,
  majority_wins bigint,
  majority_hit_rate numeric
)
language sql
stable
as $$
  with filtered as (
    select *
    from public.recap_pick_results
    where game_date between p_season_start and p_season_end
      and coalesce(season_phase, 'regular_season') = p_phase
      and is_correct is not null
  ),
  game_team_counts as (
    select
      game_id,
      selected_team,
      count(*) as pick_count
    from filtered
    group by game_id, selected_team
  ),
  game_majority as (
    select
      game_id,
      max(pick_count) as majority_pick_count
    from game_team_counts
    group by game_id
  ),
  pick_context as (
    select
      f.*,
      gtc.pick_count,
      gm.majority_pick_count,
      (gtc.pick_count < gm.majority_pick_count) as is_contrarian,
      (gtc.pick_count = gm.majority_pick_count) as is_majority_pick
    from filtered f
    join game_team_counts gtc
      on gtc.game_id = f.game_id
     and gtc.selected_team = f.selected_team
    join game_majority gm
      on gm.game_id = f.game_id
  )
  select
    p.id as user_id,
    coalesce(p.username, p.email, 'Unknown') as username,
    coalesce(count(*) filter (where pc.has_ranked_team and pc.is_correct = true), 0) as ranked_game_wins,
    coalesce(count(*) filter (where pc.has_ranked_team and pc.is_correct = false), 0) as ranked_game_losses,
    round(
      100.0 * count(*) filter (where pc.has_ranked_team and pc.is_correct = true)
      / nullif(count(*) filter (where pc.has_ranked_team), 0),
      1
    ) as ranked_game_hit_rate,
    coalesce(count(*) filter (where pc.picked_side = 'home' and pc.is_correct = true), 0) as home_pick_wins,
    coalesce(count(*) filter (where pc.picked_side = 'home' and pc.is_correct = false), 0) as home_pick_losses,
    round(
      100.0 * count(*) filter (where pc.picked_side = 'home' and pc.is_correct = true)
      / nullif(count(*) filter (where pc.picked_side = 'home'), 0),
      1
    ) as home_pick_hit_rate,
    coalesce(count(*) filter (where pc.picked_side = 'away' and pc.is_correct = true), 0) as away_pick_wins,
    coalesce(count(*) filter (where pc.picked_side = 'away' and pc.is_correct = false), 0) as away_pick_losses,
    round(
      100.0 * count(*) filter (where pc.picked_side = 'away' and pc.is_correct = true)
      / nullif(count(*) filter (where pc.picked_side = 'away'), 0),
      1
    ) as away_pick_hit_rate,
    coalesce(count(*) filter (where pc.picked_favorite = true and pc.is_correct = true), 0) as favorite_pick_wins,
    coalesce(count(*) filter (where pc.picked_favorite = true and pc.is_correct = false), 0) as favorite_pick_losses,
    round(
      100.0 * count(*) filter (where pc.picked_favorite = true and pc.is_correct = true)
      / nullif(count(*) filter (where pc.picked_favorite = true), 0),
      1
    ) as favorite_pick_hit_rate,
    coalesce(count(*) filter (where pc.picked_favorite = false and pc.is_correct = true), 0) as underdog_pick_wins,
    coalesce(count(*) filter (where pc.picked_favorite = false and pc.is_correct = false), 0) as underdog_pick_losses,
    round(
      100.0 * count(*) filter (where pc.picked_favorite = false and pc.is_correct = true)
      / nullif(count(*) filter (where pc.picked_favorite = false), 0),
      1
    ) as underdog_pick_hit_rate,
    coalesce(count(*) filter (where pc.is_contrarian), 0) as contrarian_picks,
    coalesce(count(*) filter (where pc.is_contrarian and pc.is_correct = true), 0) as contrarian_wins,
    round(
      100.0 * count(*) filter (where pc.is_contrarian and pc.is_correct = true)
      / nullif(count(*) filter (where pc.is_contrarian), 0),
      1
    ) as contrarian_hit_rate,
    coalesce(count(*) filter (where pc.is_majority_pick), 0) as majority_picks,
    coalesce(count(*) filter (where pc.is_majority_pick and pc.is_correct = true), 0) as majority_wins,
    round(
      100.0 * count(*) filter (where pc.is_majority_pick and pc.is_correct = true)
      / nullif(count(*) filter (where pc.is_majority_pick), 0),
      1
    ) as majority_hit_rate
  from public.profiles p
  left join pick_context pc
    on pc.user_id = p.id
  group by p.id, p.username, p.email
  order by username;
$$;


create or replace function public.get_recap_team_breakdown(
  p_season_start date,
  p_season_end date,
  p_phase text default 'regular_season',
  p_user_id uuid default null
)
returns table (
  user_id uuid,
  username text,
  team text,
  backed_picks bigint,
  backed_wins bigint,
  backed_losses bigint,
  faded_picks bigint,
  faded_wins bigint,
  faded_losses bigint,
  total_picks bigint,
  total_wins bigint,
  total_losses bigint,
  hit_rate numeric,
  last_picked_date date
)
language sql
stable
as $$
  with filtered as (
    select *
    from public.recap_pick_results
    where game_date between p_season_start and p_season_end
      and coalesce(season_phase, 'regular_season') = p_phase
      and is_correct is not null
      and (p_user_id is null or user_id = p_user_id)
  ),
  team_events as (
    select
      f.user_id,
      f.username,
      f.selected_team as team,
      true as backed_team,
      f.is_correct,
      f.game_date
    from filtered f

    union all

    select
      f.user_id,
      f.username,
      f.opponent_team as team,
      false as backed_team,
      f.is_correct,
      f.game_date
    from filtered f
    where f.opponent_team is not null
  )
  select
    te.user_id,
    te.username,
    te.team,
    count(*) filter (where te.backed_team) as backed_picks,
    count(*) filter (where te.backed_team and te.is_correct = true) as backed_wins,
    count(*) filter (where te.backed_team and te.is_correct = false) as backed_losses,
    count(*) filter (where not te.backed_team) as faded_picks,
    count(*) filter (where not te.backed_team and te.is_correct = true) as faded_wins,
    count(*) filter (where not te.backed_team and te.is_correct = false) as faded_losses,
    count(*) as total_picks,
    count(*) filter (where te.is_correct = true) as total_wins,
    count(*) filter (where te.is_correct = false) as total_losses,
    round(100.0 * count(*) filter (where te.is_correct = true) / nullif(count(*), 0), 1) as hit_rate,
    max(te.game_date) as last_picked_date
  from team_events te
  group by te.user_id, te.username, te.team
  order by te.username, total_picks desc, total_wins desc, te.team asc;
$$;
