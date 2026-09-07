// ============================================================================
// T3 — APONTAMENTO LIVRE
// Lançamento sem ordem prévia. Seletor de Bloco reconfigura os campos
// exibidos conforme a Seção 3 da especificação (Uso / Ferti / Venda / Compra).
// ============================================================================

const BLOCO_SUBTITULOS = {
  Uso: "Registre uma aplicação de produto/insumo",
  Ferti: "Registre uma fertirrigação",
  Venda: "Registre uma venda",
  Compra: "Registre uma entrada de fornecedor",
};

// "Uso" é o nome da coluna na planilha (não muda — é a chave de dados usada
// em toda a validação/gravação), mas na tela é mais intuitivo chamar de
// "Aplicação", que é o que a pessoa de campo realmente está fazendo.
const BLOCO_LABELS = { Uso: "Aplicação", Ferti: "Fertirrig.", Venda: "Venda", Compra: "Compra" };
const BLOCO_ICONES = { Uso: "🧪", Ferti: "💧", Venda: "💰", Compra: "🛒" };

const ScreenApontamentoLivre = {
  bloco: "Uso",

  async render(container) {
    const lookups = await getLookupData();
    container.innerHTML = `
      <h2 class="page-title">Apontamento Livre</h2>
      <p class="page-subtitle">${BLOCO_SUBTITULOS[this.bloco]}</p>
      <div class="bloco-tabs">
        ${["Uso", "Ferti", "Venda", "Compra"]
          .map(
            (b) =>
              `<div class="bloco-tab ${b === this.bloco ? "active" : ""}" data-bloco="${b}"><span class="bloco-tab-icone">${BLOCO_ICONES[b]}</span><span class="bloco-tab-label">${BLOCO_LABELS[b]}</span></div>`
          )
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
    // Em Aplicação (Uso), só entra produto com saldo em estoque — não faz
    // sentido nem deixar escolher algo zerado (a validação já bloqueia o
    // envio, mas nem aparecer na busca evita a pessoa perder tempo tentando).
    const produtoOpcoes =
      this.bloco === "Venda"
        ? (lookups.produtosVenda || []).filter((p) => p["Tipo"]).map((p) => ({ value: p["Tipo"], label: p["Tipo"] }))
        : lookups.produtos
            .filter((p) => p["Produto"] && (this.bloco !== "Uso" || Number(p["Estoque"]) > 0))
            // saldo/unidade viajam junto com a opção (não aparecem no texto do
            // combobox) só pra Aplicação mostrar o estoque disponível assim
            // que a pessoa escolhe o produto, sem precisar ir na outra tela.
            .map((p) => ({
              value: p["Produto"],
              label: p["Produto"],
              estoque: Number(p["Estoque"]) || 0,
              unidade: unidadeValida(p["Unidade"]),
            }));

    // Estufa/Meeiro/Fornecedor: caixa de busca (mesmo padrão do Produto), não
    // lista de cards — mais rápido de usar quando a lista cresce. A Estufa só
    // lista as que têm plantio Ativo agora (as sem plantio não servem pra
    // lançamento mesmo, então nem aparecem pra escolher por engano); o nome do
    // plantio aparece junto no rótulo pra confirmar de relance.
    // O emoji da categoria fica no <label> do campo (não dentro da caixa) pra
    // não disputar espaço com o ícone de lupa da busca.
    const estufaOpcoes = lookups.estufas
      .map((e) => ({ __cod: e.__cod, nome: e["Estufa"], plantios: plantiosAtivos(lookups, e["Estufa"]) }))
      .filter((e) => e.plantios.length > 0)
      .map((e) => ({ value: e.__cod, label: `${e.nome} — ${e.plantios.join(", ")}` }));
    const meeiroOpcoes = lookups.meeiros.map((m) => ({ value: m.__cod, label: m["Meeiro"] }));
    const fornecedorOpcoes = lookups.fornecedores.map((f) => ({ value: f["Fornecedor"], label: f["Fornecedor"] }));

    const clienteOptions = (lookups.clientes || [])
      .map((c) => `<option value="${escapeHtml(c["Cliente"])}">${escapeHtml(c["Cliente"])}</option>`)
      .join("");

    const today = new Date().toISOString().slice(0, 10);

    let camposEspecificos = "";
    if (this.bloco === "Uso") {
      camposEspecificos = `
        <input type="hidden" id="f-operacao" value="Saída Consumo" />
        <label>💧 Quantidade</label>
        <div class="campo-com-unidade">
          <input type="number" step="0.01" id="f-quantidade" required />
          <span class="unidade">litros</span>
        </div>
        <label>🧪 Informar Dosagem p/ 20L (opcional)</label>
        <input type="number" step="0.01" id="f-dosagem-alterada" placeholder="Deixe em branco pra usar a dosagem cadastrada" />
      `;
    } else if (this.bloco === "Ferti") {
      camposEspecificos = `
        <label>🧪 Dosagem Ferti</label>
        <input type="number" step="0.01" id="f-dosagem-ferti" />
        <label>⏱️ D.A.T (dias após transplantio, opcional)</label>
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
        <label>⚖️ Quantidade</label>
        <input type="number" step="0.01" id="f-quantidade" required />
        <label>💲 Valor unitário</label>
        <input type="number" step="0.01" id="f-valor-unitario" required />
        <label>💲 Valor embalagem (opcional)</label>
        <input type="number" step="0.01" id="f-valor-embalagem" />
        <label>🧑 Cliente</label>
        <select id="f-cliente" required><option value="">Selecione...</option>${clienteOptions}</select>
      `;
    } else if (this.bloco === "Compra") {
      camposEspecificos = `
        <input type="hidden" id="f-operacao" value="Entrada de fornecedor" />
        <label>⚖️ Quantidade</label>
        <input type="number" step="0.01" id="f-quantidade" required />
        <label>💲 Valor unitário</label>
        <input type="number" step="0.01" id="f-valor-unitario" required />
        <label>🏭 Fornecedor</label>
        <div id="f-fornecedor-combo"></div>
        <label>📅 Data de vencimento (opcional)</label>
        <input type="date" id="f-vencimento" />
        <label>🧾 Nota fiscal (opcional)</label>
        <input type="text" id="f-nota-fiscal" />
      `;
    }

    form.innerHTML = `
      <label>📅 Data</label>
      <input type="date" id="f-data" value="${today}" required />

      ${this.bloco !== "Compra" ? `<label>👤 Meeiro</label><div id="f-meeiro-combo"></div>` : ""}

      ${this.bloco !== "Compra" ? `<label>🌿 Estufa</label><div id="f-estufa-combo"></div>` : ""}

      <label>🧴 Produto</label>
      <div id="f-produto-combo"></div>
      ${this.bloco === "Uso" ? `<div id="produto-saldo-info" class="produto-saldo-info"></div>` : ""}

      ${camposEspecificos}

      <label>📝 Complemento / observação</label>
      <textarea id="f-complemento"></textarea>

      <button type="submit" class="btn btn-primary btn-lg">Salvar apontamento</button>
    `;

    const produtoSaldoInfo = form.querySelector("#produto-saldo-info");
    const produtoCombo = criarComboBusca(form.querySelector("#f-produto-combo"), produtoOpcoes, {
      placeholder: "Buscar produto...",
      onChange: produtoSaldoInfo
        ? (opcao) => {
            produtoSaldoInfo.textContent = opcao
              ? `📦 Estoque disponível: ${formatNumero(opcao.estoque)}${opcao.unidade ? " " + opcao.unidade : ""}`
              : "";
          }
        : undefined,
    });

    let meeiroCombo = null;
    let estufaCombo = null;
    let fornecedorCombo = null;
    if (this.bloco !== "Compra") {
      meeiroCombo = criarComboBusca(form.querySelector("#f-meeiro-combo"), meeiroOpcoes, {
        placeholder: "Buscar meeiro...",
        valorInicial: meeiroCod,
      });
      estufaCombo = criarComboBusca(form.querySelector("#f-estufa-combo"), estufaOpcoes, {
        placeholder: "Buscar estufa...",
      });
    } else {
      fornecedorCombo = criarComboBusca(form.querySelector("#f-fornecedor-combo"), fornecedorOpcoes, {
        placeholder: "Buscar fornecedor...",
      });
    }

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const bloco = this.bloco;
      const fields = { Bloco: bloco, Data: form.querySelector("#f-data").value };

      if (bloco !== "Compra") {
        // A caixa de busca sempre devolve texto — convertemos para o mesmo tipo
        // do "Codigo" original da planilha (normalmente número) antes de gravar,
        // pra não escrever "3" (texto) numa coluna que a planilha trata como número.
        const estufaVal = estufaCombo.getValue();
        const meeiroVal = meeiroCombo.getValue();
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
        // Dosagem livre: se o usuário informar, vale mais que a dosagem cadastrada
        // no produto (Tabela613) — decisão de campo tem prioridade sobre o padrão.
        const dosagemAlterada = form.querySelector("#f-dosagem-alterada").value;
        fields["Alterar dosagem para:"] = dosagemAlterada !== "" ? Number(dosagemAlterada) : null;
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
        fields["Fornecedor"] = fornecedorCombo.getValue();
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
