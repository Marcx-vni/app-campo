// ============================================================================
// SELEÇÃO DE ARQUIVO — mostrada uma vez (por aparelho) após o login, para
// escolher qual arquivo do OneDrive o app vai usar, sem precisar descobrir
// nenhum "Item ID" manualmente. A escolha fica salva em localStorage.
// ============================================================================

// Caminho exato conhecido do arquivo (mais confiável que a busca por nome,
// que depende de um índice que pode demorar a atualizar). Se o arquivo for
// movido, a busca abaixo continua funcionando como alternativa manual.
const CAMINHO_CONHECIDO = "Documentos/Planilhas Sitio/Controle Sitio EPI 2026.xlsm";

const ScreenFileSelector = {
  async render(container, onSelected) {
    container.innerHTML = `
      <div class="login-box" style="margin: 40px auto; max-width: 420px;">
        <h1 style="font-size:18px;">Escolha o arquivo</h1>
        <p class="muted">Selecione a planilha Controle Sitio EPI 2026 no seu OneDrive.</p>
        <p id="status-caminho" class="muted">Procurando o arquivo automaticamente...</p>
        <input type="search" id="busca-arquivo" placeholder="Buscar por nome (ex: Controle Sitio)" value="Controle Sitio EPI" style="margin-bottom:10px; display:none;" />
        <button id="btn-buscar-arquivo" class="btn btn-primary btn-block" style="display:none;">Buscar</button>
        <div id="resultado-arquivos" style="margin-top:16px; text-align:left;"></div>
        <p id="erro-arquivo" class="error-text"></p>
      </div>
    `;

    // Tenta primeiro pelo caminho exato conhecido — evita depender da busca.
    try {
      const arquivo = await getFileByPath(CAMINHO_CONHECIDO);
      const driveId = arquivo.parentReference.driveId;
      setSelectedFile(driveId, arquivo.id, arquivo.name);
      onSelected();
      return;
    } catch (e) {
      // Não achou nesse caminho — cai para a busca manual normal.
      container.querySelector("#status-caminho").textContent =
        "Não encontrei automaticamente. Busque pelo nome abaixo:";
      container.querySelector("#busca-arquivo").style.display = "";
      container.querySelector("#btn-buscar-arquivo").style.display = "";
    }

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
