// ============================================================================
// T5 — FILA DE SINCRONIZAÇÃO
// Apontamentos pendentes/enviados/erro, com status por item e erro de
// validação devolvido pela planilha (coluna AF). Reenviar / Descartar item.
// Desde a v21: filtro por Data e por Status — a fila fica só neste aparelho
// (IndexedDB não sincroniza entre dispositivos) e cresce sem limite (itens
// "enviado" não são removidos sozinhos, só por "Descartar"), então com o
// tempo pode acumular bastante coisa; o filtro ajuda a achar um lançamento
// específico sem rolar a lista inteira.
// ============================================================================

const ScreenFila = {
  // Filtros ficam guardados na própria tela (não em localStorage) — resetam
  // ao sair e voltar pra essa tela, igual ao comportamento do resto do app.
  filtroData: "",
  filtroStatus: "",

  async render(container) {
    container.innerHTML = `
      <h2 class="page-title">Fila de Sincronização</h2>
      <button id="btn-sync-all" class="btn btn-primary btn-block">Sincronizar agora</button>

      <div class="fila-filtros" style="display:flex; gap:8px; margin-top:12px;">
        <div style="flex:1;">
          <label>📅 Data</label>
          <input type="date" id="filtro-data" value="${this.filtroData}" />
        </div>
        <div style="flex:1;">
          <label>📶 Status</label>
          <select id="filtro-status">
            <option value="">Todos</option>
            <option value="pendente" ${this.filtroStatus === "pendente" ? "selected" : ""}>Pendente</option>
            <option value="enviando" ${this.filtroStatus === "enviando" ? "selected" : ""}>Enviando</option>
            <option value="enviado" ${this.filtroStatus === "enviado" ? "selected" : ""}>Enviado</option>
            <option value="erro" ${this.filtroStatus === "erro" ? "selected" : ""}>Erro</option>
          </select>
        </div>
      </div>
      <button id="btn-limpar-filtro" class="btn btn-secondary btn-sm" style="margin-top:8px;">Limpar filtro</button>

      <div id="fila-contagem" class="page-subtitle" style="margin-top:8px;"></div>
      <div id="fila-list" style="margin-top:4px;"></div>
    `;

    const filtroDataEl = container.querySelector("#filtro-data");
    const filtroStatusEl = container.querySelector("#filtro-status");
    const contagemEl = container.querySelector("#fila-contagem");

    const renderList = async () => {
      const todos = await queueAll();

      // "Data" aqui é a data em que o apontamento foi CRIADO neste aparelho
      // (createdAt), não o campo "Data" do formulário — é o mesmo valor já
      // mostrado em cada card, só convertido pra AAAA-MM-DD (fuso local) pra
      // comparar com o <input type="date">.
      const items = todos.filter((item) => {
        if (this.filtroStatus && item.status !== this.filtroStatus) return false;
        if (this.filtroData) {
          const d = new Date(item.createdAt);
          const dataLocal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          if (dataLocal !== this.filtroData) return false;
        }
        return true;
      });

      const list = container.querySelector("#fila-list");
      const temFiltro = this.filtroData || this.filtroStatus;
      contagemEl.textContent = temFiltro
        ? `${items.length} de ${todos.length} apontamento(s)`
        : `${todos.length} apontamento(s) na fila`;

      if (items.length === 0) {
        list.innerHTML = `<div class="empty-state">${
          temFiltro ? "Nenhum apontamento encontrado com esse filtro." : "Nenhum apontamento na fila."
        }</div>`;
        return;
      }
      list.innerHTML = items.map((item) => this.itemCard(item)).join("");

      list.querySelectorAll("[data-descartar]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (confirm("Descartar este apontamento da fila? Ele não será enviado.")) {
            await queueDiscard(btn.dataset.descartar);
            renderList();
            updateSyncIndicator();
          }
        });
      });
    };

    filtroDataEl.addEventListener("change", () => {
      this.filtroData = filtroDataEl.value;
      renderList();
    });
    filtroStatusEl.addEventListener("change", () => {
      this.filtroStatus = filtroStatusEl.value;
      renderList();
    });
    container.querySelector("#btn-limpar-filtro").addEventListener("click", () => {
      this.filtroData = "";
      this.filtroStatus = "";
      filtroDataEl.value = "";
      filtroStatusEl.value = "";
      renderList();
    });

    container.querySelector("#btn-sync-all").addEventListener("click", async () => {
      if (!navigator.onLine) {
        showToast("Sem conexão no momento");
        return;
      }
      showToast("Sincronizando...");
      const result = await syncQueueOnce();
      showToast(`${result.sent} enviado(s), ${result.failed} com erro`);
      updateSyncIndicator();
      renderList();
    });

    renderList();
  },

  itemCard(item) {
    const badgeClass = { pendente: "badge-pending", enviando: "badge-warn", enviado: "badge-ok", erro: "badge-error" }[item.status] || "badge-muted";
    const titulo = item.localOnly
      ? `Recusa — Ordem ${item.ordemId}`
      : `${item.fields?.["Bloco"] || "?"} — ${item.fields?.["Produto"] || ""}`;

    return `
      <div class="card">
        <div class="card-title">${escapeHtml(titulo)} <span class="badge ${badgeClass}">${item.status}</span></div>
        <div class="card-sub">${new Date(item.createdAt).toLocaleString("pt-BR")}</div>
        ${item.fields?.["Quantidade"] ? `<div class="card-row"><span>Quantidade</span><span>${item.fields["Quantidade"]}</span></div>` : ""}
        ${item.seqInventario ? `<div class="card-row"><span>Seq Inventário</span><span>${item.seqInventario}</span></div>` : ""}
        ${item.erro ? `<div class="card-row"><span>Erro</span><span style="color:var(--red)">${escapeHtml(item.erro)}</span></div>` : ""}
        ${item.justificativa ? `<div class="card-row"><span>Justificativa</span><span>${escapeHtml(item.justificativa)}</span></div>` : ""}
        ${
          item.status === "erro" || item.status === "pendente"
            ? `<button class="btn btn-secondary btn-sm btn-block" data-descartar="${item.localId}" style="margin-top:8px;">Descartar</button>`
            : ""
        }
      </div>`;
  },
};
