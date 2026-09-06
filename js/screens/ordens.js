// ============================================================================
// T1 — MINHAS ORDENS
// Lista de cards filtrada por Meeiro logado e Situação <> Executada.
// Atrasadas (Data Prevista < hoje) aparecem primeiro, em vermelho.
// ============================================================================

const MEEIRO_STORAGE_KEY = "app_campo_meeiro_codigo";

function getMeeiroSelecionado() {
  return localStorage.getItem(MEEIRO_STORAGE_KEY);
}

const ScreenOrdens = {
  async render(container) {
    const meeiroCod = getMeeiroSelecionado();
    if (!meeiroCod) {
      return this.renderSeletorMeeiro(container);
    }

    container.innerHTML = `
      <h2 class="page-title">Minhas Ordens</h2>
      <div id="ordens-list">Carregando...</div>
    `;

    const { ordens, meeiros } = await getLookupData();
    const meeiro = meeiros.find((m) => m["Codigo"] === meeiroCod);

    const minhas = ordens
      .filter((o) => o["Código Meeiro"] === meeiroCod && o["Situação"] !== "Executada")
      .map((o) => ({ ...o, atrasada: isAtrasada(o["Data Prevista"]) }))
      .sort((a, b) => (a.atrasada === b.atrasada ? 0 : a.atrasada ? -1 : 1));

    const list = container.querySelector("#ordens-list");
    if (minhas.length === 0) {
      list.innerHTML = `<div class="empty-state">Nenhuma ordem pendente para ${meeiro ? meeiro["Meeiro"] : meeiroCod}.</div>`;
      return;
    }

    list.innerHTML = minhas
      .map(
        (o) => `
      <div class="card ${o.atrasada ? "atrasado" : ""}" data-id="${o["ID Ordem"]}">
        <div class="card-title">${escapeHtml(o["Estufa"] || "")} — ${escapeHtml(o["Produto"] || "")}</div>
        <div class="card-sub">${o.atrasada ? "⚠ Atrasada — " : ""}Prevista: ${formatExcelDate(o["Data Prevista"])}</div>
        <div class="card-row"><span>Setor</span><span>${escapeHtml(o["Setor"] || "—")}</span></div>
        <div class="card-row"><span>Dosagem</span><span>${escapeHtml(String(o["Dosagem Prevista"] ?? "—"))}</span></div>
        <div class="card-row"><span>Qtde prevista</span><span>${escapeHtml(String(o["Volume/Qtde Prevista"] ?? "—"))}</span></div>
        ${o["Instruções"] ? `<div class="card-row"><span>Instruções</span><span>${escapeHtml(o["Instruções"])}</span></div>` : ""}
      </div>`
      )
      .join("");

    list.querySelectorAll(".card").forEach((card) => {
      card.addEventListener("click", () => navigate("ordem", { id: card.dataset.id }));
    });
  },

  async renderSeletorMeeiro(container) {
    container.innerHTML = `<h2 class="page-title">Quem está lançando?</h2><div id="meeiro-picker">Carregando...</div>`;
    const { meeiros } = await getLookupData();
    const picker = container.querySelector("#meeiro-picker");
    picker.innerHTML = `
      <p class="muted">Selecione seu nome para ver suas ordens. Isso fica salvo neste aparelho.</p>
      <select id="select-meeiro">
        <option value="">Selecione...</option>
        ${meeiros.map((m) => `<option value="${m["Codigo"]}">${escapeHtml(m["Meeiro"])}</option>`).join("")}
      </select>
      <button id="btn-confirmar-meeiro" class="btn btn-primary btn-block">Confirmar</button>
    `;
    picker.querySelector("#btn-confirmar-meeiro").addEventListener("click", () => {
      const val = picker.querySelector("#select-meeiro").value;
      if (!val) return;
      localStorage.setItem(MEEIRO_STORAGE_KEY, val);
      this.render(container);
    });
  },
};

function isAtrasada(excelSerialDate) {
  if (!excelSerialDate) return false;
  const hoje = toExcelSerial(new Date());
  return excelSerialDate < hoje;
}

function formatExcelDate(serial) {
  if (!serial) return "—";
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const d = new Date(excelEpoch.getTime() + serial * 86400000);
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
