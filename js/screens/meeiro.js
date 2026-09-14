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

    // Nem toda venda tem "Valor Unit. Venda" preenchido — lançamentos antigos
    // vindos da própria planilha (antes do App Campo existir) só têm o "Total
    // Venda" já calculado. Nesses casos, reconstrói o unitário dividindo pela
    // quantidade, só pra exibição no demonstrativo (nunca é gravado de volta).
    const valorUnitVenda = (r) => {
      const v = Number(r["Valor Unit. Venda"]);
      if (v > 0) return v;
      const qtde = Number(r["Qtde."]) || 0;
      return qtde > 0 ? (Number(r["Total Venda"]) || 0) / qtde : 0;
    };

    const totalLiquidoLinha = (r) => {
      const vl = r["Venda Liquida"];
      return vl !== undefined && vl !== null && vl !== "" ? Number(vl) || 0 : Number(r["Total Venda"]) || 0;
    };

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
      const totalLiquidoBruto = vendas.reduce((s, r) => s + totalLiquidoLinha(r), 0);
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
          <div class="drow"><span>${escapeHtml(r["Descricao"] || "—")}</span><span>${formatMoeda(totalLiquidoLinha(r))}</span></div>
          <div class="meeiro-linha-sub">Qtde. ${formatNumero(r["Qtde."])} · Vlr. Unit. ${formatMoeda(valorUnitVenda(r))}${
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

// Gera o recibo de pagamento ao meeiro como imagem (PNG), num layout de
// recibo formal: cabeçalho, identificação do meeiro/período, composição do
// valor (bruto → FUNRURAL → líquido → percentual → valor a pagar em
// destaque), o texto de referência do pagamento e linhas de assinatura.
async function gerarReciboMeeiroPng(dados) {
  const fonte = "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
  const escala = 2;
  const largura = 420;
  const padding = 24;
  const contentW = largura - padding * 2;
  const raio = 22;
  const altHeader = 96;

  const medCtx = document.createElement("canvas").getContext("2d");
  const periodoTexto = `${formatDataISOparaBR(dados.dataInicial)} a ${formatDataISOparaBR(dados.dataFinal)}`;

  medCtx.font = `13px ${fonte}`;
  const funruralLabel = quebrarTextoCanvas(medCtx, "FUNRURAL (1,65% s/ vendas Peterfrut)", contentW * 0.56, 2);
  const linhasCorpo = [
    { label: ["Total de vendas (bruto)"], valor: formatMoeda(dados.totalBruto) },
    { label: funruralLabel, valor: `− ${formatMoeda(dados.funrural)}`, cor: "#B3261E" },
  ];

  medCtx.font = `italic 12px ${fonte}`;
  const declaracao = quebrarTextoCanvas(
    medCtx,
    "Referente ao pagamento pela venda de produtos hortifrutigranjeiros pelo(a) meeiro(a) acima, conforme contrato de parceria agrícola (meação), no período indicado.",
    contentW,
    6
  );

  const altLinha = (l) => 20 + l.label.length * 17;
  const altBlocoTopo = 30 + 30;
  const altLinhasBrutoFunrural = linhasCorpo.reduce((s, l) => s + altLinha(l), 0);
  const altDashed = 18;
  const altTotalLiquido = 32;
  const altPercentual = 30;
  const altDestaque = 78;
  const altDeclaracao = declaracao.length * 16 + 20;
  const altVendasInfo = 26;
  const altAssinaturas = 76;

  const altura =
    altHeader +
    padding +
    altBlocoTopo +
    altLinhasBrutoFunrural +
    altDashed +
    altTotalLiquido +
    altPercentual +
    altDashed +
    altDestaque +
    16 +
    altDeclaracao +
    altVendasInfo +
    altAssinaturas +
    padding;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(largura * escala);
  canvas.height = Math.ceil(altura * escala);
  const ctx = canvas.getContext("2d");
  ctx.scale(escala, escala);
  ctx.textBaseline = "middle";

  const retanguloArredondado = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  const tracejada = (yy) => {
    ctx.save();
    ctx.strokeStyle = "#DEDCD2";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding, yy);
    ctx.lineTo(largura - padding, yy);
    ctx.stroke();
    ctx.restore();
  };

  ctx.save();
  retanguloArredondado(0, 0, largura, altura, raio);
  ctx.clip();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, largura, altura);

  // Cabeçalho.
  ctx.fillStyle = "#1F3D2B";
  ctx.fillRect(0, 0, largura, altHeader);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `26px ${fonte}`;
  ctx.textAlign = "left";
  ctx.fillText("🧾", padding, 38);
  ctx.font = `600 19px ${fonte}`;
  ctx.fillText("Recibo de Pagamento", padding + 34, 38);
  ctx.font = `13px ${fonte}`;
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fillText("Peterfrut · Parceria agrícola", padding, 68);

  let y = altHeader + padding;

  // Meeiro + período.
  ctx.textAlign = "left";
  ctx.font = `600 18px ${fonte}`;
  ctx.fillStyle = "#1A1A1A";
  ctx.fillText(dados.meeiroNome, padding, y + 10);
  y += 30;
  ctx.font = `13px ${fonte}`;
  ctx.fillStyle = "#6B6B65";
  ctx.fillText(`Período: ${periodoTexto}`, padding, y);
  y += 30;

  // Bruto / FUNRURAL.
  linhasCorpo.forEach((l) => {
    const h = altLinha(l);
    ctx.font = `13px ${fonte}`;
    ctx.fillStyle = l.cor || "#3A3A34";
    ctx.textAlign = "left";
    const yLabel = y + h / 2 - ((l.label.length - 1) * 17) / 2;
    l.label.forEach((linha, i) => ctx.fillText(linha, padding, yLabel + i * 17));
    ctx.font = `600 14px ${fonte}`;
    ctx.textAlign = "right";
    ctx.fillText(l.valor, largura - padding, y + h / 2);
    y += h;
  });

  tracejada(y + 8);
  y += altDashed;

  // Total líquido.
  ctx.font = `600 15px ${fonte}`;
  ctx.fillStyle = "#1A1A1A";
  ctx.textAlign = "left";
  ctx.fillText("Total Líquido", padding, y + altTotalLiquido / 2);
  ctx.textAlign = "right";
  ctx.fillText(formatMoeda(dados.totalLiquidoFinal), largura - padding, y + altTotalLiquido / 2);
  y += altTotalLiquido;

  // Percentual do meeiro.
  ctx.font = `13px ${fonte}`;
  ctx.fillStyle = "#6B6B65";
  ctx.textAlign = "left";
  ctx.fillText("Percentual do meeiro", padding, y + altPercentual / 2);
  ctx.font = `600 13px ${fonte}`;
  ctx.fillStyle = "#3A3A34";
  ctx.textAlign = "right";
  ctx.fillText(`${dados.percentual}%`, largura - padding, y + altPercentual / 2);
  y += altPercentual;

  tracejada(y + 6);
  y += altDashed;

  // Destaque — valor a pagar.
  ctx.fillStyle = "#1F3D2B";
  retanguloArredondado(padding, y, contentW, altDestaque, 14);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = `600 12px ${fonte}`;
  ctx.textAlign = "left";
  ctx.fillText("VALOR A PAGAR AO MEEIRO", padding + 16, y + 24);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 26px ${fonte}`;
  ctx.fillText(formatMoeda(dados.valorMeeiro), padding + 16, y + 54);
  y += altDestaque + 16;

  // Texto de referência do pagamento.
  ctx.font = `italic 12px ${fonte}`;
  ctx.fillStyle = "#6B6B65";
  ctx.textAlign = "left";
  declaracao.forEach((linha, i) => ctx.fillText(linha, padding, y + i * 16));
  y += declaracao.length * 16 + 4;

  // Nº de vendas + data de geração.
  ctx.font = `12px ${fonte}`;
  ctx.fillStyle = "#8A887F";
  ctx.fillText(
    `${dados.qtdeVendas} venda${dados.qtdeVendas === 1 ? "" : "s"} no período · Gerado em ${formatDataISOparaBR(
      new Date().toISOString().slice(0, 10)
    )}`,
    padding,
    y + 10
  );
  y += altVendasInfo;

  // Linhas de assinatura (Meeiro / Peterfrut).
  const largLinha = (contentW - 20) / 2;
  ctx.strokeStyle = "#C9C7BC";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, y + 30);
  ctx.lineTo(padding + largLinha, y + 30);
  ctx.moveTo(padding + largLinha + 20, y + 30);
  ctx.lineTo(padding + largLinha + 20 + largLinha, y + 30);
  ctx.stroke();
  ctx.font = `11px ${fonte}`;
  ctx.fillStyle = "#8A887F";
  ctx.textAlign = "center";
  ctx.fillText("Meeiro", padding + largLinha / 2, y + 46);
  ctx.fillText("Peterfrut", padding + largLinha + 20 + largLinha / 2, y + 46);

  ctx.restore();

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

async function enviarReciboMeeiro(dados) {
  const blob = await gerarReciboMeeiroPng(dados);
  if (!blob) {
    showToast("Não foi possível gerar a imagem do recibo.");
    return;
  }
  const nomeArquivo =
    `recibo-${dados.meeiroNome}-${dados.dataFinal}`.replace(/[^\w-]+/g, "_") + ".png";
  await compartilharImagem(blob, nomeArquivo);
}
