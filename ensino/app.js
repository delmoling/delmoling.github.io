const accessForm = document.getElementById("access-form");
const clearSessionButton = document.getElementById("clear-session");
const statusBox = document.getElementById("form-status");
const sessionEmpty = document.getElementById("session-empty");
const sessionReady = document.getElementById("session-ready");
const sessionEmail = document.getElementById("session-email");
const sessionId = document.getElementById("session-id");
const sessionAge = document.getElementById("session-age");
const sessionSchooling = document.getElementById("session-schooling");
const sessionDate = document.getElementById("session-date");
const sessionRoleLabel = document.getElementById("session-role-label");

function parseIntegerField(rawValue) {
  const value = Number(String(rawValue || "").trim());
  return Number.isInteger(value) ? value : null;
}

function validateDemographics(data) {
  if (!Number.isInteger(data.ageYears) || data.ageYears < 18 || data.ageYears > 100) {
    return "Informe idade válida entre 18 e 100 anos para esta versão do protocolo.";
  }

  if (!Number.isInteger(data.schoolingYears) || data.schoolingYears < 1 || data.schoolingYears > 40) {
    return "Informe anos de escolaridade válidos (entre 1 e 40).";
  }

  if (!["sim", "nao"].includes(data.colorBlindness)) {
    return "Informe a condição de daltonismo (sim ou não).";
  }

  if (!data.motherTongue || data.motherTongue.length < 2) {
    return "Informe a língua materna.";
  }

  if (!Number.isInteger(data.digitalFamiliarity) || data.digitalFamiliarity < 1 || data.digitalFamiliarity > 5) {
    return "Informe a familiaridade digital de 1 a 5.";
  }

  if (!data.physicalKeyboardConfirmed) {
    return "Confirme o uso de teclado físico para liberar esta versão da tarefa.";
  }

  return "";
}

function showStatus(type, html) {
  statusBox.hidden = false;
  statusBox.className = "status-box " + type;
  statusBox.innerHTML = "<p>" + html + "</p>";
}

function hideStatus() {
  statusBox.hidden = true;
  statusBox.innerHTML = "";
}

function renderSession() {
  const session = window.EnsinoApp.getSession();
  if (!session) {
    sessionEmpty.hidden = false;
    sessionReady.hidden = true;
    return;
  }

  sessionEmpty.hidden = true;
  sessionReady.hidden = false;
  sessionEmail.textContent = session.email;
  sessionId.textContent = session.participantId;
  sessionAge.textContent = String(session.ageYears || "-");
  sessionSchooling.textContent = String(session.schoolingYears || "-");
  sessionDate.textContent = window.EnsinoApp.formatDate(session.startedAt);
  sessionRoleLabel.textContent = (session.role === "professor" ? "Professor(a)" : "Aluno(a)") + " validado(a)";
}

accessForm.addEventListener("submit", function (event) {
  event.preventDefault();
  hideStatus();

  const formData = new FormData(accessForm);
  const role = String(formData.get("role") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const lastSurname = String(formData.get("lastSurname") || "").trim();
  const birthDay = String(formData.get("birthDay") || "").trim();
  const motherName = String(formData.get("motherName") || "").trim();
  const ageYears = parseIntegerField(formData.get("ageYears"));
  const schoolingYears = parseIntegerField(formData.get("schoolingYears"));
  const colorBlindness = String(formData.get("colorBlindness") || "").trim().toLowerCase();
  const motherTongue = String(formData.get("motherTongue") || "").trim();
  const digitalFamiliarity = parseIntegerField(formData.get("digitalFamiliarity"));
  const computerExperience = String(formData.get("computerExperience") || "").trim();
  const handedness = String(formData.get("handedness") || "").trim().toLowerCase();
  const sensoryNotes = String(formData.get("sensoryNotes") || "").trim();
  const physicalKeyboardConfirmed = formData.get("physicalKeyboard") === "on";

  const emailValidation = window.EnsinoApp.validateInstitutionalEmail(role, email);
  if (!emailValidation.ok) {
    showStatus("error", emailValidation.message);
    return;
  }

  const participantId = window.EnsinoApp.buildParticipantId(lastSurname, birthDay, motherName);
  if (!participantId) {
    showStatus("error", "Revise sobrenome, dia de nascimento e as duas primeiras letras do primeiro nome da m&atilde;e. O sistema precisa de pelo menos 2 letras para cada parte textual e um dia entre 1 e 31.");
    return;
  }

  const demographics = {
    ageYears,
    schoolingYears,
    colorBlindness,
    motherTongue,
    digitalFamiliarity,
    computerExperience,
    handedness,
    sensoryNotes,
    physicalKeyboardConfirmed
  };

  const demographicError = validateDemographics(demographics);
  if (demographicError) {
    showStatus("error", demographicError);
    return;
  }

  const session = {
    protocolVersion: window.EnsinoApp.config.protocolVersion,
    scoringVersion: window.EnsinoApp.config.scoringVersion,
    schemaVersion: window.EnsinoApp.config.schemaVersion,
    role,
    email: emailValidation.normalizedEmail,
    participantId,
    ageYears,
    schoolingYears,
    colorBlindness,
    motherTongue,
    digitalFamiliarity,
    computerExperience,
    handedness,
    sensoryNotes,
    physicalKeyboardConfirmed,
    startedAt: window.EnsinoApp.nowIso()
  };

  window.EnsinoApp.saveSession(session);
  renderSession();
  showStatus("success", "Acesso liberado. O ID &uacute;nico gerado para esta sess&atilde;o &eacute; <strong>" + participantId + "</strong>. Vers&atilde;o do protocolo: <strong>" + window.EnsinoApp.escapeHtml(session.protocolVersion) + "</strong>.");
});

clearSessionButton.addEventListener("click", function () {
  window.EnsinoApp.clearSession();
  accessForm.reset();
  hideStatus();
  renderSession();
});

renderSession();
