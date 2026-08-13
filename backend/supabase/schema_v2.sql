-- NEVIKAPS schema v2 — run this in the Supabase SQL editor AFTER schema.sql.
-- Adds: last-seen tracking, persisted generated content, and admin-managed curriculum.

alter table teachers add column if not exists last_seen_at timestamptz;

create table if not exists generated_content (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references teachers(id) on delete cascade,
    type text not null,
    title text not null,
    subject text,
    class_level text,
    content jsonb not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_generated_content_teacher_id on generated_content(teacher_id);

create table if not exists curriculum (
    id uuid primary key default gen_random_uuid(),
    school_year text not null,
    title text not null,
    source_file_url text,
    is_active boolean not null default true,
    created_by uuid references admins(id) on delete set null,
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create table if not exists curriculum_entries (
    id uuid primary key default gen_random_uuid(),
    curriculum_id uuid not null references curriculum(id) on delete cascade,
    class_level text not null,
    subject text not null,
    term text,
    month text,
    theme text,
    topics text[] not null default '{}',
    created_at timestamptz not null default now()
);

create index if not exists idx_curriculum_entries_lookup
    on curriculum_entries(curriculum_id, class_level, subject, month);

alter table generated_content enable row level security;
alter table curriculum enable row level security;
alter table curriculum_entries enable row level security;

-- As with schema.sql: no anon/authenticated policies are defined, so these
-- tables are reachable only via the Express backend's service-role client.
