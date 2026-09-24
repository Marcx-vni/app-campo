// ============================================================================
// T4 — CONSULTA ESTOQUE
// Lista agrupada por categoria (coluna D / "Grupo" da aba Cadastro de Produtos
// E Estoque — vem do Graph sem nome de cabeçalho, então a chave é " "). Cada
// grupo abre em acordeão e só traz produtos com saldo em estoque (Estoque > 0)
// — produto zerado/negativo não aparece na navegação por grupo, só pela busca.
// Busca por nome continua funcionando como lista simples, sem agrupar.
// ============================================================================

const ScreenEstoque = {
  async render(container) {
    container.innerHTML = `
      <h2 class="page-title">Consulta de Estoque</h2>
      <div class="search-bar">
        <input type="search" id="busca-produto" placeholder="Buscar produto..." />
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-secondary" id="btn-cadastro-produto">🧾 Cadastro de Produto</button>
        <button type="button" class="btn btn-secondary" id="btn-gerar-inventario">📋 Gerar inventário</button>
      </div>
      <div id="estoque-grupo-label" class="estoque-grupo-label"></div>
      <div id="estoque-valor-total" class="estoque-valor-total"></div>
      <div id="estoque-list"></div>
    `;

    const { produtos } = await getLookupData();
    const list = container.querySelector("#estoque-list");
    const grupoLabel = container.querySelector("#estoque-grupo-label");
    const valorTotalEl = container.querySelector("#estoque-valor-total");
    const input = container.querySelector("#busca-produto");
    const btnInventario = container.querySelector("#btn-gerar-inventario");
    const btnCadastro = container.querySelector("#btn-cadastro-produto");

    const GRUPO_KEY = acharChaveGrupo(produtos);
    // Coluna K (Valor em Estoque) — se a planilha não tiver essa coluna
    // identificável, VALOR_KEY fica undefined e simplesmente não mostramos
    // valor nenhum, em vez de arriscar mostrar um número de outra coluna.
    const VALOR_KEY = acharChaveValorEstoque(produtos);

    const abaixoDoMinimo = (p) => Number(p["Estoque"]) <= Number(p["Estoque Minimo"] || 0);
    const temSaldo = (p) => Number(p["Estoque"]) > 0;
    const nomeGrupo = (p) => (p[GRUPO_KEY] && String(p[GRUPO_KEY]).trim()) || "Sem categoria";
    const valorEstoque = (p) => (VALOR_KEY ? Number(p[VALOR_KEY]) || 0 : 0);

    const itemHtml = (p) => {
      const critico = abaixoDoMinimo(p);
      return `
      <div class="estoque-item ${critico ? "estoque-critico" : ""}">
        <div class="estoque-item-icone">📦</div>
        <div class="estoque-item-texto">
          <div class="estoque-item-nome">${escapeHtml(p["Produto"])}</div>
          <div class="estoque-item-categoria">${escapeHtml(nomeGrupo(p))}${p["Ctr. Estoque Minimo"] ? ` · Ctr. mín. ${escapeHtml(formatNumeroEstoque(p["Ctr. Estoque Minimo"]))}` : ""}</div>
        </div>
        <div class="estoque-item-saldo">
          <div>${escapeHtml(formatNumeroEstoque(p["Estoque"]))} ${escapeHtml(unidadeValida(p["Unidade"]))}</div>
          ${VALOR_KEY ? `<div class="estoque-item-valor">${escapeHtml(formatMoeda(valorEstoque(p)))}</div>` : ""}
        </div>
      </div>`;
    };

    // Resumo do grupo: quantidade (soma se todos usam a mesma unidade, senão
    // conta de produtos) + valor em estoque total do grupo (coluna K somada).
    const resumoGrupoHtml = (itens) => {
      const unidades = new Set(itens.map((p) => unidadeValida(p["Unidade"])).filter(Boolean));
      const qtdeTexto =
        unidades.size === 1
          ? `${formatNumeroEstoque(itens.reduce((soma, p) => soma + (Number(p["Estoque"]) || 0), 0))} ${[...unidades][0]}`
          : `${itens.length} produto${itens.length === 1 ? "" : "s"}`;
      if (!VALOR_KEY) return qtdeTexto;
      const valorTotal = itens.reduce((soma, p) => soma + valorEstoque(p), 0);
      return `${qtdeTexto} · ${formatMoeda(valorTotal)}`;
    };

    const grupoHtml = (nome, itens) => `
      <div class="estoque-grupo" data-grupo="${escapeHtml(nome)}">
        <div class="estoque-grupo-header">
          <div class="estoque-grupo-icone">🗂️</div>
          <div class="estoque-grupo-titulo">${escapeHtml(nome)}</div>
          <div class="estoque-grupo-valor">${resumoGrupoHtml(itens)}</div>
          <div class="estoque-grupo-seta">▶</div>
        </div>
        <div class="estoque-grupo-body">
          ${itens.map(itemHtml).join("")}
        </div>
      </div>`;

    const renderGrupos = () => {
      grupoLabel.textContent = "Grupos de produtos";
      const comSaldo = produtos.filter((p) => p["Produto"] && temSaldo(p));
      if (comSaldo.length === 0) {
        valorTotalEl.textContent = "";
        list.innerHTML = `<div class="empty-state">Nenhum produto com saldo em estoque no momento.</div>`;
        return;
      }
      valorTotalEl.textContent = VALOR_KEY
        ? `Valor total em estoque: ${formatMoeda(comSaldo.reduce((soma, p) => soma + valorEstoque(p), 0))}`
        : "";
      const grupos = new Map();
      comSaldo.forEach((p) => {
        const g = nomeGrupo(p);
        if (!grupos.has(g)) grupos.set(g, []);
        grupos.get(g).push(p);
      });
      const nomesOrdenados = [...grupos.keys()].sort((a, b) => a.localeCompare(b, "pt-BR"));
      list.innerHTML = nomesOrdenados.map((nome) => grupoHtml(nome, grupos.get(nome))).join("");

      list.querySelectorAll(".estoque-grupo-header").forEach((header) => {
        header.addEventListener("click", () => {
          header.closest(".estoque-grupo").classList.toggle("aberto");
        });
      });
    };

    const renderBusca = (termo) => {
      grupoLabel.textContent = "";
      valorTotalEl.textContent = "";
      // Mesma regra da navegação por grupo: só produto com saldo em estoque
      // aparece — buscar um produto zerado não devolve nada, de propósito.
      const filtrados = produtos.filter(
        (p) => p["Produto"] && p["Produto"].toLowerCase().includes(termo) && temSaldo(p)
      );
      if (filtrados.length === 0) {
        list.innerHTML = `<div class="empty-state">Nenhum produto com saldo em estoque encontrado com esse nome.</div>`;
        return;
      }
      list.innerHTML = filtrados.slice(0, 100).map(itemHtml).join("");
    };

    const renderList = (filtro = "") => {
      const termo = filtro.trim().toLowerCase();
      if (!termo) {
        renderGrupos();
        return;
      }
      renderBusca(termo);
    };

    // Nunca deixa a tela em branco sem explicação: se algo inesperado quebrar
    // o agrupamento, mostra o erro em vez de ficar tudo vazio (ajuda a
    // diagnosticar por print, sem precisar abrir o console do navegador).
    const renderListSeguro = (filtro) => {
      try {
        renderList(filtro);
      } catch (e) {
        console.error("Erro ao montar lista de estoque:", e);
        list.innerHTML = `<div class="empty-state">Não foi possível montar a lista de estoque (${escapeHtml(String(e.message || e))}). Puxe pra atualizar ou tente de novo.</div>`;
      }
    };

    input.addEventListener("input", () => renderListSeguro(input.value));
    renderListSeguro();

    btnInventario.addEventListener("click", async () => {
      btnInventario.disabled = true;
      btnInventario.textContent = "Gerando...";
      try {
        // "Saldo diferente de zero" (não só positivo) — inclui produto com
        // saldo negativo na contagem também, pra pessoa conferir e ajustar.
        const itens = produtos
          .filter((p) => p["Produto"] && Number(p["Estoque"]) !== 0)
          .sort((a, b) => a["Produto"].localeCompare(b["Produto"], "pt-BR"));
        if (itens.length === 0) {
          showToast("Nenhum produto com saldo em estoque pra gerar inventário.");
          return;
        }
        const blob = await gerarInventarioPdf(itens, { unidadeValida, formatNumeroEstoque });
        const nomeArquivo = `inventario-${new Date().toISOString().slice(0, 10)}.pdf`;
        await compartilharArquivo(blob, nomeArquivo, "application/pdf", "PDF");
      } catch (e) {
        console.error("Falha ao gerar inventário:", e);
        showToast(`Não foi possível gerar o inventário (${e.message || e}).`);
      } finally {
        btnInventario.disabled = false;
        btnInventario.textContent = "📋 Gerar inventário";
      }
    });

    btnCadastro.addEventListener("click", () => {
      abrirModalCadastroProduto(produtos, GRUPO_KEY, async () => {
        // Recarrega tudo (busca de novo na planilha, já pega o produto recém
        // criado) e re-renderiza a tela inteira — mesmo padrão usado depois de
        // gravar um apontamento em apontamentoLivre.js.
        await getLookupData();
        this.render(container);
      });
    });
  },
};

// --- Cadastro de novo produto (aba "Cadastro de Produtos E Estoque") -------
// Botão "🧾 Cadastro de Produto" na tela Estoque. Diferente dos apontamentos
// (Uso/Ferti/Venda/Compra), isso NÃO passa pela fila offline em IndexedDB —
// grava direto via Graph (addTableRow), então exige estar online. Só pede o
// que o usuário informa (Produto/Grupo/Dosagem); "Código" é calculado
// sozinho (maior código existente + 1) e as demais colunas da tabela (ex.:
// "Estoque", "Valor em Estoque") ficam em branco de propósito — são colunas
// calculadas por fórmula na planilha, o app nunca escreve nelas (mesmo
// padrão de REGISTRO_INVENTARIO_COMPUTED em apontamento.js).
function proximoCodigoProduto(produtos) {
  let max = 0;
  (produtos || []).forEach((p) => {
    const v = Number(p["Código"]);
    if (!Number.isNaN(v) && v > max) max = v;
  });
  return max + 1;
}

function abrirModalCadastroProduto(produtos, grupoKey, onSalvo) {
  const gruposExistentes = [
    ...new Set(
      (produtos || [])
        .map((p) => (p[grupoKey] ? String(p[grupoKey]).trim() : ""))
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-titulo">🧾 Cadastro de Produto</div>
      <form id="form-cadastro-produto">
        <label>Produto</label>
        <input type="text" id="cp-produto" required />
        <label>Grupo</label>
        <select id="cp-grupo" required>
          <option value="">Selecione...</option>
          ${gruposExistentes.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("")}
        </select>
        <label>Dosagem (mL) por 20L</label>
        <input type="number" step="0.01" id="cp-dosagem" required />
        <div class="btn-row">
          <button type="button" class="btn btn-secondary" id="cp-cancelar">Cancelar</button>
          <button type="submit" class="btn btn-primary" id="cp-salvar">Salvar</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  const fechar = () => overlay.remove();
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) fechar();
  });
  overlay.querySelector("#cp-cancelar").addEventListener("click", fechar);

  overlay.querySelector("#form-cadastro-produto").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const nomeProduto = overlay.querySelector("#cp-produto").value.trim();
    const grupo = overlay.querySelector("#cp-grupo").value;
    const dosagem = overlay.querySelector("#cp-dosagem").value;
    if (!nomeProduto || !grupo || dosagem === "") {
      showToast("Preencha Produto, Grupo e Dosagem antes de salvar.");
      return;
    }
    if (!navigator.onLine) {
      showToast("Sem conexão — o cadastro de produto precisa de internet.");
      return;
    }
    const btnSalvar = overlay.querySelector("#cp-salvar");
    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";
    try {
      const proximoCodigo = proximoCodigoProduto(produtos);
      const headers = produtos.headers || [];
      const valores = {
        "Código": proximoCodigo,
        "Produto": nomeProduto,
        [grupoKey]: grupo,
        "Dosagem ML/20LT": Number(dosagem) || 0,
      };
      const linha = headers.map((h) =>
        Object.prototype.hasOwnProperty.call(valores, h) ? valores[h] : null
      );
      await addTableRow(TABLES.produtos, linha);
      showToast(`Produto "${nomeProduto}" cadastrado (código ${proximoCodigo}).`);
      fechar();
      await onSalvo();
    } catch (e) {
      console.error("Falha ao cadastrar produto:", e);
      showToast(`Não foi possível cadastrar o produto (${e.message || e}).`);
      btnSalvar.disabled = false;
      btnSalvar.textContent = "Salvar";
    }
  });
}

// Gera o PDF de contagem de inventário — lista em ordem alfabética todo
// produto com saldo diferente de zero, com o saldo do sistema e uma coluna
// em branco pra anotar a contagem física à mão (impresso ou aberto no
// celular durante a contagem). Pagina automaticamente, igual ao recibo do
// Meeiro (mesmo padrão de garantirEspaco/redesenhar cabeçalho da tabela).
async function gerarInventarioPdf(itens, { unidadeValida, formatNumeroEstoque }) {
  if (typeof window.jspdf === "undefined" || !window.jspdf.jsPDF) {
    throw new Error("Biblioteca de PDF não carregou (sem internet na primeira vez que o app abriu?).");
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const margin = 15;
  const pageW = 210;
  const contentW = pageW - margin * 2;
  const bottomLimit = 282;

  const COR_VERDE = [31, 61, 43];
  const COR_TEXTO = [26, 26, 26];
  const COR_MUTED = [107, 107, 101];
  const COR_RODAPE = [138, 136, 127];
  const COR_BORDA = [222, 220, 210];
  const COR_ZEBRA = [250, 249, 246];

  let y = margin;
  let pagina = 1;

  const novaPagina = () => {
    doc.addPage();
    pagina += 1;
    y = margin;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COR_RODAPE);
    doc.text(`Inventário — continuação (pág. ${pagina})`, margin, y);
    y += 8;
  };
  const tracejada = (yy) => {
    doc.setDrawColor(...COR_BORDA);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(margin, yy, margin + contentW, yy);
    doc.setLineDashPattern([], 0);
  };

  // Cabeçalho (só na 1ª página).
  doc.setFillColor(...COR_VERDE);
  doc.rect(0, 0, pageW, 20, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Inventário de Estoque", margin, 13);
  y = 30;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COR_MUTED);
  doc.text(
    `${itens.length} produto${itens.length === 1 ? "" : "s"} com saldo · Gerado em ${new Date().toLocaleDateString("pt-BR")}`,
    margin,
    y
  );
  y += 10;

  // Colunas: Produto (mais larga), Saldo em Estoque (sistema), Contagem
  // (em branco — a pessoa preenche à mão durante a contagem física).
  const colProduto = { x: 0, w: 100 };
  const colSaldo = { x: 102, w: 40 };
  const colContagem = { x: 146, w: 34 };
  const cx = (col) => margin + col.x;
  const altLinha = 8;

  const desenharCabecalhoTabela = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...COR_RODAPE);
    doc.text("Produto", cx(colProduto), y);
    doc.text("Saldo (sistema)", cx(colSaldo) + colSaldo.w, y, { align: "right" });
    doc.text("Contagem", cx(colContagem), y);
    y += 2;
    tracejada(y);
    y += 4;
  };

  desenharCabecalhoTabela();

  const garantirEspacoLinha = () => {
    if (y + altLinha + 2 > bottomLimit) {
      novaPagina();
      desenharCabecalhoTabela();
    }
  };

  itens.forEach((p, idx) => {
    garantirEspacoLinha();

    if (idx % 2 === 1) {
      doc.setFillColor(...COR_ZEBRA);
      doc.rect(margin, y - 5, contentW, altLinha, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COR_TEXTO);
    doc.text(truncarTextoPdf(doc, p["Produto"] || "—", colProduto.w - 2), cx(colProduto), y);
    const saldoTexto = `${formatNumeroEstoque(p["Estoque"])} ${unidadeValida(p["Unidade"]) || ""}`.trim();
    doc.text(saldoTexto, cx(colSaldo) + colSaldo.w, y, { align: "right" });

    // Caixinha em branco pra escrever a contagem física — ancorada no MESMO x
    // do cabeçalho "Contagem" (cx(colContagem)), pra garantir que a borda
    // esquerda da caixa fique exatamente embaixo do início do texto do
    // cabeçalho (antes cada um usava uma fórmula de centralização própria,
    // que na teoria batia mas na prática ficava visualmente desalinhado).
    doc.setDrawColor(...COR_BORDA);
    doc.roundedRect(cx(colContagem), y - 5, colContagem.w - 2, altLinha - 1.5, 1, 1);

    y += altLinha;
  });

  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COR_RODAPE);
  if (y + 6 > bottomLimit) novaPagina();
  doc.text("App Campo — Peterfrut", margin, y);

  return doc.output("blob");
}

// Número com separador brasileiro (ponto de milhar, vírgula decimal), sem
// zeros à direita desnecessários — usado no saldo de estoque.
function formatNumeroEstoque(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}
