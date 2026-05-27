import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  collection,
  doc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { approvalCollectionName, firebaseConfig } from "./firebase-config.js";

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

let deferredInstallPrompt = null;
let logoutTimer = null;
let audioContext = null;

const APPROVAL_PASSWORD = "1A2b3c4d";
const SESSION_KEY = "amandaflix-approval-dayane-session";
const SESSION_TIMEOUT_MS = 25 * 60 * 1000;
const ICONS = {
  approved: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  rejected: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  blocked: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
};

function isConfigured() {
  return firebaseConfig.projectId && !firebaseConfig.projectId.startsWith("COLE_AQUI");
}

function isUnlocked() {
  return localStorage.getItem(SESSION_KEY) === "unlocked";
}

function lockSession() {
  localStorage.removeItem(SESSION_KEY);
  appShell.hidden = true;
  loginScreen.hidden = false;
  passwordInput.value = "";
  loginError.textContent = "Sessao expirada por inatividade. Digite a senha novamente.";
  passwordInput.focus();
}

function renewSessionTimer() {
  if (!isUnlocked()) {
    return;
  }
  clearTimeout(logoutTimer);
  logoutTimer = setTimeout(lockSession, SESSION_TIMEOUT_MS);
}

function showApp() {
  loginScreen.hidden = true;
  appShell.hidden = false;
  renewSessionTimer();
}

function setupSessionActivity() {
  ["click", "keydown", "touchstart", "mousemove"].forEach(eventName => {
    document.addEventListener(eventName, renewSessionTimer, { passive: true });
  });
}

function playFeedback(decision) {
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const frequency = decision === "approved" ? 740 : decision === "blocked" ? 392 : 220;
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  gain.gain.setValueAtTime(0.001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.16, audioContext.currentTime + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.16);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.18);
}

function setupLogin() {
  if (isUnlocked()) {
    showApp();
    return true;
  }

  loginScreen.hidden = false;
  appShell.hidden = true;
  passwordInput.focus();

  loginForm.addEventListener("submit", event => {
    event.preventDefault();

    if (passwordInput.value === APPROVAL_PASSWORD) {
      localStorage.setItem(SESSION_KEY, "unlocked");
      loginError.textContent = "";
      showApp();
      startFirebase();
      return;
    }

    loginError.textContent = "Senha incorreta. Tente novamente.";
    passwordInput.select();
  });

  return false;
}

function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function formatTime(value) {
  if (!value) {
    return "--:--";
  }

  const date = value.toDate ? value.toDate() : new Date(value);
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function posterFor(item) {
  return item.poster || item.cover || item.image || item.thumbnail || "";
}

function detailChips(item) {
  return [
    item.type,
    item.category,
    item.rating ? `Classificacao ${item.rating}` : "",
    item.year,
    item.duration,
    item.season && item.episode ? `T${item.season} E${item.episode}` : "",
    item.approvalScope === "movie" ? "Liberacao permanente" : "",
    item.approvalScope === "episode" ? "Liberacao por episodio" : ""
  ].filter(Boolean);
}

function renderPoster(item) {
  const poster = posterFor(item);
  if (!poster) {
    return '<div class="poster poster-fallback">AF</div>';
  }
  return `<img class="poster" src="${escapeText(poster)}" alt="Capa de ${escapeText(item.title || "conteudo")}">`;
}

function renderPending(items) {
  pendingCountEl.textContent = String(items.length);

  if (!items.length) {
    pendingEl.innerHTML = '<div class="empty">Nenhuma solicitacao aguardando aprovacao.</div>';
    return;
  }

  pendingEl.innerHTML = items.map(item => `
    <article class="request">
      ${renderPoster(item)}
      <div>
        <div class="title">${escapeText(item.title || "Conteudo AmandaFlix")}</div>
        <div class="meta">Solicitado as ${formatTime(item.createdAt)}</div>
        ${item.description ? `<div class="description">${escapeText(item.description)}</div>` : ""}
        <div class="chips">
          ${detailChips(item).map(chip => `<span class="chip">${escapeText(chip)}</span>`).join("")}
        </div>
      </div>
      <div class="actions">
        <button class="approve" data-id="${escapeText(item.id)}" data-decision="approved">${ICONS.approved}Aprovar</button>
        <button class="reject" data-id="${escapeText(item.id)}" data-decision="rejected">${ICONS.rejected}Rejeitar</button>
      </div>
    </article>
  `).join("");
}

function renderHistory(items) {
  historyEl.innerHTML = items.map(item => {
    const status = item.status || "pending";
    const label = status === "approved" ? "Aprovado" : status === "rejected" ? "Rejeitado" : status === "blocked" ? "Bloqueado" : status === "expired" ? "Expirado" : "Pendente";
    const blockButton = status === "approved"
      ? `<button class="block" data-id="${escapeText(item.id)}" data-decision="blocked">${ICONS.blocked}Bloquear</button>`
      : `<span class="pill ${escapeText(status)}">${label}</span>`;
    return `
      <li>
        ${posterFor(item) ? `<img src="${escapeText(posterFor(item))}" alt="">` : "<span></span>"}
        <span>${escapeText(item.title || "Conteudo AmandaFlix")}</span>
        ${blockButton}
      </li>
    `;
  }).join("") || '<li><span>Nenhuma decisao registrada.</span><span></span></li>';
}

async function decide(db, id, decision) {
  await updateDoc(doc(db, approvalCollectionName, id), {
    status: decision,
    updatedAt: serverTimestamp(),
    decidedAt: serverTimestamp()
  });
}

async function setupPwaInstall() {
  if ("serviceWorker" in navigator) {
    await navigator.serviceWorker.register("./sw.js");
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.style.display = "inline-flex";
  });

  installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installButton.style.display = "none";
  });
}

async function startFirebase() {
  if (!isConfigured()) {
    statusEl.textContent = "Configure o Firebase em firebase-config.js.";
    pendingEl.innerHTML = '<div class="empty">Firebase ainda nao configurado.</div>';
    historyEl.innerHTML = '<li><span>Preencha as credenciais Web do Firebase antes de publicar.</span><span></span></li>';
    return;
  }

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const requests = collection(db, approvalCollectionName);

  async function handleDecisionClick(event) {
    const button = event.target.closest("button[data-id]");
    if (!button) {
      return;
    }

    button.disabled = true;
    const card = button.closest(".request") || button.closest("li");
    card?.classList.add("deciding");
    try {
      await decide(db, button.dataset.id, button.dataset.decision);
      playFeedback(button.dataset.decision);
    } finally {
      button.disabled = false;
      card?.classList.remove("deciding");
    }
  }

  pendingEl.addEventListener("click", handleDecisionClick);
  historyEl.addEventListener("click", handleDecisionClick);

  onSnapshot(
    query(requests, where("status", "==", "pending"), orderBy("createdAt", "desc"), limit(30)),
    snapshot => {
      const items = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      renderPending(items);
      statusEl.textContent = `Online - ${items.length} pendente(s)`;
    },
    error => {
      statusEl.textContent = `Erro no Firebase: ${error.message}`;
    }
  );

  onSnapshot(
    query(requests, orderBy("updatedAt", "desc"), limit(12)),
    snapshot => {
      const items = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      renderHistory(items);
    }
  );
}

async function boot() {
  await setupPwaInstall();
  setupSessionActivity();

  if (setupLogin()) {
    await startFirebase();
  }
}

boot().catch(error => {
  statusEl.textContent = `Erro ao iniciar: ${error.message}`;
});
