-- Supabase/Postgres schema inicial para Stroop Victoria (desktop-only)

create table if not exists protocol_registry (
  id bigserial primary key,
  protocol_version text not null,
  scoring_version text not null,
  schema_version text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (protocol_version, scoring_version, schema_version)
);

create table if not exists participant_sessions (
  id uuid primary key default gen_random_uuid(),
  participant_id text not null,
  role text not null,
  email text not null,
  age_years integer not null,
  schooling_years integer not null,
  color_blindness text not null,
  mother_tongue text not null,
  digital_familiarity integer not null,
  computer_experience text,
  handedness text,
  sensory_notes text,
  physical_keyboard_confirmed boolean not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  protocol_version text not null,
  scoring_version text not null,
  schema_version text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_sessions_participant on participant_sessions (participant_id);
create index if not exists idx_sessions_protocol on participant_sessions (protocol_version, scoring_version);
create index if not exists idx_sessions_age_schooling on participant_sessions (age_years, schooling_years);

create table if not exists stroop_trials (
  id bigserial primary key,
  session_id uuid not null references participant_sessions(id) on delete cascade,
  trial_index_in_block integer not null,
  block integer not null,
  block_name text not null,
  stimulus_type text not null,
  stimulus_label text not null,
  stimulus_color text not null,
  correct_key text not null,
  response_key text,
  correct integer not null,
  timed_out integer not null,
  rt_ms integer,
  protocol_version text not null,
  scoring_version text not null,
  schema_version text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_trials_session on stroop_trials (session_id);
create index if not exists idx_trials_block on stroop_trials (block);

create table if not exists participant_metrics (
  id bigserial primary key,
  session_id uuid not null unique references participant_sessions(id) on delete cascade,
  total_trials integer not null,
  correct_trials integer not null,
  error_trials integer not null,
  timeout_trials integer not null,
  omission_rate_pct numeric(6,2) not null,
  accuracy_pct numeric(6,2) not null,
  rt_mean_ms numeric(10,2) not null,
  rt_median_ms numeric(10,2) not null,
  rt_sd_ms numeric(10,2) not null,
  rt_trimmed_mean_ms numeric(10,2) not null,
  rt_valid_n integer not null,
  stroop_interference_ms numeric(10,2) not null,
  excluded_participant boolean not null,
  exclusion_reasons jsonb not null default '[]'::jsonb,
  red_flags jsonb not null default '[]'::jsonb,
  fast_rt_ratio_pct numeric(6,2) not null,
  protocol_version text not null,
  scoring_version text not null,
  schema_version text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_metrics_protocol on participant_metrics (protocol_version, scoring_version);
create index if not exists idx_metrics_quality on participant_metrics (excluded_participant, accuracy_pct);

create table if not exists participant_block_metrics (
  id bigserial primary key,
  session_id uuid not null references participant_sessions(id) on delete cascade,
  block integer not null,
  total_trials integer not null,
  accuracy_pct numeric(6,2) not null,
  rt_mean_ms numeric(10,2) not null,
  rt_median_ms numeric(10,2) not null,
  rt_sd_ms numeric(10,2) not null,
  rt_trimmed_mean_ms numeric(10,2) not null,
  rt_valid_n integer not null,
  protocol_version text not null,
  scoring_version text not null,
  schema_version text not null,
  created_at timestamptz not null default now(),
  unique (session_id, block)
);

create index if not exists idx_block_metrics_protocol on participant_block_metrics (protocol_version, scoring_version);

create table if not exists normative_stats (
  id bigserial primary key,
  protocol_version text not null,
  scoring_version text not null,
  age_band text not null,
  schooling_band text not null,
  metric_name text not null,
  n integer not null,
  mean numeric(12,4) not null,
  sd numeric(12,4) not null,
  updated_at timestamptz not null default now(),
  unique (protocol_version, scoring_version, age_band, schooling_band, metric_name)
);

create index if not exists idx_norms_lookup on normative_stats (protocol_version, scoring_version, age_band, schooling_band, metric_name);
