# Supabase ingest endpoint

This workspace now includes a minimal Supabase Edge Function scaffold at:

- `supabase/functions/stroop-ingest/index.ts`

The frontend is currently configured to call:

- `https://ohihzoibxjekweporhpy.supabase.co/functions/v1/stroop-ingest`

## What it does

- Accepts the JSON payload sent by `ensino/common.js`.
- Validates protocol metadata.
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

- `Authorization: Bearer <INGEST_TOKEN>`

## Notes

- The function is ready for deployment as a Supabase Edge Function.
- The current frontend can already call any configured HTTPS endpoint through `CONFIG.webhookUrl` in `ensino/common.js`.
- If you want block metrics persisted, create a `participant_block_metrics` table or remove that section from the function.
