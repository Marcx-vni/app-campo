// ============================================================================
// APP.JS — inicialização, roteamento simples entre as 5 telas, e utilitários
// compartilhados (toast, indicador de sincronização).
// ============================================================================

const routes = {
  ordens: (el) => ScreenOrdens.render(el),
  ordem: (el, params) => ScreenOrdemCard.render(el, params.id),
  apontamento: (el) => ScreenApontamentoLivre.render(el),
  estoque: (el) => ScreenEstoque.render(el),
  fila: (el) => ScreenFila.render(el),
};

function navigate(route, params = {}) {
  location.hash = `#${route}${params.id ? "/" + params.id : ""}`;
}

function renderRoute() {
  const hash = location.hash.replace("#", "") || "ordens";
  const [route, id] = hash.split("/");
  const fn = routes[route] || routes.ordens;
  document.querySelectorAll(".nav-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.route === route)
  );
  const main = document.getElementById("main-content");
  main.innerHTML = "";
  fn(main, { id });
}

function showToast(message, ms = 2800) {
  const el = document.getElementById("tpl-toast").content.cloneNode(true).querySelector(".toast");
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

function atualizarLabelArquivo() {
  const el = document.getElementById("arquivo-atual");
  const arquivo = typeof getSelectedFile === "function" ? getSelectedFile() : null;
  el.textContent = arquivo ? arquivo.name : "";
}

async function updateSyncIndicator() {
  const pill = document.getElementById("sync-indicator");
  const pending = await queuePending();
  if (!navigator.onLine) {
    pill.textContent = "offline";
    pill.className = "status-pill status-pill-warn";
  } else if (pending.length > 0) {
    pill.textContent = `${pending.length} pendente(s)`;
    pill.className = "status-pill status-pill-pending";
  } else {
    pill.textContent = "sincronizado";
    pill.className = "status-pill";
  }
  document.getElementById("fila-badge-label").textContent =
    pending.length > 0 ? `Fila (${pending.length})` : "Fila";
}

async function bootApp() {
  document.getElementById("user-name").textContent = getUserDisplayName();
  document.getElementById("screen-login").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");
  atualizarLabelArquivo();

  // Primeira abertura neste aparelho: pede para escolher o arquivo antes de continuar.
  if (!getSelectedFile()) {
    const main = document.getElementById("main-content");
    document.querySelector(".bottom-nav").classList.add("hidden");
    await ScreenFileSelector.render(main, () => {
      document.querySelector(".bottom-nav").classList.remove("hidden");
      bootApp(); // recarrega o boot normal agora que o arquivo está selecionado
    });
    return;
  }

  // destrava qualquer apontamento que ficou preso em "enviando" (página fechada
  // ou recarregada no meio do envio anterior) — ele volta a ser tentado.
  await queueDestravarEnviandoOrfaos();

  // carrega/atualiza cache de listas (offline-first: usa cache se não houver rede)
  try {
    await getLookupData();
  } catch (e) {
    console.warn("Falha ao carregar listas (seguindo com cache local, se houver):", e);
  }

  await updateSyncIndicator();
  renderRoute();

  // tenta sincronizar a fila pendente ao abrir o app
  if (navigator.onLine) {
    syncQueueOnce((item, status) => updateSyncIndicator()).then(updateSyncIndicator);
  }
}

window.addEventListener("hashchange", renderRoute);
window.addEventListener("online", updateSyncIndicator);
window.addEventListener("offline", updateSyncIndicator);
window.addEventListener("app-campo:synced", (e) => {
  showToast(`${e.detail.sent} apontamento(s) sincronizado(s)`);
  updateSyncIndicator();
  renderRoute();
});

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => navigate(btn.dataset.route));
});

document.getElementById("btn-login").addEventListener("click", async () => {
  const errorEl = document.getElementById("login-error");
  errorEl.textContent = "";
  try {
    await login();
    await bootApp();
  } catch (e) {
    errorEl.textContent = "Não foi possível entrar. Verifique sua conexão e tente novamente.";
    console.error(e);
  }
});

document.getElementById("btn-logout").addEventListener("click", () => logout());

// Força esquecer o arquivo do OneDrive selecionado neste aparelho e escolher de novo
// (útil se em algum teste anterior o app ficou "preso" gravando no arquivo errado).
// Sem ícone dedicado no cabeçalho — é um toque no próprio nome do arquivo.
document.getElementById("arquivo-atual").addEventListener("click", () => {
  if (!getSelectedFile()) return;
  if (confirm("Isso vai esquecer o arquivo do OneDrive selecionado neste aparelho e pedir para escolher de novo. Continuar?")) {
    clearSelectedFile();
    location.reload();
  }
});

(async function init() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(console.error);
  }
  const account = await initAuth();
  if (account) {
    await bootApp();
  }
})();
