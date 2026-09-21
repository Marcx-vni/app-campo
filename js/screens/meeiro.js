// ============================================================================
// MEEIRO — apuração do valor a pagar ao meeiro sobre as vendas do período, e
// geração de um recibo (PDF) pronto pra enviar por WhatsApp. A tela já
// pré-visualiza o recibo completo (o PDF de verdade, num <iframe>) assim que
// meeiro/período/percentual são escolhidos, em vez de mostrar uma lista à
// parte das vendas — assim a pessoa confere exatamente o que vai ser
// enviado antes de tocar em "Gerar recibo e enviar".
//
// Fonte dos dados: aba "Registro de Inventario" (Tabela2), só as linhas de
// Venda (Tipo Movimentação = "V") do meeiro escolhido. O FUNRURAL (1,65%)
// incide só sobre a venda bruta feita pra cliente "PETERFRUT" — as vendas
// pra outros clientes (ex.: GOBBI) não entram nessa conta, por decisão do
// usuário, e é calculado e exibido LINHA A LINHA no extrato (zero quando
// não incide), não mais como um desconto único lá na apuração. "Total
// Venda Líquida" de cada linha já é (venda bruta − embalagem − FUNRURAL
// dessa venda); a apuração só soma essa coluna pra chegar no valor que o
// meeiro efetivamente recebe.
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

// FUNRURAL de UMA venda — só incide sobre venda bruta pro cliente PETERFRUT;
// pras demais (GOBBI, ZIMBRÃO...) o valor é sempre zero. Exibido linha a
// linha no extrato (não mais como um desconto único lá na apuração).
function meeiroFunruralLinha(r) {
  const cliente = String(r["Cliente"] || "").trim().toUpperCase();
  if (cliente !== MEEIRO_CLIENTE_FUNRURAL) return 0;
  return (Number(r["Total Venda"]) || 0) * MEEIRO_FUNRURAL_PERCENTUAL;
}

// Total líquido de UMA venda já descontando embalagem E FUNRURAL — é essa a
// coluna "Total Venda Líquida" do extrato, e a soma dela em todas as linhas
// é o "Total Líquido" da apuração (não precisa mais subtrair o FUNRURAL de
// novo lá em cima, porque ele já está embutido aqui, linha a linha).
function meeiroTotalComFunrural(r) {
  return meeiroTotalLiquidoLinha(r) - meeiroFunruralLinha(r);
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

      <div class="sechead">Recibo (pré-visualização)</div>
      <div id="meeiro-recibo-preview"><div class="empty-state">Selecione o meeiro pra ver o recibo.</div></div>
    `;

    const resumoEl = container.querySelector("#meeiro-resumo");
    const previewEl = container.querySelector("#meeiro-recibo-preview");
    const dataInicialEl = container.querySelector("#meeiro-data-inicial");
    const dataFinalEl = container.querySelector("#meeiro-data-final");
    const toggleEl = container.querySelector("#meeiro-percentual-toggle");

    let meeiroCod = null;
    let todasVendas = [];

    // Blob do PDF já gerado pra pré-visualização atual — reaproveitado pelo
    // botão "Gerar recibo e enviar" (evita gerar o PDF duas vezes) e revogado
    // (URL.revokeObjectURL) sempre que uma nova pré-visualização é montada,
    // pra não acumular URLs de blob na memória enquanto a pessoa troca
    // filtros. reciboRequestId descarta resultados de gerações antigas que
    // terminam depois de uma mais nova ter começado (troca rápida de filtro).
    let reciboBlobUrl = null;
    let reciboBlobAtual = null;
    let reciboDadosAtuais = null;
    let reciboRequestId = 0;

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
      const funrural = vendas.reduce((s, r) => s + meeiroFunruralLinha(r), 0);
      const totalLiquidoFinal = vendas.reduce((s, r) => s + meeiroTotalComFunrural(r), 0);
      const valorMeeiro = totalLiquidoFinal * (this.percentual / 100);
      return { totalBruto, funrural, totalLiquidoFinal, valorMeeiro };
    };

    const renderResumo = (vendas, dadosRecibo) => {
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
          // A pré-visualização (renderRecibo) já gera esse PDF em segundo
          // plano assim que os filtros mudam — se ele já terminou e os dados
          // não mudaram desde então, reaproveita o mesmo blob em vez de
          // gerar tudo de novo.
          if (reciboBlobAtual && reciboDadosAtuais === dadosRecibo) {
            const nomeArquivo = `recibo-${dadosRecibo.meeiroNome}-${dadosRecibo.dataFinal}`.replace(/[^\w-]+/g, "_") + ".pdf";
            await compartilharArquivo(reciboBlobAtual, nomeArquivo, "application/pdf", "PDF");
          } else {
            await enviarReciboMeeiro(dadosRecibo);
          }
        } catch (e) {
          console.error("Falha ao gerar recibo:", e);
          showToast("Não foi possível gerar o recibo.");
        } finally {
          btnRecibo.disabled = false;
          btnRecibo.textContent = "📲 Gerar recibo e enviar";
        }
      });
    };

    // Gera o PDF do recibo em segundo plano e mostra ele direto na tela (em
    // vez da antiga lista de vendas em cards) — assim a pessoa já confere o
    // recibo completo, exatamente como ele vai ser enviado, antes de tocar
    // em "Gerar recibo e enviar". reciboRequestId evita que uma geração
    // antiga (de um filtro já trocado) sobrescreva a pré-visualização atual
    // caso ela termine depois de uma mais nova.
    const renderRecibo = async (vendas, dadosRecibo) => {
      if (!meeiroCod) {
        previewEl.innerHTML = `<div class="empty-state">Selecione o meeiro pra ver o recibo.</div>`;
        return;
      }
      if (vendas.length === 0) {
        previewEl.innerHTML = `<div class="empty-state">Nenhuma venda nesse período.</div>`;
        return;
      }
      const meuRequestId = ++reciboRequestId;
      previewEl.innerHTML = `<div class="empty-state">Gerando pré-visualização do recibo...</div>`;
      try {
        const blob = await gerarReciboMeeiroPdf(dadosRecibo);
        if (meuRequestId !== reciboRequestId) return; // um filtro mais novo já foi selecionado enquanto isso gerava

        if (reciboBlobUrl) URL.revokeObjectURL(reciboBlobUrl);
        reciboBlobUrl = URL.createObjectURL(blob);
        reciboBlobAtual = blob;
        reciboDadosAtuais = dadosRecibo;

        previewEl.innerHTML = `
          <div class="meeiro-recibo-preview">
            <div class="meeiro-recibo-paginas" id="meeiro-recibo-paginas"></div>
            <a class="meeiro-recibo-abrir" href="${reciboBlobUrl}" target="_blank" rel="noopener">Abrir recibo em nova aba ↗</a>
          </div>
        `;
        if (meuRequestId !== reciboRequestId) return;
        await desenharPaginasRecibo(blob, container.querySelector("#meeiro-recibo-paginas"), () => meuRequestId === reciboRequestId);
      } catch (e) {
        if (meuRequestId !== reciboRequestId) return;
        console.error("Falha ao gerar pré-visualização do recibo:", e);
        previewEl.innerHTML = `<div class="empty-state">Não foi possível gerar a pré-visualização (${escapeHtml(
          String(e.message || e)
        )}).</div>`;
      }
    };

    const renderTudo = () => {
      const vendas = vendasFiltradas();
      const t = calcularTotais(vendas);
      const meeiro = lookups.meeiros.find((m) => String(m.__cod) === String(meeiroCod));
      const dadosRecibo = {
        meeiroNome: meeiro ? meeiro["Meeiro"] : "—",
        dataInicial: dataInicialEl.value,
        dataFinal: dataFinalEl.value,
        percentual: this.percentual,
        qtdeVendas: vendas.length,
        vendas,
        ...t,
      };
      renderResumo(vendas, dadosRecibo);
      renderRecibo(vendas, dadosRecibo);
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

if (typeof pdfjsLib !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

// Desenha cada página do PDF (blob) num <canvas> dentro de containerEl, uma
// embaixo da outra — é como a pré-visualização do recibo do Meeiro aparece
// na tela. Não usa <iframe> porque celular (principalmente Chrome Android
// dentro do PWA) não costuma renderizar PDF em iframe de forma confiável, só
// mostra o ícone genérico do arquivo. aindaValido() é checado entre páginas
// pra parar de desenhar se a pessoa já trocou de filtro enquanto isso rodava.
async function desenharPaginasRecibo(blob, containerEl, aindaValido) {
  if (typeof pdfjsLib === "undefined") {
    containerEl.innerHTML = `<div class="empty-state">Pré-visualização indisponível (biblioteca de PDF não carregou) — use "Abrir recibo em nova aba".</div>`;
    return;
  }
  const buffer = await blob.arrayBuffer();
  if (!aindaValido()) return;
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  // Escala pra caber na largura do container, considerando telas retina. O
  // teto era 480px, o que deixava a pré-visualização borrada em telas
  // maiores (computador): o container podia ter 700-900px de largura em CSS,
  // mas o canvas era desenhado com no máximo 480px de resolução e depois
  // esticado pelo CSS (width: 100%) — daí a imagem ficar ilegível. Agora usa
  // a largura real do container (com um teto bem mais alto, só pra não gerar
  // um canvas gigantesco em monitores ultra largos).
  const larguraAlvo = Math.min(containerEl.clientWidth || 360, 1400) * (window.devicePixelRatio || 1);

  for (let numPagina = 1; numPagina <= pdf.numPages; numPagina++) {
    if (!aindaValido()) return;
    const pagina = await pdf.getPage(numPagina);
    const viewportBase = pagina.getViewport({ scale: 1 });
    const escala = larguraAlvo / viewportBase.width;
    const viewport = pagina.getViewport({ scale: escala });

    const canvas = document.createElement("canvas");
    canvas.className = "meeiro-recibo-pagina";
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    containerEl.appendChild(canvas);

    await pagina.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    if (!aindaValido()) return;
  }
}

// Gera o recibo de pagamento ao meeiro em PDF (A4) — cabeçalho, meeiro +
// período, o extrato analítico das vendas em TABELA (uma linha por venda,
// com Funrural na própria coluna — zero quando não incide — e o Total Venda
// Líquida já descontando embalagem+Funrural dessa linha; pagina
// automaticamente se não couber numa folha só), a apuração (bruto → líquido
// → percentual → valor a pagar em destaque), o texto de referência do
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

// Junta linhas de venda do mesmo dia + mesmo cliente + mesmo produto num
// único lançamento no extrato do recibo (soma Qtde., Vlr. Caixa, Funrural,
// Total Venda e Total Líquida) — pedido do usuário pra não poluir o recibo
// com duas linhas idênticas quando a mesma venda foi lançada em partes (ex.:
// duas entregas do mesmo produto pro mesmo cliente no mesmo dia). Preço Venda
// exibido no grupo é a média ponderada (Total Venda ÷ Qtde. somada), que bate
// com o unitário quando as linhas originais já tinham o mesmo preço — que é
// o caso normal. Mantém a ordem de primeira aparição (vendas já chegam
// ordenadas por data).
function agruparVendasParaExtrato(vendas) {
  const grupos = new Map();
  const ordemChaves = [];
  vendas.forEach((r) => {
    const chave = [
      r["Data"],
      String(r["Cliente"] || "").trim().toUpperCase(),
      String(r["Descricao"] || "").trim().toUpperCase(),
    ].join("|");
    let grupo = grupos.get(chave);
    if (!grupo) {
      grupo = {
        data: r["Data"],
        cliente: r["Cliente"],
        produto: r["Descricao"],
        qtde: 0,
        embalagem: 0,
        funrural: 0,
        totalVenda: 0,
        totalLiquida: 0,
      };
      grupos.set(chave, grupo);
      ordemChaves.push(chave);
    }
    grupo.qtde += Number(r["Qtde."]) || 0;
    grupo.embalagem += Number(r["Valor Caixa"]) || 0;
    grupo.funrural += meeiroFunruralLinha(r);
    grupo.totalVenda += Number(r["Total Venda"]) || 0;
    grupo.totalLiquida += meeiroTotalComFunrural(r);
  });
  return ordemChaves.map((chave) => grupos.get(chave));
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
  // Colunas iguais ao extrato de conferência que o usuário validou: Data,
  // Cliente, Produto, Qtde., Valor Caixa, Funrural (linha a linha — zero
  // quando não incide), Preço Venda (unitário), Total Venda (bruto) e Total
  // Venda Líquida (já descontando embalagem e FUNRURAL dessa linha).
  const colData = { x: 0, w: 16 };
  const colCliente = { x: 16, w: 22 };
  const colProduto = { x: 38, w: 34 };
  const colQtde = { x: 72, w: 14 };
  const colCaixa = { x: 86, w: 18 };
  const colFunrural = { x: 104, w: 18 };
  const colPreco = { x: 122, w: 18 };
  const colTotalVenda = { x: 140, w: 18 };
  const colTotalLiq = { x: 158, w: 22 };
  const cx = (col) => margin + col.x;
  const altLinhaTabela = 6;
  const formatQtdePdf = (v) =>
    Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const desenharCabecalhoTabela = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(...COR_RODAPE);
    doc.text("Data", cx(colData), y);
    doc.text("Cliente", cx(colCliente), y);
    doc.text("Produto", cx(colProduto), y);
    doc.text("Qtde.", cx(colQtde) + colQtde.w, y, { align: "right" });
    doc.text("Vlr. Caixa", cx(colCaixa) + colCaixa.w, y, { align: "right" });
    doc.text("Funrural", cx(colFunrural) + colFunrural.w, y, { align: "right" });
    doc.text("Preço Venda", cx(colPreco) + colPreco.w, y, { align: "right" });
    doc.text("Total Venda", cx(colTotalVenda) + colTotalVenda.w, y, { align: "right" });
    doc.text("Total Líquida", cx(colTotalLiq) + colTotalLiq.w, y, { align: "right" });
    y += 2;
    tracejada(y);
    y += 4;
  };

  const linhasExtrato = agruparVendasParaExtrato(vendas);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COR_MUTED);
  doc.text(
    `EXTRATO DAS VENDAS · ${linhasExtrato.length} LANÇAMENTO${linhasExtrato.length === 1 ? "" : "S"}`,
    margin,
    y
  );
  y += 6;
  desenharCabecalhoTabela();

  const garantirEspacoTabela = () => {
    if (y + altLinhaTabela + 2 > bottomLimit) {
      novaPagina();
      desenharCabecalhoTabela();
    }
  };

  linhasExtrato.forEach((g, idx) => {
    garantirEspacoTabela();

    if (idx % 2 === 1) {
      doc.setFillColor(...COR_ZEBRA);
      doc.rect(margin, y - 4, contentW, altLinhaTabela, "F");
    }
    const precoMedio = g.qtde > 0 ? g.totalVenda / g.qtde : 0;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COR_TEXTO);
    doc.text(formatExcelDate(g.data), cx(colData), y);
    doc.text(truncarTextoPdf(doc, g.cliente || "—", colCliente.w - 2), cx(colCliente), y);
    doc.text(truncarTextoPdf(doc, g.produto || "—", colProduto.w - 2), cx(colProduto), y);
    doc.text(formatQtdePdf(g.qtde), cx(colQtde) + colQtde.w, y, { align: "right" });
    doc.text(formatMoeda(g.embalagem), cx(colCaixa) + colCaixa.w, y, { align: "right" });
    doc.setTextColor(...(g.funrural > 0 ? COR_VERMELHO : COR_MUTED));
    doc.text(formatMoeda(g.funrural), cx(colFunrural) + colFunrural.w, y, { align: "right" });
    doc.setTextColor(...COR_TEXTO);
    doc.text(formatMoeda(precoMedio), cx(colPreco) + colPreco.w, y, { align: "right" });
    doc.text(formatMoeda(g.totalVenda), cx(colTotalVenda) + colTotalVenda.w, y, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(formatMoeda(g.totalLiquida), cx(colTotalLiq) + colTotalLiq.w, y, { align: "right" });
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
