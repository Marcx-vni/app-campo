// ============================================================================
// TELA INICIAL (Início) — resumo rápido do dia, atalhos e atividade recente
// (das últimas gravações na planilha). Antes esse conteúdo todo vivia na aba
// "Ordens" da navegação; agora tem tela própria porque a aba "Ordens" passou
// a ser a Consulta de Fertirrigações.
//
// "Minhas Ordens" (T1: lista de tarefas atribuídas por e-mail, da tabela
// Ordens/"Ordens de Aplicacao") foi removida por não estar em uso — a
// planilha nunca chegou a ser preenchida com essas atribuições, então a
// lista sempre aparecia vazia. O ecrã de detalhe (T2, ordemCard.js) e a
// tabela "Ordens" continuam existindo caso o recurso volte a ser usado —
// só não tem mais nenhum link levando até lá.
// ============================================================================

// Lembrete do último Meeiro escolhido no formulário de Apontamento Livre
// (só conveniência de preenchimento — sem relação com login/e-mail).
const MEEIRO_STORAGE_KEY = "app_campo_meeiro_codigo";

function getMeeiroSelecionado() {
  return localStorage.getItem(MEEIRO_STORAGE_KEY);
}

const ScreenHome = {
  async render(container) {
    container.innerHTML = `
      <div class="resumo-rapido" id="resumo-rapido">
        <div class="resumo-card">
          <div class="resumo-valor" id="resumo-hoje">—</div>
          <div class="resumo-label">Lançamentos hoje</div>
        </div>
        <div class="resumo-card">
          <div class="resumo-valor resumo-alerta" id="resumo-estoque">—</div>
          <div class="resumo-label">Estoque baixo</div>
        </div>
        <div class="resumo-card">
          <div class="resumo-valor" id="resumo-fila">—</div>
          <div class="resumo-label">Fila de sync</div>
        </div>
        <div class="resumo-card">
          <div class="resumo-valor resumo-valor-pequeno" id="resumo-valor-estoque">—</div>
          <div class="resumo-label">Valor em estoque</div>
        </div>
      </div>

      <div class="section-title" style="margin-top:18px;">Ações rápidas</div>
      <div class="acoes-rapidas">
        <div class="acao-rapida acao-rapida-primaria" data-route="apontamento">
          <span class="acao-rapida-icone">✏️</span>
          <span class="acao-rapida-texto">Novo apontamento</span>
        </div>
        <div class="acao-rapida" data-route="estoque">
          <span class="acao-rapida-icone">📦</span>
          <span class="acao-rapida-texto">Ver estoque</span>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:22px;margin-bottom:10px;">
        <div class="section-title" style="margin:0;">Atividade recente</div>
        <div id="atividade-ver-tudo" style="font-size:12px;color:var(--verde);font-weight:500;cursor:pointer;">Ver tudo</div>
      </div>
      <div id="atividade-recente-list"></div>
    `;

    container.querySelectorAll(".acao-rapida").forEach((el) => {
      el.addEventListener("click", () => navigate(el.dataset.route));
    });
    container.querySelector("#atividade-ver-tudo").addEventListener("click", () => navigate("fila"));

    // Nunca deixa a tela travada em "Carregando..." pra sempre sem explicação:
    // se a busca dos dados da planilha falhar (ex.: arquivo movido/renomeado
    // e a referência salva neste aparelho ficou inválida), mostra o erro e
    // orienta a tocar no nome do arquivo no topo pra selecionar de novo.
    let produtos = [];
    try {
      ({ produtos } = await getLookupData());
    } catch (e) {
      console.error("Falha ao carregar dados da planilha:", e);
      container.querySelectorAll(".resumo-valor").forEach((el) => (el.textContent = "erro"));
      container.querySelector("#atividade-recente-list").innerHTML = `<div class="empty-state">
        Não foi possível carregar os dados da planilha (${escapeHtml(String(e.message || e))}).
        Verifique a conexão ou toque no nome do arquivo no topo do app pra selecionar de novo.
      </div>`;
      return;
    }

    // Resumo rápido + atividade recente: buscados da própria planilha (Registro
    // de Inventario, ordenado pela coluna "Gravado em" — a AF), não da fila local
    // deste aparelho. Antes usava a fila local e por isso "sumia" toda vez que
    // trocava de aparelho ou o app era reaberto sem nada pendente; agora reflete
    // o que foi realmente gravado, de qualquer aparelho.
    (async () => {
      const pendentes = await queuePending();
      container.querySelector("#resumo-fila").textContent = pendentes.length;

      let registro = [];
      let registroFerti = [];
      try {
        [registro, registroFerti] = await Promise.all([
          readTable(TABLES.registroInventario),
          readTable(TABLES.registroFerti).catch(() => []),
        ]);
      } catch (e) {
        console.warn("Falha ao buscar Registro de Inventario pra Atividade recente:", e);
      }
      // A Fertirrigação grava em "Tipo Movimentação" = S, igual à Aplicação
      // (Uso) — a coluna "Operação" vem igual pros dois ("Saída Consumo"),
      // então pra dar cor/rótulo diferente na Fertirrigação cruzamos com a
      // aba "Registro Ferti" pelos mesmos dados (Estufa+Produto+Data+Meeiro).
      const fertiIndex = new Map();
      registroFerti.forEach((f) => {
        fertiIndex.set(chaveFerti(f["Estufa"], f["Produto"], f["Data"], f["Meeiro"]), f);
      });

      const comData = registro
        .filter((r) => r["Gravado em"])
        .sort((a, b) => Number(b["Gravado em"]) - Number(a["Gravado em"]));

      const hojeSerial = toExcelSerial(new Date());
      const lancadosHoje = comData.filter((r) => Math.floor(Number(r["Gravado em"])) === hojeSerial).length;
      const estoqueBaixo = (produtos || []).filter(
        (p) => p["Produto"] && Number(p["Estoque"]) <= Number(p["Estoque Minimo"] || 0)
      ).length;
      container.querySelector("#resumo-hoje").textContent = lancadosHoje;
      container.querySelector("#resumo-estoque").textContent = estoqueBaixo;

      const valorKeyEstoque = acharChaveValorEstoque(produtos || []);
      const valorEstoqueEl = container.querySelector("#resumo-valor-estoque");
      if (valorKeyEstoque) {
        const total = (produtos || []).reduce((soma, p) => soma + (Number(p[valorKeyEstoque]) || 0), 0);
        valorEstoqueEl.textContent = formatMoeda(total);
      } else {
        valorEstoqueEl.textContent = "—";
      }

      const atividadeList = container.querySelector("#atividade-recente-list");
      const recentes = comData.slice(0, 4);
      if (recentes.length === 0) {
        atividadeList.innerHTML = `<div class="empty-state">Nenhum apontamento lançado ainda.</div>`;
        return;
      }
      atividadeList.innerHTML = recentes.map((row) => atividadeCardHtml(row, produtos, fertiIndex)).join("");
      atividadeList.querySelectorAll(".btn-compartilhar").forEach((btn) => {
        btn.addEventListener("click", () => {
          const fertiRow = fertiIndex.get(btn.dataset.fertiKey);
          if (fertiRow) enviarCardFerti([fertiRow]);
        });
      });
    })();
  },
};

// "Tipo Movimentação" na planilha: S = saída (Uso ou Ferti — a planilha não
// distingue os dois nessa coluna), V = venda, E = entrada/compra.
const TIPO_MOVIMENTACAO_INFO = {
  S: { icone: "🧪", cor: "atividade-icone-verde" },
  V: { icone: "💰", cor: "atividade-icone-azul" },
  E: { icone: "🛒", cor: "atividade-icone-terracota" },
};

function formatMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Número com separador de milhar "." e decimal "," (padrão brasileiro), sem
// zeros à direita desnecessários — ex.: 1234.5 -> "1.234,5", 0.045 -> "0,045".
function formatNumero(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

// Alguns produtos do Cadastro (Tabela613) têm a coluna "Unidade" preenchida
// errado com um número (ex.: "1000") em vez de um texto de unidade (L, kg,
// un.) — isso não é um bug do app, é dado da planilha, mas exibir "5 1000"
// confunde mais do que ajuda. Se "Unidade" for puramente numérico, tratamos
// como se estivesse vazio.
function unidadeValida(u) {
  const s = (u || "").toString().trim();
  if (!s) return "";
  if (!isNaN(Number(s.replace(",", ".")))) return "";
  return s;
}

// Chave usada pra cruzar uma linha do Registro de Inventario com sua linha
// correspondente no Registro Ferti (nenhuma das duas tabelas guarda uma
// referência direta uma pra outra, então a única forma de casar as duas é
// pelos dados que as duas têm em comum: mesma Estufa+Produto+Data+Meeiro).
function chaveFerti(estufa, produto, dataSerial, meeiro) {
  return [estufa, produto, dataSerial, meeiro].map((v) => String(v ?? "").trim().toLowerCase()).join("||");
}

// Monta os dados de UM OU MAIS lançamentos de Ferti (mesma estufa/dia) no
// formato que o "card" de imagem (gerarCardFertiPng) precisa: uma tabela com
// uma linha por produto e uma coluna por setor. Usado tanto pro envio
// individual (1 produto) quanto pro agrupado (vários produtos).
function prepararDadosCardFerti(fertiRows) {
  const primeiro = fertiRows[0];
  const produtos = fertiRows.map((r) => {
    const porSetor = {};
    let total = 0;
    [1, 2, 3, 4, 5, 6].forEach((n) => {
      const v = arredondarGramasFerti(r[`Setor ${n}`]);
      if (v > 0) {
        porSetor[n] = v;
        total += v;
      }
    });
    return { nome: r["Produto"] || "—", porSetor, total };
  });
  const setoresSet = new Set();
  produtos.forEach((p) => Object.keys(p.porSetor).forEach((n) => setoresSet.add(Number(n))));
  return {
    estufa: primeiro["Estufa"] || "—",
    meeiro: primeiro["Meeiro"] || "—",
    dataTexto: formatExcelDate(primeiro["Data"]),
    produtos,
    setores: [...setoresSet].sort((a, b) => a - b),
  };
}

// Corta o texto com "…" se não couber na largura disponível — usado como
// último recurso depois de já ter tentado quebrar em mais de uma linha.
function truncarTextoCanvas(ctx, texto, larguraMax) {
  if (ctx.measureText(texto).width <= larguraMax) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(t + "…").width > larguraMax) {
    t = t.slice(0, -1);
  }
  return t + "…";
}

// Quebra o texto em até `maxLinhas` linhas que cabem em `larguraMax` (por
// palavra inteira, como um texto normal quebraria) — evita cortar o nome do
// produto de cara quando ele só é um pouco comprido demais pra uma linha só.
// Se mesmo assim sobrar texto depois do limite de linhas, a última linha
// termina com "…".
function quebrarTextoCanvas(ctx, texto, larguraMax, maxLinhas) {
  const palavras = String(texto).split(/\s+/).filter(Boolean);
  const linhas = [];
  let atual = "";
  let i = 0;
  while (i < palavras.length && linhas.length < maxLinhas) {
    const tentativa = atual ? `${atual} ${palavras[i]}` : palavras[i];
    if (!atual || ctx.measureText(tentativa).width <= larguraMax) {
      atual = tentativa;
      i++;
    } else {
      linhas.push(atual);
      atual = "";
    }
  }
  if (atual) linhas.push(atual);
  if (i < palavras.length && linhas.length > 0) {
    linhas[linhas.length - 1] = truncarTextoCanvas(
      ctx,
      `${linhas[linhas.length - 1]} ${palavras.slice(i).join(" ")}`,
      larguraMax
    );
  }
  return linhas.length ? linhas : [""];
}

// Gera a imagem (PNG, como Blob) do "card" de Fertirrigação pronto pra
// mandar por WhatsApp — mesmo formato de tabela usado na tela (produto ×
// setor), só que como figura, pra evitar a confusão de leitura que o texto
// corrido causava (ex.: "Setor 1- 1.300 gramas" sendo lido como "1 300").
async function gerarCardFertiPng(dados) {
  const fonte = "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
  const escala = 2;
  const colProduto = 176;
  const colSetor = 104;
  const altHeader = 106;
  const altCabecalho = 44;
  const altLinhaBase = 48;
  const altFooter = 50;
  const raio = 22;
  const alturaLinhaTexto = 18; // espaço entre linhas quando o nome do produto quebra em 2
  const maxLinhasProduto = 2;

  // Sem coluna de Total nem linha de Totais (a pedido do usuário, pra
  // aproveitar espaço) — o card mostra só o lançamento em si, produto por
  // produto e setor por setor.
  const setores = dados.setores.length ? dados.setores : [1];
  const larguraTabela = colProduto + colSetor * setores.length;

  // Canvas "de medida", só pra calcular larguras de texto e quebras de linha
  // antes de saber o tamanho final do card (não é desenhado em lugar nenhum).
  const medCtx = document.createElement("canvas").getContext("2d");

  // O título do cabeçalho (ícone + "Fertirrigação — Estufa X") não pode ficar
  // maior que o card — senão passa da borda e é cortado, como aconteceu numa
  // estufa com nome curto e só 1 setor (card ficava mais estreito que o
  // título). Se o texto do cabeçalho pedir mais espaço que a própria tabela,
  // o card cresce até caber os dois.
  medCtx.font = `600 21px ${fonte}`;
  const larguraTitulo = 58 + medCtx.measureText(`Fertirrigação — ${dados.estufa}`).width + 20;
  medCtx.font = `15px ${fonte}`;
  const larguraSubtitulo = 22 + medCtx.measureText(`${dados.meeiro} · ${dados.dataTexto}`).width + 20;
  const largura = Math.max(larguraTabela, larguraTitulo, larguraSubtitulo);

  // Nome do produto: quebra em até 2 linhas antes de recorrer a "…" — evita
  // cortar nomes só um pouco compridos demais pra uma linha só.
  medCtx.font = `600 14.5px ${fonte}`;
  const larguraProdutoDisponivel = colProduto - 30;
  const linhasPorProduto = dados.produtos.map((p) =>
    quebrarTextoCanvas(medCtx, p.nome, larguraProdutoDisponivel, maxLinhasProduto)
  );
  const alturasLinha = linhasPorProduto.map((linhas) =>
    Math.max(altLinhaBase, linhas.length * alturaLinhaTexto + 20)
  );
  const alturaTabelaLinhas = alturasLinha.reduce((soma, h) => soma + h, 0);

  const altura = altHeader + altCabecalho + alturaTabelaLinhas + altFooter;

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

  // Cabeçalho verde escuro — título + meeiro/data.
  ctx.fillStyle = "#1F3D2B";
  ctx.fillRect(0, 0, largura, altHeader);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `26px ${fonte}`;
  ctx.textAlign = "left";
  ctx.fillText("💧", 22, 42);
  ctx.font = `600 21px ${fonte}`;
  ctx.fillText(`Fertirrigação — ${dados.estufa}`, 58, 42);
  ctx.font = `15px ${fonte}`;
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fillText(`${dados.meeiro} · ${dados.dataTexto}`, 22, 80);

  // Cabeçalho da tabela (nome das colunas).
  let y = altHeader;
  ctx.fillStyle = "#F7F6F2";
  ctx.fillRect(0, y, largura, altCabecalho);
  ctx.font = `600 14px ${fonte}`;
  ctx.fillStyle = "#3A3A34";
  ctx.textAlign = "center";
  setores.forEach((n, i) => {
    const cx = colProduto + colSetor * i + colSetor / 2;
    ctx.fillText(`Setor ${n}`, cx, y + altCabecalho / 2);
  });
  y += altCabecalho;

  // Uma linha por produto — só os valores lançados, sem totalizador nenhum.
  // Cada linha pode ter sua própria altura (produtos com nome maior que
  // quebrou em 2 linhas ficam mais altos que os demais).
  dados.produtos.forEach((p, idx) => {
    const altLinha = alturasLinha[idx];
    const linhasNome = linhasPorProduto[idx];
    if (idx % 2 === 1) {
      ctx.fillStyle = "#FAF9F6";
      ctx.fillRect(0, y, largura, altLinha);
    }
    ctx.font = `600 14.5px ${fonte}`;
    ctx.fillStyle = "#1A1A1A";
    ctx.textAlign = "left";
    const yPrimeiraLinha = y + altLinha / 2 - ((linhasNome.length - 1) * alturaLinhaTexto) / 2;
    linhasNome.forEach((linha, li) => {
      ctx.fillText(linha, 16, yPrimeiraLinha + li * alturaLinhaTexto);
    });
    ctx.font = `14.5px ${fonte}`;
    ctx.textAlign = "center";
    setores.forEach((n, i) => {
      const v = p.porSetor[n] || 0;
      const cx = colProduto + colSetor * i + colSetor / 2;
      ctx.fillText(v > 0 ? `${formatNumero(v)} g` : "—", cx, y + altLinha / 2);
    });
    y += altLinha;
  });

  // Rodapé com o resumo (nº de produtos e setores).
  ctx.fillStyle = "#F1EFE7";
  ctx.fillRect(0, y, largura, altFooter);
  ctx.fillStyle = "#6B6B65";
  ctx.font = `14px ${fonte}`;
  ctx.textAlign = "left";
  const nProdutos = dados.produtos.length;
  const nSetores = setores.length;
  ctx.fillText(
    `${nProdutos} produto${nProdutos === 1 ? "" : "s"} · ${nSetores} setor${nSetores === 1 ? "" : "es"}`,
    16,
    y + altFooter / 2
  );

  ctx.restore();

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

// Gera o card (imagem) de um ou mais lançamentos de Ferti da mesma
// estufa/dia e compartilha — usado tanto pelo botão individual quanto pelo
// "Enviar agrupado". Substitui o antigo envio como texto puro, que podia
// confundir a leitura dos números (ver compartilharImagem em app.js).
async function enviarCardFerti(fertiRows) {
  const dados = prepararDadosCardFerti(fertiRows);
  const blob = await gerarCardFertiPng(dados);
  if (!blob) {
    showToast("Não foi possível gerar a imagem do card.");
    return;
  }
  const nomeArquivo = `ferti-${dados.estufa}-${dados.dataTexto}`.replace(/[^\w-]+/g, "_") + ".png";
  await compartilharImagem(blob, nomeArquivo);
}

// Card de "Atividade recente" a partir de uma linha real do Registro de
// Inventario (não da fila local) — reflete o que foi gravado por qualquer
// aparelho, ordenado pela coluna "Gravado em" (AF).
// `produtos` (Tabela613) é usado só pra achar a unidade (kg/L/un) do produto
// consumido, nas linhas de uso (S). `fertiIndex` (Estufa+Produto+Data+Meeiro
// -> linha do Registro Ferti) é usado só pra diferenciar Fertirrigação de
// Aplicação normal, já que as duas gravam "Tipo Movimentação" = S igual.
function atividadeCardHtml(row, produtos, fertiIndex) {
  const tipo = row["Tipo Movimentação"];
  const isCompra = tipo === "E";
  const produtoNome = row["Descricao"] || "—";
  const pessoa = isCompra ? row["Fornecedor"] || "" : row["Meeiro"] || "";

  const fertiRow =
    tipo === "S" && fertiIndex
      ? fertiIndex.get(chaveFerti(row["Estufa"], produtoNome, row["Data"], row["Meeiro"]))
      : null;

  if (fertiRow) {
    const setores = [1, 2, 3, 4, 5, 6]
      .map((n) => arredondarGramasFerti(fertiRow[`Setor ${n}`]))
      .filter((v) => v > 0);
    const total = setores.reduce((a, b) => a + b, 0);
    return `
      <div class="card card-ferti">
        <div class="atividade-card-topo">
          <div class="atividade-icone atividade-icone-ferti">💧</div>
          <div style="flex:1; min-width:0;">
            <div class="card-title">Fertirrigação — ${escapeHtml(row["Estufa"] || "")} <span class="tag-ferti">FERTI</span></div>
            <div class="card-sub">${[pessoa, formatRelativeTimeFromSerial(row["Gravado em"])].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        <div class="card-row"><span>Produto</span><span>${escapeHtml(produtoNome)}</span></div>
        <div class="card-row"><span>Dosagem</span><span>${formatNumero(fertiRow["Dosagem"])} /1.000 plantas</span></div>
        <div class="card-row"><span>Setores aplicados</span><span>${setores.length}</span></div>
        <div class="card-row ferti-total-row"><span>Total</span><span>${formatNumero(total)} (${formatNumero(total / 1000)} no estoque)</span></div>
        <button type="button" class="btn-compartilhar" data-ferti-key="${escapeHtml(chaveFerti(row["Estufa"], produtoNome, row["Data"], row["Meeiro"]))}">📲 Enviar por WhatsApp</button>
      </div>`;
  }

  const info = TIPO_MOVIMENTACAO_INFO[tipo] || { icone: "📋", cor: "atividade-icone-verde" };
  const complemento = isCompra ? produtoNome : row["Estufa"] || "";

  // Linhas extras de detalhe, além de Produto: variam por tipo de movimentação.
  const linhasExtra = [];
  if (tipo === "S") {
    const produtoInfo = (produtos || []).find((p) => p["Produto"] === produtoNome);
    const unidade = unidadeValida(produtoInfo?.["Unidade"]);
    linhasExtra.push(["Volume aplicado", `${formatNumero(row["Volume Calda"])} L`]); // coluna J
    linhasExtra.push(["Qtde. usada", `${formatNumero(row["Qtde."])}${unidade ? " " + unidade : ""}`]); // coluna K
    if (row["Total Saida"] !== undefined && row["Total Saida"] !== null && row["Total Saida"] !== "") {
      linhasExtra.push(["Total", formatMoeda(row["Total Saida"])]); // coluna U
    }
  } else if (tipo === "V") {
    linhasExtra.push(["Qtde. vendida", formatNumero(row["Qtde."])]); // coluna K
    linhasExtra.push(["Preço Venda", formatMoeda(row["Valor Unit. Venda"])]); // coluna AG
    linhasExtra.push(["Total da venda", formatMoeda(row["Total Venda"])]);
  } else if (tipo === "E") {
    const qtde = Number(row["Qtde."]) || 0; // coluna K
    const valorUnit = Number(row["Valor Entrada"]) || 0; // coluna L
    const totalEntrada =
      row["Total Entrada"] !== undefined && row["Total Entrada"] !== null && row["Total Entrada"] !== ""
        ? Number(row["Total Entrada"]) // coluna S, quando já recalculada
        : qtde * valorUnit;
    linhasExtra.push(["Qtd.", formatNumero(qtde)]);
    linhasExtra.push(["Vlr. unit.", formatMoeda(valorUnit)]);
    linhasExtra.push(["Total", formatMoeda(totalEntrada)]);
  }

  // Na Compra o "complemento" do título já é o nome do produto (não tem
  // Estufa) — por isso a linha de Produto abaixo é sempre mostrada, pra não
  // ficar faltando essa informação no card.
  return `
    <div class="card">
      <div class="atividade-card-topo">
        <div class="atividade-icone ${info.cor}">${info.icone}</div>
        <div style="flex:1; min-width:0;">
          <div class="card-title">${escapeHtml(row["Operação"] || "Apontamento")}${complemento ? " — " + escapeHtml(complemento) : ""}</div>
          <div class="card-sub">${[pessoa, formatRelativeTimeFromSerial(row["Gravado em"])].filter(Boolean).join(" · ")}</div>
        </div>
      </div>
      <div class="card-row"><span>Produto</span><span>${escapeHtml(produtoNome)}</span></div>
      ${linhasExtra.map(([label, valor]) => `<div class="card-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(String(valor))}</span></div>`).join("")}
    </div>`;
}

// "Gravado em" é um serial Excel de data+hora, gravado a partir do horário
// LOCAL tratado como se fosse UTC (ver toExcelSerialDateTime em apontamento.js)
// — então pra calcular "há quanto tempo" comparamos no mesmo "fuso fake",
// senão o cálculo fica errado pelo deslocamento do fuso horário.
function formatRelativeTimeFromSerial(serial) {
  if (!serial) return "";
  const excelEpocaMs = Date.UTC(1899, 11, 30);
  const momentoMs = excelEpocaMs + Number(serial) * 86400000;
  const agora = new Date();
  const agoraFakeMs = Date.UTC(
    agora.getFullYear(), agora.getMonth(), agora.getDate(),
    agora.getHours(), agora.getMinutes(), agora.getSeconds()
  );
  const diffMs = agoraFakeMs - momentoMs;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

function formatExcelDate(serial) {
  if (!serial) return "—";
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const d = new Date(excelEpoch.getTime() + serial * 86400000);
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
