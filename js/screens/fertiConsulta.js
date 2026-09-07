// ============================================================================
// CONSULTA DE FERTIRRIGAÇÕES — aba "Ferti" da navegação.
// Histórico completo da aba "Registro Ferti" (não some depois de um tempo,
// diferente da Atividade recente da tela Início, que só mostra os últimos 4).
// Cada card tem um botão pra gerar o relatório e enviar por WhatsApp pro
// meeiro, com as quantidades por setor, dia, estufa e produto.
//
// "Agrupar por estufa": quando a mesma estufa leva mais de um produto no
// mesmo dia (ex.: um adubo + um bioestimulante), dá pra marcar os
// lançamentos envolvidos e mandar um único WhatsApp com os dois — em vez de
// mandar uma mensagem separada pra cada produto.
// ============================================================================

const ScreenFertiConsulta = {
  async render(container) {
    container.innerHTML = `
      <h2 class="page-title">Fertirrigações</h2>
      <div class="search-bar">
        <input type="search" id="busca-ferti" placeholder="Buscar por estufa, meeiro ou produto..." />
      </div>
      <div class="ferti-filtros">
        <select id="filtro-estufa"><option value="">Todas as estufas</option></select>
        <select id="filtro-meeiro"><option value="">Todos os meeiros</option></select>
        <div class="ferti-filtros-datas">
          <input type="date" id="filtro-data-de" />
          <span>até</span>
          <input type="date" id="filtro-data-ate" />
        </div>
        <div id="ferti-limpar-filtros" class="link-acao">Limpar filtros</div>
      </div>
      <div class="ferti-agrupar-bar">
        <label class="ferti-marcar-todos">
          <input type="checkbox" id="chk-marcar-todos" />
          <span>Marcar todos</span>
          <span class="ferti-agrupar-separador">•</span>
          <span id="ferti-agrupar-contagem">0 selecionados</span>
        </label>
        <div class="ferti-agrupar-acoes">
          <button type="button" id="btn-agrupar-enviar" class="btn-agrupar-enviar">➤ Enviar agrupado</button>
          <div id="btn-agrupar-cancelar" class="ferti-agrupar-cancelar" title="Limpar seleção">✕</div>
        </div>
      </div>
      <div id="ferti-consulta-list">Carregando...</div>
    `;

    const list = container.querySelector("#ferti-consulta-list");
    const input = container.querySelector("#busca-ferti");
    const estufaSelect = container.querySelector("#filtro-estufa");
    const meeiroSelect = container.querySelector("#filtro-meeiro");
    const dataDeInput = container.querySelector("#filtro-data-de");
    const dataAteInput = container.querySelector("#filtro-data-ate");
    const chkMarcarTodos = container.querySelector("#chk-marcar-todos");
    const contagemEl = container.querySelector("#ferti-agrupar-contagem");

    // Seleção pra agrupar: cada card sempre tem sua própria caixinha (não
    // existe mais um "modo" separado pra ligar/desligar). O checkbox
    // "Marcar todos" da barra é só um atalho: marcado, seleciona tudo que
    // está visível agora (respeitando os filtros); clicado de novo (ele já
    // marcado) limpa a seleção inteira e volta pro estado 1 — selecionar
    // item a item pelos cards. O rótulo "Marcar todos" nunca muda pra
    // "Desmarcar" nem nada parecido, mesmo com tudo selecionado.
    const selecionados = new Set();
    let ultimosFiltrados = [];

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
      // Arredondado pra centena de grama (a pedido do usuário) — inclusive
      // pra lançamentos antigos que ainda tenham valor "quebrado" gravado na
      // planilha. O total é recalculado a partir dos setores já
      // arredondados, em vez de usar a coluna "Total" da planilha, pra
      // sempre bater com a soma do que está mostrado no card.
      const setores = [1, 2, 3, 4, 5, 6]
        .map((n) => ({ n, v: arredondarGramasFerti(r[`Setor ${n}`]) }))
        .filter((s) => s.v > 0);
      const total = setores.reduce((soma, s) => soma + s.v, 0);
      const temDat = r["D.A.T"] !== undefined && r["D.A.T"] !== null && r["D.A.T"] !== "";
      return `
        <div class="card card-ferti">
          <label class="ferti-checkbox">
            <input type="checkbox" class="ferti-select" data-idx="${r.__rowIndex}" ${
              selecionados.has(String(r.__rowIndex)) ? "checked" : ""
            } />
            Selecionar pra agrupar
          </label>
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

    // Lista de estufas/meeiros pra popular os filtros — só os que realmente
    // aparecem no histórico de Ferti, em ordem alfabética.
    const estufas = [...new Set(ordenados.map((r) => r["Estufa"]).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );
    estufaSelect.innerHTML =
      `<option value="">Todas as estufas</option>` +
      estufas.map((e) => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join("");

    const meeiros = [...new Set(ordenados.map((r) => r["Meeiro"]).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );
    meeiroSelect.innerHTML =
      `<option value="">Todos os meeiros</option>` +
      meeiros.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");

    // Combina busca por texto + estufa + meeiro + intervalo de datas — os
    // filtros funcionam juntos (ex.: estufa X + meeiro Y numa data), não um
    // de cada vez.
    const renderList = () => {
      const termo = input.value.trim().toLowerCase();
      const estufaFiltro = estufaSelect.value;
      const meeiroFiltro = meeiroSelect.value;
      const serialDe = dataDeInput.value ? toExcelSerial(dataDeInput.value) : null;
      const serialAte = dataAteInput.value ? toExcelSerial(dataAteInput.value) : null;

      const filtrados = ordenados.filter((r) => {
        if (estufaFiltro && r["Estufa"] !== estufaFiltro) return false;
        if (meeiroFiltro && r["Meeiro"] !== meeiroFiltro) return false;
        const dataSerial = r["Data"] !== undefined && r["Data"] !== null && r["Data"] !== "" ? Number(r["Data"]) : null;
        if (serialDe !== null && (dataSerial === null || dataSerial < serialDe)) return false;
        if (serialAte !== null && (dataSerial === null || dataSerial > serialAte)) return false;
        if (termo && ![r["Estufa"], r["Meeiro"], r["Produto"]].some((v) => String(v || "").toLowerCase().includes(termo)))
          return false;
        return true;
      });
      ultimosFiltrados = filtrados;

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
      list.querySelectorAll(".ferti-select").forEach((chk) => {
        chk.addEventListener("change", () => {
          if (chk.checked) selecionados.add(chk.dataset.idx);
          else selecionados.delete(chk.dataset.idx);
          atualizarContagemSelecao();
        });
      });
    };

    // Reflete a seleção atual na contagem e sincroniza o checkbox "Marcar
    // todos" — ele aparece marcado quando (e só quando) tudo que está
    // visível agora já foi selecionado, seja pelo próprio checkbox seja
    // marcando os cards um a um.
    const atualizarContagemSelecao = () => {
      contagemEl.textContent = `${selecionados.size} selecionado${selecionados.size === 1 ? "" : "s"}`;
      chkMarcarTodos.checked = ultimosFiltrados.length > 0 && selecionados.size === ultimosFiltrados.length;
    };

    // Checkbox "Marcar todos": marcá-lo seleciona tudo que está visível
    // agora (respeitando os filtros de estufa/meeiro/data/busca); clicar de
    // novo nele já marcado desmarca tudo e volta pro estado 1 (seleção
    // individual, item a item, pelos cards). O texto "Marcar todos" nunca
    // muda, independente do estado.
    chkMarcarTodos.addEventListener("change", () => {
      if (chkMarcarTodos.checked) {
        ultimosFiltrados.forEach((r) => selecionados.add(String(r.__rowIndex)));
      } else {
        selecionados.clear();
      }
      atualizarContagemSelecao();
      renderList();
    });

    // "✕" limpa a seleção inteira sem sair da tela nem mexer nos filtros.
    container.querySelector("#btn-agrupar-cancelar").addEventListener("click", () => {
      selecionados.clear();
      atualizarContagemSelecao();
      renderList();
    });

    container.querySelector("#btn-agrupar-enviar").addEventListener("click", () => {
      if (selecionados.size === 0) {
        showToast("Selecione ao menos um lançamento pra agrupar.");
        return;
      }
      const escolhidos = ordenados.filter((r) => selecionados.has(String(r.__rowIndex)));
      // Um único recado só faz sentido pra uma estufa e um dia — senão a
      // pessoa recebendo não sabe a quem/quando cada produto se refere.
      const estufas = new Set(escolhidos.map((r) => r["Estufa"]));
      const datas = new Set(escolhidos.map((r) => Number(r["Data"]) || 0));
      if (estufas.size > 1 || datas.size > 1) {
        showToast("Selecione lançamentos da mesma estufa e do mesmo dia pra agrupar.");
        return;
      }
      compartilharTexto(montarTextoWhatsAppFertiAgrupado(escolhidos));
    });

    [input, estufaSelect, meeiroSelect, dataDeInput, dataAteInput].forEach((el) => {
      el.addEventListener("input", renderList);
      el.addEventListener("change", renderList);
    });
    container.querySelector("#ferti-limpar-filtros").addEventListener("click", () => {
      input.value = "";
      estufaSelect.value = "";
      meeiroSelect.value = "";
      dataDeInput.value = "";
      dataAteInput.value = "";
      renderList();
    });
    renderList();
  },
};
