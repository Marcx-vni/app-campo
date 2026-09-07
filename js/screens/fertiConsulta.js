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
      <div class="ferti-filtros">
        <select id="filtro-meeiro"><option value="">Todos os meeiros</option></select>
        <div class="ferti-filtros-datas">
          <input type="date" id="filtro-data-de" />
          <span>até</span>
          <input type="date" id="filtro-data-ate" />
        </div>
        <div id="ferti-limpar-filtros" class="link-acao">Limpar filtros</div>
      </div>
      <div id="ferti-consulta-list">Carregando...</div>
    `;

    const list = container.querySelector("#ferti-consulta-list");
    const input = container.querySelector("#busca-ferti");
    const meeiroSelect = container.querySelector("#filtro-meeiro");
    const dataDeInput = container.querySelector("#filtro-data-de");
    const dataAteInput = container.querySelector("#filtro-data-ate");

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
      // Arredondado pra dezena de grama (a pedido do usuário) — inclusive
      // pra lançamentos antigos que ainda tenham valor "quebrado" gravado na
      // planilha. O total é recalculado a partir dos setores já
      // arredondados, em vez de usar a coluna "Total" da planilha, pra
      // sempre bater com a soma do que está mostrado no card.
      const setores = [1, 2, 3, 4, 5, 6]
        .map((n) => ({ n, v: arredondarParaDezena(r[`Setor ${n}`]) }))
        .filter((s) => s.v > 0);
      const total = setores.reduce((soma, s) => soma + s.v, 0);
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

    // Lista de meeiros pra popular o filtro — só os que realmente aparecem
    // no histórico de Ferti, em ordem alfabética.
    const meeiros = [...new Set(ordenados.map((r) => r["Meeiro"]).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );
    meeiroSelect.innerHTML =
      `<option value="">Todos os meeiros</option>` +
      meeiros.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");

    // Combina busca por texto + meeiro + intervalo de datas — os três filtros
    // funcionam juntos (ex.: meeiro X entre duas datas), não um de cada vez.
    const renderList = () => {
      const termo = input.value.trim().toLowerCase();
      const meeiroFiltro = meeiroSelect.value;
      const serialDe = dataDeInput.value ? toExcelSerial(dataDeInput.value) : null;
      const serialAte = dataAteInput.value ? toExcelSerial(dataAteInput.value) : null;

      const filtrados = ordenados.filter((r) => {
        if (meeiroFiltro && r["Meeiro"] !== meeiroFiltro) return false;
        const dataSerial = r["Data"] !== undefined && r["Data"] !== null && r["Data"] !== "" ? Number(r["Data"]) : null;
        if (serialDe !== null && (dataSerial === null || dataSerial < serialDe)) return false;
        if (serialAte !== null && (dataSerial === null || dataSerial > serialAte)) return false;
        if (termo && ![r["Estufa"], r["Meeiro"], r["Produto"]].some((v) => String(v || "").toLowerCase().includes(termo)))
          return false;
        return true;
      });

      if (filtrados.length === 0) {
        list.innerHTML = `<div class="empty-state">Nenhuma fertirrigação encontrada com esse filtro.</div>`;
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

    [input, meeiroSelect, dataDeInput, dataAteInput].forEach((el) => {
      el.addEventListener("input", renderList);
      el.addEventListener("change", renderList);
    });
    container.querySelector("#ferti-limpar-filtros").addEventListener("click", () => {
      input.value = "";
      meeiroSelect.value = "";
      dataDeInput.value = "";
      dataAteInput.value = "";
      renderList();
    });
    renderList();
  },
};
