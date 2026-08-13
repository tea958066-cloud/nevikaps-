-- NEVIKAPS schema v3 — run this in the Supabase SQL editor AFTER schema.sql and schema_v2.sql.
-- Adds: reversible encrypted credentials, and the subjects system.

-- Reversible AES-256-GCM ciphertext (base64: iv + authTag + ciphertext), set
-- by the Express backend. The old one-way password_hash columns are kept
-- so any existing account can be opportunistically migrated the next time
-- it logs in successfully (a bcrypt hash cannot be reversed, so there is no
-- way to bulk-migrate old rows without the plaintext — this is the standard,
-- correct way to handle that).
alter table admins add column if not exists password_encrypted text;
alter table teachers add column if not exists password_encrypted text;

-- The original schema made password_hash NOT NULL with no default. New
-- accounts only ever write password_encrypted now, so that constraint must
-- be relaxed or every new admin/teacher insert fails.
alter table admins alter column password_hash drop not null;
alter table teachers alter column password_hash drop not null;

-- A teacher's Teacher ID and an admin's username share one login "id"
-- namespace (the login endpoint checks both tables). This constraint-level
-- comment documents the rule the application enforces: creating a teacher
-- with a Teacher ID matching an existing admin's username (or vice versa)
-- must be rejected, since that collision previously locked an admin out.

create table if not exists subjects (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    level text not null,
    is_custom boolean not null default false,
    created_by uuid references admins(id) on delete set null,
    created_at timestamptz not null default now(),
    unique (name, level)
);

create table if not exists teacher_subjects (
    teacher_id uuid not null references teachers(id) on delete cascade,
    subject_id uuid not null references subjects(id) on delete cascade,
    primary key (teacher_id, subject_id)
);

create index if not exists idx_teacher_subjects_teacher on teacher_subjects(teacher_id);

alter table subjects enable row level security;
alter table teacher_subjects enable row level security;

-- Seed the built-in Nursery and Primary subject lists (idempotent).
insert into subjects (name, level, is_custom) values
    ('Numeracy', 'Nursery', false),
    ('Literacy', 'Nursery', false),
    ('Oral Language', 'Nursery', false),
    ('Environmental Studies', 'Nursery', false),
    ('Art and Craft', 'Nursery', false),
    ('Music and Rhymes', 'Nursery', false),
    ('Mathematics', 'Primary', false),
    ('English Language', 'Primary', false),
    ('Science and Technology', 'Primary', false),
    ('Civic Education', 'Primary', false),
    ('ICT', 'Primary', false),
    ('French Language', 'Primary', false)
on conflict (name, level) do nothing;
