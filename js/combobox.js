// ============================================================================
// COMBOBOX DE BUSCA — campo de texto que filtra uma lista de opções conforme
// o usuário digita (em vez de um <select> gigante, ruim de rolar no celular
// quando a lista tem centenas de itens, como a de Produtos).
// Sem biblioteca externa — só HTML/CSS/JS simples.
// ============================================================================

// Remove acentos e caixa, pra buscar "abamex" e achar "ABAMEX" mesmo digitando
// sem acento/maiúscula.
function _comboNormalizar(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Cria um combobox de busca dentro de `container` (elemento DOM já no documento).
// opcoes: array de { value, label }
// Devolve { getValue(), setValue(v) } pra ler/ajustar a seleção depois de criado.
function criarComboBusca(container, opcoes, { valorInicial = "", placeholder = "Digite para buscar...", onChange } = {}) {
  const idBase = "combo-" + Math.random().toString(36).slice(2, 9);
  container.innerHTML = `
    <div class="combo-busca" style="position:relative;">
      <input type="text" id="${idBase}-texto" class="combo-input" placeholder="${placeholder}" autocomplete="off" />
      <input type="hidden" id="${idBase}-valor" />
      <div id="${idBase}-lista" class="combo-lista" hidden></div>
    </div>
  `;

  const inputTexto = container.querySelector(`#${idBase}-texto`);
  const inputValor = container.querySelector(`#${idBase}-valor`);
  const lista = container.querySelector(`#${idBase}-lista`);

  let limitadasAtuais = [];
  let destacado = -1; // índice em limitadasAtuais navegado pelas setas do teclado

  function renderLista(termo) {
    const termoNorm = _comboNormalizar(termo);
    const filtradas = termoNorm
      ? opcoes.filter((o) => _comboNormalizar(o.label).includes(termoNorm))
      : opcoes;
    limitadasAtuais = filtradas.slice(0, 60); // não trava a tela com listas gigantes
    destacado = limitadasAtuais.length ? 0 : -1;

    desenharLista();
    lista.hidden = false;
    document.addEventListener("pointerdown", aoTocarFora, true);
    document.addEventListener("touchstart", aoTocarFora, true);
  }

  function desenharLista() {
    if (limitadasAtuais.length === 0) {
      lista.innerHTML = `<div class="combo-item combo-vazio">Nenhum resultado</div>`;
      return;
    }
    lista.innerHTML = limitadasAtuais
      .map(
        (o, i) =>
          `<div class="combo-item${i === destacado ? " combo-item-destacado" : ""}" data-index="${i}">${escapeHtml(o.label)}</div>`
      )
      .join("");
    lista.querySelectorAll(".combo-item").forEach((el) => {
      // "click" (não mousedown) — em celular, mousedown pode perder a corrida
      // contra o blur do input e a seleção nunca acontece. Fechar a lista é
      // feito por um listener global de toque/clique "fora", não pelo blur,
      // então o click no item chega normalmente antes de qualquer coisa fechar.
      el.addEventListener("click", () => {
        selecionar(limitadasAtuais[Number(el.dataset.index)]);
      });
    });
  }

  function moverDestaque(passo) {
    if (lista.hidden) {
      renderLista(inputTexto.value === selecionarLabelAtual() ? "" : inputTexto.value);
      return;
    }
    if (!limitadasAtuais.length) return;
    destacado = (destacado + passo + limitadasAtuais.length) % limitadasAtuais.length;
    desenharLista();
    const elDestacado = lista.querySelector(".combo-item-destacado");
    if (elDestacado) elDestacado.scrollIntoView({ block: "nearest" });
  }

  function fecharLista() {
    lista.hidden = true;
    document.removeEventListener("pointerdown", aoTocarFora, true);
    document.removeEventListener("touchstart", aoTocarFora, true);
  }

  function aoTocarFora(ev) {
    if (container.contains(ev.target)) return;
    fecharLista();
    // se o texto digitado não corresponde a nenhuma seleção válida, limpa o campo
    if (!inputValor.value) {
      inputTexto.value = "";
      onChange?.(null);
    }
  }

  function selecionar(opcao) {
    inputValor.value = opcao.value;
    inputTexto.value = opcao.label;
    fecharLista();
    onChange?.(opcao);
  }

  inputTexto.addEventListener("focus", () => {
    renderLista(inputTexto.value === selecionarLabelAtual() ? "" : inputTexto.value);
  });
  inputTexto.addEventListener("input", () => {
    // digitar de novo invalida a seleção anterior até escolher algo da lista de novo
    inputValor.value = "";
    onChange?.(null);
    renderLista(inputTexto.value);
  });
  inputTexto.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      moverDestaque(1);
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      moverDestaque(-1);
    } else if (ev.key === "Enter") {
      if (!lista.hidden && destacado >= 0 && limitadasAtuais[destacado]) {
        ev.preventDefault();
        selecionar(limitadasAtuais[destacado]);
      }
    } else if (ev.key === "Escape") {
      fecharLista();
    }
  });

  function selecionarLabelAtual() {
    const atual = opcoes.find((o) => String(o.value) === String(inputValor.value));
    return atual ? atual.label : "";
  }

  if (valorInicial) {
    const inicial = opcoes.find((o) => String(o.value) === String(valorInicial));
    if (inicial) selecionar(inicial);
  }

  return {
    getValue: () => inputValor.value,
    setValue: (v) => {
      const opcao = opcoes.find((o) => String(o.value) === String(v));
      if (opcao) selecionar(opcao);
    },
  };
}

// Mesma ideia do combobox de busca acima, mas pra SELEÇÃO MÚLTIPLA (ex.: mais
// de uma Estufa/Meeiro na Pulverização, ver apontamentoLivre.js e
// screens/aplicPulverizacao.js). Cada item escolhido vira um "chip" removível
// acima da caixa de busca; a lista de opções já escolhidas some da busca (não
// dá pra escolher o mesmo item duas vezes). Devolve { getValues(), setValues() }
// — um array de `value`, NA ORDEM em que foram escolhidos (importa pro texto
// final gravado na planilha, que junta os nomes nessa mesma ordem).
function criarMultiComboBusca(container, opcoes, { placeholder = "Digite para buscar...", onChange } = {}) {
  const idBase = "multicombo-" + Math.random().toString(36).slice(2, 9);
  container.innerHTML = `
    <div class="multi-combo">
      <div id="${idBase}-chips" class="multi-combo-chips"></div>
      <div class="combo-busca" style="position:relative;">
        <input type="text" id="${idBase}-texto" class="combo-input" placeholder="${placeholder}" autocomplete="off" />
        <div id="${idBase}-lista" class="combo-lista" hidden></div>
      </div>
    </div>
  `;

  const chipsEl = container.querySelector(`#${idBase}-chips`);
  const inputTexto = container.querySelector(`#${idBase}-texto`);
  const lista = container.querySelector(`#${idBase}-lista`);

  let selecionados = []; // array de value, na ordem escolhida
  let limitadasAtuais = [];
  let destacado = -1;

  function opcoesDisponiveis() {
    return opcoes.filter((o) => !selecionados.includes(o.value));
  }

  function renderChips() {
    if (selecionados.length === 0) {
      chipsEl.innerHTML = "";
      return;
    }
    chipsEl.innerHTML = selecionados
      .map((v) => {
        const opt = opcoes.find((o) => String(o.value) === String(v));
        return `<span class="chip chip-removivel" data-value="${escapeHtml(String(v))}">${escapeHtml(
          opt ? opt.label : String(v)
        )} <span class="chip-x">✕</span></span>`;
      })
      .join("");
    chipsEl.querySelectorAll(".chip-removivel").forEach((el) => {
      el.addEventListener("click", () => {
        selecionados = selecionados.filter((v) => String(v) !== el.dataset.value);
        renderChips();
        onChange?.(selecionados);
      });
    });
  }

  function renderLista(termo) {
    const termoNorm = _comboNormalizar(termo);
    const base = opcoesDisponiveis();
    const filtradas = termoNorm ? base.filter((o) => _comboNormalizar(o.label).includes(termoNorm)) : base;
    limitadasAtuais = filtradas.slice(0, 60);
    destacado = limitadasAtuais.length ? 0 : -1;
    desenharLista();
    lista.hidden = false;
    document.addEventListener("pointerdown", aoTocarFora, true);
    document.addEventListener("touchstart", aoTocarFora, true);
  }

  function desenharLista() {
    if (limitadasAtuais.length === 0) {
      lista.innerHTML = `<div class="combo-item combo-vazio">Nenhum resultado</div>`;
      return;
    }
    lista.innerHTML = limitadasAtuais
      .map(
        (o, i) =>
          `<div class="combo-item${i === destacado ? " combo-item-destacado" : ""}" data-index="${i}">${escapeHtml(o.label)}</div>`
      )
      .join("");
    lista.querySelectorAll(".combo-item").forEach((el) => {
      el.addEventListener("click", () => {
        selecionar(limitadasAtuais[Number(el.dataset.index)]);
      });
    });
  }

  function moverDestaque(passo) {
    if (lista.hidden) {
      renderLista(inputTexto.value);
      return;
    }
    if (!limitadasAtuais.length) return;
    destacado = (destacado + passo + limitadasAtuais.length) % limitadasAtuais.length;
    desenharLista();
    const elDestacado = lista.querySelector(".combo-item-destacado");
    if (elDestacado) elDestacado.scrollIntoView({ block: "nearest" });
  }

  function fecharLista() {
    lista.hidden = true;
    document.removeEventListener("pointerdown", aoTocarFora, true);
    document.removeEventListener("touchstart", aoTocarFora, true);
  }

  function aoTocarFora(ev) {
    if (container.contains(ev.target)) return;
    fecharLista();
  }

  // Escolher um item: vira chip, campo de texto limpa (fica pronto pra
  // escolher o próximo), lista fecha.
  function selecionar(opcao) {
    selecionados.push(opcao.value);
    inputTexto.value = "";
    renderChips();
    fecharLista();
    onChange?.(selecionados);
  }

  inputTexto.addEventListener("focus", () => renderLista(inputTexto.value));
  inputTexto.addEventListener("input", () => renderLista(inputTexto.value));
  inputTexto.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      moverDestaque(1);
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      moverDestaque(-1);
    } else if (ev.key === "Enter") {
      if (!lista.hidden && destacado >= 0 && limitadasAtuais[destacado]) {
        ev.preventDefault();
        selecionar(limitadasAtuais[destacado]);
      }
    } else if (ev.key === "Escape") {
      fecharLista();
    }
  });

  return {
    getValues: () => selecionados.slice(),
    setValues: (vals) => {
      selecionados = (vals || []).filter((v) => opcoes.some((o) => String(o.value) === String(v)));
      renderChips();
    },
  };
}
