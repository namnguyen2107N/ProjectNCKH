-- 003: single owner account + owner sessions (password protected, owner-only data access).

create table if not exists owner_accounts (
  id            bigserial primary key,
  username      text not null unique,
  password_hash text not null,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists owner_sessions (
  id           bigserial primary key,
  owner_id     bigint not null references owner_accounts(id) on delete cascade,
  token_hash   text not null unique,
  csrf_token   text not null,
  ip_hash      text,
  user_agent_hash text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);

create index if not exists owner_sessions_active_idx
  on owner_sessions (last_seen_at) where revoked_at is null;
create index if not exists owner_sessions_owner_idx
  on owner_sessions (owner_id);
