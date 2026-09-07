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

  function renderLista(termo) {
    const termoNorm = _comboNormalizar(termo);
    const filtradas = termoNorm
      ? opcoes.filter((o) => _comboNormalizar(o.label).includes(termoNorm))
      : opcoes;
    const limitadas = filtradas.slice(0, 60); // não trava a tela com listas gigantes

    if (limitadas.length === 0) {
      lista.innerHTML = `<div class="combo-item combo-vazio">Nenhum resultado</div>`;
    } else {
      lista.innerHTML = limitadas
        .map(
          (o, i) =>
            `<div class="combo-item" data-index="${i}" data-value="${escapeHtml(String(o.value))}">${escapeHtml(o.label)}</div>`
        )
        .join("");
      lista.querySelectorAll(".combo-item").forEach((el) => {
        el.addEventListener("mousedown", (ev) => {
          // mousedown (não click) pra disparar antes do blur do input fechar a lista
          ev.preventDefault();
          const opcao = limitadas[Number(el.dataset.index)];
          selecionar(opcao);
        });
      });
    }
    lista.hidden = false;
  }

  function selecionar(opcao) {
    inputValor.value = opcao.value;
    inputTexto.value = opcao.label;
    lista.hidden = true;
  }

  inputTexto.addEventListener("focus", () => renderLista(inputTexto.value === selecionarLabelAtual() ? "" : inputTexto.value));
  inputTexto.addEventListener("input", () => {
    // digitar de novo invalida a seleção anterior até escolher algo da lista de novo
    inputValor.value = "";
    renderLista(inputTexto.value);
  });
  inputTexto.addEventListener("blur", () => {
    setTimeout(() => {
      lista.hidden = true;
      // se o texto digitado não corresponde a nenhuma seleção válida, limpa o campo
      if (!inputValor.value) inputTexto.value = "";
    }, 150);
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
