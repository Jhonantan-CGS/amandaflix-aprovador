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

let deferredInstallPrompt = null;

const APPROVAL_PASSWORD = "1A2b3c4d";
const SESSION_KEY = "amandaflix-approval-dayane-session";

function isConfigured() {
  return firebaseConfig.projectId && !firebaseConfig.projectId.startsWith("COLE_AQUI");
}

function isUnlocked() {
  return localStorage.getItem(SESSION_KEY) === "unlocked";
}

function showApp() {
  loginScreen.hidden = true;
  appShell.hidden = false;
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

function renderPending(items) {
  if (!items.length) {
    pendingEl.innerHTML = '<div class="empty">Nenhuma solicitacao aguardando aprovacao.</div>';
    return;
  }

  pendingEl.innerHTML = items.map(item => `
    <article class="request">
      <div>
        <div class="title">${escapeText(item.title || "Conteudo AmandaFlix")}</div>
        <div class="meta">${escapeText(item.type || "Conteudo")} - ${escapeText(item.category || "Sem categoria")} - ${formatTime(item.createdAt)}</div>
        <div class="meta">Classificacao: ${escapeText(item.rating || "nao informada")}</div>
      </div>
      <div class="actions">
        <button class="approve" data-id="${escapeText(item.id)}" data-decision="approved">Aprovar</button>
        <button class="reject" data-id="${escapeText(item.id)}" data-decision="rejected">Rejeitar</button>
      </div>
    </article>
  `).join("");
}

function renderHistory(items) {
  historyEl.innerHTML = items.map(item => {
    const status = item.status || "pending";
    const label = status === "approved" ? "Aprovado" : status === "rejected" ? "Rejeitado" : "Pendente";
    return `
      <li>
        <span>${escapeText(item.title || "Conteudo AmandaFlix")}</span>
        <span class="pill ${escapeText(status)}">${label}</span>
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

  pendingEl.addEventListener("click", async event => {
    const button = event.target.closest("button[data-id]");
    if (!button) {
      return;
    }

    button.disabled = true;
    await decide(db, button.dataset.id, button.dataset.decision);
  });

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

  if (setupLogin()) {
    await startFirebase();
  }
}

boot().catch(error => {
  statusEl.textContent = `Erro ao iniciar: ${error.message}`;
});
