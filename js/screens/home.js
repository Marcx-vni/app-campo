// ============================================================================
// TELA INICIAL (Início) — resumo rápido do dia, atalhos, atividade recente
// (das últimas gravações na planilha) e "Minhas Ordens" (T1: lista de cards
// filtrada pelo e-mail de quem logou, coluna "E-mail" da tabela Ordens, com
// Situação <> Executada — atrasadas, Data Prevista < hoje, aparecem primeiro).
// Antes esse conteúdo todo vivia na aba "Ordens" da navegação; agora tem tela
// própria porque a aba "Ordens" passou a ser a Consulta de Fertirrigações.
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

const ScreenHome = {
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
        <div class="resumo-card">
          <div class="resumo-valor resumo-valor-pequeno" id="resumo-valor-estoque">—</div>
          <div class="resumo-label">Valor em estoque</div>
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

    // Nunca deixa a tela travada em "Carregando..." pra sempre sem explicação:
    // se a busca dos dados da planilha falhar (ex.: arquivo movido/renomeado
    // e a referência salva neste aparelho ficou inválida), mostra o erro e
    // orienta a tocar no nome do arquivo no topo pra selecionar de novo.
    let ordens = [], produtos = [];
    try {
      ({ ordens, produtos } = await getLookupData());
    } catch (e) {
      console.error("Falha ao carregar dados da planilha:", e);
      container.querySelectorAll(".resumo-valor").forEach((el) => (el.textContent = "erro"));
      container.querySelector("#atividade-recente-list").innerHTML =
        `<div class="empty-state">Não foi possível carregar.</div>`;
      container.querySelector("#ordens-list").innerHTML = `<div class="empty-state">
        Não foi possível carregar os dados da planilha (${escapeHtml(String(e.message || e))}).
        Verifique a conexão ou toque no nome do arquivo no topo do app pra selecionar de novo.
      </div>`;
      return;
    }
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
      let registroFerti = [];
      try {
        [registro, registroFerti] = await Promise.all([
          readTable(TABLES.registroInventario),
          readTable(TABLES.registroFerti).catch(() => []),
        ]);
      } catch (e) {
        console.warn("Falha ao buscar Registro de Inventario pra Atividade recente:", e);
      }
      // A Fertirrigação grava em "Tipo Movimentação" = S, igual à Aplicação
      // (Uso) — a coluna "Operação" vem igual pros dois ("Saída Consumo"),
      // então pra dar cor/rótulo diferente na Fertirrigação cruzamos com a
      // aba "Registro Ferti" pelos mesmos dados (Estufa+Produto+Data+Meeiro).
      const fertiIndex = new Map();
      registroFerti.forEach((f) => {
        fertiIndex.set(chaveFerti(f["Estufa"], f["Produto"], f["Data"], f["Meeiro"]), f);
      });

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

      const valorKeyEstoque = acharChaveValorEstoque(produtos || []);
      const valorEstoqueEl = container.querySelector("#resumo-valor-estoque");
      if (valorKeyEstoque) {
        const total = (produtos || []).reduce((soma, p) => soma + (Number(p[valorKeyEstoque]) || 0), 0);
        valorEstoqueEl.textContent = formatMoeda(total);
      } else {
        valorEstoqueEl.textContent = "—";
      }

      const atividadeList = container.querySelector("#atividade-recente-list");
      const recentes = comData.slice(0, 4);
      if (recentes.length === 0) {
        atividadeList.innerHTML = `<div class="empty-state">Nenhum apontamento lançado ainda.</div>`;
        return;
      }
      atividadeList.innerHTML = recentes.map((row) => atividadeCardHtml(row, produtos, fertiIndex)).join("");
      atividadeList.querySelectorAll(".btn-compartilhar").forEach((btn) => {
        btn.addEventListener("click", () => {
          const fertiRow = fertiIndex.get(btn.dataset.fertiKey);
          if (fertiRow) compartilharTexto(montarTextoWhatsAppFerti(fertiRow));
        });
      });
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

// Número com separador de milhar "." e decimal "," (padrão brasileiro), sem
// zeros à direita desnecessários — ex.: 1234.5 -> "1.234,5", 0.045 -> "0,045".
function formatNumero(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

// Alguns produtos do Cadastro (Tabela613) têm a coluna "Unidade" preenchida
// errado com um número (ex.: "1000") em vez de um texto de unidade (L, kg,
// un.) — isso não é um bug do app, é dado da planilha, mas exibir "5 1000"
// confunde mais do que ajuda. Se "Unidade" for puramente numérico, tratamos
// como se estivesse vazio.
function unidadeValida(u) {
  const s = (u || "").toString().trim();
  if (!s) return "";
  if (!isNaN(Number(s.replace(",", ".")))) return "";
  return s;
}

// Chave usada pra cruzar uma linha do Registro de Inventario com sua linha
// correspondente no Registro Ferti (nenhuma das duas tabelas guarda uma
// referência direta uma pra outra, então a única forma de casar as duas é
// pelos dados que as duas têm em comum: mesma Estufa+Produto+Data+Meeiro).
function chaveFerti(estufa, produto, dataSerial, meeiro) {
  return [estufa, produto, dataSerial, meeiro].map((v) => String(v ?? "").trim().toLowerCase()).join("||");
}

// Texto pronto pra compartilhar por WhatsApp — um "relatório de campo" com
// as quantidades por setor, pra mandar direto pro meeiro que vai aplicar.
function montarTextoWhatsAppFerti(fertiRow) {
  // Arredondado pra dezena de grama (a pedido do usuário) — lançamentos
  // novos já são gravados assim; isso também arredonda lançamentos antigos
  // que ainda tenham valor "quebrado", pra manter o recado sempre redondo.
  const setores = [1, 2, 3, 4, 5, 6]
    .map((n) => ({ n, v: arredondarParaDezena(fertiRow[`Setor ${n}`]) }))
    .filter((s) => s.v > 0);
  const total = setores.reduce((soma, s) => soma + s.v, 0);
  // Dosagem e D.A.T ficaram de fora do texto a pedido do usuário — são
  // informação de controle interno, e misturadas ao recado do meeiro só
  // confundiam (ele só precisa saber quanto pesar em cada setor).
  const linhasSetor = setores.map((s) => `Setor ${s.n}- ${formatNumero(s.v)} gramas`).join("\n");
  return (
    `🧪 *Fertirrigação — ${fertiRow["Estufa"] || "—"}*\n` +
    `📅 ${formatExcelDate(fertiRow["Data"])}\n` +
    `👤 Meeiro: ${fertiRow["Meeiro"] || "—"}\n` +
    `🌱 Produto: ${fertiRow["Produto"] || "—"}\n\n` +
    `${linhasSetor}\n\n` +
    `*Total todos os setores - ${formatNumero(total)} gramas*`
  );
}

// Card de "Atividade recente" a partir de uma linha real do Registro de
// Inventario (não da fila local) — reflete o que foi gravado por qualquer
// aparelho, ordenado pela coluna "Gravado em" (AF).
// `produtos` (Tabela613) é usado só pra achar a unidade (kg/L/un) do produto
// consumido, nas linhas de uso (S). `fertiIndex` (Estufa+Produto+Data+Meeiro
// -> linha do Registro Ferti) é usado só pra diferenciar Fertirrigação de
// Aplicação normal, já que as duas gravam "Tipo Movimentação" = S igual.
function atividadeCardHtml(row, produtos, fertiIndex) {
  const tipo = row["Tipo Movimentação"];
  const isCompra = tipo === "E";
  const produtoNome = row["Descricao"] || "—";
  const pessoa = isCompra ? row["Fornecedor"] || "" : row["Meeiro"] || "";

  const fertiRow =
    tipo === "S" && fertiIndex
      ? fertiIndex.get(chaveFerti(row["Estufa"], produtoNome, row["Data"], row["Meeiro"]))
      : null;

  if (fertiRow) {
    const setores = [1, 2, 3, 4, 5, 6]
      .map((n) => arredondarParaDezena(fertiRow[`Setor ${n}`]))
      .filter((v) => v > 0);
    const total = setores.reduce((a, b) => a + b, 0);
    return `
      <div class="card card-ferti">
        <div class="atividade-card-topo">
          <div class="atividade-icone atividade-icone-ferti">💧</div>
          <div style="flex:1; min-width:0;">
            <div class="card-title">Fertirrigação — ${escapeHtml(row["Estufa"] || "")} <span class="tag-ferti">FERTI</span></div>
            <div class="card-sub">${[pessoa, formatRelativeTimeFromSerial(row["Gravado em"])].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        <div class="card-row"><span>Produto</span><span>${escapeHtml(produtoNome)}</span></div>
        <div class="card-row"><span>Dosagem</span><span>${formatNumero(fertiRow["Dosagem"])} /1.000 plantas</span></div>
        <div class="card-row"><span>Setores aplicados</span><span>${setores.length}</span></div>
        <div class="card-row ferti-total-row"><span>Total</span><span>${formatNumero(total)} (${formatNumero(total / 1000)} no estoque)</span></div>
        <button type="button" class="btn-compartilhar" data-ferti-key="${escapeHtml(chaveFerti(row["Estufa"], produtoNome, row["Data"], row["Meeiro"]))}">📲 Enviar por WhatsApp</button>
      </div>`;
  }

  const info = TIPO_MOVIMENTACAO_INFO[tipo] || { icone: "📋", cor: "atividade-icone-verde" };
  const complemento = isCompra ? produtoNome : row["Estufa"] || "";

  // Linhas extras de detalhe, além de Produto: variam por tipo de movimentação.
  const linhasExtra = [];
  if (tipo === "S") {
    const produtoInfo = (produtos || []).find((p) => p["Produto"] === produtoNome);
    const unidade = unidadeValida(produtoInfo?.["Unidade"]);
    linhasExtra.push(["Volume aplicado", `${formatNumero(row["Volume Calda"])} L`]); // coluna J
    linhasExtra.push(["Qtde. usada", `${formatNumero(row["Qtde."])}${unidade ? " " + unidade : ""}`]); // coluna K
    if (row["Total Saida"] !== undefined && row["Total Saida"] !== null && row["Total Saida"] !== "") {
      linhasExtra.push(["Total", formatMoeda(row["Total Saida"])]); // coluna U
    }
  } else if (tipo === "V") {
    linhasExtra.push(["Qtde. vendida", formatNumero(row["Qtde."])]); // coluna K
    linhasExtra.push(["Preço Venda", formatMoeda(row["Valor Unit. Venda"])]); // coluna AG
    linhasExtra.push(["Total da venda", formatMoeda(row["Total Venda"])]);
  } else if (tipo === "E") {
    const qtde = Number(row["Qtde."]) || 0; // coluna K
    const valorUnit = Number(row["Valor Entrada"]) || 0; // coluna L
    const totalEntrada =
      row["Total Entrada"] !== undefined && row["Total Entrada"] !== null && row["Total Entrada"] !== ""
        ? Number(row["Total Entrada"]) // coluna S, quando já recalculada
        : qtde * valorUnit;
    linhasExtra.push(["Qtd.", formatNumero(qtde)]);
    linhasExtra.push(["Vlr. unit.", formatMoeda(valorUnit)]);
    linhasExtra.push(["Total", formatMoeda(totalEntrada)]);
  }

  // Na Compra o "complemento" do título já é o nome do produto (não tem
  // Estufa) — por isso a linha de Produto abaixo é sempre mostrada, pra não
  // ficar faltando essa informação no card.
  return `
    <div class="card">
      <div class="atividade-card-topo">
        <div class="atividade-icone ${info.cor}">${info.icone}</div>
        <div style="flex:1; min-width:0;">
          <div class="card-title">${escapeHtml(row["Operação"] || "Apontamento")}${complemento ? " — " + escapeHtml(complemento) : ""}</div>
          <div class="card-sub">${[pessoa, formatRelativeTimeFromSerial(row["Gravado em"])].filter(Boolean).join(" · ")}</div>
        </div>
      </div>
      <div class="card-row"><span>Produto</span><span>${escapeHtml(produtoNome)}</span></div>
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
