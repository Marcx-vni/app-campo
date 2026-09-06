// ============================================================================
// T3 — APONTAMENTO LIVRE
// Lançamento sem ordem prévia. Seletor de Bloco reconfigura os campos
// exibidos conforme a Seção 3 da especificação (Uso / Ferti / Venda / Compra).
// ============================================================================

const ScreenApontamentoLivre = {
  bloco: "Uso",

  async render(container) {
    const lookups = await getLookupData();
    container.innerHTML = `
      <h2 class="page-title">Apontamento Livre</h2>
      <div class="bloco-tabs">
        ${["Uso", "Ferti", "Venda", "Compra"]
          .map((b) => `<div class="bloco-tab ${b === this.bloco ? "active" : ""}" data-bloco="${b}">${b}</div>`)
          .join("")}
      </div>
      <form id="form-apontamento"></form>
    `;

    container.querySelectorAll(".bloco-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        this.bloco = tab.dataset.bloco;
        this.render(container);
      });
    });

    this.renderForm(container.querySelector("#form-apontamento"), lookups);
  },

  renderForm(form, lookups) {
    const meeiroCod = getMeeiroSelecionado();
    // Na Venda, a lista de produtos vem da aba "Cadastro de Venda" (coluna "Tipo"),
    // não do cadastro geral de produtos usado em Uso/Ferti/Compra.
    const produtoOptions =
      this.bloco === "Venda"
        ? (lookups.produtosVenda || [])
            .filter((p) => p["Tipo"])
            .map((p) => `<option value="${escapeHtml(p["Tipo"])}">${escapeHtml(p["Tipo"])}</option>`)
            .join("")
        : lookups.produtos
            .filter((p) => p["Produto"])
            .map((p) => `<option value="${escapeHtml(p["Produto"])}">${escapeHtml(p["Produto"])}</option>`)
            .join("");
    const estufaOptions = lookups.estufas
      .map((e) => `<option value="${e.__cod}">${escapeHtml(e["Estufa"])}</option>`)
      .join("");
    const meeiroOptions = lookups.meeiros
      .map((m) => `<option value="${m.__cod}" ${m.__cod === meeiroCod ? "selected" : ""}>${escapeHtml(m["Meeiro"])}</option>`)
      .join("");
    const operacaoOptions = (op) =>
      lookups.operacoes
        .filter((o) => o["Operação"] === op)
        .map((o) => `<option value="${escapeHtml(o["Operação"])}">${escapeHtml(o["Operação"])}</option>`)
        .join("");
    const fornecedorOptions = lookups.fornecedores
      .map((f) => `<option value="${escapeHtml(f["Fornecedor"])}">${escapeHtml(f["Fornecedor"])}</option>`)
      .join("");
    const clienteOptions = (lookups.clientes || [])
      .map((c) => `<option value="${escapeHtml(Object.values(c)[0])}">${escapeHtml(Object.values(c)[0])}</option>`)
      .join("");

    const today = new Date().toISOString().slice(0, 10);

    let camposEspecificos = "";
    if (this.bloco === "Uso") {
      camposEspecificos = `
        <input type="hidden" id="f-operacao" value="Saída Consumo" />
        <label>Quantidade (volume de calda, litros)</label>
        <input type="number" step="0.01" id="f-quantidade" required />
      `;
    } else if (this.bloco === "Ferti") {
      camposEspecificos = `
        <label>Dosagem Ferti</label>
        <input type="number" step="0.01" id="f-dosagem-ferti" />
        <label>D.A.T (dias após transplantio, opcional)</label>
        <input type="number" id="f-dat" />
        <div class="section-title">Qtde por setor (ao menos 1)</div>
        <div class="setores-grid">
          ${[1, 2, 3, 4, 5, 6]
            .map((n) => `<div><label>Setor ${n}</label><input type="number" step="0.01" class="f-setor" data-setor="${n}" /></div>`)
            .join("")}
        </div>
      `;
    } else if (this.bloco === "Venda") {
      camposEspecificos = `
        <input type="hidden" id="f-operacao" value="Venda" />
        <label>Quantidade</label>
        <input type="number" step="0.01" id="f-quantidade" required />
        <label>Valor unitário</label>
        <input type="number" step="0.01" id="f-valor-unitario" required />
        <label>Valor embalagem (opcional)</label>
        <input type="number" step="0.01" id="f-valor-embalagem" />
        <label>Cliente</label>
        <select id="f-cliente" required><option value="">Selecione...</option>${clienteOptions}</select>
      `;
    } else if (this.bloco === "Compra") {
      camposEspecificos = `
        <input type="hidden" id="f-operacao" value="Entrada de fornecedor" />
        <label>Quantidade</label>
        <input type="number" step="0.01" id="f-quantidade" required />
        <label>Valor unitário</label>
        <input type="number" step="0.01" id="f-valor-unitario" required />
        <label>Fornecedor</label>
        <select id="f-fornecedor" required><option value="">Selecione...</option>${fornecedorOptions}</select>
        <label>Data de vencimento (opcional)</label>
        <input type="date" id="f-vencimento" />
        <label>Nota fiscal (opcional)</label>
        <input type="text" id="f-nota-fiscal" />
      `;
    }

    form.innerHTML = `
      <label>Data</label>
      <input type="date" id="f-data" value="${today}" required />

      ${
        this.bloco !== "Compra"
          ? `<label>Meeiro</label><select id="f-meeiro" required><option value="">Selecione...</option>${meeiroOptions}</select>`
          : ""
      }

      ${
        this.bloco !== "Compra"
          ? `<label>Estufa</label><select id="f-estufa" required><option value="">Selecione...</option>${estufaOptions}</select>`
          : ""
      }

      <label>Produto</label>
      <select id="f-produto" required><option value="">Selecione...</option>${produtoOptions}</select>

      ${camposEspecificos}

      <label>Complemento / observação</label>
      <textarea id="f-complemento"></textarea>

      <button type="submit" class="btn btn-primary btn-lg">Gravar</button>
    `;

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const bloco = this.bloco;
      const fields = { Bloco: bloco, Data: form.querySelector("#f-data").value };

      if (bloco !== "Compra") {
        fields["Código Estufa"] = form.querySelector("#f-estufa").value;
        fields["Código Meeiro"] = form.querySelector("#f-meeiro").value;
        if (fields["Código Meeiro"]) localStorage.setItem(MEEIRO_STORAGE_KEY, fields["Código Meeiro"]);
      }
      fields["Produto"] = form.querySelector("#f-produto").value;
      fields["Complemento"] = form.querySelector("#f-complemento").value;

      if (bloco === "Uso") {
        fields["Operação"] = "Saída Consumo";
        fields["Quantidade"] = Number(form.querySelector("#f-quantidade").value);
      } else if (bloco === "Ferti") {
        fields["Dosagem Ferti"] = Number(form.querySelector("#f-dosagem-ferti").value) || null;
        fields["D.A.T"] = Number(form.querySelector("#f-dat").value) || null;
        [1, 2, 3, 4, 5, 6].forEach((n) => {
          fields["Qtde Setor " + n] = Number(form.querySelector(`.f-setor[data-setor="${n}"]`).value) || null;
        });
      } else if (bloco === "Venda") {
        fields["Operação"] = "Venda";
        fields["Quantidade"] = Number(form.querySelector("#f-quantidade").value);
        fields["Valor Unitário"] = Number(form.querySelector("#f-valor-unitario").value);
        fields["Valor Embalagem"] = Number(form.querySelector("#f-valor-embalagem").value) || null;
        fields["Cliente"] = form.querySelector("#f-cliente").value;
      } else if (bloco === "Compra") {
        fields["Operação"] = "Entrada de fornecedor";
        fields["Quantidade"] = Number(form.querySelector("#f-quantidade").value);
        fields["Valor Unitário"] = Number(form.querySelector("#f-valor-unitario").value);
        fields["Fornecedor"] = form.querySelector("#f-fornecedor").value;
        const venc = form.querySelector("#f-vencimento").value;
        fields["Data Vencimento"] = venc || null;
        fields["Nota Fiscal"] = form.querySelector("#f-nota-fiscal").value || null;
      }

      const erro = validateBeforeSend(fields, lookups);
      if (erro) {
        showToast(`Não foi possível enviar: ${erro}`);
        return;
      }

      await queueAdd({ fields, origemTela: "T3" });
      showToast("Apontamento gravado. Sincronizando...");
      form.reset();
      updateSyncIndicator();
      if (navigator.onLine) syncQueueOnce().then(() => updateSyncIndicator());
    });
  },
};
