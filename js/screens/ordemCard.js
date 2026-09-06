// ============================================================================
// T2 — CARD DA ORDEM
// Detalhe da ordem (leitura) + campos de execução editáveis.
// Confirmar execução → grava em Apontamentos (com ID Ordem preenchido em AQ,
// para que a fórmula da aba "Ordens de Aplicacao" atualize Situação/Desvio sozinha).
// ============================================================================

const ScreenOrdemCard = {
  async render(container, ordemId) {
    container.innerHTML = `<div id="ordem-detail">Carregando...</div>`;
    const { ordens } = await getLookupData();
    const ordem = ordens.find((o) => String(o["ID Ordem"]) === String(ordemId));
    const el = container.querySelector("#ordem-detail");

    if (!ordem) {
      el.innerHTML = `<div class="empty-state">Ordem não encontrada (pode já ter sido sincronizada). <br><button class="btn btn-secondary btn-block" onclick="navigate('ordens')">Voltar</button></div>`;
      return;
    }

    const draftKey = `draft_ordem_${ordemId}`;
    const draft = JSON.parse(localStorage.getItem(draftKey) || "null") || {};
    const isFerti = ordem["Bloco"] === "Ferti";

    el.innerHTML = `
      <h2 class="page-title">${escapeHtml(ordem["Estufa"])} — ${escapeHtml(ordem["Produto"])}</h2>
      <div class="card">
        <div class="card-row"><span>Bloco</span><span>${escapeHtml(ordem["Bloco"])}</span></div>
        <div class="card-row"><span>Setor</span><span>${escapeHtml(ordem["Setor"] || "—")}</span></div>
        <div class="card-row"><span>Data prevista</span><span>${formatExcelDate(ordem["Data Prevista"])}</span></div>
        <div class="card-row"><span>Dosagem prevista</span><span>${escapeHtml(String(ordem["Dosagem Prevista"] ?? "—"))}</span></div>
        <div class="card-row"><span>Volume/Qtde prevista</span><span>${escapeHtml(String(ordem["Volume/Qtde Prevista"] ?? "—"))}</span></div>
        <div class="card-row"><span>Estoque atual</span><span>${escapeHtml(String(ordem["Estoque Atual"] ?? "—"))}</span></div>
        ${ordem["Instruções"] ? `<div class="card-row"><span>Instruções</span><span>${escapeHtml(ordem["Instruções"])}</span></div>` : ""}
      </div>

      <div class="section-title">Execução</div>
      <label>Data de execução</label>
      <input type="date" id="f-data" value="${draft.data || new Date().toISOString().slice(0, 10)}" />

      ${
        isFerti
          ? `
        <label>Dosagem real aplicada</label>
        <input type="number" step="0.01" id="f-dosagem" value="${draft.dosagem ?? ordem["Dosagem Prevista"] ?? ""}" />
        <div class="section-title">Qtde por setor</div>
        <div class="setores-grid">
          ${[1, 2, 3, 4, 5, 6]
            .map(
              (n) => `
            <div>
              <label>Setor ${n}</label>
              <input type="number" step="0.01" data-setor="${n}" class="f-setor" value="${draft["setor" + n] ?? ""}" />
            </div>`
            )
            .join("")}
        </div>`
          : `
        <label>Qtde real aplicada</label>
        <input type="number" step="0.01" id="f-quantidade" value="${draft.quantidade ?? ordem["Volume/Qtde Prevista"] ?? ""}" />
        <label>Dosagem real (opcional, se diferente da prevista)</label>
        <input type="number" step="0.01" id="f-dosagem-alt" value="${draft.dosagemAlt ?? ""}" />`
      }

      <label>Complemento / observação</label>
      <textarea id="f-complemento">${draft.complemento || ""}</textarea>

      <div class="btn-row">
        <button id="btn-rascunho" class="btn btn-secondary">Salvar rascunho</button>
        <button id="btn-confirmar" class="btn btn-primary">Confirmar execução</button>
      </div>
      <button id="btn-recusar" class="btn btn-danger btn-block">Recusar com justificativa</button>
    `;

    function readForm() {
      const base = {
        data: el.querySelector("#f-data").value,
        complemento: el.querySelector("#f-complemento").value,
      };
      if (isFerti) {
        base.dosagem = el.querySelector("#f-dosagem").value;
        [1, 2, 3, 4, 5, 6].forEach((n) => {
          base["setor" + n] = el.querySelector(`.f-setor[data-setor="${n}"]`).value;
        });
      } else {
        base.quantidade = el.querySelector("#f-quantidade").value;
        base.dosagemAlt = el.querySelector("#f-dosagem-alt").value;
      }
      return base;
    }

    el.querySelector("#btn-rascunho").addEventListener("click", () => {
      localStorage.setItem(draftKey, JSON.stringify(readForm()));
      showToast("Rascunho salvo neste aparelho");
    });

    el.querySelector("#btn-confirmar").addEventListener("click", async () => {
      const form = readForm();
      const fields = isFerti
        ? {
            Bloco: "Ferti",
            Data: form.data,
            "Código Meeiro": ordem["Código Meeiro"],
            "Código Estufa": ordem["Código Estufa"],
            Produto: ordem["Produto"],
            "Dosagem Ferti": Number(form.dosagem) || null,
            "Qtde Setor 1": Number(form.setor1) || null,
            "Qtde Setor 2": Number(form.setor2) || null,
            "Qtde Setor 3": Number(form.setor3) || null,
            "Qtde Setor 4": Number(form.setor4) || null,
            "Qtde Setor 5": Number(form.setor5) || null,
            "Qtde Setor 6": Number(form.setor6) || null,
            Complemento: form.complemento,
            "ID Ordem": ordem["ID Ordem"],
          }
        : {
            Bloco: "Uso",
            Data: form.data,
            "Código Meeiro": ordem["Código Meeiro"],
            "Código Estufa": ordem["Código Estufa"],
            Produto: ordem["Produto"],
            Operação: "Saída Consumo",
            Quantidade: Number(form.quantidade),
            "Alterar dosagem para:": form.dosagemAlt ? Number(form.dosagemAlt) : null,
            Complemento: form.complemento,
            "ID Ordem": ordem["ID Ordem"],
          };

      const lookups = await getLookupData();
      const erro = validateBeforeSend(fields, lookups);
      if (erro) {
        showToast(`Não foi possível enviar: ${erro}`);
        return;
      }

      await queueAdd({ fields, origemTela: "T2", ordemId: ordem["ID Ordem"] });
      localStorage.removeItem(draftKey);
      showToast("Execução registrada. Sincronizando...");
      updateSyncIndicator();
      if (navigator.onLine) syncQueueOnce().then(() => { updateSyncIndicator(); });
      navigate("ordens");
    });

    el.querySelector("#btn-recusar").addEventListener("click", async () => {
      const justificativa = prompt("Motivo da recusa:");
      if (!justificativa) return;
      // A especificação não define uma coluna para "recusa" em Apontamentos —
      // fica registrado localmente (Fila) como referência; comunique o escritório
      // por fora até que se defina onde essa informação deve ser gravada na planilha.
      await queueAdd({
        fields: { Bloco: "Recusa (informativo, não enviado à planilha)" },
        localOnly: true,
        justificativa,
        ordemId: ordem["ID Ordem"],
        status: "enviado", // não tenta sincronizar
      });
      showToast("Recusa registrada localmente");
      navigate("ordens");
    });
  },
};
