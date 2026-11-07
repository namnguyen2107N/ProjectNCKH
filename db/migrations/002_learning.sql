-- 002: learning sessions, PS1-PS11 events, daily metrics, rate limits.

create table if not exists learning_sessions (
  id               bigserial primary key,
  session_uid      text not null unique,
  profile_id       bigint not null references student_profiles(id) on delete cascade,
  task_id          text not null,
  task_title       text,
  language         text not null default 'vi' check (language in ('vi', 'en')),
  started_at       timestamptz,
  completed_at     timestamptz,
  total_time_s     integer not null default 0 check (total_time_s >= 0),
  total_attempts   integer not null default 0 check (total_attempts >= 0),
  backward_steps   integer not null default 0 check (backward_steps >= 0),
  hints_opened     integer not null default 0 check (hints_opened >= 0),
  max_hint_level   integer not null default 0 check (max_hint_level between 0 and 3),
  vocab_lookups    integer not null default 0 check (vocab_lookups >= 0),
  final_success    boolean,
  summary          jsonb not null default '{}'::jsonb,
  ip_hash          text,
  ua_hash          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists learning_sessions_profile_idx
  on learning_sessions (profile_id, started_at desc);
create index if not exists learning_sessions_task_idx
  on learning_sessions (task_id, started_at desc);
create index if not exists learning_sessions_started_idx
  on learning_sessions (started_at desc);

create table if not exists learning_events (
  id               bigserial primary key,
  session_id       bigint not null references learning_sessions(id) on delete cascade,
  client_event_uid text not null unique,
  profile_id       bigint not null references student_profiles(id) on delete cascade,
  task_id          text,
  code             text not null,
  label            text,
  step             smallint,
  relative_time_ms integer check (relative_time_ms is null or relative_time_ms >= 0),
  payload          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists learning_events_session_idx
  on learning_events (session_id, created_at);
create index if not exists learning_events_profile_idx
  on learning_events (profile_id, created_at desc);
create index if not exists learning_events_task_code_idx
  on learning_events (task_id, code);

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

create index if not exists rate_limits_window_idx
  on rate_limits (window_start);
