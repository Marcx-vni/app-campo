// ============================================================================
// T5 — FILA DE SINCRONIZAÇÃO
// Apontamentos pendentes/enviados/erro, com status por item e erro de
// validação devolvido pela planilha (coluna AF). Reenviar / Descartar item.
// ============================================================================

const ScreenFila = {
  async render(container) {
    container.innerHTML = `
      <h2 class="page-title">Fila de Sincronização</h2>
      <button id="btn-sync-all" class="btn btn-primary btn-block">Sincronizar agora</button>
      <div id="fila-list" style="margin-top:12px;"></div>
    `;

    const renderList = async () => {
      const items = await queueAll();
      const list = container.querySelector("#fila-list");
      if (items.length === 0) {
        list.innerHTML = `<div class="empty-state">Nenhum apontamento na fila.</div>`;
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
