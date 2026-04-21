(function () {
  const STORAGE_KEY = "ensino-session";
  const RESULT_KEY = "ensino-last-result";
  const FIXED_PROTOCOL_VERSION = "stroop-victoria-desktop-v1.3-psychometrics";
  const CONFIG = {
    allowedDomains: {
      professor: "online.uscs.edu.br",
      aluno: "uscsonline.com.br"
    },
    protocolVersion: FIXED_PROTOCOL_VERSION,
    scoringVersion: "rt-pipeline-v3-jittered",
    schemaVersion: "ensino-schema-v2",
    supabaseProjectUrl: "https://ohihzoibxjekweporhpy.supabase.co",
    supabasePublishableKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oaWh6b2lieGpla3dlcG9yaHB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxODExMTIsImV4cCI6MjA5MDc1NzExMn0.HTXtwD_Fh2QdvnzIBaUKeeIQ8eQeDJ7NXYkbi9NmABo",
    webhookUrl: "https://ohihzoibxjekweporhpy.supabase.co/functions/v1/stroop-ingest",
    webhookApiKey: "a425844cc614ced5f4c8698e8dbc449e46ca3066f4cd804378b43fbc4656b463"
  };

  function normalizeLetters(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z\s]/g, " ")
      .trim();
  }

  function buildParticipantId(lastSurname, birthDay, motherName) {
    const surnameToken = normalizeLetters(lastSurname).split(/\s+/).filter(Boolean).pop() || "";
    const motherToken = normalizeLetters(motherName).split(/\s+/).filter(Boolean)[0] || "";
    const dayNumber = Number(birthDay);

    if (surnameToken.length < 2 || motherToken.length < 2 || !Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) {
      return null;
    }

    return surnameToken.slice(0, 2).toUpperCase()
      + String(dayNumber).padStart(2, "0")
      + motherToken.slice(0, 2).toUpperCase();
  }

  function validateInstitutionalEmail(role, email) {
    const normalizedRole = String(role || "").trim().toLowerCase();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const domain = CONFIG.allowedDomains[normalizedRole];

    if (!domain) {
      return { ok: false, message: "Selecione se o participante &eacute; aluno(a) ou professor(a)." };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return { ok: false, message: "Informe um e-mail institucional v&aacute;lido." };
    }

    if (!normalizedEmail.endsWith("@" + domain)) {
      return {
        ok: false,
        message: normalizedRole === "professor"
          ? "Professores devem usar e-mail com dom&iacute;nio @online.uscs.edu.br."
          : "Alunos devem usar e-mail com dom&iacute;nio @uscsonline.com.br."
      };
    }

    return { ok: true, normalizedEmail };
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function isDesktopEligible() {
    const ua = navigator.userAgent || "";
    const isPhoneUa = /iPhone|iPod|Android.*Mobile|Windows Phone|webOS|BlackBerry|Opera Mini/i.test(ua);
    const hasCoarsePointer = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    const minScreenSide = Math.min(window.screen.width || window.innerWidth, window.screen.height || window.innerHeight);
    const isLikelySmallMobile = minScreenSide < 700;

    if (isPhoneUa || (hasCoarsePointer && isLikelySmallMobile)) {
      return {
        ok: false,
        reason: "A tarefa está bloqueada para smartphone. Use computador/notebook, ou tablet com teclado físico acoplado."
      };
    }

    return { ok: true, reason: "" };
  }

  function formatDate(isoString) {
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short"
      }).format(new Date(isoString));
    } catch (error) {
      return isoString;
    }
  }

  function saveSession(session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  function getSession() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(RESULT_KEY);
  }

  function saveLastResult(result) {
    localStorage.setItem(RESULT_KEY, JSON.stringify(result));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function downloadText(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function createDownloadUrl(content, mimeType) {
    return URL.createObjectURL(new Blob([content], { type: mimeType }));
  }

  function trialsToCsv(rows) {
    const headers = [
      "protocol_version",
      "scoring_version",
      "schema_version",
      "session_started_at",
      "completed_at",
      "role",
      "email",
      "participant_id",
      "age_years",
      "schooling_years",
      "color_blindness",
      "mother_tongue",
      "digital_familiarity",
      "user_agent",
      "screen_width",
      "screen_height",
      "window_inner_width",
      "window_inner_height",
      "experiment_started_at",
      "block",
      "block_name",
      "trial_index_in_block",
      "is_practice",
      "transition_type",
      "post_error",
      "stimulus_type",
      "stimulus_label",
      "stimulus_color",
      "correct_key",
      "response_key",
      "correct",
      "correct_bool",
      "timed_out",
      "timed_out_bool",
      "rt_ms"
    ];

    const lines = [headers.join(",")];
    rows.forEach((row) => {
      const line = headers.map((header) => {
        const value = row[header] == null ? "" : String(row[header]).replace(/"/g, "\"\"");
        return `"${value}"`;
      }).join(",");
      lines.push(line);
    });
    return lines.join("\n");
  }

  function buildSummaryText(summary) {
    const blocks = summary.blockSummaries.map((block) => {
      return [
        `Bloco ${block.block}: ${block.name}`,
        `  Tentativas: ${block.trials}`,
        `  Acertos: ${block.correct}`,
        `  Precisao: ${block.accuracy}%`,
        `  TR medio (acertos): ${block.meanRt} ms`
      ].join("\n");
    }).join("\n\n");

    return [
      "ENSINO - Stroop Victoria",
      `Data de inicio: ${summary.session.startedAt}`,
      `Data de conclusao: ${summary.completedAt}`,
      `Perfil: ${summary.session.role}`,
      `E-mail: ${summary.session.email}`,
      `ID unico: ${summary.session.participantId}`,
      "",
      blocks
    ].join("\n");
  }

  async function postResults(payload) {
    if (!CONFIG.webhookUrl) {
      return { skipped: true };
    }

    const headers = { "Content-Type": "application/json" };
    if (CONFIG.supabasePublishableKey) {
      headers.apikey = CONFIG.supabasePublishableKey;
      headers.Authorization = "Bearer " + CONFIG.supabasePublishableKey;
    }
    if (CONFIG.webhookApiKey) {
      headers["x-ingest-token"] = CONFIG.webhookApiKey;
    }

    console.log("[Stroop] Payload enviado para API:", payload);

    const response = await fetch(CONFIG.webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    let body = null;
    try {
      body = await response.json();
    } catch (error) {
      body = null;
    }

    console.log("[Stroop] Resposta da API:", {
      status: response.status,
      ok: response.ok,
      body
    });

    if (!response.ok) {
      console.error("[Stroop] Erro no envio para API:", {
        status: response.status,
        body
      });
      throw new Error("Falha ao enviar dados para o endpoint configurado. Status: " + response.status);
    }

    return { skipped: false, body };
  }

  window.EnsinoApp = {
    config: CONFIG,
    buildParticipantId,
    buildSummaryText,
    clearSession,
    createDownloadUrl,
    downloadText,
    escapeHtml,
    formatDate,
    getSession,
    isDesktopEligible,
    nowIso,
    postResults,
    saveLastResult,
    saveSession,
    trialsToCsv,
    validateInstitutionalEmail
  };
})();
