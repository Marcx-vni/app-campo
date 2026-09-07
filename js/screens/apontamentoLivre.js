// ============================================================================
// T3 — APONTAMENTO LIVRE
// Lançamento sem ordem prévia. Seletor de Bloco reconfigura os campos
// exibidos conforme a Seção 3 da especificação (Uso / Ferti / Venda / Compra).
// ============================================================================

const BLOCO_SUBTITULOS = {
  Uso: "Registre uma aplicação de produto",
  Ferti: "Registre uma fertirrigação",
  Venda: "Registre uma venda",
  Compra: "Registre uma entrada de fornecedor",
};

const ScreenApontamentoLivre = {
  bloco: "Uso",

  async render(container) {
    const lookups = await getLookupData();
    container.innerHTML = `
      <h2 class="page-title">Apontamento Livre</h2>
      <p class="page-subtitle">${BLOCO_SUBTITULOS[this.bloco]}</p>
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

    this.renderForm(container.querySelector("#form-apontamento"), lookups, container);
  },

  renderForm(form, lookups, container) {
    const meeiroCod = getMeeiroSelecionado();

    // Na Venda, a lista de produtos vem da aba "Cadastro de Venda" (coluna "Tipo"),
    // não do cadastro geral de produtos usado em Uso/Ferti/Compra. A Tabela613
    // tem ~400 itens — vira uma caixa de busca em vez de <select> gigante.
    const produtoOpcoes =
      this.bloco === "Venda"
        ? (lookups.produtosVenda || []).filter((p) => p["Tipo"]).map((p) => ({ value: p["Tipo"], label: p["Tipo"] }))
        : lookups.produtos.filter((p) => p["Produto"]).map((p) => ({ value: p["Produto"], label: p["Produto"] }));

    // Estufa e Meeiro têm poucas opções fixas — viram lista vertical de cards
    // em vez de <select> nativo (mais rápido de tocar em campo, com luvas).
    // Na Estufa, a linha de contexto mostra o plantio Ativo (se houver) — dado
    // útil pra decisão, evita escolher a estufa errada.
    const estufaItens = lookups.estufas.map((e) => {
      const plantios = plantiosAtivos(lookups, e["Estufa"]);
      return {
        value: e.__cod,
        titulo: e["Estufa"],
        contexto: plantios.length ? plantios.join(", ") : "Sem plantio ativo",
        icone: "🌿",
      };
    });
    const meeiroItens = lookups.meeiros.map((m) => ({
      value: m.__cod,
      titulo: m["Meeiro"],
      icone: "👤",
    }));
    const fornecedorItens = lookups.fornecedores.map((f) => ({
      value: f["Fornecedor"],
      titulo: f["Fornecedor"],
      icone: "🏭",
    }));

    const clienteOptions = (lookups.clientes || [])
      .map((c) => `<option value="${escapeHtml(c["Cliente"])}">${escapeHtml(c["Cliente"])}</option>`)
      .join("");

    const today = new Date().toISOString().slice(0, 10);

    let camposEspecificos = "";
    if (this.bloco === "Uso") {
      camposEspecificos = `
        <input type="hidden" id="f-operacao" value="Saída Consumo" />
        <label>Quantidade</label>
        <div class="campo-com-unidade">
          <input type="number" step="0.01" id="f-quantidade" required />
          <span class="unidade">litros</span>
        </div>
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
        <div id="f-fornecedor-lista" class="lista-selecao"></div>
        <label>Data de vencimento (opcional)</label>
        <input type="date" id="f-vencimento" />
        <label>Nota fiscal (opcional)</label>
        <input type="text" id="f-nota-fiscal" />
      `;
    }

    form.innerHTML = `
      <label>Data</label>
      <input type="date" id="f-data" value="${today}" required />

      ${this.bloco !== "Compra" ? `<label>Meeiro</label><div id="f-meeiro-lista" class="lista-selecao"></div>` : ""}

      ${this.bloco !== "Compra" ? `<label>Estufa</label><div id="f-estufa-lista" class="lista-selecao"></div>` : ""}

      <label>Produto</label>
      <div id="f-produto-combo"></div>

      ${camposEspecificos}

      <label>Complemento / observação</label>
      <textarea id="f-complemento"></textarea>

      <button type="submit" class="btn btn-primary btn-lg">Salvar apontamento</button>
    `;

    const produtoCombo = criarComboBusca(form.querySelector("#f-produto-combo"), produtoOpcoes, {
      placeholder: "Buscar produto...",
    });

    let meeiroLista = null;
    let estufaLista = null;
    let fornecedorLista = null;
    if (this.bloco !== "Compra") {
      meeiroLista = criarListaSelecao(form.querySelector("#f-meeiro-lista"), meeiroItens, {
        valorInicial: meeiroCod,
      });
      estufaLista = criarListaSelecao(form.querySelector("#f-estufa-lista"), estufaItens);
    } else {
      fornecedorLista = criarListaSelecao(form.querySelector("#f-fornecedor-lista"), fornecedorItens);
    }

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const bloco = this.bloco;
      const fields = { Bloco: bloco, Data: form.querySelector("#f-data").value };

      if (bloco !== "Compra") {
        // A lista de seleção sempre devolve texto — convertemos para o mesmo tipo
        // do "Codigo" original da planilha (normalmente número) antes de gravar,
        // pra não escrever "3" (texto) numa coluna que a planilha trata como número.
        const estufaVal = estufaLista.getValue();
        const meeiroVal = meeiroLista.getValue();
        const estufaMatch = lookups.estufas.find((e) => String(e.__cod) === String(estufaVal));
        const meeiroMatch = lookups.meeiros.find((m) => String(m.__cod) === String(meeiroVal));
        fields["Código Estufa"] = estufaMatch ? estufaMatch.__cod : estufaVal;
        fields["Código Meeiro"] = meeiroMatch ? meeiroMatch.__cod : meeiroVal;
        if (fields["Código Meeiro"] !== undefined && fields["Código Meeiro"] !== null && fields["Código Meeiro"] !== "") {
          localStorage.setItem(MEEIRO_STORAGE_KEY, fields["Código Meeiro"]);
        }
      }
      fields["Produto"] = produtoCombo.getValue();
      if (!fields["Produto"]) {
        showToast("Não foi possível enviar: selecione um produto da lista.");
        return;
      }
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
        fields["Fornecedor"] = fornecedorLista.getValue();
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
      // Re-renderiza a tela inteira (não só o form) pra trocar o <form> por um nó
      // novo — evita empilhar um segundo listener de submit no mesmo elemento,
      // o que faria o próximo envio duplicar o apontamento.
      this.render(container);
      updateSyncIndicator();
      if (navigator.onLine) syncQueueOnce().then(() => updateSyncIndicator());
    });
  },
};
