// ============================================================================
// CONSULTA DE FERTIRRIGAÇÕES — aba "Ferti" da navegação.
// Histórico completo da aba "Registro Ferti" (não some depois de um tempo,
// diferente da Atividade recente da tela Início, que só mostra os últimos 4).
// Cada card tem um botão pra gerar o relatório e enviar por WhatsApp pro
// meeiro, com as quantidades por setor, dia, estufa e produto.
// ============================================================================

const ScreenFertiConsulta = {
  async render(container) {
    container.innerHTML = `
      <h2 class="page-title">Fertirrigações</h2>
      <div class="search-bar">
        <input type="search" id="busca-ferti" placeholder="Buscar por estufa, meeiro ou produto..." />
      </div>
      <div id="ferti-consulta-list">Carregando...</div>
    `;

    const list = container.querySelector("#ferti-consulta-list");
    const input = container.querySelector("#busca-ferti");

    let registros = [];
    try {
      registros = await readTable(TABLES.registroFerti);
    } catch (e) {
      console.error("Falha ao carregar Registro Ferti:", e);
      list.innerHTML = `<div class="empty-state">Não foi possível carregar as fertirrigações (${escapeHtml(
        String(e.message || e)
      )}). Verifique a conexão ou toque no nome do arquivo no topo do app pra selecionar de novo.</div>`;
      return;
    }

    // Mais recente primeiro. "Data" sozinha não distingue vários lançamentos
    // no mesmo dia, então usa a posição na tabela (linhas mais novas ficam
    // mais abaixo) como desempate.
    const ordenados = registros
      .filter((r) => r["Estufa"] || r["Produto"])
      .sort(
        (a, b) =>
          (Number(b["Data"]) || 0) - (Number(a["Data"]) || 0) ||
          (Number(b.__rowIndex) || 0) - (Number(a.__rowIndex) || 0)
      );

    const cardHtml = (r) => {
      const setores = [1, 2, 3, 4, 5, 6]
        .map((n) => ({ n, v: Number(r[`Setor ${n}`]) || 0 }))
        .filter((s) => s.v > 0);
      const total =
        r["Total"] !== undefined && r["Total"] !== null && r["Total"] !== ""
          ? Number(r["Total"])
          : setores.reduce((soma, s) => soma + s.v, 0);
      const temDat = r["D.A.T"] !== undefined && r["D.A.T"] !== null && r["D.A.T"] !== "";
      return `
        <div class="card card-ferti">
          <div class="atividade-card-topo">
            <div class="atividade-icone atividade-icone-ferti">💧</div>
            <div style="flex:1; min-width:0;">
              <div class="card-title">${escapeHtml(r["Estufa"] || "—")} <span class="tag-ferti">FERTI</span></div>
              <div class="card-sub">${[r["Meeiro"], formatExcelDate(r["Data"])].filter(Boolean).join(" · ")}</div>
            </div>
          </div>
          <div class="card-row"><span>Produto</span><span>${escapeHtml(r["Produto"] || "—")}</span></div>
          <div class="card-row"><span>Dosagem</span><span>${formatNumero(r["Dosagem"])} /1.000 plantas</span></div>
          ${setores
            .map((s) => `<div class="card-row"><span>Setor ${s.n}</span><span>${formatNumero(s.v)}</span></div>`)
            .join("")}
          <div class="card-row ferti-total-row"><span>Total</span><span>${formatNumero(total)} (${formatNumero(
        total / 1000
      )} no estoque)</span></div>
          ${temDat ? `<div class="card-row"><span>D.A.T</span><span>${escapeHtml(String(r["D.A.T"]))} dias</span></div>` : ""}
          <button type="button" class="btn-compartilhar" data-idx="${r.__rowIndex}">📲 Enviar por WhatsApp</button>
        </div>`;
    };

    const renderList = (termo) => {
      const t = (termo || "").trim().toLowerCase();
      const filtrados = !t
        ? ordenados
        : ordenados.filter((r) =>
            [r["Estufa"], r["Meeiro"], r["Produto"]].some((v) => String(v || "").toLowerCase().includes(t))
          );
      if (filtrados.length === 0) {
        list.innerHTML = `<div class="empty-state">Nenhuma fertirrigação encontrada.</div>`;
        return;
      }
      list.innerHTML = filtrados.slice(0, 100).map(cardHtml).join("");
      list.querySelectorAll(".btn-compartilhar").forEach((btn) => {
        btn.addEventListener("click", () => {
          const registro = ordenados.find((r) => String(r.__rowIndex) === btn.dataset.idx);
          if (registro) compartilharTexto(montarTextoWhatsAppFerti(registro));
        });
      });
    };

    input.addEventListener("input", () => renderList(input.value));
    renderList();
  },
};
