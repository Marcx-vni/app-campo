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
  return (data.value || []).filter((item) => item.file); // só arquivos, não pastas
}

async function graphFetch(path, options = {}) {
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
    throw new Error(`Graph API ${res.status}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// --- Leitura de tabelas -----------------------------------------------------

// Retorna as linhas de uma tabela como array de objetos {ColunaHeader: valor}
async function readTable(tableName) {
  const [headerRes, rowsRes] = await Promise.all([
    graphFetch(`/tables('${tableName}')/headerRowRange`),
    graphFetch(`/tables('${tableName}')/rows`),
  ]);
  const headers = headerRes.values[0];
  return rowsRes.value.map((row) => {
    const obj = { __rowIndex: row.index };
    headers.forEach((h, i) => (obj[h] = row.values[0][i]));
    return obj;
  });
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

async function fetchLookupData() {
  const [produtos, meeiros, estufas, operacoes, ordens, fornecedores, clientes] =
    await Promise.all([
      readTable(TABLES.produtos),
      readTable(TABLES.meeiros),
      readTable(TABLES.estufas),
      readTable(TABLES.operacao),
      readTable(TABLES.ordens),
      readTable(TABLES.fornecedor),
      readTable(TABLES.cliente).catch(() => []), // tabela pequena, pode não existir em toda planilha
    ]);
  return { produtos, meeiros, estufas, operacoes, ordens, fornecedores, clientes };
}
