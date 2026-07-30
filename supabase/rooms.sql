create extension if not exists pgcrypto with schema extensions;

create table if not exists public.game_rooms (
  code text primary key,
  name text not null,
  host_name text not null,
  visibility text not null check (visibility in ('public', 'private')),
  password_hash text,
  host_token_hash text not null,
  players integer not null default 1 check (players between 0 and 4),
  status text not null default 'waiting' check (status in ('waiting', 'playing')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.game_rooms enable row level security;
revoke all on public.game_rooms from anon, authenticated;

create or replace view public.room_directory as
select code, name, host_name, visibility, players, updated_at
from public.game_rooms
where status = 'waiting' and updated_at > now() - interval '20 seconds';

grant select on public.room_directory to anon, authenticated;

create or replace function public.create_game_room(
  p_code text, p_name text, p_host_name text, p_visibility text,
  p_password text, p_host_token text
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into game_rooms(code, name, host_name, visibility, password_hash, host_token_hash)
  values (
    upper(left(p_code, 6)), left(p_name, 20), left(p_host_name, 12), p_visibility,
    case when p_visibility = 'private' then encode(extensions.digest(convert_to(p_password, 'UTF8'), 'sha256'), 'hex') end,
    encode(extensions.digest(convert_to(p_host_token, 'UTF8'), 'sha256'), 'hex')
  )
  on conflict (code) do update set
    name = excluded.name, host_name = excluded.host_name, visibility = excluded.visibility,
    password_hash = excluded.password_hash, host_token_hash = excluded.host_token_hash,
    players = 1, status = 'waiting', updated_at = now();
end $$;

create or replace function public.heartbeat_game_room(p_code text, p_host_token text, p_players integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update game_rooms set players = greatest(0, least(4, p_players)), updated_at = now()
  where code = upper(p_code) and host_token_hash = encode(extensions.digest(convert_to(p_host_token, 'UTF8'), 'sha256'), 'hex');
  return found;
end $$;

create or replace function public.delete_game_room(p_code text, p_host_token text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from game_rooms
  where code = upper(p_code) and host_token_hash = encode(extensions.digest(convert_to(p_host_token, 'UTF8'), 'sha256'), 'hex');
  return found;
end $$;

create or replace function public.verify_game_room_password(p_code text, p_password text)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from game_rooms
    where code = upper(p_code)
      and visibility = 'private'
      and password_hash = encode(extensions.digest(convert_to(p_password, 'UTF8'), 'sha256'), 'hex')
      and updated_at > now() - interval '20 seconds'
  );
$$;

grant execute on function public.create_game_room(text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.heartbeat_game_room(text,text,integer) to anon, authenticated;
grant execute on function public.delete_game_room(text,text) to anon, authenticated;
grant execute on function public.verify_game_room_password(text,text) to anon, authenticated;
