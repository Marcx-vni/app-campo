// ============================================================================
// BANCO LOCAL (IndexedDB) — cache de listas e fila offline de apontamentos
// Regra da especificação: gravação é sempre "append" na fila local; nunca
// alteramos/apagamos um apontamento já enviado (correção = novo lançamento).
// ============================================================================

const DB_NAME = "app-campo-db";
const DB_VERSION = 1;
const STORES = {
  cache: "cache", // key/value: listas de produtos, meeiros, estufas, operacoes, ordens
  queue: "queue", // apontamentos pendentes/enviados (fila de sincronização)
};

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.cache)) {
        db.createObjectStore(STORES.cache, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORES.queue)) {
        const qs = db.createObjectStore(STORES.queue, { keyPath: "localId" });
        qs.createIndex("status", "status", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = fn(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

// --- Cache de listas (produtos, meeiros, estufas, operacoes, ordens) --------

async function cacheSet(key, value) {
  return withStore(STORES.cache, "readwrite", (store) =>
    store.put({ key, value, updatedAt: new Date().toISOString() })
  );
}

async function cacheGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.cache, "readonly");
    const req = tx.objectStore(STORES.cache).get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => reject(req.error);
  });
}

async function refreshLookupCache() {
  const data = await fetchLookupData();
  await Promise.all(Object.entries(data).map(([k, v]) => cacheSet(k, v)));
  await cacheSet("__lastSync", new Date().toISOString());
  return data;
}

async function getLookupData() {
  // Prioriza sempre a rede (dados atuais da planilha); o cache local só é
  // usado quando estamos offline ou a rede falha, para o app continuar
  // funcionando em campo. Antes disso, o cache "vencia" a rede pra sempre —
  // uma vez salvo, nunca era atualizado de novo mesmo com internet, o que
  // deixava o app preso em listas antigas (ex.: Meeiros sem o campo de
  // código correto) mesmo depois de corrigido o código do app.
  if (navigator.onLine) {
    try {
      return await refreshLookupCache();
    } catch (e) {
      // rede indisponível/instável mesmo com navigator.onLine true — cai pro cache abaixo
    }
  }
  const keys = ["produtos", "produtosVenda", "meeiros", "estufas", "operacoes", "ordens", "fornecedores", "clientes"];
  const cached = await Promise.all(keys.map((k) => cacheGet(k)));
  if (cached.every((v) => v && v.length !== undefined)) {
    return Object.fromEntries(keys.map((k, i) => [k, cached[i]]));
  }
  throw new Error("Sem conexão e sem dados salvos localmente ainda — abra o app uma vez com internet.");
}

// --- Fila de apontamentos ----------------------------------------------------
// status: "pendente" | "enviando" | "enviado" | "erro"

function generateLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function queueAdd(apontamento) {
  // Preenche "Usuario" (auditoria) com a parte antes do "@" da conta Microsoft
  // logada — não tem nenhuma relação com o "Código Meeiro" escolhido no formulário.
  if (apontamento.fields && !apontamento.fields["Usuario"]) {
    apontamento.fields["Usuario"] =
      typeof getUserEmailPrefix === "function" ? getUserEmailPrefix() : null;
  }
  const item = {
    localId: generateLocalId(),
    status: "pendente",
    createdAt: new Date().toISOString(),
    erro: null,
    seqInventario: null,
    ...apontamento,
  };
  await withStore(STORES.queue, "readwrite", (store) => store.put(item));
  return item;
}

async function queueUpdate(localId, patch) {
  return withStore(STORES.queue, "readwrite", (store) => {
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const item = getReq.result;
      if (item) store.put({ ...item, ...patch });
    };
  });
}

async function queueAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.queue, "readonly");
    const req = tx.objectStore(STORES.queue).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
    req.onerror = () => reject(req.error);
  });
}

async function queuePending() {
  const all = await queueAll();
  return all.filter((i) => i.status === "pendente" || i.status === "erro");
}

// Se a página fechar/recarregar no meio de um envio, o item fica preso em
// "enviando" para sempre (nunca chega a "enviado" nem a "erro"). Chamado uma
// vez ao abrir o app, antes de qualquer sincronização, para não deixar
// nenhum apontamento esquecido — ele volta a ser tentado como "pendente".
async function queueDestravarEnviandoOrfaos() {
  const all = await queueAll();
  const presos = all.filter((i) => i.status === "enviando");
  await Promise.all(presos.map((i) => queueUpdate(i.localId, { status: "pendente" })));
  return presos.length;
}

async function queueDiscard(localId) {
  return withStore(STORES.queue, "readwrite", (store) => store.delete(localId));
}
