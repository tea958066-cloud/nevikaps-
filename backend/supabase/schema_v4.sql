-- NEVIKAPS schema v4 — run this in the Supabase SQL editor AFTER schema_v3.sql.
-- Adds: teacher submissions (exams for admin review + student comments).

create table if not exists submissions (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references teachers(id) on delete cascade,
    type text not null check (type in ('exam', 'comment')),
    title text not null,
    subject text,
    class_level text,
    student_name text,
    content text not null,
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    admin_feedback text,
    reviewed_by uuid references admins(id) on delete set null,
    reviewed_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_submissions_teacher_id on submissions(teacher_id);
create index if not exists idx_submissions_status on submissions(status);

alter table submissions enable row level security;

-- As with the other tables: no anon/authenticated policies are defined, so
-- this table is reachable only via the Express backend's service-role client.
