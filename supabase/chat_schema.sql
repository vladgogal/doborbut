-- ════════════════════════════════════════════════
-- CHAT MESSAGES — запускай у Supabase SQL Editor
-- ════════════════════════════════════════════════

-- Якщо таблиця ще не існує
create table if not exists chat_messages (
  id         bigserial primary key,
  session_id text not null,
  sender     text not null check (sender in ('user', 'admin')),
  text       text not null default '',
  file_url   text,
  created_at timestamptz default now()
);

-- Якщо таблиця вже існує — додай колонку для файлів
alter table chat_messages add column if not exists file_url text;

alter table chat_messages enable row level security;

create policy "Anyone can read chat"
  on chat_messages for select using (true);

create policy "Anyone can insert chat"
  on chat_messages for insert with check (true);

-- Увімкнути реалтайм
alter publication supabase_realtime add table chat_messages;

-- ════════════════════════════════════════════════
-- STORAGE — виконай окремо або зроби вручну:
-- Dashboard → Storage → New bucket → "chat-files" → Public
-- ════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('chat-files', 'chat-files', true)
on conflict (id) do nothing;

create policy "Anyone can upload chat files"
  on storage.objects for insert
  with check (bucket_id = 'chat-files');

create policy "Anyone can read chat files"
  on storage.objects for select
  using (bucket_id = 'chat-files');
