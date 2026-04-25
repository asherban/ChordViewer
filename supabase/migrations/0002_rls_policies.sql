alter table public.chord_charts     enable row level security;
alter table public.video_history    enable row level security;
alter table public.user_preferences enable row level security;

-- Each user can only read and write their own rows
create policy "own rows" on public.chord_charts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own rows" on public.video_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own rows" on public.user_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
