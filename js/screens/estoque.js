// ============================================================================
// T4 — CONSULTA ESTOQUE
// Busca de produto por nome, exibindo Estoque atual, Estoque Mínimo e
// Ctr. Estoque Mínimo. Somente leitura.
// ============================================================================

const ScreenEstoque = {
  async render(container) {
    container.innerHTML = `
      <h2 class="page-title">Consulta de Estoque</h2>
      <div class="search-bar">
        <input type="search" id="busca-produto" placeholder="Buscar produto..." />
      </div>
      <div id="estoque-list"></div>
    `;

    const { produtos } = await getLookupData();
    const list = container.querySelector("#estoque-list");
    const input = container.querySelector("#busca-produto");

    const renderList = (filtro = "") => {
      const termo = filtro.trim().toLowerCase();
      const filtrados = produtos.filter(
        (p) => p["Produto"] && (!termo || p["Produto"].toLowerCase().includes(termo))
      );
      if (filtrados.length === 0) {
        list.innerHTML = `<div class="empty-state">Nenhum produto encontrado.</div>`;
        return;
      }
      list.innerHTML = filtrados
        .slice(0, 100)
        .map((p) => {
          const abaixoDoMinimo = Number(p["Estoque"]) <= Number(p["Estoque Minimo"] || 0);
          return `
          <div class="card ${abaixoDoMinimo ? "atrasado" : ""}">
            <div class="card-title">${escapeHtml(p["Produto"])}</div>
            <div class="card-row"><span>Estoque atual</span><span>${escapeHtml(String(p["Estoque"] ?? "—"))} ${escapeHtml(p["Unidade"] || "")}</span></div>
            <div class="card-row"><span>Estoque mínimo</span><span>${escapeHtml(String(p["Estoque Minimo"] ?? "—"))}</span></div>
            ${p["Ctr. Estoque Minimo"] ? `<div class="card-row"><span>Ctr. Estoque Mínimo</span><span>${escapeHtml(String(p["Ctr. Estoque Minimo"]))}</span></div>` : ""}
            ${abaixoDoMinimo ? `<div class="card-row"><span>⚠ Alerta</span><span>Abaixo do mínimo</span></div>` : ""}
          </div>`;
        })
        .join("");
    };

    input.addEventListener("input", () => renderList(input.value));
    renderList();
  },
};
