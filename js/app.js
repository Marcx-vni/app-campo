// ============================================================================
// APP.JS — inicialização, roteamento simples entre as 5 telas, e utilitários
// compartilhados (toast, indicador de sincronização).
// ============================================================================

const routes = {
  home: (el) => ScreenHome.render(el),
  ferti: (el) => ScreenFertiConsulta.render(el),
  ordem: (el, params) => ScreenOrdemCard.render(el, params.id),
  apontamento: (el) => ScreenApontamentoLivre.render(el),
  estoque: (el) => ScreenEstoque.render(el),
  financeiro: (el) => ScreenFinanceiro.render(el),
  fila: (el) => ScreenFila.render(el),
};

function navigate(route, params = {}) {
  location.hash = `#${route}${params.id ? "/" + params.id : ""}`;
}

function renderRoute() {
  const hash = location.hash.replace("#", "") || "home";
  const [route, id] = hash.split("/");
  const fn = routes[route] || routes.home;
  document.querySelectorAll(".nav-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.route === route)
  );
  const main = document.getElementById("main-content");
  main.innerHTML = "";
  fn(main, { id });
}

// Compartilha um texto (relatório de Fertirrigação, por ex.) usando o menu
// nativo de compartilhamento do aparelho quando disponível — assim a pessoa
// escolhe o contato/grupo do WhatsApp na hora, sem precisar informar telefone
// nenhum no app. Sem suporte (a maioria dos navegadores desktop), cai pro
// link "wa.me" (abre o WhatsApp Web/app já com o texto pronto pra colar).
async function compartilharTexto(texto) {
  if (navigator.share) {
    try {
      await navigator.share({ text: texto });
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return; // pessoa cancelou o compartilhamento
      // qualquer outro erro cai no fallback abaixo
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
}

// Compartilha uma imagem (o "card" de Fertirrigação gerado em Canvas, ver
// gerarCardFertiPng em home.js) pelo menu nativo de compartilhamento —
// mesma ideia do compartilharTexto, mas com arquivo em vez de texto, porque
// o wa.me não aceita anexar imagem por link. Sem suporte a compartilhar
// arquivo (a maioria dos navegadores desktop), baixa a imagem e avisa a
// pessoa pra anexar ela manualmente na conversa do WhatsApp.
async function compartilharImagem(blob, nomeArquivo) {
  const file = new File([blob], nomeArquivo, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return; // pessoa cancelou o compartilhamento
      // qualquer outro erro cai no fallback abaixo
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  showToast("Imagem baixada — anexe ela numa conversa do WhatsApp.");
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

// Primeiro nome, com a inicial maiúscula (o resto do nome/e-mail some) — pra
// caber na saudação sem ficar comprido demais.
function primeiroNome(nomeCompleto) {
  if (!nomeCompleto) return "";
  const primeiro = nomeCompleto.trim().split(/\s+/)[0];
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1);
}

function saudacaoPorHorario() {
  const hora = new Date().getHours();
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

// Data por extenso ("Segunda-feira, 7 de setembro") + saudação dinâmica, no
// lugar do espaço vazio que ficava acima do nome no cabeçalho antigo.
function atualizarSaudacaoData() {
  const agora = new Date();
  const dataFormatada = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  // toLocaleDateString devolve tudo em minúsculo ("segunda-feira, 7 de
  // setembro") — só a primeira letra precisa maiúscula.
  const dataCapitalizada = dataFormatada.charAt(0).toUpperCase() + dataFormatada.slice(1);
  document.getElementById("topbar-data").textContent = dataCapitalizada;
  document.getElementById("topbar-saudacao").textContent =
    `${saudacaoPorHorario()}, ${primeiroNome(getUserDisplayName())}`;
}

// Coordenadas fixas de Venda Nova do Imigrante/ES — o app sempre roda no
// mesmo sítio, então não precisa de geolocalização nem de geocodificação
// por nome de cidade, só a previsão pro ponto fixo.
const CLIMA_LATITUDE = -20.3383;
const CLIMA_LONGITUDE = -41.1352;

// Ícone (emoji) a partir do "weather code" — tabela oficial da Open-Meteo:
// https://open-meteo.com/en/docs
function iconeClima(codigo) {
  if (codigo === 0) return "☀️";
  if (codigo === 1 || codigo === 2) return "🌤️";
  if (codigo === 3) return "☁️";
  if (codigo === 45 || codigo === 48) return "🌫️";
  if ([51, 53, 55, 56, 57].includes(codigo)) return "🌦️";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(codigo)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(codigo)) return "🌨️";
  if ([95, 96, 99].includes(codigo)) return "⛈️";
  return "⛅";
}

// Busca a temperatura/condição atual (Open-Meteo — API pública, sem chave).
// Falha silenciosa: clima é só um enfeite do cabeçalho, não pode travar nem
// poluir o app se a API estiver fora do ar.
async function atualizarClima() {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${CLIMA_LATITUDE}&longitude=${CLIMA_LONGITUDE}` +
      `&current=temperature_2m,weather_code&timezone=America%2FSao_Paulo`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    const temp = data?.current?.temperature_2m;
    const codigo = data?.current?.weather_code;
    if (temp === undefined || temp === null) return;
    document.getElementById("clima-temp").textContent = `${Math.round(temp)}°C`;
    document.getElementById("clima-icone").textContent = iconeClima(codigo);
  } catch (e) {
    console.warn("Falha ao buscar previsão do tempo (não crítico, segue sem clima):", e);
  }
}

async function bootApp() {
  atualizarSaudacaoData();
  atualizarClima(); // não bloqueia o boot — se falhar, fica só sem o clima
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

  const versaoEl = document.getElementById("app-version");
  if (versaoEl) versaoEl.textContent = APP_VERSION;

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
