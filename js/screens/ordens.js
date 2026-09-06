// ============================================================================
// T1 — MINHAS ORDENS
// Lista de cards filtrada pelo e-mail de quem logou (coluna "E-mail" da
// tabela Ordens) e Situação <> Executada. Sem nenhuma seleção manual —
// cada pessoa só vê as ordens atribuídas ao e-mail com que ela entrou.
// Atrasadas (Data Prevista < hoje) aparecem primeiro, em vermelho.
// ============================================================================

// Lembrete do último Meeiro escolhido no formulário de Apontamento Livre
// (só conveniência de preenchimento — sem relação com login/e-mail).
const MEEIRO_STORAGE_KEY = "app_campo_meeiro_codigo";

function getMeeiroSelecionado() {
  return localStorage.getItem(MEEIRO_STORAGE_KEY);
}

function normalizeEmail(s) {
  return String(s || "").trim().toLowerCase();
}

const ScreenOrdens = {
  async render(container) {
    container.innerHTML = `
      <h2 class="page-title">Minhas Ordens</h2>
      <div id="ordens-list">Carregando...</div>
    `;

    const { ordens } = await getLookupData();
    const meuEmail = normalizeEmail(typeof getUserEmail === "function" ? getUserEmail() : null);

    const minhas = ordens
      .filter((o) => normalizeEmail(o["E-mail"]) === meuEmail && o["Situação"] !== "Executada")
      .map((o) => ({ ...o, atrasada: isAtrasada(o["Data Prevista"]) }))
      .sort((a, b) => (a.atrasada === b.atrasada ? 0 : a.atrasada ? -1 : 1));

    const list = container.querySelector("#ordens-list");
    if (minhas.length === 0) {
      list.innerHTML = `<div class="empty-state">Nenhuma ordem pendente para o seu e-mail.</div>`;
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
