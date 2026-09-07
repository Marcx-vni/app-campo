// ============================================================================
// SELEÇÃO DE ARQUIVO — mostrada uma vez (por aparelho) após o login, para
// escolher qual arquivo do OneDrive o app vai usar, sem precisar descobrir
// nenhum "Item ID" manualmente. A escolha fica salva em localStorage.
// Na abertura normal (caminho conhecido funciona de primeira, quase sempre),
// isso é só uma tela de boas-vindas com "sincronizando" — não pede nada do
// usuário. Só vira um formulário de busca se o caminho automático falhar.
// ============================================================================

// Caminho exato conhecido do arquivo (mais confiável que a busca por nome,
// que depende de um índice que pode demorar a atualizar). Se o arquivo for
// movido, a busca abaixo continua funcionando como alternativa manual.
const CAMINHO_CONHECIDO = "Documentos/Planilhas Sitio/Controle Sitio EPI 2026.xlsm";

const ScreenFileSelector = {
  async render(container, onSelected) {
    const primeiroNome = (getUserDisplayName() || "").split(" ")[0] || "";

    container.innerHTML = `
      <div class="welcome-box">
        <div class="welcome-spinner"></div>
        <h1>Bem-vindo${primeiroNome ? ", " + escapeHtml(primeiroNome) : ""}!</h1>
        <p class="muted">Sincronizando dados da planilha...</p>
      </div>
    `;

    // Tenta primeiro pelo caminho exato conhecido — evita depender da busca.
    // Na grande maioria das vezes o usuário só vê a mensagem de boas-vindas
    // acima, por uma fração de segundo, e cai direto no app.
    try {
      const arquivo = await getFileByPath(CAMINHO_CONHECIDO);
      const driveId = arquivo.parentReference.driveId;
      setSelectedFile(driveId, arquivo.id, arquivo.name);
      onSelected();
      return;
    } catch (e) {
      // Não achou nesse caminho — cai para a busca manual normal.
    }

    container.innerHTML = `
      <div class="login-box" style="margin: 40px auto; max-width: 420px;">
        <h1 style="font-size:18px;">Escolha o arquivo</h1>
        <p class="muted">Não encontrei a planilha automaticamente. Busque pelo nome abaixo:</p>
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
