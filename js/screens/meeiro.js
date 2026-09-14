// ============================================================================
// MEEIRO — apuração do valor a pagar ao meeiro sobre as vendas do período, e
// geração de um recibo (imagem) pronto pra enviar por WhatsApp.
//
// Fonte dos dados: aba "Registro de Inventario" (Tabela2), só as linhas de
// Venda (Tipo Movimentação = "V") do meeiro escolhido. O FUNRURAL (1,65%)
// incide só sobre a venda bruta feita pra cliente "PETERFRUT" — as vendas
// pra outros clientes (ex.: GOBBI) não entram nessa conta, por decisão do
// usuário. "Total Líquido" já é (venda bruta − embalagem), que a própria
// tabela guarda em "Venda Liquida"; o app só soma essa coluna e desconta o
// FUNRURAL por cima pra chegar no valor que o meeiro efetivamente recebe.
// ============================================================================

const MEEIRO_FUNRURAL_PERCENTUAL = 0.0165; // 1,65%
const MEEIRO_CLIENTE_FUNRURAL = "PETERFRUT";

// Nem toda venda tem "Valor Unit. Venda" preenchido — lançamentos antigos
// vindos da própria planilha (antes do App Campo existir) só têm o "Total
// Venda" já calculado. Nesses casos, reconstrói o unitário dividindo pela
// quantidade, só pra exibição (nunca é gravado de volta).
function meeiroValorUnitVenda(r) {
  const v = Number(r["Valor Unit. Venda"]);
  if (v > 0) return v;
  const qtde = Number(r["Qtde."]) || 0;
  return qtde > 0 ? (Number(r["Total Venda"]) || 0) / qtde : 0;
}

function meeiroTotalLiquidoLinha(r) {
  const vl = r["Venda Liquida"];
  return vl !== undefined && vl !== null && vl !== "" ? Number(vl) || 0 : Number(r["Total Venda"]) || 0;
}

const ScreenMeeiro = {
  percentual: 50,

  async render(container) {
    const lookups = await getLookupData();

    const hoje = new Date();
    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
    const hojeStr = hoje.toISOString().slice(0, 10);

    container.innerHTML = `
      <h2 class="page-title">Meeiro</h2>
      <p class="page-subtitle">Apuração e recibo de pagamento ao meeiro</p>

      <div class="card">
        <label>👤 Meeiro</label>
        <div id="meeiro-combo"></div>
        <label>📅 Data inicial</label>
        <input type="date" id="meeiro-data-inicial" value="${primeiroDiaMes}" />
        <label>📅 Data final</label>
        <input type="date" id="meeiro-data-final" value="${hojeStr}" />
        <label>💰 Percentual do meeiro</label>
        <div class="meeiro-percentual-toggle" id="meeiro-percentual-toggle">
          <button type="button" class="chip ${this.percentual === 30 ? "active" : ""}" data-p="30">30%</button>
          <button type="button" class="chip ${this.percentual === 50 ? "active" : ""}" data-p="50">50%</button>
        </div>
      </div>

      <div id="meeiro-resumo"></div>

      <div class="sechead">Demonstrativo de vendas</div>
      <div id="meeiro-lista"><div class="empty-state">Selecione o meeiro pra ver as vendas.</div></div>
    `;

    const resumoEl = container.querySelector("#meeiro-resumo");
    const listaEl = container.querySelector("#meeiro-lista");
    const dataInicialEl = container.querySelector("#meeiro-data-inicial");
    const dataFinalEl = container.querySelector("#meeiro-data-final");
    const toggleEl = container.querySelector("#meeiro-percentual-toggle");

    let meeiroCod = null;
    let todasVendas = [];

    const meeiroOpcoes = lookups.meeiros.map((m) => ({ value: m.__cod, label: m["Meeiro"] }));
    criarComboBusca(container.querySelector("#meeiro-combo"), meeiroOpcoes, {
      placeholder: "Buscar meeiro...",
      onChange: (opcao) => {
        meeiroCod = opcao ? opcao.value : null;
        renderTudo();
      },
    });

    try {
      // Só as vendas (V) interessam aqui — mas a tabela inteira (Registro de
      // Inventario) é lida de uma vez e filtrada localmente, porque a pessoa
      // pode trocar meeiro/período/percentual várias vezes seguidas sem
      // precisar reconsultar a planilha a cada troca.
      todasVendas = (await readTable(TABLES.registroInventario)).filter((r) => r["Tipo Movimentação"] === "V");
    } catch (e) {
      console.error("Falha ao carregar vendas:", e);
      listaEl.innerHTML = `<div class="empty-state">Não foi possível carregar as vendas (${escapeHtml(
        String(e.message || e)
      )}). Verifique a conexão ou toque no nome do arquivo no topo do app pra selecionar de novo.</div>`;
      return;
    }

    const vendasFiltradas = () => {
      if (!meeiroCod) return [];
      const inicioSerial = dataInicialEl.value ? toExcelSerial(dataInicialEl.value) : null;
      const fimSerial = dataFinalEl.value ? toExcelSerial(dataFinalEl.value) : null;
      return todasVendas
        .filter((r) => String(r["Código Meeiro"]) === String(meeiroCod))
        .filter((r) => {
          const d = Number(r["Data"]);
          if (inicioSerial !== null && d < inicioSerial) return false;
          if (fimSerial !== null && d > fimSerial) return false;
          return true;
        })
        .sort((a, b) => (Number(a["Data"]) || 0) - (Number(b["Data"]) || 0));
    };

    const calcularTotais = (vendas) => {
      const totalBruto = vendas.reduce((s, r) => s + (Number(r["Total Venda"]) || 0), 0);
      const totalLiquidoBruto = vendas.reduce((s, r) => s + meeiroTotalLiquidoLinha(r), 0);
      const baseFunrural = vendas
        .filter((r) => String(r["Cliente"] || "").trim().toUpperCase() === MEEIRO_CLIENTE_FUNRURAL)
        .reduce((s, r) => s + (Number(r["Total Venda"]) || 0), 0);
      const funrural = baseFunrural * MEEIRO_FUNRURAL_PERCENTUAL;
      const totalLiquidoFinal = totalLiquidoBruto - funrural;
      const valorMeeiro = totalLiquidoFinal * (this.percentual / 100);
      return { totalBruto, baseFunrural, funrural, totalLiquidoFinal, valorMeeiro };
    };

    const renderResumo = (vendas) => {
      if (!meeiroCod) {
        resumoEl.innerHTML = "";
        return;
      }
      if (vendas.length === 0) {
        resumoEl.innerHTML = `<div class="empty-state">Nenhuma venda encontrada nesse período.</div>`;
        return;
      }
      const t = calcularTotais(vendas);
      resumoEl.innerHTML = `
        <div class="card meeiro-resumo">
          <div class="drow"><span>Total de vendas (bruto)</span><span>${formatMoeda(t.totalBruto)}</span></div>
          <div class="drow"><span>FUNRURAL (1,65% s/ vendas Peterfrut)</span><span class="meeiro-negativo">− ${formatMoeda(t.funrural)}</span></div>
          <div class="meeiro-linha-sub">Base do cálculo: ${formatMoeda(t.baseFunrural)} em vendas p/ Peterfrut</div>
          <div class="dashed"></div>
          <div class="financeiro-totalrow"><span>Total Líquido</span><span>${formatMoeda(t.totalLiquidoFinal)}</span></div>
          <div class="drow"><span>Percentual do meeiro</span><span>${this.percentual}%</span></div>
          <div class="meeiro-destaque">
            <span>Valor a pagar ao meeiro</span>
            <span>${formatMoeda(t.valorMeeiro)}</span>
          </div>
          <button type="button" class="btn btn-primary btn-lg" id="btn-gerar-recibo">📲 Gerar recibo e enviar</button>
        </div>
      `;
      const btnRecibo = resumoEl.querySelector("#btn-gerar-recibo");
      btnRecibo.addEventListener("click", async () => {
        btnRecibo.disabled = true;
        btnRecibo.textContent = "Gerando...";
        try {
          const meeiro = lookups.meeiros.find((m) => String(m.__cod) === String(meeiroCod));
          await enviarReciboMeeiro({
            meeiroNome: meeiro ? meeiro["Meeiro"] : "—",
            dataInicial: dataInicialEl.value,
            dataFinal: dataFinalEl.value,
            percentual: this.percentual,
            qtdeVendas: vendas.length,
            vendas,
            ...t,
          });
        } catch (e) {
          console.error("Falha ao gerar recibo:", e);
          showToast("Não foi possível gerar o recibo.");
        } finally {
          btnRecibo.disabled = false;
          btnRecibo.textContent = "📲 Gerar recibo e enviar";
        }
      });
    };

    const linhaHtml = (r) => {
      const embalagem = Number(r["Valor Caixa"]) || 0;
      return `
        <div class="card meeiro-linha">
          <div class="meeiro-linha-topo"><span>${formatExcelDate(r["Data"])}</span><span>${escapeHtml(r["Cliente"] || "—")}</span></div>
          <div class="drow"><span>${escapeHtml(r["Descricao"] || "—")}</span><span>${formatMoeda(meeiroTotalLiquidoLinha(r))}</span></div>
          <div class="meeiro-linha-sub">Qtde. ${formatNumero(r["Qtde."])} · Vlr. Unit. ${formatMoeda(meeiroValorUnitVenda(r))}${
        embalagem > 0 ? ` · Embalagem ${formatMoeda(embalagem)}/un.` : ""
      }</div>
        </div>`;
    };

    const renderLista = (vendas) => {
      if (!meeiroCod) {
        listaEl.innerHTML = `<div class="empty-state">Selecione o meeiro pra ver as vendas.</div>`;
        return;
      }
      if (vendas.length === 0) {
        listaEl.innerHTML = `<div class="empty-state">Nenhuma venda nesse período.</div>`;
        return;
      }
      listaEl.innerHTML = vendas.map(linhaHtml).join("");
    };

    const renderTudo = () => {
      const vendas = vendasFiltradas();
      renderResumo(vendas);
      renderLista(vendas);
    };

    toggleEl.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        this.percentual = Number(chip.dataset.p);
        toggleEl.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
        renderTudo();
      });
    });
    dataInicialEl.addEventListener("change", renderTudo);
    dataFinalEl.addEventListener("change", renderTudo);

    renderTudo();
  },
};

// dd/mm/aaaa a partir de um <input type="date"> (formato "aaaa-mm-dd").
function formatDataISOparaBR(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Gera o recibo de pagamento ao meeiro em PDF (A4) — cabeçalho, meeiro +
// período, o extrato analítico das vendas em TABELA (uma linha por venda,
// pra dar pra conferir cada lançamento — pagina automaticamente se não
// couber numa folha só), a apuração (bruto → FUNRURAL → líquido →
// percentual → valor a pagar em destaque), o texto de referência do
// pagamento e uma única linha de assinatura — a do meeiro selecionado (o
// recibo é dele assinar; não há segunda via da Peterfrut aqui).
//
// Usa jsPDF (CDN, carregado em index.html) — igual ao Chart.js do
// Financeiro, só funciona com a página já carregada com internet ao menos
// uma vez; se a biblioteca não tiver carregado (ex.: script bloqueado),
// avisa em vez de travar.
function truncarTextoPdf(doc, texto, larguraMaxMM) {
  const t = String(texto ?? "");
  if (doc.getTextWidth(t) <= larguraMaxMM) return t;
  let cortado = t;
  while (cortado.length > 1 && doc.getTextWidth(cortado + "…") > larguraMaxMM) {
    cortado = cortado.slice(0, -1);
  }
  return cortado + "…";
}

async function gerarReciboMeeiroPdf(dados) {
  if (typeof window.jspdf === "undefined" || !window.jspdf.jsPDF) {
    throw new Error("Biblioteca de PDF não carregou (sem internet na primeira vez que o app abriu?).");
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const vendas = dados.vendas || [];
  const margin = 15;
  const pageW = 210;
  const contentW = pageW - margin * 2; // 180mm
  const bottomLimit = 282; // deixa ~15mm de margem inferior na folha A4 (297mm)

  // Cores (mesma paleta do app, em RGB).
  const COR_VERDE = [31, 61, 43];
  const COR_TEXTO = [26, 26, 26];
  const COR_MUTED = [107, 107, 101];
  const COR_RODAPE = [138, 136, 127];
  const COR_BORDA = [222, 220, 210];
  const COR_ZEBRA = [250, 249, 246];
  const COR_VERMELHO = [179, 38, 30];
  const COR_DOURADO = [181, 121, 46];

  const periodoTexto = `${formatDataISOparaBR(dados.dataInicial)} a ${formatDataISOparaBR(dados.dataFinal)}`;

  let y = margin;
  let pagina = 1;

  const novaPagina = () => {
    doc.addPage();
    pagina += 1;
    y = margin;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COR_RODAPE);
    doc.text(`Recibo de Pagamento — continuação (pág. ${pagina})`, margin, y);
    y += 8;
  };
  const garantirEspaco = (alturaNecessaria) => {
    if (y + alturaNecessaria > bottomLimit) novaPagina();
  };
  const tracejada = (yy) => {
    doc.setDrawColor(...COR_BORDA);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(margin, yy, margin + contentW, yy);
    doc.setLineDashPattern([], 0);
  };

  // --- Cabeçalho (só na 1ª página) ---------------------------------------
  doc.setFillColor(...COR_VERDE);
  doc.rect(0, 0, pageW, 20, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Recibo de Pagamento", margin, 13);
  y = 30;

  // Meeiro + período.
  doc.setTextColor(...COR_TEXTO);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(dados.meeiroNome || "—", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COR_MUTED);
  doc.text(`Período: ${periodoTexto}`, margin, y);
  y += 10;

  // --- Extrato das vendas, em tabela --------------------------------------
  const colData = { x: 0, w: 16 };
  const colCliente = { x: 16, w: 30 };
  const colProduto = { x: 46, w: 64 };
  const colVlrUnit = { x: 110, w: 24 };
  const colEmb = { x: 134, w: 20 };
  const colTotal = { x: 154, w: 26 };
  const cx = (col) => margin + col.x;
  const altLinhaTabela = 6;

  const desenharCabecalhoTabela = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...COR_RODAPE);
    doc.text("Data", cx(colData), y);
    doc.text("Cliente", cx(colCliente), y);
    doc.text("Produto", cx(colProduto), y);
    doc.text("Vlr. Unit.", cx(colVlrUnit) + colVlrUnit.w, y, { align: "right" });
    doc.text("Emb.", cx(colEmb) + colEmb.w, y, { align: "right" });
    doc.text("Total", cx(colTotal) + colTotal.w, y, { align: "right" });
    y += 2;
    tracejada(y);
    y += 4;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COR_MUTED);
  doc.text(`EXTRATO DAS VENDAS · ${vendas.length} LANÇAMENTO${vendas.length === 1 ? "" : "S"}`, margin, y);
  y += 6;
  desenharCabecalhoTabela();

  const garantirEspacoTabela = () => {
    if (y + altLinhaTabela + 2 > bottomLimit) {
      novaPagina();
      desenharCabecalhoTabela();
    }
  };

  vendas.forEach((r, idx) => {
    garantirEspacoTabela();

    if (idx % 2 === 1) {
      doc.setFillColor(...COR_ZEBRA);
      doc.rect(margin, y - 4, contentW, altLinhaTabela, "F");
    }
    const embalagem = Number(r["Valor Caixa"]) || 0;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COR_TEXTO);
    doc.text(formatExcelDate(r["Data"]), cx(colData), y);
    doc.text(truncarTextoPdf(doc, r["Cliente"] || "—", colCliente.w - 2), cx(colCliente), y);
    doc.text(truncarTextoPdf(doc, r["Descricao"] || "—", colProduto.w - 2), cx(colProduto), y);
    doc.text(formatMoeda(meeiroValorUnitVenda(r)), cx(colVlrUnit) + colVlrUnit.w, y, { align: "right" });
    doc.setTextColor(...COR_DOURADO);
    doc.text(embalagem > 0 ? formatMoeda(embalagem) : "—", cx(colEmb) + colEmb.w, y, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COR_TEXTO);
    doc.text(formatMoeda(meeiroTotalLiquidoLinha(r)), cx(colTotal) + colTotal.w, y, { align: "right" });
    y += altLinhaTabela;
    tracejada(y - 2);
  });
  y += 6;

  // --- Apuração ------------------------------------------------------------
  garantirEspaco(60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COR_MUTED);
  doc.text("APURAÇÃO", margin, y);
  y += 7;

  const linhaResumo = (label, valor, cor) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...(cor || COR_TEXTO));
    doc.text(label, margin, y);
    doc.setFont("helvetica", "bold");
    doc.text(valor, margin + contentW, y, { align: "right" });
    y += 7;
  };

  linhaResumo("Total de vendas (bruto)", formatMoeda(dados.totalBruto));
  linhaResumo("FUNRURAL", `− ${formatMoeda(dados.funrural)}`, COR_VERMELHO);
  tracejada(y - 3);
  y += 3;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COR_TEXTO);
  doc.text("Total Líquido", margin, y);
  doc.text(formatMoeda(dados.totalLiquidoFinal), margin + contentW, y, { align: "right" });
  y += 8;

  linhaResumo("Percentual do meeiro", `${dados.percentual}%`);
  tracejada(y - 3);
  y += 5;

  // --- Destaque — valor a pagar ---------------------------------------------
  garantirEspaco(24);
  doc.setFillColor(...COR_VERDE);
  doc.roundedRect(margin, y, contentW, 18, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(230, 236, 232);
  doc.text("VALOR A PAGAR AO MEEIRO", margin + 6, y + 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(formatMoeda(dados.valorMeeiro), margin + 6, y + 14.5);
  y += 26;

  // --- Texto de referência do pagamento --------------------------------------
  const declaracao = doc.setFont("helvetica", "italic").setFontSize(9).splitTextToSize(
    "Referente ao pagamento pela venda de produtos hortifrutigranjeiros pelo(a) meeiro(a) acima, conforme contrato de parceria agrícola (meação), no período indicado.",
    contentW
  );
  garantirEspaco(declaracao.length * 4.5 + 10);
  doc.setTextColor(...COR_MUTED);
  doc.text(declaracao, margin, y);
  y += declaracao.length * 4.5 + 4;

  // Nº de vendas + data de geração.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COR_RODAPE);
  doc.text(
    `${dados.qtdeVendas} venda${dados.qtdeVendas === 1 ? "" : "s"} no período · Gerado em ${formatDataISOparaBR(
      new Date().toISOString().slice(0, 10)
    )}`,
    margin,
    y
  );
  y += 12;

  // --- Assinatura — só a do meeiro --------------------------------------------
  garantirEspaco(22);
  const largAssinatura = Math.min(90, contentW);
  doc.setDrawColor(200, 199, 188);
  doc.line(margin, y, margin + largAssinatura, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COR_TEXTO);
  doc.text(dados.meeiroNome || "—", margin, y);
  y += 4.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COR_RODAPE);
  doc.text("Assinatura do meeiro", margin, y);

  return doc.output("blob");
}

async function enviarReciboMeeiro(dados) {
  let blob;
  try {
    blob = await gerarReciboMeeiroPdf(dados);
  } catch (e) {
    console.error("Falha ao gerar recibo em PDF:", e);
    showToast(`Não foi possível gerar o PDF do recibo (${e.message || e}).`);
    return;
  }
  const nomeArquivo = `recibo-${dados.meeiroNome}-${dados.dataFinal}`.replace(/[^\w-]+/g, "_") + ".pdf";
  await compartilharArquivo(blob, nomeArquivo, "application/pdf", "PDF");
}
