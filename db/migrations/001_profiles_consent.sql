-- 001: light student profiles (name + age, no password) and research consent.

create table if not exists student_profiles (
  id                bigserial primary key,
  display_name      text not null,
  age               smallint not null,
  access_token_hash text not null,
  created_at        timestamptz not null default now(),
  last_seen_at      timestamptz,
  deactivated_at    timestamptz,
  constraint student_profiles_name_len check (char_length(display_name) between 1 and 50),
  constraint student_profiles_age_chk  check (age between 3 and 18)
);

create index if not exists student_profiles_name_idx
  on student_profiles (lower(display_name));
create index if not exists student_profiles_created_idx
  on student_profiles (created_at desc);

create table if not exists consents (
  id              bigserial primary key,
  profile_id      bigint not null references student_profiles(id) on delete cascade,
  consent_version text not null,
  granted_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  unique (profile_id, consent_version)
);

create index if not exists consents_profile_idx
  on consents (profile_id, granted_at desc);
