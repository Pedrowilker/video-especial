-- Execute este arquivo no SQL Editor do Supabase.
-- Crie a conta administrativa em Authentication > Users; não habilite cadastro público.
create extension if not exists pgcrypto;

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  path text not null unique,
  original_name text not null,
  size_bytes bigint not null default 0,
  mime_type text not null default 'video/mp4',
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.videos enable row level security;

drop policy if exists "Public can view video list" on public.videos;
create policy "Public can view video list"
on public.videos for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated admins can add videos" on public.videos;
create policy "Authenticated admins can add videos"
on public.videos for insert
to authenticated
with check (auth.uid() = uploaded_by);

drop policy if exists "Authenticated admins can delete videos" on public.videos;
create policy "Authenticated admins can delete videos"
on public.videos for delete
to authenticated
using (auth.uid() is not null);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', true, 5368709120, array['video/mp4','video/webm','video/quicktime','video/x-m4v'])
on conflict (id) do update set public = true, file_size_limit = 5368709120,
  allowed_mime_types = array['video/mp4','video/webm','video/quicktime','video/x-m4v'];

drop policy if exists "Public can read published videos" on storage.objects;
create policy "Public can read published videos"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'videos');

drop policy if exists "Authenticated users can upload videos" on storage.objects;
create policy "Authenticated users can upload videos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'videos' and auth.uid() is not null);

drop policy if exists "Authenticated users can delete videos" on storage.objects;
create policy "Authenticated users can delete videos"
on storage.objects for delete
to authenticated
using (bucket_id = 'videos' and auth.uid() is not null);
