// ============================================================================
// APLIC. (Pulverização) — aba "Pulverização" / tabela "Pulverizacao".
// Tela nova (v22), pedida pelo usuário em 10/10/2026: registra lançamentos de
// pulverização (não mexe em estoque, é só um log pra gerar o card de WhatsApp
// avisando os meeiros) e gera esse card já agrupado por Estufa(s)/Meeiro(s).
//
// Diferente dos outros blocos (Uso/Ferti/Venda/Compra/Financeiro):
// - Estufa e Meeiro aceitam MAIS DE UM (seleção múltipla, ver combobox.js
//   `criarMultiComboBusca`) — gravados na planilha como os NOMES juntados com
//   "/" (ex.: "ESTUFA BAIXA/ESTUFA 1J"), não um código.
// - Pode lançar VÁRIOS produtos de uma vez (um por linha, cada um com sua
//   própria dosagem) — cada produto vira uma linha própria na tabela
//   Pulverizacao, repetindo Data/Estufa/Meeiro/Horário.
// - "Total Calda em LT" é só uma CONTA MOSTRADA NA TELA pra ajudar a decidir
//   a dosagem — não existe coluna pra isso na planilha (confirmado com o
//   usuário, print da tabela real em 10/10/2026). Fórmula (corrigida em
//   10/10/2026, depois de testar a primeira versão): ((Estoque × 1000) ÷
//   Dosagem) × 20 — quantos litros de calda dá pra preparar com o estoque
//   disponível, considerando que a Dosagem cadastrada é "por 20L" (mesma
//   unidade da coluna "Dosagem ML/20LT" do cadastro).
// ============================================================================

// Grupos de produto liberados pra pulverização (pedido do usuário,
// 10/10/2026) — compara sem acento/caixa pra não depender de como foi
// digitado na planilha ("BIOLÓGICO" vs "BIOLOGICO", por ex.).
const PULV_GRUPOS_PERMITIDOS = new Set(["DEFENSIVO", "BIOLOGICO", "FOLIARES"]);
function _pulvGrupoPermitido(grupo) {
  const norm = String(grupo || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
  return PULV_GRUPOS_PERMITIDOS.has(norm);
}

// Litros de calda que dá pra preparar com o estoque disponível, dada uma
// dosagem "por 20L" (mesma unidade de "Dosagem ML/20LT" no cadastro).
// Ver nota no cabeçalho do arquivo sobre a fórmula.
function calcularTotalCaldaLitros(estoque, dosagem) {
  const d = Number(dosagem) || 0;
  if (d <= 0) return 0;
  return ((Number(estoque) || 0) * 1000) / d * 20;
}

// Horário gravado como fração do dia (padrão Excel) -> "HH:MM" pra exibir.
// Inverso de toExcelTimeSerial (apontamento.js).
function formatExcelHorario(serial) {
  if (serial === undefined || serial === null || serial === "") return "—";
  const totalMin = Math.round(Number(serial) * 1440);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Agrupa as linhas da tabela Pulverizacao em "lançamentos" (mesma Data +
// Estufa + Meeiro + Horário = um único card, com a lista de produtos dentro)
// — espelha como a própria planilha é preenchida: um lançamento de várias
// estufas/meeiros/produtos vira várias linhas repetindo esses 4 campos.
//
// `chaves` (opcional): nomes REAIS dos cabeçalhos pra cada campo, resolvidos
// com `acharChavePorNomeOuPosicao()` (graph.js) antes de chamar essa função
// — proteção contra a planilha ter um cabeçalho diferente do esperado (ex.:
// alguém editou a tabela direto no Excel e mexeu sem querer no texto de um
// cabeçalho, ou inseriu/renomeou uma coluna). Sem isso, passa a usar os
// nomes padrão ("Dosagem", "Horário" etc.) — ver "Erros já investigados e
// resolvidos" (10/10/2026) pro caso real que motivou essa proteção.
function agruparPulverizacoes(rows, chaves = {}) {
  const kData = chaves.data || "Data";
  const kEstufa = chaves.estufa || "Estufa";
  const kMeeiro = chaves.meeiro || "Meeiro";
  const kProduto = chaves.produto || "Produto";
  const kDosagem = chaves.dosagem || "Dosagem";
  const kHorario = chaves.horario || "Horário";
  const kObservacao = chaves.observacao; // undefined se a coluna não existir — ok

  const grupos = new Map();
  rows.forEach((r) => {
    const key = [r[kData], r[kEstufa], r[kMeeiro], r[kHorario]].map((v) => String(v ?? "")).join("||");
    if (!grupos.has(key)) {
      grupos.set(key, {
        chave: key,
        data: r[kData],
        estufa: r[kEstufa],
        meeiro: r[kMeeiro],
        horario: r[kHorario],
        observacao: "",
        produtos: [],
      });
    }
    const grupo = grupos.get(key);
    grupo.produtos.push({ nome: r[kProduto] || "—", dosagem: Number(r[kDosagem]) || 0 });
    // Pega a primeira observação não vazia que aparecer entre as linhas desse
    // lançamento (normalmente só a primeira linha teria preenchida).
    if (!grupo.observacao && kObservacao && r[kObservacao]) {
      grupo.observacao = String(r[kObservacao]).trim();
    }
  });
  return Array.from(grupos.values()).sort((a, b) => (Number(b.data) || 0) - (Number(a.data) || 0));
}

// Gera a imagem (PNG) do card de Pulverização pronto pra WhatsApp — mesmo
// padrão visual dos outros cards do app (gerarCardFertiPng, home.js), com uma
// faixa de alerta chamativa no rodapé (duas linhas: horário limite + risco de
// fito — texto exato pedido pelo usuário em 10/10/2026). Essa faixa é o único
// lugar com o aviso — não existe mais uma caixa equivalente na tela do app
// (removida a pedido do usuário: "basta estar no card que enviamos").
// dados: { estufasList: [nome,...], meeirosList: [nome,...], dataTexto, horario, produtos: [{nome, dosagem}] }
async function gerarCardPulverizacaoPng(dados) {
  const fonte = "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
  const escala = 2;
  const colProduto = 230;
  const colDosagem = 130;
  const altCabecalho = 40;
  const altLinhaBase = 42;
  const raio = 22;
  const alturaLinhaTexto = 17;
  const maxLinhasProduto = 2;

  const medCtx = document.createElement("canvas").getContext("2d");

  medCtx.font = `600 20px ${fonte}`;
  const larguraTitulo = 56 + medCtx.measureText("Pulverização").width + 90; // +90 reserva espaço da data à direita
  const larguraTabela = colProduto + colDosagem;
  let largura = Math.max(larguraTabela, larguraTitulo, 320);

  // Meeiro(s) primeiro, um por linha, depois Estufa(s), também uma por linha
  // (pedido explícito do usuário em 10/10/2026 — antes vinha tudo junto numa
  // linha só, separado por vírgula).
  medCtx.font = `13.5px ${fonte}`;
  const larguraInfoDisponivel = largura - 44 - 22; // -22 reserva espaço do ícone antes do texto
  const meeirosList = dados.meeirosList && dados.meeirosList.length ? dados.meeirosList : ["—"];
  const estufasList = dados.estufasList && dados.estufasList.length ? dados.estufasList : ["—"];
  const linhasHeaderInfo = [
    ...meeirosList.map((nome) => `🤝 ${truncarTextoCanvas(medCtx, nome, larguraInfoDisponivel)}`),
    ...estufasList.map((nome) => `🌿 ${truncarTextoCanvas(medCtx, nome, larguraInfoDisponivel)}`),
  ];
  const altHeader = 46 + linhasHeaderInfo.length * alturaLinhaTexto + 12;

  medCtx.font = `600 14px ${fonte}`;
  const larguraProdutoDisponivel = colProduto - 24;
  const linhasPorProduto = dados.produtos.map((p) => quebrarTextoCanvas(medCtx, p.nome, larguraProdutoDisponivel, maxLinhasProduto));
  const alturasLinha = linhasPorProduto.map((linhas) => Math.max(altLinhaBase, linhas.length * alturaLinhaTexto + 18));
  const alturaTabelaLinhas = alturasLinha.reduce((soma, h) => soma + h, 0);

  // Observação livre (opcional) — vai como alerta(s) extra, em MAIÚSCULAS,
  // dentro da mesma faixa terracota, depois dos dois alertas fixos. Pedido
  // do usuário em 10/10/2026: um campo pra escrever algo antes de salvar e
  // isso compor o final do card junto com os outros alertas.
  medCtx.font = `700 12.5px ${fonte}`;
  const textoObs = dados.observacao ? String(dados.observacao).trim().toUpperCase() : "";
  const linhasObs = textoObs ? quebrarTextoCanvas(medCtx, textoObs, largura - 32, 3) : [];
  const altAlerta = linhasObs.length ? 70 + linhasObs.length * 16 + 10 : 72;

  const altura = altHeader + altCabecalho + alturaTabelaLinhas + altAlerta;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(largura * escala);
  canvas.height = Math.ceil(altura * escala);
  const ctx = canvas.getContext("2d");
  ctx.scale(escala, escala);
  ctx.textBaseline = "middle";

  const retanguloArredondado = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  ctx.save();
  retanguloArredondado(0, 0, largura, altura, raio);
  ctx.clip();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, largura, altura);

  // Cabeçalho verde escuro — título + data (direita) + estufa(s)/meeiro(s).
  ctx.fillStyle = "#1F3D2B";
  ctx.fillRect(0, 0, largura, altHeader);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `24px ${fonte}`;
  ctx.textAlign = "left";
  ctx.fillText("🚿", 22, 28);
  ctx.font = `600 20px ${fonte}`;
  ctx.fillText("Pulverização", 54, 28);
  ctx.font = `13px ${fonte}`;
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.textAlign = "right";
  ctx.fillText(dados.dataTexto || "", largura - 22, 28);
  ctx.textAlign = "left";
  let yHeaderInfo = 54;
  linhasHeaderInfo.forEach((linha) => {
    ctx.fillText(linha, 22, yHeaderInfo);
    yHeaderInfo += alturaLinhaTexto;
  });

  // Cabeçalho da tabela.
  let y = altHeader;
  ctx.fillStyle = "#F7F6F2";
  ctx.fillRect(0, y, largura, altCabecalho);
  ctx.font = `600 13px ${fonte}`;
  ctx.fillStyle = "#3A3A34";
  ctx.textAlign = "left";
  ctx.fillText("Produto", 16, y + altCabecalho / 2);
  ctx.textAlign = "center";
  ctx.fillText("Dosagem/20LT", colProduto + colDosagem / 2, y + altCabecalho / 2);
  y += altCabecalho;

  // Uma linha por produto.
  dados.produtos.forEach((p, idx) => {
    const altLinha = alturasLinha[idx];
    const linhasNome = linhasPorProduto[idx];
    if (idx % 2 === 1) {
      ctx.fillStyle = "#FAF9F6";
      ctx.fillRect(0, y, largura, altLinha);
    }
    ctx.font = `600 14px ${fonte}`;
    ctx.fillStyle = "#1A1A1A";
    ctx.textAlign = "left";
    const yPrimeiraLinha = y + altLinha / 2 - ((linhasNome.length - 1) * alturaLinhaTexto) / 2;
    linhasNome.forEach((linha, li) => ctx.fillText(linha, 16, yPrimeiraLinha + li * alturaLinhaTexto));
    ctx.font = `14px ${fonte}`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#1A1A1A";
    ctx.fillText(formatNumero(p.dosagem), colProduto + colDosagem / 2, y + altLinha / 2);
    y += altLinha;
  });

  // Faixa de alerta — chamativa de propósito (fundo terracota, texto branco
  // grande): texto fixo (horário + risco de fito) pedido pelo usuário em
  // 10/10/2026, mais a observação livre (opcional, em MAIÚSCULAS) logo
  // abaixo quando a pessoa escreveu alguma — pedido também em 10/10/2026.
  ctx.fillStyle = "#C9603D";
  ctx.fillRect(0, y, largura, altAlerta);
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  const yFixo = linhasObs.length ? y + 24 : y + altAlerta / 2 - 13;
  const yFixo2 = linhasObs.length ? y + 50 : y + altAlerta / 2 + 13;
  ctx.font = `700 16px ${fonte}`;
  ctx.fillText(`INICIAR A PULVERIZAÇÃO ANTES DAS ${dados.horario || "—"}`, largura / 2, yFixo);
  ctx.font = `700 13px ${fonte}`;
  ctx.fillText("⚠️ ALERTA - RISCO DE FITO NA PLANTA", largura / 2, yFixo2);
  if (linhasObs.length) {
    ctx.font = `700 12.5px ${fonte}`;
    let yObs = y + 70;
    linhasObs.forEach((linha) => {
      ctx.fillText(linha, largura / 2, yObs);
      yObs += 16;
    });
  }

  ctx.restore();

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

async function enviarCardPulverizacao(dados) {
  const blob = await gerarCardPulverizacaoPng(dados);
  if (!blob) {
    showToast("Não foi possível gerar a imagem do card.");
    return;
  }
  const nomeArquivo = `pulverizacao-${dados.dataTexto || ""}`.replace(/[^\w-]+/g, "_") + ".png";
  await compartilharImagem(blob, nomeArquivo);
}

const ScreenAplic = {
  async render(container) {
    container.innerHTML = `
      <div id="pulv-form-wrap">
        <h2 class="page-title">Aplic. (Pulverização)</h2>
        <p class="page-subtitle">Registre a pulverização e gere o card de aviso pros meeiros</p>

        <label>📅 Data</label>
        <input type="date" id="pulv-data" value="${new Date().toISOString().slice(0, 10)}" required />

        <label>🌿 Estufa (pode escolher mais de uma)</label>
        <div id="pulv-estufa-combo"></div>

        <label>🤝 Meeiro (pode escolher mais de um)</label>
        <div id="pulv-meeiro-combo"></div>

        <div class="section-title">Produtos</div>
        <div id="pulv-produtos-list"></div>
        <button type="button" id="pulv-add-produto" class="btn btn-secondary btn-sm">+ Adicionar produto</button>

        <label>⏱️ Horário limite</label>
        <input type="time" id="pulv-horario" required />

        <label>📝 Observação (opcional)</label>
        <textarea id="pulv-observacao" rows="2" placeholder="Informação extra pro card — vai no final, junto com os alertas, em maiúsculas"></textarea>

        <button type="button" id="pulv-salvar" class="btn btn-primary btn-lg">Salvar lançamento</button>
      </div>

      <div class="section-title" style="margin-top:28px;">Lançamentos já feitos</div>
      <div class="ferti-filtros">
        <div class="ferti-filtros-datas">
          <input type="date" id="pulv-filtro-data" />
        </div>
        <div id="pulv-limpar-filtro" class="link-acao">Limpar filtro</div>
      </div>
      <button type="button" id="pulv-enviar-todos" class="btn btn-secondary btn-block">📲 Enviar todos os cards do dia</button>
      <div id="pulv-historico-list" style="margin-top:12px;">Carregando...</div>
    `;

    let lookups;
    try {
      lookups = await getLookupData();
    } catch (e) {
      console.error("Falha ao carregar dados da planilha:", e);
      container.querySelector("#pulv-produtos-list").innerHTML = `<div class="empty-state">
        Não foi possível carregar os dados da planilha (${escapeHtml(String(e.message || e))}).
      </div>`;
      return;
    }

    // Só produtos com estoque disponível e dos grupos usados em pulverização
    // (DEFENSIVO/BIOLÓGICO/FOLIARES) — pedido do usuário em 10/10/2026, pra
    // não misturar com fertilizante ou outro insumo que não se aplica assim.
    const produtoOpcoes = (lookups.produtos || [])
      .filter((p) => p["Produto"] && Number(p["Estoque"]) > 0 && _pulvGrupoPermitido(p["Grupo"]))
      .map((p) => ({
        value: p["Produto"],
        label: p["Produto"],
        estoque: Number(p["Estoque"]) || 0,
        dosagemCadastro: Number(p["Dosagem ML/20LT"]) || 0,
      }));
    // Só estufas com plantio ATIVO (aba "Plantio", coluna "Status" = "Ativo")
    // — pedido do usuário em 10/10/2026, mesmo filtro já usado em
    // dataPlantioAtiva()/sugerirDAT() (apontamento.js) pra achar o plantio
    // ativo de uma estufa.
    const estufasAtivasSet = new Set(
      (lookups.plantio || [])
        .filter((p) => p["Estufa"] && String(p["Status"]).trim().toLowerCase() === "ativo")
        .map((p) => p["Estufa"])
    );
    const estufaOpcoes = (lookups.estufas || [])
      .filter((e) => e["Estufa"] && estufasAtivasSet.has(e["Estufa"]))
      .map((e) => ({ value: e["Estufa"], label: e["Estufa"] }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    const meeiroOpcoes = (lookups.meeiros || [])
      .filter((m) => m["Meeiro"])
      .map((m) => ({ value: m["Meeiro"], label: m["Meeiro"] }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

    let estufasSelecionadas = [];
    let meeirosSelecionados = [];
    criarMultiComboBusca(container.querySelector("#pulv-estufa-combo"), estufaOpcoes, {
      placeholder: "Buscar estufa...",
      onChange: (vals) => (estufasSelecionadas = vals),
    });
    criarMultiComboBusca(container.querySelector("#pulv-meeiro-combo"), meeiroOpcoes, {
      placeholder: "Buscar meeiro...",
      onChange: (vals) => (meeirosSelecionados = vals),
    });

    // --- Lista dinâmica de produtos (um por linha) ---------------------------
    const produtosList = container.querySelector("#pulv-produtos-list");
    let proximoId = 1;
    let produtosState = [{ id: proximoId++, produto: null, estoque: 0, dosagemCadastro: 0, dosagemManual: null }];

    const renderProdutos = () => {
      produtosList.innerHTML = produtosState
        .map(
          (p, idx) => `
        <div class="pulv-produto-row" data-idx="${idx}">
          <div class="pulv-produto-row-topo">
            <label>🧴 Produto ${idx + 1}</label>
            ${produtosState.length > 1 ? `<span class="pulv-remover-produto" data-idx="${idx}">Remover</span>` : ""}
          </div>
          <div class="pulv-produto-combo" data-idx="${idx}"></div>
          <div class="produto-saldo-info" data-estoque="${idx}"></div>
          <div class="total-calc-info" data-calda-cadastro="${idx}"></div>
          <label>🧪 Dosagem (ajuste se precisar)</label>
          <input type="number" step="0.01" class="pulv-dosagem-manual" data-idx="${idx}" />
          <div class="total-calc-info" data-calda-manual="${idx}"></div>
        </div>`
        )
        .join("");

      produtosState.forEach((p, idx) => {
        const comboEl = produtosList.querySelector(`.pulv-produto-combo[data-idx="${idx}"]`);
        const estoqueEl = produtosList.querySelector(`[data-estoque="${idx}"]`);
        const caldaCadastroEl = produtosList.querySelector(`[data-calda-cadastro="${idx}"]`);
        const caldaManualEl = produtosList.querySelector(`[data-calda-manual="${idx}"]`);
        const dosagemManualInput = produtosList.querySelector(`.pulv-dosagem-manual[data-idx="${idx}"]`);

        // Semeia o campo com o que já estava guardado em memória ANTES de
        // criar o combobox — necessário porque remover/adicionar outra linha
        // reconstrói o HTML de todas (renderProdutos inteiro de novo), e sem
        // isso a dosagem já digitada nessa linha se perderia por causa do
        // "reseta a dosagem pro valor cadastrado" logo abaixo.
        dosagemManualInput.value = p.dosagemManual ?? "";

        // Total Calda em LT = ((Estoque × 1000) ÷ Dosagem) × 20 — ver
        // calcularTotalCaldaLitros no topo do arquivo.
        const atualizarCaldaManual = () => {
          const dm = dosagemManualInput.value === "" ? null : Number(dosagemManualInput.value) || 0;
          p.dosagemManual = dm;
          const totalManual = calcularTotalCaldaLitros(p.estoque, dm);
          caldaManualEl.textContent =
            dm > 0 ? `💧 Total Calda em LT (dosagem informada): ${formatNumero(totalManual)} L` : "💧 Total Calda em LT: —";
        };

        criarComboBusca(comboEl, produtoOpcoes, {
          valorInicial: p.produto || "",
          placeholder: "Buscar produto...",
          onChange: (opcao) => {
            // Só reseta a dosagem manual pro valor cadastrado quando o
            // PRODUTO realmente muda pra outro — não quando é só o re-render
            // recriando o combobox com o MESMO produto já escolhido antes
            // (ex.: depois de remover uma linha diferente), senão perderia
            // qualquer ajuste manual que a pessoa já tivesse feito aqui.
            const produtoAnterior = p.produto;
            p.produto = opcao ? opcao.value : null;
            p.estoque = opcao ? opcao.estoque : 0;
            p.dosagemCadastro = opcao ? opcao.dosagemCadastro : 0;
            estoqueEl.textContent = opcao ? `📦 Estoque disponível: ${formatNumero(opcao.estoque)}` : "";
            const totalCadastro = calcularTotalCaldaLitros(p.estoque, p.dosagemCadastro);
            // Quando o produto não tem "Dosagem ML/20LT" preenchida no
            // cadastro (Tabela613), mostrar isso de forma clara em vez de
            // simplesmente exibir "0" — confunde pensar que é um bug do app
            // quando na verdade é o cadastro que está incompleto; a pessoa
            // ainda consegue informar a dosagem manualmente logo abaixo.
            if (!opcao) {
              caldaCadastroEl.textContent = "";
            } else if (p.dosagemCadastro > 0) {
              caldaCadastroEl.textContent = `🧪 Dosagem cadastrada: ${formatNumero(p.dosagemCadastro)} · 💧 Total Calda em LT: ${formatNumero(totalCadastro)} L`;
            } else {
              caldaCadastroEl.textContent = "⚠️ Esse produto não tem Dosagem cadastrada — informe manualmente abaixo.";
            }
            if (!opcao) {
              dosagemManualInput.value = "";
            } else if (opcao.value !== produtoAnterior) {
              dosagemManualInput.value = opcao.dosagemCadastro > 0 ? opcao.dosagemCadastro : "";
            }
            atualizarCaldaManual();
          },
        });

        dosagemManualInput.addEventListener("input", atualizarCaldaManual);
        atualizarCaldaManual();
      });

      produtosList.querySelectorAll(".pulv-remover-produto").forEach((el) => {
        el.addEventListener("click", () => {
          produtosState.splice(Number(el.dataset.idx), 1);
          renderProdutos();
        });
      });
    };
    renderProdutos();

    container.querySelector("#pulv-add-produto").addEventListener("click", () => {
      produtosState.push({ id: proximoId++, produto: null, estoque: 0, dosagemCadastro: 0, dosagemManual: null });
      renderProdutos();
    });

    const horarioInput = container.querySelector("#pulv-horario");
    const observacaoInput = container.querySelector("#pulv-observacao");

    // --- Salvar + gerar card --------------------------------------------------
    const salvarBtn = container.querySelector("#pulv-salvar");
    salvarBtn.addEventListener("click", async () => {
      if (salvarBtn.disabled) return; // trava contra duplo-toque (mesmo padrão da v20)

      const data = container.querySelector("#pulv-data").value;
      const horario = horarioInput.value;

      if (!data) {
        showToast("Informe a data.");
        return;
      }
      if (estufasSelecionadas.length === 0) {
        showToast("Selecione ao menos uma estufa.");
        return;
      }
      if (meeirosSelecionados.length === 0) {
        showToast("Selecione ao menos um meeiro.");
        return;
      }
      if (!horario) {
        showToast("Informe o horário limite.");
        return;
      }
      const produtosValidos = produtosState.filter((p) => p.produto && Number(p.dosagemManual) > 0);
      if (produtosValidos.length === 0) {
        showToast("Informe ao menos um produto com dosagem válida.");
        return;
      }

      salvarBtn.disabled = true;

      const estufaTexto = estufasSelecionadas.join("/");
      const meeiroTexto = meeirosSelecionados.join("/");

      for (const p of produtosValidos) {
        const fields = {
          Bloco: "Pulverizacao",
          Data: data,
          Estufa: estufaTexto,
          Meeiro: meeiroTexto,
          Produto: p.produto,
          Dosagem: p.dosagemManual,
          "Horário": horario,
        };
        const erro = validateBeforeSend(fields, lookups);
        if (erro) {
          showToast(`Não foi possível enviar: ${erro}`);
          salvarBtn.disabled = false;
          return;
        }
        await queueAdd({ fields, origemTela: "Aplic" });
      }

      showToast("Pulverização gravada. Sincronizando...");
      updateSyncIndicator();
      // Diferente dos outros blocos (que disparam a sincronização em segundo
      // plano, sem esperar): aqui ESPERAMOS a sincronização terminar antes de
      // re-renderizar, porque o histórico logo abaixo relê a tabela Pulverizacao
      // DIRETO da planilha — sem esperar, o re-render buscava os dados antes da
      // gravação ter de fato chegado lá, e o lançamento recém-feito "sumia" do
      // histórico até a pessoa sair e voltar pra tela (bug relatado pelo usuário
      // em 10/10/2026).
      if (navigator.onLine) await syncQueueOnce();
      updateSyncIndicator();

      const dadosCard = {
        estufasList: estufasSelecionadas.slice(),
        meeirosList: meeirosSelecionados.slice(),
        // Observação livre (opcional) — não existe coluna pra isso na tabela
        // Pulverizacao, então só vai pro card desse envio na hora; reenviar
        // esse mesmo lançamento depois pelo histórico não traz essa
        // observação de volta (ver nota no arquivo).
        observacao: observacaoInput.value.trim(),
        dataTexto: formatDataISOparaBR(data),
        horario,
        produtos: produtosValidos.map((p) => ({ nome: p.produto, dosagem: p.dosagemManual })),
      };

      // NÃO chama enviarCardPulverizacao() direto aqui — pedido do usuário em
      // 10/10/2026 ("está gerando um comando para salvar o card, não precisa,
      // é só enviar por WhatsApp"). Causa real: até chegar aqui já passaram
      // dois `await` (queueAdd em loop + syncQueueOnce), e em boa parte dos
      // navegadores/celulares o navigator.share() só funciona se chamado
      // ainda "dentro" do toque original (user activation) — depois de vários
      // awaits essa janela já tinha passado, então compartilharArquivo()
      // (app.js) caía no fallback de BAIXAR o arquivo em vez de abrir o menu
      // de compartilhar do WhatsApp. Corrigido trocando o envio automático por
      // um botão "Enviar por WhatsApp" que a pessoa toca depois de salvar —
      // esse toque é novo e direto, então o compartilhamento abre certo.
      mostrarConfirmacaoEnvio(dadosCard);
    });

    const mostrarConfirmacaoEnvio = (dadosCard) => {
      const wrap = container.querySelector("#pulv-form-wrap");
      wrap.innerHTML = `
        <div class="card" style="text-align:center;">
          <div style="font-size:15px; font-weight:600; margin-bottom:4px;">✅ Pulverização gravada!</div>
          <p class="page-subtitle" style="margin-bottom:16px;">Toque abaixo pra enviar o card no WhatsApp.</p>
          <button type="button" id="pulv-confirmar-enviar" class="btn btn-primary btn-lg btn-block">📲 Enviar por WhatsApp</button>
          <button type="button" id="pulv-novo-lancamento" class="btn btn-secondary btn-block" style="margin-top:10px;">➕ Novo lançamento</button>
        </div>
      `;
      wrap.querySelector("#pulv-confirmar-enviar").addEventListener("click", () => {
        // Toque direto do usuário, sem nenhum await antes — mantém a "user
        // activation" válida pro navigator.share() abrir o WhatsApp de
        // verdade em vez de cair no fallback de baixar o arquivo.
        enviarCardPulverizacao(dadosCard);
      });
      wrap.querySelector("#pulv-novo-lancamento").addEventListener("click", () => {
        this.render(container);
      });
    };

    // --- Histórico (lançamentos já feitos), com filtro de data --------------
    const historicoList = container.querySelector("#pulv-historico-list");
    const filtroDataInput = container.querySelector("#pulv-filtro-data");
    const enviarTodosBtn = container.querySelector("#pulv-enviar-todos");

    let grupos = [];
    try {
      const rows = await readTable(TABLES.pulverizacao);
      // Resolve os nomes REAIS dos cabeçalhos antes de usar — proteção contra
      // a tabela ter sido editada direto no Excel (coluna inserida, cabeçalho
      // renomeado sem querer etc.); cai pra posição (0-based: Data=0...
      // Horário=5) quando o nome não bate. `acharChavePorNomeOuPosicao` já
      // existe em `graph.js`, mesmo padrão usado pro Cadastro de Produtos.
      // "observacao" é opcional — undefined até a planilha ter essa coluna
      // (ex.: uma coluna G adicionada manualmente pelo usuário).
      const chaves = {
        data: acharChavePorNomeOuPosicao(rows, ["data"], 0) ?? "Data",
        estufa: acharChavePorNomeOuPosicao(rows, ["estufa"], 1) ?? "Estufa",
        meeiro: acharChavePorNomeOuPosicao(rows, ["meeiro"], 2) ?? "Meeiro",
        produto: acharChavePorNomeOuPosicao(rows, ["produto"], 3) ?? "Produto",
        dosagem: acharChavePorNomeOuPosicao(rows, ["dosagem"], 4) ?? "Dosagem",
        horario: acharChavePorNomeOuPosicao(rows, ["horario", "horariolimite"], 5) ?? "Horário",
        observacao: acharChavePorNomeOuPosicao(rows, ["observacao", "obs", "observacoes", "textoextra"], 6),
      };
      grupos = agruparPulverizacoes(rows.filter((r) => r[chaves.estufa] || r[chaves.produto]), chaves);
    } catch (e) {
      console.error("Falha ao carregar Pulverizacao:", e);
      historicoList.innerHTML = `<div class="empty-state">Não foi possível carregar o histórico (${escapeHtml(
        String(e.message || e)
      )}).</div>`;
      return;
    }

    const gruposPorChave = new Map(grupos.map((g) => [g.chave, g]));

    const cardHistoricoHtml = (g) => `
      <div class="card">
        <div class="atividade-card-topo">
          <div class="atividade-icone atividade-icone-azul">🚿</div>
          <div style="flex:1; min-width:0;">
            <div class="card-title">${escapeHtml((g.estufa || "—").split("/").join(", "))}</div>
            <div class="card-sub">${[g.meeiro ? g.meeiro.split("/").join(", ") : "", formatExcelDate(g.data)]
              .filter(Boolean)
              .join(" · ")}</div>
          </div>
        </div>
        ${g.produtos
          .map((p) => `<div class="card-row"><span>${escapeHtml(p.nome)}</span><span>${formatNumero(p.dosagem)}</span></div>`)
          .join("")}
        <div class="card-row ferti-total-row"><span>Horário limite</span><span>${formatExcelHorario(g.horario)}</span></div>
        ${g.observacao ? `<div class="card-sub" style="margin-top:4px;">📝 ${escapeHtml(g.observacao)}</div>` : ""}
        <button type="button" class="btn-compartilhar" data-chave="${escapeHtml(g.chave)}">📲 Enviar por WhatsApp</button>
      </div>`;

    const renderHistorico = () => {
      const serialFiltro = filtroDataInput.value ? toExcelSerial(filtroDataInput.value) : null;

      const filtrados = grupos.filter((g) => {
        if (serialFiltro !== null && Math.floor(Number(g.data)) !== serialFiltro) return false;
        return true;
      });

      if (filtrados.length === 0) {
        historicoList.innerHTML = `<div class="empty-state">Nenhuma pulverização encontrada.</div>`;
        return;
      }
      historicoList.innerHTML = filtrados.slice(0, 100).map(cardHistoricoHtml).join("");
      historicoList.querySelectorAll(".btn-compartilhar").forEach((btn) => {
        btn.addEventListener("click", () => {
          const g = gruposPorChave.get(btn.dataset.chave);
          if (!g) return;
          enviarCardPulverizacao({
            estufasList: (g.estufa || "").split("/").filter(Boolean),
            meeirosList: (g.meeiro || "").split("/").filter(Boolean),
            dataTexto: formatExcelDate(g.data),
            horario: formatExcelHorario(g.horario),
            produtos: g.produtos,
            observacao: g.observacao,
          });
        });
      });
    };

    filtroDataInput.addEventListener("input", renderHistorico);
    filtroDataInput.addEventListener("change", renderHistorico);
    container.querySelector("#pulv-limpar-filtro").addEventListener("click", () => {
      filtroDataInput.value = "";
      renderHistorico();
    });

    // "Enviar todos os cards do dia" — manda, em sequência, o card de cada
    // lançamento do dia escolhido no filtro (ou de hoje, se nenhum filtro
    // estiver ativo), pra não precisar abrir um por um quando pulverizou
    // várias estufas/meeiros diferentes no mesmo dia. Cada compartilhamento
    // só avança pro próximo depois do anterior fechar (toque do usuário no
    // menu nativo de compartilhar) — é assim que o sistema operacional espera
    // múltiplos compartilhamentos em sequência.
    enviarTodosBtn.addEventListener("click", async () => {
      const serialAlvo = filtroDataInput.value
        ? toExcelSerial(filtroDataInput.value)
        : toExcelSerial(new Date().toISOString().slice(0, 10));
      const doDia = grupos.filter((g) => Math.floor(Number(g.data)) === serialAlvo);
      if (doDia.length === 0) {
        showToast("Nenhuma pulverização encontrada nesse dia.");
        return;
      }
      enviarTodosBtn.disabled = true;
      for (const g of doDia) {
        await enviarCardPulverizacao({
          estufasList: (g.estufa || "").split("/").filter(Boolean),
          meeirosList: (g.meeiro || "").split("/").filter(Boolean),
          dataTexto: formatExcelDate(g.data),
          horario: formatExcelHorario(g.horario),
          produtos: g.produtos,
          observacao: g.observacao,
        });
      }
      enviarTodosBtn.disabled = false;
    });

    renderHistorico();
  },
};
