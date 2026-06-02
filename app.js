import { apiBaseUrl } from "./api-config.js";

const pendingEl = document.getElementById("pending");
const historyEl = document.getElementById("history");
const statusEl = document.getElementById("status");
const installButton = document.getElementById("installButton");
const loginScreen = document.getElementById("loginScreen");
const loginForm = document.getElementById("loginForm");
const passwordInput = document.getElementById("passwordInput");
const loginError = document.getElementById("loginError");
const appShell = document.getElementById("appShell");
const pendingCountEl = document.getElementById("pendingCount");
const metadataForm = document.getElementById("metadataForm");
const metadataDeleteButton = document.getElementById("metadataDelete");
const metadataCloseButton = document.getElementById("metadataClose");

const SESSION_KEY = "amandaflix-approver-token";
const REFRESH_MS = 2500;
let deferredInstallPrompt = null;
let refreshTimer = null;
let audioContext = null;

const ICONS = {
  approved: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
  rejected: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  blocked: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
};

function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function playTone(kind = "tap") {
  audioContext ||= new AudioContext();
  const now = audioContext.currentTime;
  const presets = {
    tap: [620, 880],
    login: [520, 780, 1040],
    approve: [660, 990, 1320],
    reject: [360, 240],
    save: [580, 760, 980]
  };
  (presets[kind] || presets.tap).forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now + index * 0.045);
    gain.gain.exponentialRampToValueAtTime(0.045, now + index * 0.045 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.045 + 0.11);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now + index * 0.045);
    oscillator.stop(now + index * 0.045 + 0.12);
  });
}

function token() {
  return sessionStorage.getItem(SESSION_KEY) || "";
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== "/approver/login") lockSession("Sessao expirada. Digite a senha novamente.");
  if (!response.ok) throw new Error(body.error || `Erro HTTP ${response.status}`);
  return body;
}

function lockSession(message = "") {
  sessionStorage.removeItem(SESSION_KEY);
  clearTimeout(refreshTimer);
  appShell.hidden = true;
  loginScreen.hidden = false;
  passwordInput.value = "";
  loginError.textContent = message;
  passwordInput.focus();
}

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--";
}

function poster(item) {
  return item.poster ? `<img class="poster" src="${escapeText(item.poster)}" alt="">` : '<div class="poster poster-fallback">AF</div>';
}

function chips(item) {
  return [
    item.media_type === "episode" ? "Episodio" : "Filme",
    item.rating ? `Classificacao ${item.rating}` : "Classificacao nao informada",
    item.season && item.episode ? `T${item.season} E${item.episode}` : ""
  ].filter(Boolean).map(value => `<span class="chip">${escapeText(value)}</span>`).join("");
}

function render(items) {
  const pending = items.filter(item => item.status === "pending");
  pendingCountEl.textContent = String(pending.length);
  pendingEl.innerHTML = pending.map(item => `
    <article class="request">
      ${poster(item)}
      <div>
        <div class="title">${escapeText(item.title)}</div>
        <div class="meta">Solicitado as ${formatTime(item.created_at)}</div>
        ${item.description ? `<div class="description">${escapeText(item.description)}</div>` : ""}
        <div class="chips">${chips(item)}</div>
      </div>
      <div class="actions">
        <button class="approve" data-id="${escapeText(item.id)}" data-status="approved">${ICONS.approved}Aprovar</button>
        <button class="reject" data-id="${escapeText(item.id)}" data-status="rejected">${ICONS.rejected}Rejeitar</button>
      </div>
    </article>
  `).join("") || '<div class="empty">Nenhuma solicitacao aguardando aprovacao.</div>';

  historyEl.innerHTML = items.filter(item => item.status !== "pending").slice(0, 20).map(item => `
    <li>
      ${item.poster ? `<img src="${escapeText(item.poster)}" alt="">` : "<span></span>"}
      <span>${escapeText(item.title)}</span>
      ${item.status === "approved"
        ? `<button class="block" data-id="${escapeText(item.id)}" data-status="blocked">${ICONS.blocked}Bloquear</button>`
        : `<span class="pill ${escapeText(item.status)}">${escapeText(item.status)}</span>`}
    </li>
  `).join("") || '<li><span>Nenhuma decisao registrada.</span><span></span></li>';
  statusEl.textContent = `Online - ${pending.length} pendente(s)`;
}

function renderMetadataReviews(items) {
  metadataCountEl.textContent = String(items.length);
  metadataReviewEl.innerHTML = items.map(item => `
    <article class="metadata-card">
      ${item.poster ? `<img class="poster" src="${escapeText(item.poster)}" alt="">` : '<div class="poster poster-fallback">AF</div>'}
      <div>
        <div class="title">${escapeText(item.title || "Conteudo sem titulo")}</div>
        <div class="meta">${escapeText(item.media_key)} · origem ${escapeText(item.source)}</div>
        <div class="description">Metadado incompleto ou ambiguo. Revise o titulo e a URL da capa antes da proxima solicitacao.</div>
      </div>
      <button class="edit-metadata" data-key="${escapeText(item.media_key)}" data-type="${escapeText(item.media_type)}" data-id="${escapeText(item.media_id)}" data-title="${escapeText(item.title)}" data-poster="${escapeText(item.poster)}">Editar</button>
    </article>
  `).join("") || '<div class="empty">Nenhum metadado aguardando revisao.</div>';
}

async function refresh() {
  clearTimeout(refreshTimer);
  try {
    const approvals = await api("/approvals");
    render(approvals.items || []);
  } catch (error) {
    statusEl.textContent = `Erro de conexao: ${error.message}`;
  }
  if (token()) refreshTimer = setTimeout(refresh, REFRESH_MS);
}

async function decide(event) {
  const button = event.target.closest("button[data-id]");
  if (!button) return;
  button.disabled = true;
  playTone(button.dataset.status === "approved" ? "approve" : "reject");
  try {
    await api(`/approvals/${encodeURIComponent(button.dataset.id)}/decision`, {
      method: "POST",
      body: JSON.stringify({ status: button.dataset.status })
    });
    await refresh();
  } catch (error) {
    statusEl.textContent = `Erro ao decidir: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

function openMetadataEditor(event) {
  const button = event.target.closest("button[data-key]");
  if (!button) return;
  playTone("tap");
  metadataKeyInput.value = button.dataset.key;
  metadataTypeInput.value = button.dataset.type;
  metadataIdInput.value = button.dataset.id;
  metadataTitleInput.value = button.dataset.title;
  metadataPosterInput.value = button.dataset.poster;
  metadataDialog.showModal();
}

metadataForm?.addEventListener("submit", async event => {
  event.preventDefault();
  await api(`/metadata/${encodeURIComponent(metadataTypeInput.value)}/${encodeURIComponent(metadataIdInput.value)}`, {
    method: "POST",
    body: JSON.stringify({ title: metadataTitleInput.value, poster: metadataPosterInput.value })
  });
  playTone("save");
  metadataDialog.close();
  await refresh();
});

metadataDeleteButton?.addEventListener("click", async () => {
  await api(`/metadata/${encodeURIComponent(metadataTypeInput.value)}/${encodeURIComponent(metadataIdInput.value)}/delete`, { method: "POST" });
  playTone("reject");
  metadataDialog.close();
  await refresh();
});

metadataCloseButton?.addEventListener("click", () => {
  playTone("tap");
  metadataDialog.close();
});

async function setupInstall() {
  if ("serviceWorker" in navigator) await navigator.serviceWorker.register("./sw.js");
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.style.display = "inline-flex";
  });
  installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installButton.style.display = "none";
  });
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  loginError.textContent = "";
  try {
    const result = await api("/approver/login", { method: "POST", body: JSON.stringify({ password: passwordInput.value }) });
    sessionStorage.setItem(SESSION_KEY, result.token);
    playTone("login");
    loginScreen.hidden = true;
    appShell.hidden = false;
    await refresh();
  } catch {
    loginError.textContent = "Senha incorreta ou backend indisponivel.";
    passwordInput.select();
  }
});

pendingEl.addEventListener("click", decide);
historyEl.addEventListener("click", decide);
setupInstall().catch(error => statusEl.textContent = `Erro ao iniciar: ${error.message}`);
if (token()) {
  loginScreen.hidden = true;
  appShell.hidden = false;
  refresh();
} else {
  lockSession();
}
