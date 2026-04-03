type ScorePayload = {
  session?: Record<string, unknown>;
  completedAt?: string;
  summary?: Record<string, unknown>;
  participantMetrics?: Record<string, unknown>;
  blockMetrics?: Array<Record<string, unknown>>;
  quality?: Record<string, unknown>;
  trials?: Array<Record<string, unknown>>;
  cleanedTrialsForRt?: Array<Record<string, unknown>>;
};

const FIXED_PROTOCOL_VERSION = "stroop-victoria-desktop-v1-baseline";

declare const Deno: any;

type NumericMetricRow = {
  session_id: string;
  accuracy_pct: number;
  rt_mean_ms: number;
  stroop_interference_ms: number;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function requiredEnvAny(names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) {
      return value;
    }
  }
  throw new Error(`Missing environment variable. Expected one of: ${names.join(", ")}`);
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function toInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function safeParseJson(rawText: string): { ok: true; data: unknown } | { ok: false; message: string } {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { ok: false, message: "Empty JSON body" };
  }

  try {
    return { ok: true, data: JSON.parse(trimmed) };
  } catch (error) {
    return { ok: false, message: "Invalid JSON body" };
  }
}

function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.max(minValue, Math.min(maxValue, value));
}

function mean(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const m = mean(values);
  const variance = values.reduce((sum, value) => sum + Math.pow(value - m, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function percentileRank(values: number[], value: number): number {
  if (!values.length) {
    return 50;
  }
  const lessOrEqual = values.filter((item) => item <= value).length;
  return clamp((lessOrEqual / values.length) * 100, 1, 99);
}

function ageBand(ageYears: number | null): string {
  if (!ageYears || ageYears < 18) {
    return "unknown";
  }
  if (ageYears <= 24) {
    return "18-24";
  }
  if (ageYears <= 34) {
    return "25-34";
  }
  if (ageYears <= 44) {
    return "35-44";
  }
  if (ageYears <= 54) {
    return "45-54";
  }
  return "55+";
}

function schoolingBand(schoolingYears: number | null): string {
  if (!schoolingYears || schoolingYears < 1) {
    return "unknown";
  }
  if (schoolingYears <= 11) {
    return "ate-11";
  }
  if (schoolingYears <= 15) {
    return "12-15";
  }
  return "16+";
}

function getNumeric(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const expectedToken = Deno.env.get("INGEST_TOKEN") || "";
    const authHeader = request.headers.get("authorization") || "";
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const rawBody = await request.text();
    const parsedBody = safeParseJson(rawBody);
    if (!parsedBody.ok) {
      return jsonResponse({ error: parsedBody.message }, 400);
    }

    const payload = parsedBody.data as ScorePayload;
    const session = payload.session || {};
    const trials = Array.isArray(payload.trials) ? payload.trials : [];
    const blockMetrics = Array.isArray(payload.blockMetrics) ? payload.blockMetrics : [];

    const protocolVersion = normalizeText(session.protocolVersion) || normalizeText(payload.summary?.protocolVersion);
    const scoringVersion = normalizeText(session.scoringVersion) || normalizeText(payload.summary?.scoringVersion);
    const schemaVersion = normalizeText(session.schemaVersion) || normalizeText(payload.summary?.schemaVersion);
    const completedAt = normalizeText(payload.completedAt) || new Date().toISOString();

    if (!protocolVersion || !scoringVersion || !schemaVersion) {
      return jsonResponse({ error: "Missing protocol metadata" }, 400);
    }

    if (protocolVersion !== FIXED_PROTOCOL_VERSION) {
      return jsonResponse({
        error: "Protocol version mismatch",
        expected: FIXED_PROTOCOL_VERSION,
        received: protocolVersion
      }, 400);
    }

    const supabaseUrl = requiredEnvAny(["SUPABASE_URL", "PROJECT_URL"]);
    const serviceRoleKey = requiredEnvAny(["SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY"]);
    // @ts-ignore Deno runtime resolves this URL import at execution time.
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.1");
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const protocolUpsert = await supabase
      .from("protocol_registry")
      .upsert({
        protocol_version: protocolVersion,
        scoring_version: scoringVersion,
        schema_version: schemaVersion,
        description: "Stroop Victoria desktop baseline"
      }, { onConflict: "protocol_version,scoring_version,schema_version" })
      .select("id")
      .single();

    if (protocolUpsert.error) {
      throw protocolUpsert.error;
    }

    const sessionRow = {
      participant_id: normalizeText(session.participantId),
      role: normalizeText(session.role),
      email: normalizeText(session.email),
      age_years: toInteger(session.ageYears),
      schooling_years: toInteger(session.schoolingYears),
      color_blindness: normalizeText(session.colorBlindness),
      mother_tongue: normalizeText(session.motherTongue),
      digital_familiarity: toInteger(session.digitalFamiliarity),
      computer_experience: normalizeText(session.computerExperience),
      handedness: normalizeText(session.handedness),
      sensory_notes: normalizeText(session.sensoryNotes),
      physical_keyboard_confirmed: Boolean(session.physicalKeyboardConfirmed),
      started_at: normalizeText(session.startedAt),
      completed_at: completedAt,
      protocol_version: protocolVersion,
      scoring_version: scoringVersion,
      schema_version: schemaVersion
    };

    const sessionInsert = await supabase
      .from("participant_sessions")
      .insert(sessionRow)
      .select("id")
      .single();

    if (sessionInsert.error) {
      throw sessionInsert.error;
    }

    const sessionId = sessionInsert.data?.id;
    if (!sessionId) {
      throw new Error("Failed to create participant session");
    }

    const trialRows = trials.map((trial) => ({
      session_id: sessionId,
      trial_index_in_block: toInteger(trial.trial_index_in_block) || 0,
      block: toInteger(trial.block) || 0,
      block_name: normalizeText(trial.block_name),
      stimulus_type: normalizeText(trial.stimulus_type),
      stimulus_label: normalizeText(trial.stimulus_label),
      stimulus_color: normalizeText(trial.stimulus_color),
      correct_key: normalizeText(trial.correct_key),
      response_key: normalizeText(trial.response_key),
      correct: Number(trial.correct) || 0,
      timed_out: Number(trial.timed_out) || 0,
      rt_ms: trial.rt_ms === "" || trial.rt_ms == null ? null : toInteger(trial.rt_ms),
      protocol_version: protocolVersion,
      scoring_version: scoringVersion,
      schema_version: schemaVersion
    }));

    if (trialRows.length) {
      const trialsInsert = await supabase.from("stroop_trials").insert(trialRows);
      if (trialsInsert.error) {
        throw trialsInsert.error;
      }
    }

    const participantMetrics = payload.participantMetrics || {};
    const quality = payload.quality || {};

    const metricsInsert = await supabase
      .from("participant_metrics")
      .insert({
        session_id: sessionId,
        total_trials: toInteger(participantMetrics.total_trials) || 0,
        correct_trials: toInteger(participantMetrics.correct_trials) || 0,
        error_trials: toInteger(participantMetrics.error_trials) || 0,
        timeout_trials: toInteger(participantMetrics.timeout_trials) || 0,
        omission_rate_pct: Number(participantMetrics.omission_rate_pct) || 0,
        accuracy_pct: Number(participantMetrics.accuracy_pct) || 0,
        rt_mean_ms: Number(participantMetrics.rt_mean_ms) || 0,
        rt_median_ms: Number(participantMetrics.rt_median_ms) || 0,
        rt_sd_ms: Number(participantMetrics.rt_sd_ms) || 0,
        rt_trimmed_mean_ms: Number(participantMetrics.rt_trimmed_mean_ms) || 0,
        rt_valid_n: toInteger(participantMetrics.rt_valid_n) || 0,
        stroop_interference_ms: Number(participantMetrics.stroop_interference_ms) || 0,
        excluded_participant: Boolean(quality.excluded_participant),
        exclusion_reasons: Array.isArray(quality.exclusion_reasons) ? quality.exclusion_reasons : [],
        red_flags: Array.isArray(quality.red_flags) ? quality.red_flags : [],
        fast_rt_ratio_pct: Number(quality.fast_rt_ratio_pct) || 0,
        protocol_version: protocolVersion,
        scoring_version: scoringVersion,
        schema_version: schemaVersion
      })
      .select("id")
      .single();

    if (metricsInsert.error) {
      throw metricsInsert.error;
    }

    const participantAgeYears = toInteger(session.ageYears);
    const participantSchoolingYears = toInteger(session.schoolingYears);
    const participantAgeBand = ageBand(participantAgeYears);
    const participantSchoolingBand = schoolingBand(participantSchoolingYears);

    let normative: Record<string, unknown> | null = null;

    if (blockMetrics.length) {
      const blockInsert = await supabase.from("participant_block_metrics").upsert(
        blockMetrics.map((block) => ({
          session_id: sessionId,
          block: toInteger(block.block) || 0,
          total_trials: toInteger(block.total_trials) || 0,
          accuracy_pct: Number(block.accuracy_pct) || 0,
          rt_mean_ms: Number(block.rt_mean_ms) || 0,
          rt_median_ms: Number(block.rt_median_ms) || 0,
          rt_sd_ms: Number(block.rt_sd_ms) || 0,
          rt_trimmed_mean_ms: Number(block.rt_trimmed_mean_ms) || 0,
          rt_valid_n: toInteger(block.rt_valid_n) || 0,
          protocol_version: protocolVersion,
          scoring_version: scoringVersion,
          schema_version: schemaVersion
        })),
        { onConflict: "session_id,block" }
      );

      if (blockInsert.error) {
        throw blockInsert.error;
      }
    }

    if (!Boolean(quality.excluded_participant) && participantAgeBand !== "unknown" && participantSchoolingBand !== "unknown") {
      const metricsQuery = await supabase
        .from("participant_metrics")
        .select("session_id, accuracy_pct, rt_mean_ms, stroop_interference_ms")
        .eq("protocol_version", protocolVersion)
        .eq("scoring_version", scoringVersion)
        .eq("excluded_participant", false);

      if (metricsQuery.error) {
        throw metricsQuery.error;
      }

      const metricRows = (metricsQuery.data || []) as NumericMetricRow[];
      const metricSessionIds = metricRows.map((row) => row.session_id).filter(Boolean);

      if (metricSessionIds.length) {
        const sessionsQuery = await supabase
          .from("participant_sessions")
          .select("id, age_years, schooling_years")
          .in("id", metricSessionIds);

        if (sessionsQuery.error) {
          throw sessionsQuery.error;
        }

        const bandBySessionId = new Map<string, { ageBand: string; schoolingBand: string }>();
        (sessionsQuery.data || []).forEach((row: { id: string; age_years: number | null; schooling_years: number | null }) => {
          bandBySessionId.set(String(row.id), {
            ageBand: ageBand(toInteger(row.age_years)),
            schoolingBand: schoolingBand(toInteger(row.schooling_years))
          });
        });

        const stratumRows = metricRows.filter((row) => {
          const sessionBands = bandBySessionId.get(String(row.session_id));
          return sessionBands
            && sessionBands.ageBand === participantAgeBand
            && sessionBands.schoolingBand === participantSchoolingBand;
        });

        const accuracyValues = stratumRows.map((row) => getNumeric(row.accuracy_pct));
        const rtMeanValues = stratumRows.map((row) => getNumeric(row.rt_mean_ms));
        const interferenceValues = stratumRows.map((row) => getNumeric(row.stroop_interference_ms));

        const participantAccuracy = getNumeric(participantMetrics.accuracy_pct);
        const participantRtMean = getNumeric(participantMetrics.rt_mean_ms);
        const participantInterference = getNumeric(participantMetrics.stroop_interference_ms);

        const metricDescriptors = [
          {
            name: "accuracy_pct",
            values: accuracyValues,
            raw: participantAccuracy
          },
          {
            name: "rt_mean_ms",
            values: rtMeanValues,
            raw: participantRtMean
          },
          {
            name: "stroop_interference_ms",
            values: interferenceValues,
            raw: participantInterference
          }
        ];

        const normativeMetrics: Record<string, unknown> = {};
        const normativeUpsertRows: Array<Record<string, unknown>> = [];

        metricDescriptors.forEach((descriptor) => {
          const n = descriptor.values.length;
          const m = mean(descriptor.values);
          const sd = standardDeviation(descriptor.values);
          const z = sd > 0 ? (descriptor.raw - m) / sd : 0;
          const percentile = percentileRank(descriptor.values, descriptor.raw);
          const tScore = 50 + (10 * z);

          normativeMetrics[descriptor.name] = {
            raw: Number(descriptor.raw.toFixed(4)),
            n,
            mean: Number(m.toFixed(4)),
            sd: Number(sd.toFixed(4)),
            z_score: Number(z.toFixed(4)),
            percentile: Number(percentile.toFixed(2)),
            t_score: Number(tScore.toFixed(2))
          };

          normativeUpsertRows.push({
            protocol_version: protocolVersion,
            scoring_version: scoringVersion,
            age_band: participantAgeBand,
            schooling_band: participantSchoolingBand,
            metric_name: descriptor.name,
            n,
            mean: Number(m.toFixed(4)),
            sd: Number(sd.toFixed(4)),
            updated_at: new Date().toISOString()
          });
        });

        if (normativeUpsertRows.length) {
          const normUpsert = await supabase
            .from("normative_stats")
            .upsert(normativeUpsertRows, {
              onConflict: "protocol_version,scoring_version,age_band,schooling_band,metric_name"
            });

          if (normUpsert.error) {
            throw normUpsert.error;
          }
        }

        normative = {
          age_band: participantAgeBand,
          schooling_band: participantSchoolingBand,
          sample_n: stratumRows.length,
          metrics: normativeMetrics
        };
      }
    }

    return jsonResponse({
      ok: true,
      session_id: sessionId,
      protocol_version: protocolVersion,
      scoring_version: scoringVersion,
      schema_version: schemaVersion,
      trials_saved: trialRows.length,
      completed_at: completedAt,
      normative
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Unexpected error"
      },
      500
    );
  }
});
