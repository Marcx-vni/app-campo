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
      <div id="estoque-list"></div>
    `;

    const { produtos } = await getLookupData();
    const list = container.querySelector("#estoque-list");
    const grupoLabel = container.querySelector("#estoque-grupo-label");
    const input = container.querySelector("#busca-produto");

    const GRUPO_KEY = " "; // cabeçalho da coluna D vem em branco na planilha
    const abaixoDoMinimo = (p) => Number(p["Estoque"]) <= Number(p["Estoque Minimo"] || 0);
    const temSaldo = (p) => Number(p["Estoque"]) > 0;
    const nomeGrupo = (p) => (p[GRUPO_KEY] && String(p[GRUPO_KEY]).trim()) || "Sem categoria";

    const itemHtml = (p) => {
      const critico = abaixoDoMinimo(p);
      return `
      <div class="estoque-item ${critico ? "estoque-critico" : ""}">
        <div class="estoque-item-icone">📦</div>
        <div class="estoque-item-texto">
          <div class="estoque-item-nome">${escapeHtml(p["Produto"])}</div>
          <div class="estoque-item-categoria">${escapeHtml(nomeGrupo(p))}${p["Ctr. Estoque Minimo"] ? ` · Ctr. mín. ${escapeHtml(String(p["Ctr. Estoque Minimo"]))}` : ""}</div>
        </div>
        <div class="estoque-item-saldo">${escapeHtml(formatNumeroEstoque(p["Estoque"]))} ${escapeHtml(unidadeValida(p["Unidade"]))}</div>
      </div>`;
    };

    // Resumo do grupo: se todos os produtos do grupo usam a mesma unidade,
    // soma o saldo ("120 L"); senão, como somar unidades diferentes não faz
    // sentido, mostra só a quantidade de produtos.
    const resumoGrupoHtml = (itens) => {
      const unidades = new Set(itens.map((p) => unidadeValida(p["Unidade"])).filter(Boolean));
      if (unidades.size === 1) {
        const total = itens.reduce((soma, p) => soma + (Number(p["Estoque"]) || 0), 0);
        return `${formatNumeroEstoque(total)} ${[...unidades][0]}`;
      }
      return `${itens.length} produto${itens.length === 1 ? "" : "s"}`;
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
        list.innerHTML = `<div class="empty-state">Nenhum produto com saldo em estoque no momento.</div>`;
        return;
      }
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
      const filtrados = produtos.filter((p) => p["Produto"] && p["Produto"].toLowerCase().includes(termo));
      if (filtrados.length === 0) {
        list.innerHTML = `<div class="empty-state">Nenhum produto encontrado.</div>`;
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

    input.addEventListener("input", () => renderList(input.value));
    renderList();
  },
};

// Número com separador brasileiro (ponto de milhar, vírgula decimal), sem
// zeros à direita desnecessários — usado no saldo de estoque.
function formatNumeroEstoque(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}
