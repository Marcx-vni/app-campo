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

    const { ordens, produtos } = await getLookupData();
    const meuEmail = normalizeEmail(typeof getUserEmail === "function" ? getUserEmail() : null);

    // Resumo rápido + atividade recente: buscados da própria planilha (Registro
    // de Inventario, ordenado pela coluna "Gravado em" — a AF), não da fila local
    // deste aparelho. Antes usava a fila local e por isso "sumia" toda vez que
    // trocava de aparelho ou o app era reaberto sem nada pendente; agora reflete
    // o que foi realmente gravado, de qualquer aparelho.
    (async () => {
      const pendentes = await queuePending();
      container.querySelector("#resumo-fila").textContent = pendentes.length;

      let registro = [];
      try {
        registro = await readTable(TABLES.registroInventario);
      } catch (e) {
        console.warn("Falha ao buscar Registro de Inventario pra Atividade recente:", e);
      }
      const comData = registro
        .filter((r) => r["Gravado em"])
        .sort((a, b) => Number(b["Gravado em"]) - Number(a["Gravado em"]));

      const hojeSerial = toExcelSerial(new Date());
      const lancadosHoje = comData.filter((r) => Math.floor(Number(r["Gravado em"])) === hojeSerial).length;
      const estoqueBaixo = (produtos || []).filter(
        (p) => p["Produto"] && Number(p["Estoque"]) <= Number(p["Estoque Minimo"] || 0)
      ).length;
      container.querySelector("#resumo-hoje").textContent = lancadosHoje;
      container.querySelector("#resumo-estoque").textContent = estoqueBaixo;

      const atividadeList = container.querySelector("#atividade-recente-list");
      const recentes = comData.slice(0, 4);
      if (recentes.length === 0) {
        atividadeList.innerHTML = `<div class="empty-state">Nenhum apontamento lançado ainda.</div>`;
        return;
      }
      atividadeList.innerHTML = recentes.map((row) => atividadeCardHtml(row, produtos)).join("");
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

// "Tipo Movimentação" na planilha: S = saída (Uso ou Ferti — a planilha não
// distingue os dois nessa coluna), V = venda, E = entrada/compra.
const TIPO_MOVIMENTACAO_INFO = {
  S: { icone: "🧪", cor: "atividade-icone-verde" },
  V: { icone: "💰", cor: "atividade-icone-azul" },
  E: { icone: "🛒", cor: "atividade-icone-terracota" },
};

function formatMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Card de "Atividade recente" a partir de uma linha real do Registro de
// Inventario (não da fila local) — reflete o que foi gravado por qualquer
// aparelho, ordenado pela coluna "Gravado em" (AF).
// `produtos` (Tabela613) é usado só pra achar a unidade (kg/L/un) do produto
// consumido, nas linhas de uso (S).
function atividadeCardHtml(row, produtos) {
  const tipo = row["Tipo Movimentação"];
  const info = TIPO_MOVIMENTACAO_INFO[tipo] || { icone: "📋", cor: "atividade-icone-verde" };
  const isCompra = tipo === "E";
  const produtoNome = row["Descricao"] || "—";
  const complemento = isCompra ? produtoNome : row["Estufa"] || "";
  const pessoa = isCompra ? row["Fornecedor"] || "" : row["Meeiro"] || "";

  // Linhas extras de detalhe, além de Produto: variam por tipo de movimentação.
  const linhasExtra = [];
  if (tipo === "S") {
    const produtoInfo = (produtos || []).find((p) => p["Produto"] === produtoNome);
    const unidade = produtoInfo?.["Unidade"] || "";
    linhasExtra.push(["Volume aplicado", `${Number(row["Volume Calda"]) || 0} L`]);
    linhasExtra.push(["Qtde. usada", `${Number(row["Qtde."]) || 0}${unidade ? " " + unidade : ""}`]); // coluna K
    if (row["Total Saida"] !== undefined && row["Total Saida"] !== null && row["Total Saida"] !== "") {
      linhasExtra.push(["Total", formatMoeda(row["Total Saida"])]); // coluna U
    }
  } else if (tipo === "V") {
    linhasExtra.push(["Total da venda", formatMoeda(row["Total Venda"])]);
  } else if (tipo === "E") {
    const total = (Number(row["Qtde."]) || 0) * (Number(row["Valor Entrada"]) || 0);
    linhasExtra.push(["Total gasto", formatMoeda(total)]);
  }

  return `
    <div class="card">
      <div class="atividade-card-topo">
        <div class="atividade-icone ${info.cor}">${info.icone}</div>
        <div style="flex:1; min-width:0;">
          <div class="card-title">${escapeHtml(row["Operação"] || "Apontamento")}${complemento ? " — " + escapeHtml(complemento) : ""}</div>
          <div class="card-sub">${[pessoa, formatRelativeTimeFromSerial(row["Gravado em"])].filter(Boolean).join(" · ")}</div>
        </div>
      </div>
      ${!isCompra ? `<div class="card-row"><span>Produto</span><span>${escapeHtml(produtoNome)}</span></div>` : ""}
      ${linhasExtra.map(([label, valor]) => `<div class="card-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(String(valor))}</span></div>`).join("")}
    </div>`;
}

// "Gravado em" é um serial Excel de data+hora, gravado a partir do horário
// LOCAL tratado como se fosse UTC (ver toExcelSerialDateTime em apontamento.js)
// — então pra calcular "há quanto tempo" comparamos no mesmo "fuso fake",
// senão o cálculo fica errado pelo deslocamento do fuso horário.
function formatRelativeTimeFromSerial(serial) {
  if (!serial) return "";
  const excelEpocaMs = Date.UTC(1899, 11, 30);
  const momentoMs = excelEpocaMs + Number(serial) * 86400000;
  const agora = new Date();
  const agoraFakeMs = Date.UTC(
    agora.getFullYear(), agora.getMonth(), agora.getDate(),
    agora.getHours(), agora.getMinutes(), agora.getSeconds()
  );
  const diffMs = agoraFakeMs - momentoMs;
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
