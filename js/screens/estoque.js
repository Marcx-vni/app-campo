// ============================================================================
// T4 — CONSULTA ESTOQUE
// Busca de produto por nome, exibindo Estoque atual, Estoque Mínimo e
// Ctr. Estoque Mínimo. Somente leitura.
// Estado inicial não fica em branco: mostra os itens de estoque baixo direto,
// pra dar utilidade à tela mesmo antes de digitar qualquer coisa.
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

    const abaixoDoMinimo = (p) => Number(p["Estoque"]) <= Number(p["Estoque Minimo"] || 0);

    const itemHtml = (p) => {
      const critico = abaixoDoMinimo(p);
      return `
      <div class="estoque-item ${critico ? "estoque-critico" : ""}">
        <div class="estoque-item-icone">📦</div>
        <div class="estoque-item-texto">
          <div class="estoque-item-nome">${escapeHtml(p["Produto"])}</div>
          <div class="estoque-item-categoria">${escapeHtml(p[" "] || "—")}${p["Ctr. Estoque Minimo"] ? ` · Ctr. mín. ${escapeHtml(String(p["Ctr. Estoque Minimo"]))}` : ""}</div>
        </div>
        <div class="estoque-item-saldo">${escapeHtml(String(p["Estoque"] ?? "—"))} ${escapeHtml(p["Unidade"] || "")}</div>
      </div>`;
    };

    const renderList = (filtro = "") => {
      const termo = filtro.trim().toLowerCase();

      if (!termo) {
        const baixos = produtos.filter((p) => p["Produto"] && abaixoDoMinimo(p));
        grupoLabel.textContent = baixos.length ? "Estoque baixo" : "";
        if (baixos.length === 0) {
          list.innerHTML = `<div class="empty-state">Nenhum item abaixo do estoque mínimo. Digite acima para buscar um produto.</div>`;
          return;
        }
        list.innerHTML = baixos.slice(0, 100).map(itemHtml).join("");
        return;
      }

      grupoLabel.textContent = "";
      const filtrados = produtos.filter((p) => p["Produto"] && p["Produto"].toLowerCase().includes(termo));
      if (filtrados.length === 0) {
        list.innerHTML = `<div class="empty-state">Nenhum produto encontrado.</div>`;
        return;
      }
      list.innerHTML = filtrados.slice(0, 100).map(itemHtml).join("");
    };

    input.addEventListener("input", () => renderList(input.value));
    renderList();
  },
};
