// ============================================================================
// FINANCEIRO — CONTAS A PAGAR (aba "Financeiro" da planilha).
// Uma linha por Compra lançada (o próprio app já grava lá quando o bloco
// Compra é usado no Apontamento Livre, ver prepararRegistro em
// apontamento.js). Aqui é só consulta + a única ação que faz sentido no
// celular: marcar um título como pago (Status, Data Pagamento, Valor Pago,
// Pagador) — as demais colunas (Dias em Atraso, por ex.) ficam como estão,
// preservadas pelo montarLinhaPatch.
//
// Pagador é sempre um dos dois nomes cadastrados na validação da planilha
// (coluna N): EDIVANIA ou RENILVO — não é texto livre.
// ============================================================================

const FINANCEIRO_PAGADORES = ["EDIVANIA", "RENILVO"];

const ScreenFinanceiro = {
  async render(container) {
    container.innerHTML = `
      <h2 class="page-title">Financeiro</h2>
      <p class="page-subtitle">Contas a pagar</p>

      <div class="resumo-rapido" id="financeiro-resumo">
        <div class="resumo-card">
          <div class="resumo-valor resumo-alerta" id="fin-total-vencido">—</div>
          <div class="resumo-label">Vencido</div>
        </div>
        <div class="resumo-card">
          <div class="resumo-valor" id="fin-total-aberto">—</div>
          <div class="resumo-label">Em aberto</div>
        </div>
        <div class="resumo-card">
          <div class="resumo-valor resumo-valor-pequeno" id="fin-total-pago-mes">—</div>
          <div class="resumo-label">Pago no mês</div>
        </div>
        <div class="resumo-card">
          <div class="resumo-valor" id="fin-titulos-abertos">—</div>
          <div class="resumo-label">Títulos em aberto</div>
        </div>
      </div>

      <div class="search-bar" style="margin-top:14px;">
        <input type="search" id="busca-financeiro" placeholder="Buscar por fornecedor, produto ou nota fiscal..." />
      </div>
      <div class="ferti-filtros">
        <select id="filtro-fin-status">
          <option value="">Todos os status</option>
          <option value="vencida">Vencidas</option>
          <option value="aberto">Em aberto (não vencidas)</option>
          <option value="pago">Pagas</option>
        </select>
        <select id="filtro-fin-fornecedor"><option value="">Todos os fornecedores</option></select>
        <div id="financeiro-limpar-filtros" class="link-acao">Limpar filtros</div>
      </div>

      <div id="financeiro-list">Carregando...</div>
    `;

    const list = container.querySelector("#financeiro-list");
    const input = container.querySelector("#busca-financeiro");
    const statusSelect = container.querySelector("#filtro-fin-status");
    const fornecedorSelect = container.querySelector("#filtro-fin-fornecedor");

    let linhas = [];
    const carregar = async () => {
      linhas = await readTable(TABLES.financeiro);
    };

    try {
      await carregar();
    } catch (e) {
      console.error("Falha ao carregar Financeiro:", e);
      list.innerHTML = `<div class="empty-state">Não foi possível carregar as contas a pagar (${escapeHtml(
        String(e.message || e)
      )}). Verifique a conexão ou toque no nome do arquivo no topo do app pra selecionar de novo.</div>`;
      return;
    }

    const hojeSerial = toExcelSerial(new Date());

    // Situação derivada do Status + Data Vencimento — a planilha só guarda
    // "A Pagar"/"Pago", "vencida" é calculado aqui na hora (não existe coluna
    // própria pra isso, só "Dias em Atraso" que é computada pela planilha).
    const situacao = (r) => {
      if (r["Status"] === "Pago") return "pago";
      const venc = r["Data Vencimento"];
      if (venc !== undefined && venc !== null && venc !== "" && Number(venc) < hojeSerial) return "vencida";
      return "aberto";
    };

    const ordenados = () =>
      [...linhas]
        .filter((r) => r["Fornecedor"] || r["Produto"])
        .sort((a, b) => {
          const sa = situacao(a);
          const sb = situacao(b);
          // Vencida primeiro, depois em aberto, pagas por último — dentro de
          // cada grupo, vencimento mais próximo/antigo primeiro.
          const ordemSituacao = { vencida: 0, aberto: 1, pago: 2 };
          if (ordemSituacao[sa] !== ordemSituacao[sb]) return ordemSituacao[sa] - ordemSituacao[sb];
          return (Number(a["Data Vencimento"]) || 0) - (Number(b["Data Vencimento"]) || 0);
        });

    const fornecedores = [...new Set(linhas.map((r) => r["Fornecedor"]).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );
    fornecedorSelect.innerHTML =
      `<option value="">Todos os fornecedores</option>` +
      fornecedores.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join("");

    const atualizarResumo = () => {
      const abertosOuVencidos = linhas.filter((r) => situacao(r) !== "pago");
      const vencidos = abertosOuVencidos.filter((r) => situacao(r) === "vencida");
      const totalAberto = abertosOuVencidos.reduce((soma, r) => soma + (Number(r["Valor Total"]) || 0), 0);
      const totalVencido = vencidos.reduce((soma, r) => soma + (Number(r["Valor Total"]) || 0), 0);

      const agora = new Date();
      const inicioMesSerial = toExcelSerial(new Date(agora.getFullYear(), agora.getMonth(), 1));
      const totalPagoMes = linhas
        .filter((r) => situacao(r) === "pago" && Number(r["Data Pagamento"]) >= inicioMesSerial)
        .reduce((soma, r) => soma + (Number(r["Valor Pago"]) || Number(r["Valor Total"]) || 0), 0);

      container.querySelector("#fin-total-vencido").textContent = formatMoeda(totalVencido);
      container.querySelector("#fin-total-aberto").textContent = formatMoeda(totalAberto);
      container.querySelector("#fin-total-pago-mes").textContent = formatMoeda(totalPagoMes);
      container.querySelector("#fin-titulos-abertos").textContent = abertosOuVencidos.length;
    };

    const SITUACAO_INFO = {
      vencida: { classe: "financeiro-vencida", badge: "financeiro-badge-vencida", texto: "Vencida" },
      aberto: { classe: "financeiro-aberto", badge: "financeiro-badge-aberto", texto: "A pagar" },
      pago: { classe: "financeiro-pago", badge: "financeiro-badge-pago", texto: "Pago" },
    };

    const cardHtml = (r) => {
      const sit = situacao(r);
      const info = SITUACAO_INFO[sit];
      let linhaData;
      if (sit === "vencida") {
        const dias = hojeSerial - Number(r["Data Vencimento"]);
        linhaData = `Venceu em ${formatExcelDate(r["Data Vencimento"])} · há ${dias} dia${dias === 1 ? "" : "s"}`;
      } else if (sit === "pago") {
        linhaData = `Pago em ${formatExcelDate(r["Data Pagamento"])}${r["Pagador"] ? " · " + escapeHtml(r["Pagador"]) : ""}`;
      } else {
        linhaData = `Vence em ${formatExcelDate(r["Data Vencimento"])}`;
      }
      return `
        <div class="card card-financeiro ${info.classe}" data-idx="${r.__rowIndex}">
          <div class="card-title">${escapeHtml(r["Fornecedor"] || "—")} <span class="financeiro-badge ${info.badge}">${info.texto}</span></div>
          <div class="card-sub">${linhaData}</div>
          <div class="card-row"><span>Produto</span><span>${escapeHtml(r["Produto"] || "—")}</span></div>
          ${r["Nota Fiscal"] ? `<div class="card-row"><span>Nota Fiscal</span><span>${escapeHtml(String(r["Nota Fiscal"]))}</span></div>` : ""}
          <div class="card-row"><span>Compra</span><span>${formatExcelDate(r["Data Compra"])}</span></div>
          <div class="card-row ferti-total-row"><span>Valor Total</span><span>${formatMoeda(r["Valor Total"])}</span></div>
          ${
            sit === "pago"
              ? `<div class="card-row"><span>Valor Pago</span><span>${formatMoeda(r["Valor Pago"] ?? r["Valor Total"])}</span></div>`
              : `<button type="button" class="btn-pagar" data-idx="${r.__rowIndex}">💰 Marcar como pago</button>
                 <div class="financeiro-pagamento-form" data-idx="${r.__rowIndex}" hidden></div>`
          }
        </div>`;
    };

    // Formulário de pagamento — só existe dentro do card enquanto a pessoa
    // não confirma ou cancela (não é uma tela/modal separada, fica embutido).
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

    const renderList = () => {
      const termo = input.value.trim().toLowerCase();
      const statusFiltro = statusSelect.value;
      const fornecedorFiltro = fornecedorSelect.value;

      const filtrados = ordenados().filter((r) => {
        if (fornecedorFiltro && r["Fornecedor"] !== fornecedorFiltro) return false;
        if (statusFiltro && situacao(r) !== statusFiltro) return false;
        if (
          termo &&
          ![r["Fornecedor"], r["Produto"], r["Nota Fiscal"]].some((v) => String(v || "").toLowerCase().includes(termo))
        )
          return false;
        return true;
      });

      if (filtrados.length === 0) {
        list.innerHTML = `<div class="empty-state">Nenhuma conta encontrada com esse filtro.</div>`;
        return;
      }
      list.innerHTML = filtrados.slice(0, 150).map(cardHtml).join("");

      list.querySelectorAll(".btn-pagar").forEach((btn) => {
        btn.addEventListener("click", () => {
          const card = btn.closest(".card-financeiro");
          const formEl = card.querySelector(".financeiro-pagamento-form");
          const registro = linhas.find((r) => String(r.__rowIndex) === btn.dataset.idx);
          if (!registro || !formEl) return;
          formEl.innerHTML = formPagamentoHtml(registro);
          formEl.hidden = false;
          btn.hidden = true;
          wirePagamentoForm(formEl, registro, btn);
        });
      });
    };

    const wirePagamentoForm = (formEl, registro, btnPagar) => {
      const valorInput = formEl.querySelector(".fin-valor-pago");
      formEl.querySelectorAll(".fin-valor-opcao").forEach((radio) => {
        radio.addEventListener("change", () => {
          const outro = formEl.querySelector('.fin-valor-opcao[value="outro"]').checked;
          valorInput.disabled = !outro;
          if (!outro) valorInput.value = Number(registro["Valor Total"]) || 0;
        });
      });

      formEl.querySelector(".fin-cancelar-pagamento").addEventListener("click", () => {
        formEl.hidden = true;
        formEl.innerHTML = "";
        btnPagar.hidden = false;
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
          await carregar();
          atualizarResumo();
          renderList();
        } catch (e) {
          console.error("Falha ao gravar pagamento:", e);
          showToast(`Não foi possível gravar o pagamento (${e.message || e}).`);
          confirmarBtn.disabled = false;
          confirmarBtn.textContent = "Confirmar pagamento";
        }
      });
    };

    [input, statusSelect, fornecedorSelect].forEach((el) => {
      el.addEventListener("input", renderList);
      el.addEventListener("change", renderList);
    });
    container.querySelector("#financeiro-limpar-filtros").addEventListener("click", () => {
      input.value = "";
      statusSelect.value = "";
      fornecedorSelect.value = "";
      renderList();
    });

    atualizarResumo();
    renderList();
  },
};
