// ============================================================================
// T1 — MINHAS ORDENS
// Lista de cards filtrada pelo e-mail de quem logou (coluna "E-mail" da
// tabela Ordens) e Situação <> Executada. Sem nenhuma seleção manual —
// cada pessoa só vê as ordens atribuídas ao e-mail com que ela entrou.
// Atrasadas (Data Prevista < hoje) aparecem primeiro, em vermelho.
// No topo, um resumo rápido do dia + atalhos pras telas mais usadas.
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
      <div class="resumo-rapido" id="resumo-rapido">
        <div class="resumo-card">
          <div class="resumo-valor" id="resumo-hoje">—</div>
          <div class="resumo-label">Lançamentos hoje</div>
        </div>
        <div class="resumo-card">
          <div class="resumo-valor resumo-alerta" id="resumo-estoque">—</div>
          <div class="resumo-label">Estoque baixo</div>
        </div>
        <div class="resumo-card">
          <div class="resumo-valor" id="resumo-fila">—</div>
          <div class="resumo-label">Fila de sync</div>
        </div>
      </div>

      <div class="section-title" style="margin-top:18px;">Ações rápidas</div>
      <div class="acoes-rapidas">
        <div class="acao-rapida acao-rapida-primaria" data-route="apontamento">
          <span class="acao-rapida-icone">✏️</span>
          <span class="acao-rapida-texto">Novo apontamento</span>
        </div>
        <div class="acao-rapida" data-route="estoque">
          <span class="acao-rapida-icone">📦</span>
          <span class="acao-rapida-texto">Ver estoque</span>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:22px;margin-bottom:10px;">
        <div class="section-title" style="margin:0;">Atividade recente</div>
        <div id="atividade-ver-tudo" style="font-size:12px;color:var(--verde);font-weight:500;cursor:pointer;">Ver tudo</div>
      </div>
      <div id="atividade-recente-list"></div>

      <h2 class="page-title" style="margin-top:22px;">Minhas Ordens</h2>
      <div id="ordens-list">Carregando...</div>
    `;

    container.querySelectorAll(".acao-rapida").forEach((el) => {
      el.addEventListener("click", () => navigate(el.dataset.route));
    });
    container.querySelector("#atividade-ver-tudo").addEventListener("click", () => navigate("fila"));

    const { ordens, produtos, estufas, meeiros } = await getLookupData();
    const meuEmail = normalizeEmail(typeof getUserEmail === "function" ? getUserEmail() : null);

    // Resumo rápido + atividade recente: preenchidos em paralelo, não bloqueiam a lista de ordens.
    (async () => {
      const [fila, pendentes] = await Promise.all([queueAll(), queuePending()]);
      const hojeStr = new Date().toDateString();
      const lancadosHoje = fila.filter((f) => new Date(f.createdAt).toDateString() === hojeStr).length;
      const estoqueBaixo = (produtos || []).filter(
        (p) => p["Produto"] && Number(p["Estoque"]) <= Number(p["Estoque Minimo"] || 0)
      ).length;
      container.querySelector("#resumo-hoje").textContent = lancadosHoje;
      container.querySelector("#resumo-estoque").textContent = estoqueBaixo;
      container.querySelector("#resumo-fila").textContent = pendentes.length;

      const atividadeList = container.querySelector("#atividade-recente-list");
      const recentes = fila.slice(0, 4); // queueAll() já vem ordenado do mais novo pro mais antigo
      if (recentes.length === 0) {
        atividadeList.innerHTML = `<div class="empty-state">Nenhum apontamento lançado ainda.</div>`;
        return;
      }
      atividadeList.innerHTML = recentes.map((item) => atividadeCardHtml(item, { estufas, meeiros })).join("");
    })();

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
      <div class="card ordem-card ${o.atrasada ? "atrasado" : ""}" data-id="${o["ID Ordem"]}">
        <div class="ordem-card-topo">
          <div class="ordem-card-icone">${o.atrasada ? "⚠️" : "🧪"}</div>
          <div class="ordem-card-titulo-wrap">
            <div class="card-title">${escapeHtml(o["Estufa"] || "")} — ${escapeHtml(o["Produto"] || "")}</div>
            <div class="card-sub">${o.atrasada ? "⚠ Atrasada — " : ""}Prevista: ${formatExcelDate(o["Data Prevista"])}</div>
          </div>
        </div>
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

const BLOCO_INFO = {
  Uso: { titulo: "Aplicação", icone: "🧪", cor: "atividade-icone-verde" },
  Ferti: { titulo: "Fertirrigação", icone: "💧", cor: "atividade-icone-verde" },
  Venda: { titulo: "Venda", icone: "💰", cor: "atividade-icone-azul" },
  Compra: { titulo: "Compra", icone: "🛒", cor: "atividade-icone-terracota" },
};

function formatMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Card de "Atividade recente" a partir de um item local da fila (o que foi
// lançado neste aparelho — não é um feed de outros usuários). Mostra o produto
// usado e o total (quantidade aplicada, ou valor gasto/vendido) além do resumo.
function atividadeCardHtml(item, lookups) {
  const f = item.fields || {};
  const bloco = f["Bloco"];
  const info = BLOCO_INFO[bloco] || { titulo: bloco || "Apontamento", icone: "📋", cor: "atividade-icone-verde" };
  const produtoNome = f["Produto"] || "—";

  let complemento;
  if (bloco === "Compra") {
    complemento = produtoNome;
  } else {
    const estufa = (lookups.estufas || []).find((e) => String(e.__cod) === String(f["Código Estufa"]));
    complemento = estufa ? estufa["Estufa"] : produtoNome;
  }

  let pessoa;
  if (bloco === "Compra") {
    pessoa = f["Fornecedor"] || "";
  } else {
    const meeiro = (lookups.meeiros || []).find((m) => String(m.__cod) === String(f["Código Meeiro"]));
    pessoa = meeiro ? meeiro["Meeiro"] : "";
  }

  // Segunda linha de detalhe: quantidade aplicada (Uso/Ferti) ou total em R$ (Venda/Compra).
  let totalLabel = null;
  let totalValor = null;
  if (bloco === "Uso") {
    totalLabel = "Qtde. aplicada";
    totalValor = `${Number(f["Quantidade"]) || 0} L`;
  } else if (bloco === "Ferti") {
    const totalSetores = SETOR_FIELDS.reduce((soma, campo) => soma + (Number(f[campo]) || 0), 0);
    totalLabel = "Qtde. aplicada";
    totalValor = `${totalSetores} L`;
  } else if (bloco === "Venda") {
    const total = (Number(f["Quantidade"]) || 0) * (Number(f["Valor Unitário"]) || 0);
    totalLabel = "Total da venda";
    totalValor = formatMoeda(total);
  } else if (bloco === "Compra") {
    const total = (Number(f["Quantidade"]) || 0) * (Number(f["Valor Unitário"]) || 0);
    totalLabel = "Total gasto";
    totalValor = formatMoeda(total);
  }

  return `
    <div class="card">
      <div class="atividade-card-topo">
        <div class="atividade-icone ${info.cor}">${info.icone}</div>
        <div style="flex:1; min-width:0;">
          <div class="card-title">${escapeHtml(info.titulo)}${complemento ? " — " + escapeHtml(complemento) : ""}</div>
          <div class="card-sub">${[pessoa, formatRelativeTime(item.createdAt)].filter(Boolean).join(" · ")}</div>
        </div>
      </div>
      ${bloco !== "Compra" ? `<div class="card-row"><span>Produto</span><span>${escapeHtml(produtoNome)}</span></div>` : ""}
      ${totalLabel ? `<div class="card-row"><span>${totalLabel}</span><span>${escapeHtml(totalValor)}</span></div>` : ""}
    </div>`;
}

function formatRelativeTime(isoString) {
  if (!isoString) return "";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

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
