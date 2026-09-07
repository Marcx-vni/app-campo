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
function criarComboBusca(container, opcoes, { valorInicial = "", placeholder = "Digite para buscar..." } = {}) {
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
    if (!inputValor.value) inputTexto.value = "";
  }

  function selecionar(opcao) {
    inputValor.value = opcao.value;
    inputTexto.value = opcao.label;
    fecharLista();
  }

  inputTexto.addEventListener("focus", () => {
    renderLista(inputTexto.value === selecionarLabelAtual() ? "" : inputTexto.value);
  });
  inputTexto.addEventListener("input", () => {
    // digitar de novo invalida a seleção anterior até escolher algo da lista de novo
    inputValor.value = "";
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
