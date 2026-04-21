(function () {
  const host = document.getElementById("jspsych-target");
  const badge = document.getElementById("participant-badge");
  const session = window.EnsinoApp.getSession();

  function renderError(message) {
    host.innerHTML = [
      '<div class="stroop-layout"><div class="stroop-frame">',
      "<h2>N&atilde;o foi poss&iacute;vel iniciar a tarefa</h2>",
      "<p>", message, "</p>",
      '<div class="button-row"><a class="button-link" href="index.html">Voltar para ENSINO</a></div>',
      "</div></div>"
    ].join("");
  }

  if (!session) {
    renderError("Nenhuma sess&atilde;o v&aacute;lida foi encontrada. Volte para a p&aacute;gina ENSINO, informe seus dados e tente novamente.");
    return;
  }

  if (!session.physicalKeyboardConfirmed) {
    renderError("Esta vers&atilde;o da tarefa exige teclado f&iacute;sico acoplado. Volte &agrave; p&aacute;gina ENSINO, confirme o uso de teclado e tente novamente.");
    return;
  }

  const eligibility = window.EnsinoApp.isDesktopEligible();
  if (!eligibility.ok) {
    renderError(eligibility.reason);
    return;
  }

  badge.textContent = session.participantId + " | " + (session.role === "professor" ? "Professor(a)" : "Aluno(a)");

  const scriptErrors = Array.isArray(window.__ensinoScriptErrors) ? window.__ensinoScriptErrors : [];
  if (
    typeof window.initJsPsych !== "function" ||
    typeof window.jsPsychHtmlKeyboardResponse === "undefined" ||
    typeof window.jsPsychCallFunction === "undefined" ||
    typeof window.jsPsychFullscreen === "undefined"
  ) {
    const extraDetails = scriptErrors.length ? " " + scriptErrors.join(" ") : "";
    renderError("Os arquivos do jsPsych n&atilde;o foram carregados corretamente. Verifique a conex&atilde;o com a internet, recarregue a p&aacute;gina e teste em uma aba normal do navegador." + extraDetails);
    return;
  }

  const keyMap = {
    s: { label: "S", name: "Azul", color: "#1f5ed6" },
    d: { label: "D", name: "Verde", color: "#178344" },
    k: { label: "K", name: "Vermelho", color: "#bf1e2e" },
    l: { label: "L", name: "Amarelo", color: "#d99a00" }
  };

  const colorKeys = Object.keys(keyMap);
  const neutralWords = ["CASA", "MESA", "LIVRO", "JANELA", "NUVEM", "TRILHO"];
  const colorWords = [
    { text: "AZUL", key: "s" },
    { text: "VERDE", key: "d" },
    { text: "VERMELHO", key: "k" },
    { text: "AMARELO", key: "l" }
  ];
  const fixationDurationMs = 500;
  const responseTimeoutMs = 3000;
  const isiMinMs = 500;
  const isiMaxMs = 1000;
  const practiceRepetitionsPerColor = 2;
  const experimentStartedAt = window.EnsinoApp.nowIso();
  const deviceMeta = {
    user_agent: navigator.userAgent || "",
    screen_width: window.screen && window.screen.width ? window.screen.width : 0,
    screen_height: window.screen && window.screen.height ? window.screen.height : 0,
    window_inner_width: window.innerWidth || 0,
    window_inner_height: window.innerHeight || 0,
    experiment_started_at: experimentStartedAt
  };

  function randomIntInclusive(minValue, maxValue) {
    return Math.floor(Math.random() * (maxValue - minValue + 1)) + minValue;
  }

  function getConditionLabel(trial) {
    return trial.stimulus_type === "incongruent_color_word" ? "I" : "C";
  }

  function buildTransitionType(previousCondition, currentCondition, startToken) {
    if (!previousCondition) {
      return (startToken || "START") + "->" + currentCondition;
    }
    return previousCondition + "->" + currentCondition;
  }

  function ageBand(ageYears) {
    const age = Number(ageYears);
    if (!Number.isFinite(age) || age < 18) {
      return "unknown";
    }
    if (age <= 24) {
      return "18-24";
    }
    if (age <= 34) {
      return "25-34";
    }
    if (age <= 44) {
      return "35-44";
    }
    if (age <= 54) {
      return "45-54";
    }
    return "55+";
  }

  function schoolingBand(schoolingYears) {
    const years = Number(schoolingYears);
    if (!Number.isFinite(years) || years < 1) {
      return "unknown";
    }
    if (years <= 11) {
      return "ate-11";
    }
    if (years <= 15) {
      return "12-15";
    }
    return "16+";
  }

  function parseNormativeCsv(text) {
    const lines = String(text || "").trim().split(/\r?\n/);
    if (lines.length < 2) {
      return [];
    }

    const headers = lines[0].split(",").map((item) => item.trim());
    return lines.slice(1).map((line) => {
      const values = line.split(",");
      const row = {};
      headers.forEach((header, index) => {
        row[header] = String(values[index] || "").trim();
      });
      return row;
    });
  }

  async function loadLocalNormativeRows() {
    try {
      const response = await fetch("../ANALISE-PILOTO-STROOP-SUPABASE/normative_stats_rows.csv", {
        cache: "no-store"
      });
      if (!response.ok) {
        return [];
      }
      const content = await response.text();
      return parseNormativeCsv(content);
    } catch (error) {
      return [];
    }
  }

  function buildLocalNormativeFeedback(normRows, participantMetrics) {
    if (!Array.isArray(normRows) || !normRows.length) {
      return null;
    }

    const participantAgeBand = ageBand(session.ageYears);
    const participantSchoolingBand = schoolingBand(session.schoolingYears);
    const protocolVersion = window.EnsinoApp.config.protocolVersion;
    const scoringVersion = window.EnsinoApp.config.scoringVersion;

    const rowsForStratum = normRows.filter((row) => {
      return row.protocol_version === protocolVersion
        && row.scoring_version === scoringVersion
        && row.age_band === participantAgeBand
        && row.schooling_band === participantSchoolingBand;
    });

    if (!rowsForStratum.length) {
      return null;
    }

    function metricEntry(metricName, rawValue) {
      const row = rowsForStratum.find((item) => item.metric_name === metricName);
      if (!row) {
        return null;
      }
      const meanValue = Number(row.mean);
      const sdValue = Number(row.sd);
      const raw = Number(rawValue);
      const zScore = sdValue > 0 ? (raw - meanValue) / sdValue : null;
      const tScore = zScore == null ? null : (50 + (10 * zScore));
      return {
        raw: Number.isFinite(raw) ? Number(raw.toFixed(4)) : null,
        n: Number(row.n) || 0,
        mean: Number.isFinite(meanValue) ? Number(meanValue.toFixed(4)) : null,
        sd: Number.isFinite(sdValue) ? Number(sdValue.toFixed(4)) : null,
        z_score: zScore == null ? null : Number(zScore.toFixed(4)),
        percentile: null,
        t_score: tScore == null ? null : Number(tScore.toFixed(2))
      };
    }

    const accuracyMetric = metricEntry("accuracy_pct", participantMetrics.accuracy_pct);
    const interferenceMetric = metricEntry("stroop_interference_ms", participantMetrics.stroop_interference_ms);

    if (!accuracyMetric && !interferenceMetric) {
      return null;
    }

    return {
      source: "local_csv",
      age_band: participantAgeBand,
      schooling_band: participantSchoolingBand,
      sample_n: Math.max(accuracyMetric ? accuracyMetric.n : 0, interferenceMetric ? interferenceMetric.n : 0),
      metrics: {
        accuracy_pct: accuracyMetric,
        stroop_interference_ms: interferenceMetric
      }
    };
  }

  function shuffle(array) {
    const copy = array.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const temp = copy[index];
      copy[index] = copy[swapIndex];
      copy[swapIndex] = temp;
    }
    return copy;
  }

  function createBlockOneTrials() {
    const trials = [];
    colorKeys.forEach((key) => {
      for (let repetition = 0; repetition < 6; repetition += 1) {
        trials.push({
          block: 1,
          block_name: "Neutro - c\u00edrculos coloridos",
          stimulus_type: "circle",
          stimulus_label: "c\u00edrculo",
          stimulus_color: keyMap[key].name,
          correct_key: key
        });
      }
    });
    return shuffle(trials);
  }

  function createPracticeTrials() {
    const trials = [];
    colorKeys.forEach((key) => {
      for (let repetition = 0; repetition < practiceRepetitionsPerColor; repetition += 1) {
        trials.push({
          block: 0,
          block_name: "Pr&aacute;tica",
          stimulus_type: "circle",
          stimulus_label: "c\u00edrculo",
          stimulus_color: keyMap[key].name,
          correct_key: key
        });
      }
    });
    return shuffle(trials);
  }

  function createBlockTwoTrials() {
    const trials = [];
    neutralWords.forEach((word) => {
      colorKeys.forEach((key) => {
        trials.push({
          block: 2,
          block_name: "Controle - palavras neutras",
          stimulus_type: "neutral_word",
          stimulus_label: word,
          stimulus_color: keyMap[key].name,
          correct_key: key
        });
      });
    });
    return shuffle(trials);
  }

  function createBlockThreeTrials() {
    const trials = [];
    colorWords.forEach((word) => {
      colorKeys.filter((key) => key !== word.key).forEach((key) => {
        for (let repetition = 0; repetition < 2; repetition += 1) {
          trials.push({
            block: 3,
            block_name: "Interfer\u00eancia - palavras incongruentes",
            stimulus_type: "incongruent_color_word",
            stimulus_label: word.text,
            stimulus_color: keyMap[key].name,
            correct_key: key
          });
        }
      });
    });
    return shuffle(trials);
  }

  function keyMapHtml() {
    return colorKeys.map((key) => {
      const item = keyMap[key];
      return [
        '<div class="stroop-key" style="background:', item.color, ';">',
        "<span>", item.label, "</span>",
        "<small>", item.name, "</small>",
        "</div>"
      ].join("");
    }).join("");
  }

  function stimulusHtml(trial) {
    const color = keyMap[trial.correct_key].color;
    const renderedStimulus = trial.stimulus_type === "circle"
      ? '<div class="stroop-circle" style="background:' + color + ';"></div>'
      : '<div class="stroop-word" style="color:' + color + ';">' + trial.stimulus_label + "</div>";

    return [
      '<div class="stroop-layout"><div class="stroop-frame">',
      '<div class="stroop-keymap">', keyMapHtml(), "</div>",
      '<div class="stroop-stimulus">', renderedStimulus, "</div>",
      "</div></div>"
    ].join("");
  }

  function instructionPage(title, bodyHtml) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      stimulus: [
        '<div class="stroop-layout"><div class="stroop-frame">',
        "<h2>", title, "</h2>",
        bodyHtml,
        '<p class="stroop-caption">Pressione ESPA&Ccedil;O para continuar.</p>',
        "</div></div>"
      ].join(""),
      choices: [" "]
    };
  }

  function fixationTrial(blockNumber) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      stimulus: '<div class="stroop-layout"><div class="stroop-frame"><div class="stroop-word" style="color:#1f3f55;">+</div></div></div>',
      choices: "NO_KEYS",
      trial_duration: fixationDurationMs,
      data: {
        task: "fixation",
        block: blockNumber
      }
    };
  }

  function experimentTrial(trial, indexInBlock, options) {
    const trialOptions = options || {};
    return {
      type: jsPsychHtmlKeyboardResponse,
      stimulus: stimulusHtml(trial),
      choices: colorKeys,
      response_ends_trial: true,
      trial_duration: responseTimeoutMs,
      post_trial_gap: randomIntInclusive(isiMinMs, isiMaxMs),
      data: {
        task: "stroop",
        is_practice: Boolean(trialOptions.isPractice),
        transition_type: trialOptions.transitionType || "START->NA",
        post_error: false,
        session_started_at: session.startedAt,
        role: session.role,
        email: session.email,
        participant_id: session.participantId,
        block: trial.block,
        block_name: trial.block_name,
        trial_index_in_block: indexInBlock + 1,
        stimulus_type: trial.stimulus_type,
        stimulus_label: trial.stimulus_label,
        stimulus_color: trial.stimulus_color,
        correct_key: trial.correct_key
      },
      on_finish: function (data) {
        data.response_key = data.response || "";
        data.correct = data.response === trial.correct_key ? 1 : 0;
        data.timed_out = data.response == null ? 1 : 0;
        data.correct_bool = Number(data.correct) === 1;
        data.timed_out_bool = Number(data.timed_out) === 1;
        data.rt_ms = data.rt == null ? "" : Math.round(data.rt);
        data.post_error = Boolean(window.__stroopLastWasError || false);
        window.__stroopLastWasError = Number(data.correct) === 0;
      }
    };
  }

  function makeBlockTimeline(blockTrials, introTitle, introBody, options) {
    const timelineOptions = options || {};
    const timeline = [instructionPage(introTitle, introBody)];
    const startToken = timelineOptions.isPractice ? "PRACTICE_START" : "BLOCK_START";
    let previousCondition = null;
    timeline.push({
      type: jsPsychCallFunction,
      func: function () {
        window.__stroopLastWasError = false;
      }
    });
    blockTrials.forEach((trial, index) => {
      const currentCondition = getConditionLabel(trial);
      const transitionType = buildTransitionType(previousCondition, currentCondition, startToken);
      previousCondition = currentCondition;
      timeline.push(fixationTrial(trial.block));
      timeline.push(experimentTrial(trial, index, {
        isPractice: Boolean(timelineOptions.isPractice),
        transitionType
      }));
    });
    return timeline;
  }

  function summarizeRows(rows) {
    const blockNames = {
      1: "Neutro - c\u00edrculos coloridos",
      2: "Controle - palavras neutras",
      3: "Interfer\u00eancia"
    };

    return [1, 2, 3].map((block) => {
      const blockRows = rows.filter((row) => Number(row.block) === block);
      const correctRows = blockRows.filter((row) => Number(row.correct) === 1 && Number(row.rt_ms) > 0);
      const meanRt = correctRows.length
        ? Math.round(correctRows.reduce((sum, row) => sum + Number(row.rt_ms), 0) / correctRows.length)
        : 0;
      const accuracy = blockRows.length
        ? ((blockRows.reduce((sum, row) => sum + Number(row.correct), 0) / blockRows.length) * 100).toFixed(1)
        : "0.0";

      return {
        block,
        name: blockNames[block],
        trials: blockRows.length,
        correct: blockRows.reduce((sum, row) => sum + Number(row.correct), 0),
        accuracy,
        meanRt
      };
    });
  }

  function mean(values) {
    if (!values.length) {
      return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function median(values) {
    if (!values.length) {
      return 0;
    }
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  function standardDeviation(values) {
    if (values.length < 2) {
      return 0;
    }
    const valueMean = mean(values);
    const variance = values.reduce((sum, value) => sum + Math.pow(value - valueMean, 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
  }

  function trimmedMean(values, trimRatio) {
    if (!values.length) {
      return 0;
    }
    const sorted = values.slice().sort((a, b) => a - b);
    const trimCount = Math.floor(sorted.length * trimRatio);
    const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
    const base = trimmed.length ? trimmed : sorted;
    return mean(base);
  }

  function calculateRtStats(rows) {
    const values = rows.map((row) => Number(row.rt_ms)).filter((value) => Number.isFinite(value) && value > 0);
    const meanValue = mean(values);
    const medianValue = median(values);
    const sdValue = standardDeviation(values);
    return {
      count: values.length,
      mean: Math.round(meanValue),
      median: Math.round(medianValue),
      sd: Math.round(sdValue),
      trimmedMean: Math.round(trimmedMean(values, 0))
    };
  }

  function removeIntraParticipantOutliers(rows) {
    const byBlock = rows.reduce((accumulator, row) => {
      const key = String(row.block);
      if (!accumulator[key]) {
        accumulator[key] = [];
      }
      accumulator[key].push(row);
      return accumulator;
    }, {});

    const kept = [];
    Object.keys(byBlock).forEach((blockKey) => {
      const blockRows = byBlock[blockKey];
      const values = blockRows.map((row) => Number(row.rt_ms));
      const blockMean = mean(values);
      const blockSd = standardDeviation(values);

      if (!blockSd) {
        kept.push.apply(kept, blockRows);
        return;
      }

      const lower = blockMean - (2.5 * blockSd);
      const upper = blockMean + (2.5 * blockSd);

      blockRows.forEach((row) => {
        const value = Number(row.rt_ms);
        if (value >= lower && value <= upper) {
          kept.push(row);
        }
      });
    });

    return kept;
  }

  function buildScoring(trialRows) {
    const thresholds = {
      minAccuracyPct: 75,
      minMeanRtMs: 300,
      maxMeanRtMs: 3000,
      minValidRtMs: 200,
      maxValidRtMs: 2500,
      maxFastRtRatio: 0.1
    };

    const analysisRows = trialRows.filter((row) => !row.is_practice);
    const totalTrials = analysisRows.length;
    const correctTrials = analysisRows.reduce((sum, row) => sum + Number(row.correct), 0);
    const timeoutTrials = analysisRows.reduce((sum, row) => sum + Number(row.timed_out), 0);
    const errorTrials = analysisRows.reduce((sum, row) => sum + (Number(row.correct) === 0 && Number(row.timed_out) === 0 ? 1 : 0), 0);
    const accuracyPct = totalTrials ? (correctTrials / totalTrials) * 100 : 0;

    const correctRtRows = analysisRows.filter((row) => Number(row.correct) === 1 && Number(row.rt_ms) > 0);
    const fastRtCount = correctRtRows.filter((row) => Number(row.rt_ms) < thresholds.minValidRtMs).length;
    const fastRtRatio = correctRtRows.length ? fastRtCount / correctRtRows.length : 0;

    const validRtRows = correctRtRows.filter((row) => {
      const rt = Number(row.rt_ms);
      return rt >= thresholds.minValidRtMs && rt <= thresholds.maxValidRtMs;
    });

    const finalRtStats = calculateRtStats(validRtRows);

    const byBlock = [1, 2, 3].map((block) => {
      const blockRows = analysisRows.filter((row) => Number(row.block) === block);
      const blockRtRows = validRtRows.filter((row) => Number(row.block) === block);
      const blockAccuracy = blockRows.length
        ? (blockRows.reduce((sum, row) => sum + Number(row.correct), 0) / blockRows.length) * 100
        : 0;
      const blockStats = calculateRtStats(blockRtRows);
      return {
        block,
        total_trials: blockRows.length,
        accuracy_pct: Number(blockAccuracy.toFixed(2)),
        rt_mean_ms: blockStats.mean,
        rt_median_ms: blockStats.median,
        rt_sd_ms: blockStats.sd,
        rt_trimmed_mean_ms: blockStats.trimmedMean,
        rt_valid_n: blockStats.count
      };
    });

    const control = byBlock.find((block) => block.block === 2);
    const incongruent = byBlock.find((block) => block.block === 3);
    const stroopInterferenceMs = control && incongruent
      ? Math.round(Number(incongruent.rt_mean_ms || 0) - Number(control.rt_mean_ms || 0))
      : 0;

    const exclusionReasons = [];
    if (accuracyPct < thresholds.minAccuracyPct) {
      exclusionReasons.push("acuracia_global_abaixo_75");
    }

    if (!finalRtStats.count || finalRtStats.mean < thresholds.minMeanRtMs || finalRtStats.mean > thresholds.maxMeanRtMs) {
      exclusionReasons.push("rt_medio_fora_300_3000");
    }

    if (fastRtRatio >= thresholds.maxFastRtRatio) {
      exclusionReasons.push("respostas_rapidas_maior_igual_10pct");
    }

    const redFlags = [];
    if (finalRtStats.count && finalRtStats.sd > finalRtStats.mean) {
      redFlags.push("sd_rt_maior_que_media_rt");
    }

    return {
      thresholds,
      quality: {
        excluded_participant: exclusionReasons.length > 0,
        exclusion_reasons: exclusionReasons,
        red_flags: redFlags,
        removed_trials_practice: trialRows.length - analysisRows.length,
        removed_trials_incorrect_or_timeout: analysisRows.length - correctRtRows.length,
        removed_trials_rt_window: correctRtRows.length - validRtRows.length,
        fast_rt_ratio_pct: Number((fastRtRatio * 100).toFixed(2))
      },
      participant_metrics: {
        total_trials: totalTrials,
        correct_trials: correctTrials,
        error_trials: errorTrials,
        timeout_trials: timeoutTrials,
        omission_rate_pct: totalTrials ? Number(((timeoutTrials / totalTrials) * 100).toFixed(2)) : 0,
        accuracy_pct: Number(accuracyPct.toFixed(2)),
        rt_mean_ms: finalRtStats.mean,
        rt_median_ms: finalRtStats.median,
        rt_sd_ms: finalRtStats.sd,
        rt_trimmed_mean_ms: finalRtStats.trimmedMean,
        rt_valid_n: finalRtStats.count,
        stroop_interference_ms: stroopInterferenceMs,
        z_accuracy: null,
        z_interference: null
      },
      by_block: byBlock,
      cleaned_rows_for_rt: validRtRows,
      pre_outlier_rt_stats: finalRtStats
    };
  }

  const jsPsych = initJsPsych({
    display_element: "jspsych-target",
    on_finish: async function () {
      const completedAt = window.EnsinoApp.nowIso();
      const trialRows = jsPsych.data.get().filter({ task: "stroop" }).values().map((row) => ({
        protocol_version: session.protocolVersion || window.EnsinoApp.config.protocolVersion,
        scoring_version: session.scoringVersion || window.EnsinoApp.config.scoringVersion,
        schema_version: session.schemaVersion || window.EnsinoApp.config.schemaVersion,
        session_started_at: row.session_started_at,
        completed_at: completedAt,
        role: row.role,
        email: row.email,
        participant_id: row.participant_id,
        age_years: session.ageYears,
        schooling_years: session.schoolingYears,
        color_blindness: session.colorBlindness,
        mother_tongue: session.motherTongue,
        digital_familiarity: session.digitalFamiliarity,
        user_agent: row.user_agent,
        screen_width: row.screen_width,
        screen_height: row.screen_height,
        window_inner_width: row.window_inner_width,
        window_inner_height: row.window_inner_height,
        experiment_started_at: row.experiment_started_at,
        block: row.block,
        block_name: row.block_name,
        trial_index_in_block: row.trial_index_in_block,
        is_practice: Boolean(row.is_practice),
        transition_type: row.transition_type,
        post_error: Boolean(row.post_error),
        stimulus_type: row.stimulus_type,
        stimulus_label: row.stimulus_label,
        stimulus_color: row.stimulus_color,
        correct_key: row.correct_key,
        response_key: row.response_key,
        correct: row.correct,
        timed_out: row.timed_out,
        correct_bool: Boolean(row.correct_bool),
        timed_out_bool: Boolean(row.timed_out_bool),
        rt_ms: row.rt_ms
      }));

      const scoring = buildScoring(trialRows);
      const localNormRows = await loadLocalNormativeRows();
      const localNormative = buildLocalNormativeFeedback(localNormRows, scoring.participant_metrics);
      if (localNormative && localNormative.metrics) {
        scoring.participant_metrics.z_accuracy = localNormative.metrics.accuracy_pct
          ? localNormative.metrics.accuracy_pct.z_score
          : null;
        scoring.participant_metrics.z_interference = localNormative.metrics.stroop_interference_ms
          ? localNormative.metrics.stroop_interference_ms.z_score
          : null;
      }

      const summary = {
        session,
        completedAt,
        protocolVersion: window.EnsinoApp.config.protocolVersion,
        scoringVersion: window.EnsinoApp.config.scoringVersion,
        schemaVersion: window.EnsinoApp.config.schemaVersion,
        blockSummaries: summarizeRows(trialRows),
        scoring
      };

      window.EnsinoApp.saveLastResult(summary);

      const safeId = session.participantId + "-" + completedAt.slice(0, 19).replace(/[:T]/g, "-");
      const csvContent = window.EnsinoApp.trialsToCsv(trialRows);
      const txtContent = window.EnsinoApp.buildSummaryText(summary);
      const csvFilename = "stroop-victoria-" + safeId + ".csv";
      const txtFilename = "stroop-victoria-" + safeId + ".txt";
      const csvUrl = window.EnsinoApp.createDownloadUrl(csvContent, "text/csv;charset=utf-8");
      const txtUrl = window.EnsinoApp.createDownloadUrl(txtContent, "text/plain;charset=utf-8");

      window.EnsinoApp.downloadText(csvFilename, csvContent, "text/csv;charset=utf-8");
      window.EnsinoApp.downloadText(txtFilename, txtContent, "text/plain;charset=utf-8");

      let backendResult = null;
      try {
        const sessionPayload = {
          protocolVersion: session.protocolVersion,
          scoringVersion: session.scoringVersion,
          schemaVersion: session.schemaVersion,
          role: session.role,
          email: session.email,
          participantId: session.participantId,
          ageYears: session.ageYears,
          schoolingYears: session.schoolingYears,
          colorBlindness: session.colorBlindness,
          motherTongue: session.motherTongue,
          digitalFamiliarity: session.digitalFamiliarity,
          computerExperience: session.computerExperience,
          handedness: session.handedness,
          sensoryNotes: session.sensoryNotes,
          physicalKeyboardConfirmed: session.physicalKeyboardConfirmed,
          startedAt: session.startedAt,
          experimentStartedAt: experimentStartedAt,
          userAgent: deviceMeta.user_agent,
          screenWidth: deviceMeta.screen_width,
          screenHeight: deviceMeta.screen_height,
          windowInnerWidth: deviceMeta.window_inner_width,
          windowInnerHeight: deviceMeta.window_inner_height
        };

        backendResult = await window.EnsinoApp.postResults({
          session: sessionPayload,
          completedAt,
          participantMetrics: scoring.participant_metrics,
          blockMetrics: scoring.by_block,
          quality: scoring.quality,
          trials: trialRows,
          cleanedTrialsForRt: scoring.cleaned_rows_for_rt
        });
      } catch (error) {
        console.error("[Stroop] Falha no envio final para Edge Function:", error);
      }

      const byBlockHtml = scoring.by_block.map((block) => {
        return [
          '<article class="result-card">',
          "<h3>Bloco ", block.block, "</h3>",
          "<p><strong>Acur&aacute;cia:</strong> ", block.accuracy_pct.toFixed(2), "%</p>",
          "<p><strong>RT m&eacute;dio:</strong> ", block.rt_mean_ms, " ms</p>",
          "<p><strong>RT mediano:</strong> ", block.rt_median_ms, " ms</p>",
          "<p><strong>RT DP:</strong> ", block.rt_sd_ms, " ms</p>",
          "<p><strong>RT m&eacute;dio trimado:</strong> ", block.rt_trimmed_mean_ms, " ms</p>",
          "<p><strong>N RT v&aacute;lido:</strong> ", block.rt_valid_n, "</p>",
          "</article>"
        ].join("");
      }).join("");

      const participantMetrics = scoring.participant_metrics;
      const qualityStatus = scoring.quality.excluded_participant
        ? `<p class="status-box error"><strong>Status de qualidade:</strong> dados exclu&iacute;dos para norma (${window.EnsinoApp.escapeHtml(scoring.quality.exclusion_reasons.join(", "))}).</p>`
        : '<p class="status-box success"><strong>Status de qualidade:</strong> participante eleg&iacute;vel para an&aacute;lise normativa desta vers&atilde;o.</p>';

      const redFlags = scoring.quality.red_flags.length
        ? `<p class="status-box warning"><strong>Red flags:</strong> ${window.EnsinoApp.escapeHtml(scoring.quality.red_flags.join(", "))}</p>`
        : "";

      const backendInfo = backendResult && !backendResult.skipped
        ? '<p class="status-box success">Envio para backend conclu&iacute;do.</p>'
        : '<p class="status-box warning">Backend n&atilde;o configurado ou indispon&iacute;vel. Os arquivos locais foram preservados.</p>';

      const normativeData = localNormative || (backendResult && backendResult.body && backendResult.body.normative
        ? backendResult.body.normative
        : null);

      if (normativeData && normativeData.metrics) {
        const normAccuracy = normativeData.metrics.accuracy_pct || {};
        const normInterference = normativeData.metrics.stroop_interference_ms || {};
        scoring.participant_metrics.z_accuracy = normAccuracy.z_score ?? null;
        scoring.participant_metrics.z_interference = normInterference.z_score ?? null;
      }

      function formatNormativeNumber(value, decimals) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed.toFixed(decimals) : "-";
      }

      let normativeHtml = '<p class="status-box warning"><strong>Normas din&acirc;micas:</strong> indispon&iacute;veis para este estrato ou vers&atilde;o (sem CSV local ou retorno do backend).</p>';

      if (normativeData && normativeData.metrics) {
        const metrics = normativeData.metrics;
        const metricCards = [
          { key: "accuracy_pct", title: "Acur&aacute;cia (%)" },
          { key: "stroop_interference_ms", title: "Interfer&ecirc;ncia Stroop (ms)" }
        ].map((descriptor) => {
          const data = metrics[descriptor.key] || {};
          return [
            '<article class="result-card">',
            "<h3>", descriptor.title, "</h3>",
            "<p><strong>Bruto:</strong> ", formatNormativeNumber(data.raw, 2), "</p>",
            "<p><strong>M&eacute;dia do estrato:</strong> ", formatNormativeNumber(data.mean, 2), "</p>",
            "<p><strong>DP do estrato:</strong> ", formatNormativeNumber(data.sd, 2), "</p>",
            "<p><strong>z-score:</strong> ", formatNormativeNumber(data.z_score, 2), "</p>",
            "<p><strong>Percentil:</strong> ", formatNormativeNumber(data.percentile, 1), "</p>",
            "<p><strong>T-score:</strong> ", formatNormativeNumber(data.t_score, 1), "</p>",
            "<p><strong>N estrato:</strong> ", formatNormativeNumber(data.n, 0), "</p>",
            "</article>"
          ].join("");
        }).join("");

        normativeHtml = [
          '<article class="result-card">',
          "<h3>Compara&ccedil;&atilde;o normativa din&acirc;mica</h3>",
          "<p><strong>Faixa et&aacute;ria:</strong> ", window.EnsinoApp.escapeHtml(String(normativeData.age_band || "-")), "</p>",
          "<p><strong>Faixa de escolaridade:</strong> ", window.EnsinoApp.escapeHtml(String(normativeData.schooling_band || "-")), "</p>",
          "<p><strong>Amostra v&aacute;lida no estrato:</strong> ", formatNormativeNumber(normativeData.sample_n, 0), "</p>",
          "<p><strong>Fonte:</strong> ", window.EnsinoApp.escapeHtml(String(normativeData.source || "backend")), "</p>",
          "</article>",
          '<div class="task-grid">', metricCards, "</div>"
        ].join("");
      }

      jsPsych.getDisplayElement().innerHTML = [
        '<div class="stroop-layout"><div class="stroop-frame">',
        "<h2>Tarefa conclu&iacute;da</h2>",
        "<p>Os arquivos de resultado foram gerados para download neste navegador. Se o navegador bloquear a transfer&ecirc;ncia autom&aacute;tica, use os links abaixo.</p>",
        qualityStatus,
        redFlags,
        backendInfo,
        '<article class="result-card">',
        "<h3>Desempenho bruto (participante)</h3>",
        "<p><strong>Acur&aacute;cia total:</strong> ", participantMetrics.accuracy_pct.toFixed(2), "%</p>",
        "<p><strong>Erros:</strong> ", participantMetrics.error_trials, "</p>",
        "<p><strong>Timeouts/omiss&otilde;es:</strong> ", participantMetrics.timeout_trials, " (", participantMetrics.omission_rate_pct.toFixed(2), "%)</p>",
        "<p><strong>RT m&eacute;dio:</strong> ", participantMetrics.rt_mean_ms, " ms</p>",
        "<p><strong>RT mediano:</strong> ", participantMetrics.rt_median_ms, " ms</p>",
        "<p><strong>RT DP:</strong> ", participantMetrics.rt_sd_ms, " ms</p>",
        "<p><strong>RT m&eacute;dio trimado:</strong> ", participantMetrics.rt_trimmed_mean_ms, " ms</p>",
        "<p><strong>Interfer&ecirc;ncia Stroop (B3 - B2):</strong> ", participantMetrics.stroop_interference_ms, " ms</p>",
        "</article>",
        "<h3>M&eacute;tricas por bloco</h3>",
        '<div class="task-grid">', byBlockHtml, "</div>",
        normativeHtml,
        '<article class="result-card" style="text-align:left;">',
        "<h3>Guia de Interpreta&ccedil;&atilde;o dos Resultados (Stroop Test)</h3>",
        "<h4>1. Indicadores de Qualidade e Desempenho</h4>",
        "<p><strong>Acur&aacute;cia Total (%):</strong> Reflete a precis&atilde;o da tarefa. Em testes de tempo de rea&ccedil;&atilde;o, uma acur&aacute;cia muito baixa pode sugerir que o participante n&atilde;o compreendeu as instru&ccedil;&otilde;es ou respondeu ao acaso, invalidando as m&eacute;tricas de tempo.</p>",
        "<p><strong>RT M&eacute;dio Trimado (ms):</strong> &Eacute; a m&eacute;dia calculada ap&oacute;s a remo&ccedil;&atilde;o de outliers (ex: 5% das respostas mais lentas e mais r&aacute;pidas). Pedagogicamente, usamos essa medida para obter uma estimativa mais robusta do desempenho real, minimizando o ru&iacute;do de distra&ccedil;&otilde;es moment&acirc;neas.</p>",
        "<h4>2. Din&acirc;mica do Tempo de Resposta (RT)</h4>",
        "<p><strong>M&eacute;dia vs. Mediana (ms):</strong> Enquanto a M&eacute;dia &eacute; a tend&ecirc;ncia central cl&aacute;ssica, a Mediana representa o valor central exato da amostra. Se houver grande diferen&ccedil;a entre elas, indica que a distribui&ccedil;&atilde;o de tempo do aluno foi assim&eacute;trica (presen&ccedil;a de respostas muito lentas).</p>",
        "<p><strong>Desvio-Padr&atilde;o (DP):</strong> Indica a variabilidade intraindiv&iacute;duo. Valores altos sugerem instabilidade no controle atencional ao longo do teste; valores baixos sugerem maior consist&ecirc;ncia na execu&ccedil;&atilde;o.</p>",
        "<h4>3. O Efeito de Interfer&ecirc;ncia (O Cora&ccedil;&atilde;o do Teste)</h4>",
        "<p><strong>Efeito Stroop (Interfer&ecirc;ncia):</strong> Calculado pela diferen&ccedil;a entre o RT do bloco 3 incongruente e do bloco 2. Representa o custo cognitivo adicional para inibir a leitura autom&aacute;tica da palavra e focar apenas na cor. &Eacute; a medida experimental que isola a fun&ccedil;&atilde;o executiva de controle inibit&oacute;rio.</p>",
        "<h4>4. Escores Padronizados (Interpreta&ccedil;&atilde;o Normativa)</h4>",
        "<p>Para entender onde o aluno se posiciona em rela&ccedil;&atilde;o a uma popula&ccedil;&atilde;o de refer&ecirc;ncia:</p>",
        "<p><strong>z-score:</strong> Indica quantos desvios-padr&atilde;o o resultado est&aacute; acima ou abaixo da m&eacute;dia do grupo. F&oacute;rmula: <strong>z = (x - &mu;) / &sigma;</strong>.</p>",
        "<p><strong>T-score:</strong> Uma transforma&ccedil;&atilde;o do z-score para facilitar a leitura, evitando n&uacute;meros negativos e decimais. F&oacute;rmula: <strong>T = 50 + 10z</strong>.</p>",
        "<p><strong>Percentil:</strong> Indica a porcentagem de pessoas que pontuaram igual ou abaixo do aluno. Um percentil 75 significa que o desempenho foi superior a 75% da amostra normativa.</p>",
        "</article>",
        '<article class="result-card" style="text-align:left;">',
        "<h3>Refer&ecirc;ncias bibliogr&aacute;ficas</h3>",
        "<p>Stroop, J. R. (1935). Studies of interference in serial verbal reactions. Journal of Experimental Psychology, 18(6), 643-662.</p>",
        "<p>Regard, M., Potgieter, J., & Van Zomeren, A. (1982). The Victoria version of the Stroop Test.</p>",
        "<p>de Schryver, M., Hughes, J., Rosseel, Y., & De Houwer, J. (2018). Unreliable difference scores in the Stroop task? Psychological Assessment, 30(5), 691-700.</p>",
        "<p>de Leeuw, J. R. (2015). jsPsych: A JavaScript library for creating behavioral experiments in a Web browser. Behavior Research Methods, 47, 1-12.</p>",
        "<p>Autor - Guilherme Delmolin - 2026</p>",
        "</article>",
        '<div class="button-row">',
        '<a class="button-link" download="', csvFilename, '" href="', csvUrl, '">Baixar CSV</a>',
        '<a class="button-link secondary" download="', txtFilename, '" href="', txtUrl, '">Baixar TXT</a>',
        "</div>",
        '<div class="button-row">',
        '<a class="button-link" href="index.html">Voltar para ENSINO</a>',
        '<a class="button-link secondary" href="stroop-victoria.html">Repetir tarefa</a>',
        "</div>",
        "</div></div>"
      ].join("");
    }
  });

  jsPsych.data.addProperties(deviceMeta);

  const timeline = [];
  const practiceTrials = createPracticeTrials();
  const blockOne = createBlockOneTrials();
  const blockTwo = createBlockTwoTrials();
  const blockThree = createBlockThreeTrials();

  timeline.push({
    type: jsPsychCallFunction,
    func: function () {
      document.title = "Stroop Victoria | " + session.participantId;
    }
  });

  timeline.push({
    type: jsPsychFullscreen,
    fullscreen_mode: true,
    message: "<p>A tarefa ser&aacute; apresentada em tela cheia para reduzir distra&ccedil;&otilde;es.</p>",
    button_label: "Entrar em tela cheia"
  });

  timeline.push(instructionPage(
    "Stroop Victoria",
    [
      "<p>Voc&ecirc; ver&aacute; est&iacute;mulos em diferentes cores e deve responder &agrave; <strong>cor</strong>, n&atilde;o ao significado da palavra.</p>",
      "<p>Cada tentativa tem limite de <strong>3 segundos</strong>. Se n&atilde;o houver resposta, o sistema registra omiss&atilde;o (timeout).</p>",
      "<p>Mapeamento das teclas:</p>",
      "<ul>",
      "<li><strong>S</strong> = Azul</li>",
      "<li><strong>D</strong> = Verde</li>",
      "<li><strong>K</strong> = Vermelho</li>",
      "<li><strong>L</strong> = Amarelo</li>",
      "</ul>",
      "<p>Mantenha os dedos apoiados nas teclas S, D, K e L para responder com mais consist&ecirc;ncia.</p>",
      "<p>Responda o mais r&aacute;pido e corretamente poss&iacute;vel.</p>"
    ].join("")
  ));

  timeline.push(...makeBlockTimeline(
    practiceTrials,
    "Bloco de Pr&aacute;tica",
    "<p>Este bloco &eacute; apenas para treinar o mapeamento de teclas. Esses ensaios n&atilde;o entram na an&aacute;lise principal.</p><p>Pressione ESPA&Ccedil;O para iniciar.</p>",
    { isPractice: true }
  ));

  timeline.push(...makeBlockTimeline(
    blockOne,
    "Bloco 1 de 3",
    "<p>Neste bloco, os est&iacute;mulos s&atilde;o c&iacute;rculos coloridos. Responda &agrave; cor apresentada.</p><p>Pressione ESPA&Ccedil;O para iniciar.</p>"
  ));

  timeline.push(...makeBlockTimeline(
    blockTwo,
    "Bloco 2 de 3",
    "<p>Neste bloco, voc&ecirc; ver&aacute; palavras neutras em diferentes cores. Ignore a palavra e responda somente &agrave; cor.</p><p>Pressione ESPA&Ccedil;O para iniciar.</p>"
  ));

  timeline.push(...makeBlockTimeline(
    blockThree,
    "Bloco 3 de 3",
    "<p>Neste bloco, voc&ecirc; ver&aacute; palavras de cores apresentadas em cor incongruente. Ignore o significado da palavra e responda somente &agrave; cor da tinta.</p><p>Pressione ESPA&Ccedil;O para iniciar.</p>"
  ));

  timeline.push({
    type: jsPsychFullscreen,
    fullscreen_mode: false
  });

  jsPsych.run(timeline);
})();
