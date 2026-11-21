-- Quartermaster · inspection module · schema (phase F2a)
--
-- Security by default: every table below is created with row-level security ENABLED
-- and no policies, so nobody can read or write it through the API yet. The access
-- policies and the functions that write data arrive in phase F2b.
--
-- The CHECK constraints and unique indexes are rules the database enforces even when a
-- modified client sends bad data: the phone is never trusted.

-- ---------------------------------------------------------------- people

-- One row per signed-in person; the id is the authentication user id.
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  full_name      text not null default '' check (char_length(full_name) <= 120),
  role           text not null default 'inspector' check (role in ('inspector', 'supervisor')),
  signature_path text check (char_length(signature_path) <= 300),
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- catalog

-- Loaded from catalog/questions.json by a generated migration (npm run gen:catalog).
create table public.catalog_versions (
  version   int primary key check (version > 0),
  loaded_at timestamptz not null default now()
);

create table public.unit_types (
  code     text primary key,
  label_en text not null,
  label_es text not null,
  groups   text[] not null default '{}',
  position int not null
);

create table public.questions (
  code        text primary key,
  step        int not null check (step > 0),
  position    int not null,
  kind        text not null check (kind in ('heading', 'check', 'choice', 'unit_type', 'text',
                                            'digits', 'number', 'date', 'photo', 'signature')),
  requirement text not null check (requirement in ('required', 'recommended', 'optional')),
  group_name  text,
  label_en    text not null,
  label_es    text not null,
  options     jsonb
);

-- The `summary` map of the catalog: which question feeds each summary column.
-- The server uses it to compute the summary itself instead of trusting the phone.
create table public.catalog_summary (
  field         text primary key check (field in ('tripRef', 'inspectionDate', 'unitType',
                                                  'truckPlate', 'containerNo', 'driverName',
                                                  'verdict')),
  question_code text not null references public.questions (code)
);

-- ---------------------------------------------------------------- inspections

create table public.inspections (
  id                  uuid primary key,              -- created on the phone
  status              text not null default 'draft' check (status in ('draft', 'completed')),
  current_step        int not null default 1 check (current_step between 1 and 50),
  catalog_version     int not null references public.catalog_versions (version),
  created_by          uuid not null references public.profiles (id),
  inspector_name      text not null check (char_length(inspector_name) <= 120),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz,
  report_generated_at timestamptz,
  deleted_at          timestamptz,

  -- Summary: a deliberate copy of seven answers so lists need no join (DATA-MODEL.md).
  trip_ref        text check (char_length(trip_ref) <= 60),
  inspection_date date,
  unit_type_code  text references public.unit_types (code),
  truck_plate     text check (char_length(truck_plate) <= 20),
  container_no    text check (char_length(container_no) <= 20),
  driver_name     text check (char_length(driver_name) <= 120),
  verdict         text check (verdict in ('FIT', 'NOT_FIT')),

  -- F16: no outer spaces, single inner spaces, upper case; blank means "no reference".
  -- Same rule as normalizeTripRef() in src/inspection/form.ts.
  trip_ref_key text generated always as (
    nullif(upper(regexp_replace(regexp_replace(trip_ref, '^\s+|\s+$', '', 'g'), '\s+', ' ', 'g')), '')
  ) stored,

  -- A completed inspection always has its completion time, and a draft never does.
  constraint completed_has_time check ((status = 'completed') = (completed_at is not null))
);

-- F16 enforced by the database: one live inspection per trip reference.
create unique index inspections_trip_ref_key_unique
  on public.inspections (trip_ref_key)
  where trip_ref_key is not null and deleted_at is null;

create index inspections_created_by_updated_at on public.inspections (created_by, updated_at);
create index inspections_inspection_date on public.inspections (inspection_date);
create index inspections_updated_at on public.inspections (updated_at);  -- changes_since()

-- One row per answered question: queryable with plain SQL.
create table public.answers (
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  question_code text not null references public.questions (code),
  value         text not null check (char_length(value) <= 2000),
  note          text check (char_length(note) <= 2000),
  primary key (inspection_id, question_code)
);

-- Photos, signatures and the report file.
create table public.attachments (
  id            uuid primary key,                    -- created on the phone
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  kind          text not null check (kind in ('photo', 'signature', 'report')),
  question_code text references public.questions (code),
  storage_path  text not null check (char_length(storage_path) <= 300),
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  -- A photo or signature answers a question; the report does not.
  constraint report_has_no_question check ((kind = 'report') = (question_code is null))
);

-- At most one report per inspection.
create unique index attachments_one_report
  on public.attachments (inspection_id)
  where kind = 'report';

-- ---------------------------------------------------------------- directory

create table public.drivers (
  id         uuid primary key,
  name       text not null check (char_length(name) between 1 and 120),
  id_number  text not null check (id_number ~ '^[0-9]{1,20}$'),
  phone      text check (phone ~ '^[0-9]{1,20}$'),
  created_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index drivers_id_number_unique on public.drivers (id_number) where deleted_at is null;

create table public.carriers (
  id           uuid primary key,
  name         text not null check (char_length(name) between 1 and 120),
  contact_name text check (char_length(contact_name) <= 120),
  created_by   uuid not null references public.profiles (id),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create unique index carriers_name_unique on public.carriers (lower(name)) where deleted_at is null;

create table public.vehicles (
  id          uuid primary key,
  plate       text not null check (plate ~ '^[A-Z0-9]{1,15}$'),  -- upper case, no spaces or hyphens
  description text check (char_length(description) <= 120),
  created_by  uuid not null references public.profiles (id),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create unique index vehicles_plate_unique on public.vehicles (plate) where deleted_at is null;

create index drivers_updated_at on public.drivers (updated_at);
create index carriers_updated_at on public.carriers (updated_at);
create index vehicles_updated_at on public.vehicles (updated_at);

-- ---------------------------------------------------------------- row-level security

-- Enabled on every table; with no policies, the API can read and write nothing.
alter table public.profiles         enable row level security;
alter table public.catalog_versions enable row level security;
alter table public.unit_types       enable row level security;
alter table public.questions        enable row level security;
alter table public.catalog_summary  enable row level security;
alter table public.inspections      enable row level security;
alter table public.answers          enable row level security;
alter table public.attachments      enable row level security;
alter table public.drivers          enable row level security;
alter table public.carriers         enable row level security;
alter table public.vehicles         enable row level security;
