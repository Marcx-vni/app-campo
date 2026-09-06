// ============================================================================
// SELEÇÃO DE ARQUIVO — mostrada uma vez (por aparelho) após o login, para
// escolher qual arquivo do OneDrive o app vai usar, sem precisar descobrir
// nenhum "Item ID" manualmente. A escolha fica salva em localStorage.
// ============================================================================

const ScreenFileSelector = {
  async render(container, onSelected) {
    container.innerHTML = `
      <div class="login-box" style="margin: 40px auto; max-width: 420px;">
        <h1 style="font-size:18px;">Escolha o arquivo</h1>
        <p class="muted">Selecione a planilha Controle Sitio EPI 2026 no seu OneDrive.</p>
        <input type="search" id="busca-arquivo" placeholder="Buscar por nome (ex: Controle Sitio)" value="Controle Sitio EPI" style="margin-bottom:10px;" />
        <button id="btn-buscar-arquivo" class="btn btn-primary btn-block">Buscar</button>
        <div id="resultado-arquivos" style="margin-top:16px; text-align:left;"></div>
        <p id="erro-arquivo" class="error-text"></p>
      </div>
    `;

    const buscar = async () => {
      const termo = container.querySelector("#busca-arquivo").value;
      const resultado = container.querySelector("#resultado-arquivos");
      const erro = container.querySelector("#erro-arquivo");
      resultado.innerHTML = "Buscando...";
      erro.textContent = "";
      try {
        const arquivos = await searchExcelFiles(termo);
        if (arquivos.length === 0) {
          resultado.innerHTML = `<p class="muted">Nenhum arquivo encontrado com esse nome.</p>`;
          return;
        }
        resultado.innerHTML = arquivos
          .map(
            (a, i) => `
          <div class="card" data-index="${i}" style="cursor:pointer;">
            <div class="card-title">${a.name}</div>
            <div class="card-sub">${a.parentReference?.path?.replace("/drive/root:", "") || ""}</div>
          </div>`
          )
          .join("");
        resultado.querySelectorAll(".card").forEach((card) => {
          card.addEventListener("click", () => {
            const arquivo = arquivos[Number(card.dataset.index)];
            const driveId = arquivo.parentReference.driveId;
            setSelectedFile(driveId, arquivo.id, arquivo.name);
            onSelected();
          });
        });
      } catch (e) {
        erro.textContent = "Erro ao buscar: " + e.message;
      }
    };

    container.querySelector("#btn-buscar-arquivo").addEventListener("click", buscar);
    buscar(); // busca automática já na primeira abertura
  },
};
