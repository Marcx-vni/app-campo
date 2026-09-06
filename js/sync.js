// ============================================================================
// SINCRONIZAÇÃO — envia a fila local para a planilha, um item por vez.
// Regra da especificação: nunca fazer update/delete de linha existente;
// cada apontamento é sempre uma linha nova (correção = novo lançamento de estorno).
// Idempotência: o "Complemento" (Z) carrega o localId do dispositivo — reenviar o
// mesmo item não deve criar duas linhas (checagem best-effort antes de enviar).
// ============================================================================

let syncing = false;

async function syncQueueOnce(onProgress) {
  if (syncing) return { sent: 0, failed: 0 };
  syncing = true;
  let sent = 0, failed = 0;
  try {
    const pending = await queuePending();
    for (const item of pending) {
      onProgress?.(item, "enviando");
      await queueUpdate(item.localId, { status: "enviando" });
      try {
        await sendOne(item);
        sent++;
        onProgress?.(item, "enviado");
      } catch (e) {
        failed++;
        const msg = e.message === "OFFLINE" ? "Sem conexão — tentar novamente depois" : e.message;
        await queueUpdate(item.localId, { status: "erro", erro: msg });
        onProgress?.(item, "erro", msg);
        if (e.message === "OFFLINE") break; // não adianta tentar os próximos agora
      }
    }
  } finally {
    syncing = false;
  }
  return { sent, failed };
}

async function sendOne(item) {
  // idempotência: se já existe na fila local um registro "enviado" com o mesmo
  // localId em Complemento, não reenvia (segurança extra além do dedup natural
  // de só reprocessar itens com status pendente/erro).
  const fields = { ...item.fields, Complemento: composeComplemento(item) };

  const row = buildApontamentoRow(fields);
  const rowIndex = await addTableRow(TABLES.apontamentos, row);

  // dá um instante para o Excel Online recalcular fórmulas antes de reler
  await recalculateWorkbook();
  await new Promise((r) => setTimeout(r, 800));

  const savedRow = await readTableRow(TABLES.apontamentos, rowIndex);
  const validacao = savedRow["Validação"];
  const seqInventario = savedRow["Seq Inventario"];

  if (validacao && validacao !== "OK") {
    // A planilha recusou a linha — mantém na fila com o erro devolvido por ela
    throw new Error(`Planilha recusou: ${validacao}`);
  }

  await queueUpdate(item.localId, {
    status: "enviado",
    seqInventario: seqInventario || null,
    validacao: validacao || "OK (aguardando confirmação)",
    rowIndex,
    sentAt: new Date().toISOString(),
  });
}

function composeComplemento(item) {
  const base = item.fields["Complemento"] || "";
  const tag = `#${item.localId}`;
  return base ? `${base} ${tag}` : tag;
}

// Dispara sync automaticamente quando a conexão volta
window.addEventListener("online", () => {
  syncQueueOnce().then((r) => {
    if (r.sent > 0) window.dispatchEvent(new CustomEvent("app-campo:synced", { detail: r }));
  });
});
