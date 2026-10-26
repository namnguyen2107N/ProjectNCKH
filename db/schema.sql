-- Robot Math Lab - authentication, access tracking, and research consent schema
-- Target: Neon Postgres / PostgreSQL 14+
-- Idempotent: safe to run more than once.

create table if not exists classes (
  id          bigserial primary key,
  name        text not null,
  join_code   text not null unique,
  teacher_id  bigint,
  created_at  timestamptz not null default now(),
  constraint classes_name_len check (char_length(name) between 1 and 100),
  constraint classes_join_code_fmt check (join_code ~ '^[A-Z0-9]{4,12}$')
);

create index if not exists classes_teacher_idx on classes (teacher_id);

create table if not exists accounts (
  id                 bigserial primary key,
  username           text not null unique,
  password_hash      text not null,
  display_name       text not null,
  role               text not null default 'student',
  class_id           bigint references classes(id) on delete set null,
  status             text not null default 'active',
  consent_version    text,
  consent_granted_at timestamptz,
  created_at         timestamptz not null default now(),
  last_login_at      timestamptz,
  failed_login_count integer not null default 0,
  locked_until       timestamptz,
  constraint accounts_username_fmt check (username ~ '^[a-z0-9][a-z0-9_]{2,23}$'),
  constraint accounts_username_lower check (username = lower(username)),
  constraint accounts_display_name_len check (char_length(display_name) between 1 and 50),
  constraint accounts_role_chk check (role in ('student', 'teacher', 'admin')),
  constraint accounts_status_chk check (status in ('active', 'disabled'))
);

create index if not exists accounts_class_idx on accounts (class_id);
create index if not exists accounts_role_idx on accounts (role);

-- classes.teacher_id references accounts; add the FK after accounts exists.
alter table classes drop constraint if exists classes_teacher_fk;
alter table classes
  add constraint classes_teacher_fk
  foreign key (teacher_id) references accounts(id) on delete set null;

create table if not exists auth_sessions (
  id           bigserial primary key,
  account_id   bigint not null references accounts(id) on delete cascade,
  token_hash   text not null unique,
  csrf_token   text not null,
  ip_hash      text,
  user_agent_hash text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);

create index if not exists auth_sessions_active_idx
  on auth_sessions (last_seen_at)
  where revoked_at is null;
create index if not exists auth_sessions_account_idx
  on auth_sessions (account_id);

create table if not exists login_events (
  id                 bigserial primary key,
  account_id         bigint references accounts(id) on delete set null,
  username_attempted text,
  success            boolean not null,
  reason             text,
  ip_hash            text,
  created_at         timestamptz not null default now()
);

create index if not exists login_events_created_idx
  on login_events (created_at desc);
create index if not exists login_events_account_idx
  on login_events (account_id, created_at desc);

create table if not exists app_metrics (
  metric_date date primary key,
  peak_online integer not null default 0,
  updated_at  timestamptz not null default now()
);

create table if not exists rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (bucket, window_start)
);

create index if not exists rate_limits_window_idx on rate_limits (window_start);
