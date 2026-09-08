// ============================================================================
// FINANCEIRO — CONTAS A PAGAR (aba "Financeiro" da planilha).
// Uma linha por Compra lançada (o próprio app já grava lá quando o bloco
// Compra é usado no Apontamento Livre, ver prepararRegistro em
// apontamento.js). Layout em 3 blocos, de cima pra baixo: KPIs, gráfico de
// saídas por período + ranking de fornecedores, e a lista de títulos em
// aberto (com o botão de marcar como pago, que o mockup original do usuário
// não trazia mas foi pedido explicitamente pra entrar aqui).
//
// Pagador é sempre um dos dois nomes cadastrados na validação da planilha
// (coluna N): EDIVANIA ou RENILVO — não é texto livre.
// ============================================================================

const FINANCEIRO_PAGADORES = ["EDIVANIA", "RENILVO"];

// Rótulo/cor de cada balde do gráfico "Saídas por período" — só títulos em
// aberto (não pagos) entram aqui. "Atraso" é sempre vermelho (já venceu); os
// demais são o mesmo laranja de "previsto", só a distância no tempo muda.
const FINANCEIRO_BALDES = [
  { chave: "atraso", label: "Atraso", cor: "var(--red)" },
  { chave: "d7", label: "7 dias", cor: "var(--amber)" },
  { chave: "d15", label: "15 dias", cor: "var(--amber)" },
  { chave: "d30", label: "30 dias", cor: "var(--amber)" },
  { chave: "d30mais", label: "+30 dias", cor: "var(--amber)" },
];

const ScreenFinanceiro = {
  chart: null,
  expandedIdx: null,
  pagamentoAbertoIdx: null,

  async render(container) {
    container.innerHTML = `
      <h2 class="page-title">Financeiro</h2>
      <p class="page-subtitle">Contas a pagar</p>

      <div class="financeiro-kpis" id="financeiro-kpis"></div>

      <div class="sechead">
        Saídas por período ·
        <span class="financeiro-legenda-item"><span class="financeiro-legenda-dot" style="background:var(--red);"></span>vencido</span> ·
        <span class="financeiro-legenda-item"><span class="financeiro-legenda-dot" style="background:var(--amber);"></span>previsto</span>
      </div>
      <div class="financeiro-chart-wrap">
        <canvas id="financeiro-chart"></canvas>
      </div>

      <div class="sechead">Fornecedores com maior exposição</div>
      <div id="financeiro-ranking"></div>

      <div class="sechead" style="margin-top:16px;">Próximos vencimentos</div>
      <div class="search-bar">
        <input type="search" id="busca-financeiro" placeholder="Buscar por fornecedor, produto ou nota fiscal..." />
      </div>
      <div class="financeiro-chips" id="financeiro-chips">
        <button type="button" class="chip active" data-f="todos">Todos</button>
        <button type="button" class="chip" data-f="vencido">Vencido</button>
        <button type="button" class="chip" data-f="semana">Esta semana</button>
        <button type="button" class="chip" data-f="depois">Depois</button>
      </div>
      <div id="financeiro-list">Carregando...</div>
    `;

    this.expandedIdx = null;
    this.pagamentoAbertoIdx = null;
    let filtroAtual = "todos";

    const kpisEl = container.querySelector("#financeiro-kpis");
    const rankingEl = container.querySelector("#financeiro-ranking");
    const list = container.querySelector("#financeiro-list");
    const input = container.querySelector("#busca-financeiro");
    const chipsEl = container.querySelector("#financeiro-chips");

    let linhas = [];
    const carregar = async () => {
      linhas = await readTable(TABLES.financeiro);
    };

    try {
      await carregar();
    } catch (e) {
      console.error("Falha ao carregar Financeiro:", e);
      kpisEl.innerHTML = "";
      list.innerHTML = `<div class="empty-state">Não foi possível carregar as contas a pagar (${escapeHtml(
        String(e.message || e)
      )}). Verifique a conexão ou toque no nome do arquivo no topo do app pra selecionar de novo.</div>`;
      return;
    }

    const hojeSerial = toExcelSerial(new Date());

    // Situação de cada título: "pago" (Status=Pago), "vencida" (não pago e o
    // vencimento já passou) ou "aberto" (não pago, ainda dentro do prazo).
    const situacao = (r) => {
      if (r["Status"] === "Pago") return "pago";
      const venc = r["Data Vencimento"];
      if (venc !== undefined && venc !== null && venc !== "" && Number(venc) < hojeSerial) return "vencida";
      return "aberto";
    };
    const diasParaVencer = (r) => Number(r["Data Vencimento"]) - hojeSerial;

    // Categoria usada nos chips do filtro — só existe pra título não pago
    // (a lista "Próximos vencimentos" nunca mostra título já pago).
    const categoriaFiltro = (r) => {
      const sit = situacao(r);
      if (sit === "vencida") return "vencido";
      return diasParaVencer(r) <= 7 ? "semana" : "depois";
    };

    const todasComDado = () => linhas.filter((r) => r["Fornecedor"] || r["Produto"]);
    const naoPagas = () => todasComDado().filter((r) => situacao(r) !== "pago");

    // --- KPIs -----------------------------------------------------------
    const renderKpis = () => {
      const naoPagasArr = naoPagas();
      const vencidos = naoPagasArr.filter((r) => situacao(r) === "vencida");
      const semana = naoPagasArr.filter((r) => situacao(r) === "aberto" && diasParaVencer(r) <= 7);
      const totalVencido = vencidos.reduce((s, r) => s + (Number(r["Valor Total"]) || 0), 0);
      const totalAberto = naoPagasArr.reduce((s, r) => s + (Number(r["Valor Total"]) || 0), 0);
      const totalSemana = semana.reduce((s, r) => s + (Number(r["Valor Total"]) || 0), 0);

      const agora = new Date();
      const inicioMesSerial = toExcelSerial(new Date(agora.getFullYear(), agora.getMonth(), 1));
      const totalPagoMes = todasComDado()
        .filter((r) => situacao(r) === "pago" && Number(r["Data Pagamento"]) >= inicioMesSerial)
        .reduce((s, r) => s + (Number(r["Valor Pago"]) || Number(r["Valor Total"]) || 0), 0);

      kpisEl.innerHTML = `
        <div class="financeiro-kpi">
          <div class="financeiro-kpi-label">Vencido</div>
          <div class="financeiro-kpi-valor financeiro-kpi-vencido">${formatMoeda(totalVencido)}</div>
          <div class="financeiro-kpi-sub">${vencidos.length} título${vencidos.length === 1 ? "" : "s"}</div>
        </div>
        <div class="financeiro-kpi">
          <div class="financeiro-kpi-label">Em aberto</div>
          <div class="financeiro-kpi-valor">${formatMoeda(totalAberto)}</div>
          <div class="financeiro-kpi-sub">${naoPagasArr.length} título${naoPagasArr.length === 1 ? "" : "s"}</div>
        </div>
        <div class="financeiro-kpi">
          <div class="financeiro-kpi-label">Vence em 7 dias</div>
          <div class="financeiro-kpi-valor financeiro-kpi-semana">${formatMoeda(totalSemana)}</div>
          <div class="financeiro-kpi-sub">${semana.length} título${semana.length === 1 ? "" : "s"}</div>
        </div>
        <div class="financeiro-kpi">
          <div class="financeiro-kpi-label">Pago no mês</div>
          <div class="financeiro-kpi-valor">${formatMoeda(totalPagoMes)}</div>
        </div>
      `;
    };

    // --- Gráfico "Saídas por período" (só títulos em aberto) -------------
    const renderChart = () => {
      const canvas = container.querySelector("#financeiro-chart");
      if (!canvas) return;
      if (typeof Chart === "undefined") {
        canvas.replaceWith(
          Object.assign(document.createElement("div"), {
            className: "empty-state",
            textContent: "Gráfico indisponível offline.",
          })
        );
        return;
      }
      const abertos = naoPagas().filter((r) => situacao(r) === "aberto");
      const totais = {
        atraso: naoPagas()
          .filter((r) => situacao(r) === "vencida")
          .reduce((s, r) => s + (Number(r["Valor Total"]) || 0), 0),
        d7: 0,
        d15: 0,
        d30: 0,
        d30mais: 0,
      };
      abertos.forEach((r) => {
        const dias = diasParaVencer(r);
        const valor = Number(r["Valor Total"]) || 0;
        if (dias <= 7) totais.d7 += valor;
        else if (dias <= 15) totais.d15 += valor;
        else if (dias <= 30) totais.d30 += valor;
        else totais.d30mais += valor;
      });

      if (this.chart) {
        this.chart.destroy();
        this.chart = null;
      }
      const estilos = getComputedStyle(document.documentElement);
      const corTexto = estilos.getPropertyValue("--muted").trim() || "#6B6B65";
      const corGrade = estilos.getPropertyValue("--border").trim() || "#E3E1D9";
      this.chart = new Chart(canvas, {
        type: "bar",
        data: {
          labels: FINANCEIRO_BALDES.map((b) => b.label),
          datasets: [
            {
              data: FINANCEIRO_BALDES.map((b) => totais[b.chave]),
              backgroundColor: FINANCEIRO_BALDES.map((b) => estilos.getPropertyValue(b.cor.replace("var(", "").replace(")", "")).trim() || b.cor),
              borderRadius: 4,
              maxBarThickness: 28,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => formatMoeda(c.parsed.y) } } },
          scales: {
            x: { grid: { display: false }, ticks: { color: corTexto, font: { size: 10 } } },
            y: {
              grid: { color: corGrade },
              ticks: { color: corTexto, font: { size: 10 }, callback: (v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v) },
            },
          },
        },
      });
    };

    // --- Ranking de fornecedores com maior exposição ---------------------
    const renderRanking = () => {
      const porFornecedor = new Map();
      naoPagas().forEach((r) => {
        const nome = r["Fornecedor"] || "—";
        porFornecedor.set(nome, (porFornecedor.get(nome) || 0) + (Number(r["Valor Total"]) || 0));
      });
      const ranking = [...porFornecedor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      if (ranking.length === 0) {
        rankingEl.innerHTML = `<div class="empty-state" style="padding:16px 0;">Nenhum título em aberto.</div>`;
        return;
      }
      const maxValor = ranking[0][1];
      rankingEl.innerHTML = ranking
        .map(
          ([nome, valor]) => `
        <div class="financeiro-ranking-row">
          <div class="financeiro-ranking-nome">${escapeHtml(nome)}</div>
          <div class="financeiro-ranking-bar" style="width:${Math.max(6, (valor / maxValor) * 90)}px;"></div>
          <div class="financeiro-ranking-valor">${formatMoeda(valor)}</div>
        </div>`
        )
        .join("");
    };

    // --- Lista "Próximos vencimentos" (só não pagos) ---------------------
    const SITUACAO_INFO = {
      vencida: { classe: "financeiro-vencida", badge: "financeiro-badge-vencida", texto: "Vencido" },
      aberto: { classe: "financeiro-aberto", badge: "financeiro-badge-aberto", texto: "A pagar" },
    };

    const formPagamentoHtml = (r) => `
      <label>📅 Data do pagamento</label>
      <input type="date" class="fin-data-pagamento" value="${new Date().toISOString().slice(0, 10)}" />
      <label>💲 Valor pago</label>
      <div class="financeiro-valor-opcoes">
        <label><input type="radio" name="fin-valor-opcao-${r.__rowIndex}" class="fin-valor-opcao" value="integral" checked /> Integral (${formatMoeda(r["Valor Total"])})</label>
        <label><input type="radio" name="fin-valor-opcao-${r.__rowIndex}" class="fin-valor-opcao" value="outro" /> Outro valor</label>
      </div>
      <input type="number" step="0.01" class="fin-valor-pago" placeholder="Valor pago" value="${Number(r["Valor Total"]) || 0}" disabled />
      <label>🧑 Pagador</label>
      <select class="fin-pagador" required>
        <option value="">Selecione...</option>
        ${FINANCEIRO_PAGADORES.map((p) => `<option value="${p}">${p}</option>`).join("")}
      </select>
      <div class="financeiro-pagamento-acoes">
        <button type="button" class="btn btn-secondary btn-sm fin-cancelar-pagamento">Cancelar</button>
        <button type="button" class="btn btn-primary btn-sm fin-confirmar-pagamento">Confirmar pagamento</button>
      </div>
    `;

    const cardHtml = (r) => {
      const sit = situacao(r);
      const info = SITUACAO_INFO[sit];
      const aberto = this.expandedIdx === r.__rowIndex;
      const linhaSub =
        sit === "vencida"
          ? `Venceu em ${formatExcelDate(r["Data Vencimento"])} · ${formatMoeda(r["Valor Total"])}`
          : `Vence em ${formatExcelDate(r["Data Vencimento"])} · ${formatMoeda(r["Valor Total"])}`;

      return `
        <div class="card card-financeiro ${info.classe}">
          <div class="financeiro-chead" data-toggle="${r.__rowIndex}">
            <div class="financeiro-chead-topo">
              <span class="financeiro-chead-fornecedor">${escapeHtml(r["Fornecedor"] || "—")}</span>
              <span class="financeiro-badge ${info.badge}">${info.texto}</span>
            </div>
            <div class="card-sub">${linhaSub}</div>
          </div>
          ${
            aberto
              ? `<div class="financeiro-detail">
                  <div class="drow"><span>Produto</span><span>${escapeHtml(r["Produto"] || "—")}</span></div>
                  ${r["Nota Fiscal"] ? `<div class="drow"><span>Nota Fiscal</span><span>${escapeHtml(String(r["Nota Fiscal"]))}</span></div>` : ""}
                  <div class="drow"><span>Compra</span><span>${formatExcelDate(r["Data Compra"])}</span></div>
                  <div class="dashed"></div>
                  <div class="financeiro-totalrow"><span>Valor Total</span><span>${formatMoeda(r["Valor Total"])}</span></div>
                  ${
                    this.pagamentoAbertoIdx === r.__rowIndex
                      ? `<div class="financeiro-pagamento-form" data-idx="${r.__rowIndex}">${formPagamentoHtml(r)}</div>`
                      : `<button type="button" class="btn-pagar" data-idx="${r.__rowIndex}">💰 Marcar como pago</button>`
                  }
                </div>`
              : ""
          }
        </div>`;
    };

    const renderList = () => {
      const termo = input.value.trim().toLowerCase();
      const filtrados = naoPagas()
        .filter((r) => filtroAtual === "todos" || categoriaFiltro(r) === filtroAtual)
        .filter(
          (r) =>
            !termo ||
            [r["Fornecedor"], r["Produto"], r["Nota Fiscal"]].some((v) => String(v || "").toLowerCase().includes(termo))
        )
        .sort((a, b) => (Number(a["Data Vencimento"]) || 0) - (Number(b["Data Vencimento"]) || 0));

      if (filtrados.length === 0) {
        list.innerHTML = `<div class="empty-state">Nenhum título nesse filtro.</div>`;
        return;
      }
      list.innerHTML = filtrados.map(cardHtml).join("");

      list.querySelectorAll("[data-toggle]").forEach((el) => {
        el.addEventListener("click", () => {
          const idx = Number(el.dataset.toggle);
          this.expandedIdx = this.expandedIdx === idx ? null : idx;
          this.pagamentoAbertoIdx = null;
          renderList();
        });
      });
      list.querySelectorAll(".btn-pagar").forEach((btn) => {
        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this.pagamentoAbertoIdx = Number(btn.dataset.idx);
          renderList();
          const registro = linhas.find((r) => r.__rowIndex === this.pagamentoAbertoIdx);
          const formEl = list.querySelector(`.financeiro-pagamento-form[data-idx="${this.pagamentoAbertoIdx}"]`);
          if (registro && formEl) wirePagamentoForm(formEl, registro);
        });
      });
      // Impede que um clique dentro do formulário de pagamento (já expandido)
      // feche o card sem querer — só o cabeçalho recolhe/expande.
      list.querySelectorAll(".financeiro-detail").forEach((el) => el.addEventListener("click", (ev) => ev.stopPropagation()));
    };

    const wirePagamentoForm = (formEl, registro) => {
      const valorInput = formEl.querySelector(".fin-valor-pago");
      formEl.querySelectorAll(".fin-valor-opcao").forEach((radio) => {
        radio.addEventListener("change", () => {
          const outro = formEl.querySelector('.fin-valor-opcao[value="outro"]').checked;
          valorInput.disabled = !outro;
          if (!outro) valorInput.value = Number(registro["Valor Total"]) || 0;
        });
      });

      formEl.querySelector(".fin-cancelar-pagamento").addEventListener("click", () => {
        this.pagamentoAbertoIdx = null;
        renderList();
      });

      formEl.querySelector(".fin-confirmar-pagamento").addEventListener("click", async () => {
        const dataPagamento = formEl.querySelector(".fin-data-pagamento").value;
        const pagador = formEl.querySelector(".fin-pagador").value;
        const valorPago = Number(valorInput.value);
        if (!dataPagamento) {
          showToast("Informe a data do pagamento.");
          return;
        }
        if (!pagador) {
          showToast("Selecione o pagador.");
          return;
        }
        if (!(valorPago > 0)) {
          showToast("Informe um valor pago válido.");
          return;
        }

        const confirmarBtn = formEl.querySelector(".fin-confirmar-pagamento");
        confirmarBtn.disabled = true;
        confirmarBtn.textContent = "Gravando...";
        try {
          const patch = {
            Status: "Pago",
            "Data Pagamento": toExcelSerial(dataPagamento),
            "Valor Pago": valorPago,
            Pagador: pagador,
          };
          const novaLinha = montarLinhaPatch(FINANCEIRO_COLUMNS, registro, patch);
          await updateTableRow(TABLES.financeiro, registro.__rowIndex, novaLinha);
          showToast("Pagamento registrado.");
          this.expandedIdx = null;
          this.pagamentoAbertoIdx = null;
          await carregar();
          renderTudo();
        } catch (e) {
          console.error("Falha ao gravar pagamento:", e);
          showToast(`Não foi possível gravar o pagamento (${e.message || e}).`);
          confirmarBtn.disabled = false;
          confirmarBtn.textContent = "Confirmar pagamento";
        }
      });
    };

    const renderTudo = () => {
      renderKpis();
      renderChart();
      renderRanking();
      renderList();
    };

    chipsEl.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        filtroAtual = chip.dataset.f;
        chipsEl.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
        renderList();
      });
    });
    input.addEventListener("input", renderList);

    renderTudo();
  },
};
