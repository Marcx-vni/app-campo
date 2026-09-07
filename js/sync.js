// ============================================================================
// SINCRONIZAÇÃO — envia a fila local para as tabelas finais da planilha
// (Registro de Inventario, e Registro Ferti/Financeiro quando o bloco exige),
// um item por vez. O app grava DIRETO nelas — não existe mais uma aba
// "Apontamentos" intermediária nem uma fórmula/macro da planilha conferindo
// depois, então toda a validação de negócio vive em validateBeforeSend()
// (apontamento.js), rodada de novo aqui bem antes de gravar.
// Regra da especificação: nunca fazer update/delete de linha existente;
// cada apontamento é sempre uma linha nova (correção = novo lançamento/estorno).
// Idempotência: o "Complemento" carrega o localId do dispositivo — reenviar o
// mesmo item deixa rastro, ainda que não impeça 100% uma segunda gravação.
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
  const fields = { ...item.fields, Complemento: composeComplemento(item) };

  // Busca as listas mais atuais (Meeiro/Estufa/Produto/Plantio) e valida de
  // novo bem na hora de enviar — os dados podem ter mudado desde que o
  // apontamento foi criado localmente (ex.: veio de outro dia, offline).
  const lookups = await getLookupData();
  const erro = validateBeforeSend(fields, lookups);
  if (erro) throw new Error(`Recusado: ${erro}`);

  const usuario = typeof getUserEmailPrefix === "function" ? getUserEmailPrefix() : null;

  // O "Seq" é calculado aqui (maior valor já existente + 1) porque o app agora
  // grava direto no Registro de Inventario — antes isso era feito por uma
  // macro no Excel, de forma serial. Gravações de dois aparelhos ao mesmo
  // tempo podem, em teoria, calcular o mesmo próximo número; o risco é baixo
  // pro volume de uso esperado, mas é uma limitação conhecida dessa abordagem.
  const seq = await proximoSeq(TABLES.registroInventario);
  const { inventario, ferti, financeiro } = prepararRegistro(fields, lookups, seq, usuario);

  const rowIndex = await addTableRow(TABLES.registroInventario, inventario);

  // Ferti e Compra também gravam num segundo lugar (Registro Ferti / Financeiro).
  // Se essa segunda gravação falhar, a linha do Inventario já gravada NÃO é
  // desfeita automaticamente (limitação atual) — o erro fica visível na fila
  // pra correção manual.
  if (ferti) await addTableRow(TABLES.registroFerti, ferti);
  if (financeiro) await addTableRow(TABLES.financeiro, financeiro);

  await queueUpdate(item.localId, {
    status: "enviado",
    seqInventario: seq,
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
