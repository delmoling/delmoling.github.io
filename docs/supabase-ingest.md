# Supabase ingest endpoint

This workspace now includes a minimal Supabase Edge Function scaffold at:

- `supabase/functions/stroop-ingest/index.ts`

The frontend is currently configured to call:

- `https://ohihzoibxjekweporhpy.supabase.co/functions/v1/stroop-ingest`

## What it does

- Accepts the JSON payload sent by `ensino/common.js`.
- Validates protocol metadata (aceita v1.2 e v1.3).
- Creates a row in `participant_sessions`.
- Inserts trial rows in `stroop_trials`.
- Inserts participant-level metrics in `participant_metrics`.
- Optionally upserts block metrics when the table exists.

## Required environment variables

Use one of each pair below:

- URL: `SUPABASE_URL` or `PROJECT_URL`
- Service key: `SUPABASE_SERVICE_ROLE_KEY` or `SERVICE_ROLE_KEY`
- Token: `INGEST_TOKEN` (recommended)

Note: in the new Supabase dashboard, custom secrets cannot start with `SUPABASE_`.
If you see that error, create `PROJECT_URL` and `SERVICE_ROLE_KEY` instead.

## Expected request

`POST` with JSON body containing:

- `session`
- `completedAt`
- `summary`
- `participantMetrics`
- `blockMetrics`
- `quality`
- `trials`
- `cleanedTrialsForRt`

## Headers

If `INGEST_TOKEN` is set, the client must send:

- `x-ingest-token: <INGEST_TOKEN>`

When using Supabase Edge Functions with JWT verification enabled, also send:

- `Authorization: Bearer <SUPABASE_ANON_KEY>`
- `apikey: <SUPABASE_ANON_KEY>`

## Notes

- The function is ready for deployment as a Supabase Edge Function.
- The current frontend can already call any configured HTTPS endpoint through `CONFIG.webhookUrl` in `ensino/common.js`.
- If you want block metrics persisted, create a `participant_block_metrics` table or remove that section from the function.

## New fields (v1.3)

### Session payload

Optional device metadata (stored in `participant_sessions`):

- `userAgent`
- `screenWidth`
- `screenHeight`
- `windowInnerWidth`
- `windowInnerHeight`
- `experimentStartedAt`

### Trial payload

New columns (stored in `stroop_trials`):

- `is_practice`
- `transition_type`
- `post_error`
- `correct_bool`
- `timed_out_bool`

### Participant metrics

Optional normative scores stored in `participant_metrics`:

- `z_accuracy`
- `z_interference`

## SQL analysis playbook (step-by-step)

Use this sequence directly in Supabase SQL Editor to inspect data quality and interpret scores.

### 1) Open SQL Editor

1. Access your Supabase project dashboard.
2. Open `SQL Editor`.
3. Run each query below in order.

### 2) Coverage and quality gate

```sql
select
  count(*) as total_sessions,
  count(*) filter (where pm.excluded_participant = false) as valid_sessions,
  count(*) filter (where pm.excluded_participant = true) as excluded_sessions
from participant_sessions ps
left join participant_metrics pm on pm.session_id = ps.id;
```

```sql
select
  reason,
  count(*) as n
from participant_metrics pm,
jsonb_array_elements_text(pm.exclusion_reasons) as reason
where pm.excluded_participant = true
group by reason
order by n desc;
```

### 3) Distribution of participant scores

```sql
select
  round(avg(pm.accuracy_pct)::numeric, 2) as accuracy_mean,
  round(percentile_cont(0.5) within group (order by pm.accuracy_pct)::numeric, 2) as accuracy_median,
  round(avg(pm.rt_mean_ms)::numeric, 2) as rt_mean_ms_mean,
  round(percentile_cont(0.5) within group (order by pm.rt_mean_ms)::numeric, 2) as rt_mean_ms_median,
  round(avg(pm.stroop_interference_ms)::numeric, 2) as stroop_interference_mean,
  round(percentile_cont(0.5) within group (order by pm.stroop_interference_ms)::numeric, 2) as stroop_interference_median
from participant_metrics pm
where pm.excluded_participant = false;
```

```sql
select
  width_bucket(pm.stroop_interference_ms, -200, 600, 16) as bucket,
  count(*) as n
from participant_metrics pm
where pm.excluded_participant = false
group by bucket
order by bucket;
```

### 4) Block-level behavior (critical for Stroop effect)

```sql
select
  t.block,
  count(*) as n_trials,
  round(avg(t.rt_ms) filter (where t.correct = 1 and t.rt_ms is not null)::numeric, 2) as rt_mean_correct,
  round(100.0 * avg(t.correct)::numeric, 2) as accuracy_pct,
  round(100.0 * avg(t.timed_out)::numeric, 2) as timeout_pct
from stroop_trials t
join participant_metrics pm on pm.session_id = t.session_id
where pm.excluded_participant = false
group by t.block
order by t.block;
```

### 5) Outlier and anomaly checks

```sql
with valid as (
  select pm.*
  from participant_metrics pm
  where pm.excluded_participant = false
), stats as (
  select avg(rt_mean_ms) as m, stddev_samp(rt_mean_ms) as sd
  from valid
)
select
  v.session_id,
  round(v.rt_mean_ms::numeric, 2) as rt_mean_ms,
  round(((v.rt_mean_ms - s.m) / nullif(s.sd, 0))::numeric, 2) as z_rt
from valid v
cross join stats s
where abs((v.rt_mean_ms - s.m) / nullif(s.sd, 0)) >= 2.5
order by abs((v.rt_mean_ms - s.m) / nullif(s.sd, 0)) desc;
```

```sql
select
  pm.session_id,
  pm.accuracy_pct,
  pm.fast_rt_ratio_pct,
  pm.red_flags,
  pm.exclusion_reasons
from participant_metrics pm
where pm.excluded_participant = false
  and (
    pm.accuracy_pct < 80
    or pm.fast_rt_ratio_pct > 5
    or jsonb_array_length(pm.red_flags) > 0
  )
order by pm.accuracy_pct asc;
```

### 6) Stratified analysis (age and schooling)

```sql
select
  case
    when ps.age_years between 18 and 24 then '18-24'
    when ps.age_years between 25 and 34 then '25-34'
    when ps.age_years between 35 and 44 then '35-44'
    when ps.age_years between 45 and 54 then '45-54'
    when ps.age_years >= 55 then '55+'
    else 'unknown'
  end as age_band,
  count(*) as n,
  round(avg(pm.rt_mean_ms)::numeric, 2) as rt_mean_ms,
  round(avg(pm.stroop_interference_ms)::numeric, 2) as interference_ms,
  round(avg(pm.accuracy_pct)::numeric, 2) as accuracy_pct
from participant_sessions ps
join participant_metrics pm on pm.session_id = ps.id
where pm.excluded_participant = false
group by age_band
order by age_band;
```

```sql
select
  case
    when ps.schooling_years <= 11 then '<=11'
    when ps.schooling_years between 12 and 15 then '12-15'
    when ps.schooling_years >= 16 then '16+'
    else 'unknown'
  end as schooling_band,
  count(*) as n,
  round(avg(pm.rt_mean_ms)::numeric, 2) as rt_mean_ms,
  round(avg(pm.stroop_interference_ms)::numeric, 2) as interference_ms,
  round(avg(pm.accuracy_pct)::numeric, 2) as accuracy_pct
from participant_sessions ps
join participant_metrics pm on pm.session_id = ps.id
where pm.excluded_participant = false
group by schooling_band
order by schooling_band;
```

### 7) Interpretation checklist

Use these checkpoints after running the queries:

- Block 3 should usually be slower than Block 2 (positive Stroop interference).
- Very high timeout rates suggest the 3-second limit may be strict for the sample.
- If many valid participants still show low accuracy or fast responses, review instructions and attention checks.
- If stratum sizes are small, normative z-scores and percentiles should be interpreted with caution.

## Verification checklist (v1.3)

- Run 3 full sessions and confirm new fields are persisted in `stroop_trials` and `participant_metrics`.
- Confirm ISI jitter stays between 500-1000 ms in at least 100 trials.
- Manually recompute interference for 2 sessions and compare with stored values.
- Simulate missing local CSV and validate backend fallback for norms.
- Import exported CSV into JASP and verify boolean/float typing.
- Run a query to check null rates for new columns (should be near zero outside practice trials).
