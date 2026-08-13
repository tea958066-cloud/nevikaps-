-- NEVIKAPS accounts schema — run this once in the Supabase SQL editor.
-- Only accounts (admins/teachers) live here; lesson/exam generation is stateless
-- and keeps using the Anthropic API directly, untouched by this migration.

create extension if not exists pgcrypto;

create table if not exists admins (
    id uuid primary key default gen_random_uuid(),
    username text unique not null,
    password_hash text not null,
    created_at timestamptz not null default now()
);

create table if not exists teachers (
    id uuid primary key default gen_random_uuid(),
    full_name text not null,
    teacher_id text unique not null,
    password_hash text not null,
    is_active boolean not null default true,
    must_change_password boolean not null default true,
    created_by uuid references admins(id) on delete set null,
    created_at timestamptz not null default now()
);

-- teacher_id already has a unique index from the constraint above; this is
-- an explicit named index for clarity/query planning as requested.
create index if not exists idx_teachers_teacher_id on teachers(teacher_id);

alter table admins enable row level security;
alter table teachers enable row level security;

-- No policies are defined for anon/authenticated roles: this locks the
-- tables to the Postgres service_role, which the Express backend uses
-- exclusively (service role key is never sent to the browser). RLS with
-- zero policies means anon/authenticated JWTs get zero rows either way.
