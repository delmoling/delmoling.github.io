(function () {
  const host = document.getElementById("jspsych-target");
  const badge = document.getElementById("participant-badge");
  const session = window.EnsinoApp.getSession();

  function renderError(message) {
    host.innerHTML = [
      '<div class="stroop-layout"><div class="stroop-frame">',
      "<h2>Nao foi possivel iniciar a tarefa</h2>",
      "<p>", message, "</p>",
      '<div class="button-row"><a class="button-link" href="index.html">Voltar para ENSINO</a></div>',
      "</div></div>"
    ].join("");
  }

  if (!session) {
    renderError("Nenhuma sessao valida foi encontrada. Volte para a pagina ENSINO, informe seus dados e tente novamente.");
    return;
  }

  if (!session.physicalKeyboardConfirmed) {
    renderError("Esta versao da tarefa exige teclado fisico acoplado. Volte a pagina ENSINO, confirme o uso de teclado e tente novamente.");
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
    renderError("Os arquivos do jsPsych nao foram carregados corretamente. Verifique a conexao com a internet, recarregue a pagina e teste em uma aba normal do navegador." + extraDetails);
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
          block_name: "Neutro - circulos coloridos",
          stimulus_type: "circle",
          stimulus_label: "circulo",
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
            block_name: "Interferencia - palavras incongruentes",
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
      '<p class="stroop-caption">Responda a cor usando S, D, K e L o mais rapido e corretamente possivel.</p>',
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
        '<p class="stroop-caption">Pressione ESPACO para continuar.</p>',
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
      trial_duration: 500,
      data: {
        task: "fixation",
        block: blockNumber
      }
    };
  }

  function experimentTrial(trial, indexInBlock) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      stimulus: stimulusHtml(trial),
      choices: colorKeys,
      response_ends_trial: true,
      trial_duration: 3000,
      data: {
        task: "stroop",
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
        data.rt_ms = data.rt == null ? "" : Math.round(data.rt);
      }
    };
  }

  function makeBlockTimeline(blockTrials, introTitle, introBody) {
    const timeline = [instructionPage(introTitle, introBody)];
    blockTrials.forEach((trial, index) => {
      timeline.push(fixationTrial(trial.block));
      timeline.push(experimentTrial(trial, index));
    });
    return timeline;
  }

  function summarizeRows(rows) {
    const blockNames = {
      1: "Neutro - circulos coloridos",
      2: "Controle - palavras neutras",
      3: "Interferencia"
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
      trimmedMean: Math.round(trimmedMean(values, 0.1))
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
      maxValidRtMs: 4000,
      maxFastRtRatio: 0.1
    };

    const totalTrials = trialRows.length;
    const correctTrials = trialRows.reduce((sum, row) => sum + Number(row.correct), 0);
    const timeoutTrials = trialRows.reduce((sum, row) => sum + Number(row.timed_out), 0);
    const errorTrials = trialRows.reduce((sum, row) => sum + (Number(row.correct) === 0 && Number(row.timed_out) === 0 ? 1 : 0), 0);
    const accuracyPct = totalTrials ? (correctTrials / totalTrials) * 100 : 0;

    const fastRtCount = trialRows.filter((row) => Number(row.rt_ms) > 0 && Number(row.rt_ms) < thresholds.minValidRtMs).length;
    const fastRtRatio = totalTrials ? fastRtCount / totalTrials : 0;

    const step1Rows = trialRows.filter((row) => {
      const rt = Number(row.rt_ms);
      return Number(row.correct) === 1 && rt >= thresholds.minValidRtMs && rt <= thresholds.maxValidRtMs;
    });

    const step1Stats = calculateRtStats(step1Rows);
    const step3Rows = removeIntraParticipantOutliers(step1Rows);
    const finalRtStats = calculateRtStats(step3Rows);

    const byBlock = [1, 2, 3].map((block) => {
      const blockRows = trialRows.filter((row) => Number(row.block) === block);
      const blockRtRows = step3Rows.filter((row) => Number(row.block) === block);
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
        removed_trials_step1: totalTrials - step1Rows.length,
        removed_trials_step3: step1Rows.length - step3Rows.length,
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
        stroop_interference_ms: stroopInterferenceMs
      },
      by_block: byBlock,
      cleaned_rows_for_rt: step3Rows,
      pre_outlier_rt_stats: step1Stats
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
        block: row.block,
        block_name: row.block_name,
        trial_index_in_block: row.trial_index_in_block,
        stimulus_type: row.stimulus_type,
        stimulus_label: row.stimulus_label,
        stimulus_color: row.stimulus_color,
        correct_key: row.correct_key,
        response_key: row.response_key,
        correct: row.correct,
        timed_out: row.timed_out,
        rt_ms: row.rt_ms
      }));

      const scoring = buildScoring(trialRows);

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
        backendResult = await window.EnsinoApp.postResults({
          session,
          participantMetrics: scoring.participant_metrics,
          blockMetrics: scoring.by_block,
          quality: scoring.quality,
          trials: trialRows
        });
      } catch (error) {
        console.error("[Stroop] Falha no envio final para Edge Function:", error);
      }

      const byBlockHtml = scoring.by_block.map((block) => {
        return [
          '<article class="result-card">',
          "<h3>Bloco ", block.block, "</h3>",
          "<p><strong>Acuracia:</strong> ", block.accuracy_pct.toFixed(2), "%</p>",
          "<p><strong>RT medio:</strong> ", block.rt_mean_ms, " ms</p>",
          "<p><strong>RT mediano:</strong> ", block.rt_median_ms, " ms</p>",
          "<p><strong>RT DP:</strong> ", block.rt_sd_ms, " ms</p>",
          "<p><strong>RT medio trimado:</strong> ", block.rt_trimmed_mean_ms, " ms</p>",
          "<p><strong>N RT valido:</strong> ", block.rt_valid_n, "</p>",
          "</article>"
        ].join("");
      }).join("");

      const participantMetrics = scoring.participant_metrics;
      const qualityStatus = scoring.quality.excluded_participant
        ? `<p class="status-box error"><strong>Status de qualidade:</strong> dados excluidos para norma (${window.EnsinoApp.escapeHtml(scoring.quality.exclusion_reasons.join(", "))}).</p>`
        : '<p class="status-box success"><strong>Status de qualidade:</strong> participante elegivel para analise normativa desta versao.</p>';

      const redFlags = scoring.quality.red_flags.length
        ? `<p class="status-box warning"><strong>Red flags:</strong> ${window.EnsinoApp.escapeHtml(scoring.quality.red_flags.join(", "))}</p>`
        : "";

      const backendInfo = backendResult && !backendResult.skipped
        ? '<p class="status-box success">Envio para backend concluido.</p>'
        : '<p class="status-box warning">Backend nao configurado ou indisponivel. Os arquivos locais foram preservados.</p>';

      const normativeData = backendResult && backendResult.body && backendResult.body.normative
        ? backendResult.body.normative
        : null;

      function formatNormativeNumber(value, decimals) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed.toFixed(decimals) : "-";
      }

      let normativeHtml = '<p class="status-box warning"><strong>Normas dinamicas:</strong> calculo de z-score, percentil e T-score sera ativado na proxima fase, apos estabilizacao do escore bruto.</p>';

      if (normativeData && normativeData.metrics) {
        const metrics = normativeData.metrics;
        const metricCards = [
          { key: "accuracy_pct", title: "Acuracia (%)" },
          { key: "rt_mean_ms", title: "RT medio (ms)" },
          { key: "stroop_interference_ms", title: "Interferencia Stroop (ms)" }
        ].map((descriptor) => {
          const data = metrics[descriptor.key] || {};
          return [
            '<article class="result-card">',
            "<h3>", descriptor.title, "</h3>",
            "<p><strong>Bruto:</strong> ", formatNormativeNumber(data.raw, 2), "</p>",
            "<p><strong>Media do estrato:</strong> ", formatNormativeNumber(data.mean, 2), "</p>",
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
          "<h3>Comparacao normativa dinamica</h3>",
          "<p><strong>Faixa etaria:</strong> ", window.EnsinoApp.escapeHtml(String(normativeData.age_band || "-")), "</p>",
          "<p><strong>Faixa de escolaridade:</strong> ", window.EnsinoApp.escapeHtml(String(normativeData.schooling_band || "-")), "</p>",
          "<p><strong>Amostra valida no estrato:</strong> ", formatNormativeNumber(normativeData.sample_n, 0), "</p>",
          "</article>",
          '<div class="task-grid">', metricCards, "</div>"
        ].join("");
      }

      jsPsych.getDisplayElement().innerHTML = [
        '<div class="stroop-layout"><div class="stroop-frame">',
        "<h2>Tarefa concluida</h2>",
        "<p>Os arquivos de resultado foram gerados para download neste navegador. Se o navegador bloquear a transferencia automatica, use os links abaixo.</p>",
        qualityStatus,
        redFlags,
        backendInfo,
        '<article class="result-card">',
        "<h3>Desempenho bruto (participante)</h3>",
        "<p><strong>Acuracia total:</strong> ", participantMetrics.accuracy_pct.toFixed(2), "%</p>",
        "<p><strong>Erros:</strong> ", participantMetrics.error_trials, "</p>",
        "<p><strong>Timeouts/omissoes:</strong> ", participantMetrics.timeout_trials, " (", participantMetrics.omission_rate_pct.toFixed(2), "%)</p>",
        "<p><strong>RT medio:</strong> ", participantMetrics.rt_mean_ms, " ms</p>",
        "<p><strong>RT mediano:</strong> ", participantMetrics.rt_median_ms, " ms</p>",
        "<p><strong>RT DP:</strong> ", participantMetrics.rt_sd_ms, " ms</p>",
        "<p><strong>RT medio trimado:</strong> ", participantMetrics.rt_trimmed_mean_ms, " ms</p>",
        "<p><strong>Interferencia Stroop (B3 - B2):</strong> ", participantMetrics.stroop_interference_ms, " ms</p>",
        "</article>",
        "<h3>Metricas por bloco</h3>",
        '<div class="task-grid">', byBlockHtml, "</div>",
        normativeHtml,
        '<article class="result-card">',
        "<h3>Legenda das medidas</h3>",
        "<p><strong>Acuracia total (%):</strong> proporcao de respostas corretas em todos os trials.</p>",
        "<p><strong>RT medio (ms):</strong> media do tempo de resposta em milissegundos (acertos validos apos limpeza).</p>",
        "<p><strong>RT mediano (ms):</strong> valor central do tempo de resposta, menos sensivel a valores extremos.</p>",
        "<p><strong>RT DP (ms):</strong> desvio-padrao dos tempos de resposta, indicando variabilidade intraindividuo.</p>",
        "<p><strong>RT medio trimado (ms):</strong> media com corte de extremos para robustez psicometrica.</p>",
        "<p><strong>Interferencia Stroop (ms):</strong> diferenca entre RT medio do bloco incongruente e do bloco controle (B3 - B2).</p>",
        "<p><strong>z-score:</strong> distancia do valor bruto em unidades de desvio-padrao no estrato normativo.</p>",
        "<p><strong>Percentil:</strong> posicao relativa do participante no estrato (0 a 100).</p>",
        "<p><strong>T-score:</strong> escore padronizado calculado como 50 + 10 x z.</p>",
        "</article>",
        '<article class="result-card" style="text-align:left;">',
        "<h3>Referencias bibliograficas</h3>",
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

  const timeline = [];
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
    message: "<p>A tarefa sera apresentada em tela cheia para reduzir distracoes.</p>",
    button_label: "Entrar em tela cheia"
  });

  timeline.push(instructionPage(
    "Stroop Victoria",
    [
      "<p>Voce vera estimulos em diferentes cores e deve responder a <strong>cor</strong>, nao ao significado da palavra.</p>",
      "<p>Mapeamento das teclas:</p>",
      "<ul>",
      "<li><strong>S</strong> = Azul</li>",
      "<li><strong>D</strong> = Verde</li>",
      "<li><strong>K</strong> = Vermelho</li>",
      "<li><strong>L</strong> = Amarelo</li>",
      "</ul>",
      "<p>Responda o mais rapido e corretamente possivel.</p>"
    ].join("")
  ));

  timeline.push(...makeBlockTimeline(
    blockOne,
    "Bloco 1 de 3",
    "<p>Neste bloco, os estimulos sao circulos coloridos. Responda a cor apresentada.</p><p>Pressione ESPACO para iniciar.</p>"
  ));

  timeline.push(...makeBlockTimeline(
    blockTwo,
    "Bloco 2 de 3",
    "<p>Neste bloco, voce vera palavras neutras em diferentes cores. Ignore a palavra e responda somente a cor.</p><p>Pressione ESPACO para iniciar.</p>"
  ));

  timeline.push(...makeBlockTimeline(
    blockThree,
    "Bloco 3 de 3",
    "<p>Neste bloco, voce vera palavras de cores apresentadas em cor incongruente. Ignore o significado da palavra e responda somente a cor da tinta.</p><p>Pressione ESPACO para iniciar.</p>"
  ));

  timeline.push({
    type: jsPsychFullscreen,
    fullscreen_mode: false
  });

  jsPsych.run(timeline);
})();
