create extension if not exists "uuid-ossp";

-- Chord charts (one 'default' chart per user for now)
create table public.chord_charts (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null default 'default',
  title      text not null default '',
  key        text not null default '',
  time_sig   text not null default '4/4',
  tempo      text not null default '120',
  bars       jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id, name)
);

-- Video history (up to 5 entries per user, ordered by position)
create table public.video_history (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  youtube_id  text not null,
  start_sec   integer,
  label       text not null,
  title       text,
  position    smallint not null,  -- 0 = most recent
  accessed_at timestamptz not null default now()
);

-- Per-user preferences (notation style)
create table public.user_preferences (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  notation   text not null default 'regular' check (notation in ('regular', 'jazz')),
  updated_at timestamptz not null default now()
);

-- Auto-update updated_at on chord_charts and user_preferences
create or replace function update_updated_at()
  returns trigger as $$
  begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger chord_charts_updated_at
  before update on public.chord_charts
  for each row execute function update_updated_at();

create trigger user_preferences_updated_at
  before update on public.user_preferences
  for each row execute function update_updated_at();
