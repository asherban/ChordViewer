alter table public.user_preferences
  add column mode text not null default 'Learn' check (mode in ('Learn', 'Transcribe', 'Play')),
  add column current_video_id text,
  add column current_video_start_sec integer;
