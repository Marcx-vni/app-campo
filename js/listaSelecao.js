// ============================================================================
// LISTA VERTICAL DE SELEÇÃO — substitui <select> nativo em campos com poucas
// opções fixas (Estufa, Meeiro, Fornecedor). Cada opção é um card tocável,
// maior e mais rápido de acertar em campo (com luvas, ao sol) do que abrir
// um dropdown nativo (2 toques + rolagem).
// ============================================================================

function criarListaSelecao(container, itens, { valorInicial = "", onChange = null } = {}) {
  // itens: array de { value, titulo, contexto?, icone? }
  let valorAtual = valorInicial != null ? String(valorInicial) : "";

  function desenhar() {
    if (!itens.length) {
      container.innerHTML = `<div class="lista-selecao-vazia">Nenhuma opção disponível.</div>`;
      return;
    }
    container.innerHTML = itens
      .map((it) => {
        const selecionado = String(it.value) === valorAtual;
        return `
        <div class="lista-selecao-item${selecionado ? " lista-selecao-item-sel" : ""}" data-value="${escapeHtml(String(it.value))}">
          <div class="lista-selecao-icone">${escapeHtml(it.icone || "")}</div>
          <div class="lista-selecao-texto">
            <div class="lista-selecao-titulo">${escapeHtml(it.titulo)}</div>
            ${it.contexto ? `<div class="lista-selecao-contexto">${escapeHtml(it.contexto)}</div>` : ""}
          </div>
          ${selecionado ? `<div class="lista-selecao-check">✓</div>` : ""}
        </div>`;
      })
      .join("");

    container.querySelectorAll(".lista-selecao-item").forEach((el) => {
      el.addEventListener("click", () => {
        valorAtual = el.dataset.value;
        desenhar();
        if (onChange) onChange(valorAtual);
      });
    });
  }

  desenhar();

  return {
    getValue: () => valorAtual,
    setValue: (v) => {
      valorAtual = v != null ? String(v) : "";
      desenhar();
    },
  };
}
