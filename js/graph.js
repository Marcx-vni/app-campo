// ============================================================================
// CAMADA MICROSOFT GRAPH — leitura e escrita nas tabelas do Excel via API
// Documentação: https://learn.microsoft.com/graph/api/resources/excel
// ============================================================================

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const FILE_SELECTION_KEY = "app_campo_arquivo_selecionado"; // { driveId, itemId, name }

function getSelectedFile() {
  try {
    return JSON.parse(localStorage.getItem(FILE_SELECTION_KEY) || "null");
  } catch {
    return null;
  }
}

function setSelectedFile(driveId, itemId, name) {
  localStorage.setItem(FILE_SELECTION_KEY, JSON.stringify({ driveId, itemId, name }));
}

function clearSelectedFile() {
  localStorage.removeItem(FILE_SELECTION_KEY);
}

function workbookBase() {
  const selected = getSelectedFile();
  if (!selected) {
    throw new Error("Nenhum arquivo selecionado ainda — abra o app e escolha o arquivo do OneDrive.");
  }
  return `${GRAPH_BASE}/drives/${selected.driveId}/items/${selected.itemId}/workbook`;
}

// Lista os arquivos .xlsm/.xlsx do OneDrive do usuário logado, para a tela de seleção.
// Usa /search em vez de listar tudo, para não precisar paginar milhares de arquivos.
async function searchExcelFiles(termo) {
  const token = await getAccessToken();
  const q = encodeURIComponent(termo || "xlsm");
  const res = await fetch(`${GRAPH_BASE}/me/drive/root/search(q='${q}')?$select=id,name,parentReference,webUrl,file`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Graph API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const termoNorm = (termo || "").toLowerCase().trim();
  return (data.value || []).filter((item) => {
    if (!item.file) return false; // só arquivos, não pastas
    const nome = item.name.toLowerCase();
    const ehExcel = nome.endsWith(".xlsx") || nome.endsWith(".xlsm") || nome.endsWith(".xls");
    const contemTermo = !termoNorm || nome.includes(termoNorm);
    return ehExcel && contemTermo;
  });
}

// Busca um arquivo diretamente pelo caminho exato no OneDrive — não depende do
// índice de busca do Graph (que pode demorar a "enxergar" arquivos editados com
// frequência), então é mais confiável que searchExcelFiles quando já se sabe onde
// o arquivo está.
async function getFileByPath(path) {
  const token = await getAccessToken();
  const encodedPath = path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  const res = await fetch(`${GRAPH_BASE}/me/drive/root:/${encodedPath}?$select=id,name,parentReference,file`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Graph API ${res.status}: ${await res.text()}`);
  return res.json();
}

// Códigos que o Excel Online devolve quando está sobrecarregado/instável momentaneamente
// (não é erro do nosso código nem da planilha) — vale a pena tentar de novo.
const GRAPH_RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function graphFetch(path, options = {}, _tentativa = 1) {
  const token = await getAccessToken(); // lança "OFFLINE" se não houver rede e o token expirou
  const res = await fetch(`${workbookBase()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (GRAPH_RETRYABLE_STATUS.has(res.status) && _tentativa < 3) {
      // Backoff simples: espera um pouco mais a cada nova tentativa (1.5s, depois 3s)
      await new Promise((r) => setTimeout(r, 1500 * _tentativa));
      return graphFetch(path, options, _tentativa + 1);
    }
    throw new Error(`Graph API ${res.status}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Como graphFetch, mas pra uma URL absoluta já pronta (usado pro @odata.nextLink
// de paginação, que já vem com o host/caminho completo — não dá pra montar de
// novo com workbookBase() + path).
async function graphFetchAbsolute(url, _tentativa = 1) {
  const token = await getAccessToken();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (GRAPH_RETRYABLE_STATUS.has(res.status) && _tentativa < 3) {
      await new Promise((r) => setTimeout(r, 1500 * _tentativa));
      return graphFetchAbsolute(url, _tentativa + 1);
    }
    throw new Error(`Graph API ${res.status}: ${body}`);
  }
  return res.json();
}

// --- Leitura de tabelas -----------------------------------------------------

// Retorna as linhas de uma tabela como array de objetos {ColunaHeader: valor}.
// Tabelas grandes (ex.: Registro de Inventario, que só cresce) vêm paginadas
// pelo Graph — sem seguir o @odata.nextLink, só a primeira página voltava, e
// como a ordem não é garantida ser cronológica, dava pra faltar lançamentos
// recentes na "Atividade recente" mesmo eles existindo na planilha.
async function readTable(tableName) {
  const [headerRes, primeiraPagina] = await Promise.all([
    graphFetch(`/tables('${tableName}')/headerRowRange`),
    graphFetch(`/tables('${tableName}')/rows`),
  ]);
  const headers = headerRes.values[0];

  let rows = primeiraPagina.value.slice();
  let proximaPagina = primeiraPagina["@odata.nextLink"];
  while (proximaPagina) {
    const pagina = await graphFetchAbsolute(proximaPagina);
    rows = rows.concat(pagina.value);
    proximaPagina = pagina["@odata.nextLink"];
  }

  const mapeadas = rows.map((row) => {
    const obj = { __rowIndex: row.index };
    headers.forEach((h, i) => (obj[h] = row.values[0][i]));
    return obj;
  });
  // Guarda a lista de cabeçalhos na própria lista (propriedade extra num array
  // não atrapalha .map/.filter/.forEach) — usado quando uma coluna importante
  // vem com o cabeçalho em branco na planilha e precisamos achá-la pela
  // POSIÇÃO (ex.: "coluna D") em vez de pelo nome exato do cabeçalho.
  mapeadas.headers = headers;
  return mapeadas;
}

// Lê uma única linha pelo índice (usado para reler AF/AE depois de gravar)
async function readTableRow(tableName, rowIndex) {
  const [headerRes, rowRes] = await Promise.all([
    graphFetch(`/tables('${tableName}')/headerRowRange`),
    graphFetch(`/tables('${tableName}')/rows/itemAt(index=${rowIndex})`),
  ]);
  const headers = headerRes.values[0];
  const obj = { __rowIndex: rowRes.index };
  headers.forEach((h, i) => (obj[h] = rowRes.values[0][i]));
  return obj;
}

// --- Escrita -----------------------------------------------------------------

// Adiciona uma linha ao final da tabela. `valuesArray` deve ter o mesmo número
// de colunas da tabela, na mesma ordem (use os helpers de js/apontamento.js para montar).
// Retorna o índice da linha criada (necessário para reler AF/AE depois).
async function addTableRow(tableName, valuesArray) {
  const result = await graphFetch(`/tables('${tableName}')/rows/add`, {
    method: "POST",
    body: JSON.stringify({ values: [valuesArray] }),
  });
  return result.index;
}

// Força o Excel Online a recalcular fórmulas (colunas calculadas como AF, AE, P, S, etc.)
// antes de reler a linha. Sem isso a leitura pode trazer o valor "stale".
async function recalculateWorkbook() {
  await graphFetch(`/application/calculate`, {
    method: "POST",
    body: JSON.stringify({ calculationType: "Recalculate" }),
  });
}

// --- Listas de apoio (cache) --------------------------------------------------

// Normaliza um nome de coluna para comparação tolerante a acento/maiúscula
// (ex.: "Código", "codigo", "Cód." e "COD" todos viram "cod").
function normKey(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// Acha, num objeto de linha lida da planilha, a coluna cujo nome normalizado
// "parece" um código (ex.: "Codigo", "Cód.", "Código Meeiro") — sem depender
// de acertar de antemão o texto exato usado na planilha do usuário.
function findCodKey(obj) {
  const keys = Object.keys(obj).filter((k) => k !== "__rowIndex");
  const candidates = keys.filter((k) => normKey(k).startsWith("cod"));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => normKey(a).length - normKey(b).length);
  return candidates[0];
}

// Adiciona um campo "__cod" a cada linha de uma lista de apoio, apontando
// para a coluna de código real da planilha (qualquer que seja seu nome exato).
function comCodigoNormalizado(lista) {
  lista.forEach((item) => {
    const k = findCodKey(item);
    item.__cod = k ? item[k] : undefined;
  });
  return lista;
}

async function fetchLookupData() {
  const [produtos, produtosVenda, meeiros, estufas, operacoes, ordens, fornecedores, clientes, plantio] =
    await Promise.all([
      readTable(TABLES.produtos),
      readTable(TABLES.produtosVenda),
      readTable(TABLES.meeiros),
      readTable(TABLES.estufas),
      readTable(TABLES.operacao),
      readTable(TABLES.ordens),
      readTable(TABLES.fornecedor),
      readTable(TABLES.cliente).catch(() => []), // tabela pequena, pode não existir em toda planilha
      readTable(TABLES.plantio).catch(() => []), // usado pra validar/achar o plantio Ativo da estufa
    ]);
  comCodigoNormalizado(meeiros);
  comCodigoNormalizado(estufas);
  return { produtos, produtosVenda, meeiros, estufas, operacoes, ordens, fornecedores, clientes, plantio };
}

// Lê só a coluna "Seq" de uma tabela e devolve o próximo número (maior + 1) —
// espelha a função ProximoSeq() da macro VBA original ("Motor"). Como o app
// agora grava direto (sem a macro), é o app quem garante essa numeração.
async function proximoSeq(tableName) {
  const linhas = await readTable(tableName);
  let max = 0;
  for (const l of linhas) {
    const v = Number(l["Seq"]);
    if (!Number.isNaN(v) && v > max) max = v;
  }
  return max + 1;
}
