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
      <div id="estoque-grupo-label" class="estoque-grupo-label"></div>
      <div id="estoque-valor-total" class="estoque-valor-total"></div>
      <div id="estoque-list"></div>
    `;

    const { produtos } = await getLookupData();
    const list = container.querySelector("#estoque-list");
    const grupoLabel = container.querySelector("#estoque-grupo-label");
    const valorTotalEl = container.querySelector("#estoque-valor-total");
    const input = container.querySelector("#busca-produto");

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
  },
};

// Número com separador brasileiro (ponto de milhar, vírgula decimal), sem
// zeros à direita desnecessários — usado no saldo de estoque.
function formatNumeroEstoque(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}
