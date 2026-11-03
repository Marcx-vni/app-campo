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
  // Blocos "Financeiro" (conta a pagar sem estoque) e "Pulverizacao" (log
  // só pra gerar o card de WhatsApp) nunca gravam no Registro de Inventario
  // — não precisa nem calcular o próximo "Seq" deles (evita leitura à toa).
  const precisaSeqInventario = fields["Bloco"] !== "Financeiro" && fields["Bloco"] !== "Pulverizacao";
  const seq = precisaSeqInventario ? await proximoSeq(TABLES.registroInventario) : null;
  const { inventario, ferti, financeiro, pulverizacao } = prepararRegistro(fields, lookups, seq, usuario);

  // Proteção contra duplicar (27/10/2026, ampliada em 03/11/2026 — ver
  // "PROTEÇÃO CONTRA GRAVAÇÃO DUPLICADA" em apontamento.js): um `addTableRow`
  // pode já ter gravado na planilha mesmo quando ESSA chamada termina com
  // erro (ex.: "Failed to fetch" — a rede caiu bem na hora de ler a RESPOSTA,
  // já depois do servidor ter processado a gravação). Quando `sendOne` é
  // chamado de novo pro mesmo item (reenvio automático ou manual), cada
  // gravação confere antes se já foi feita, pra não duplicar a linha.
  const tagUnico = `#${item.localId}`;
  let rowIndex;
  if (inventario) {
    const existente = await inventarioRowIndexPorTag(tagUnico);
    rowIndex = existente !== undefined ? existente : await addTableRow(TABLES.registroInventario, inventario);
  } else {
    rowIndex = null;
  }

  // Ferti e Compra também gravam num segundo lugar (Registro Ferti / Financeiro);
  // os blocos Financeiro e Pulverizacao gravam SÓ no destino próprio (sem linha
  // correspondente no Inventario). Se essa segunda gravação falhar, a linha do
  // Inventario já gravada (quando existe) NÃO é desfeita automaticamente
  // (limitação atual) — o erro fica visível na fila pra correção manual.
  if (ferti && !(await linhaJaGravadaExata(TABLES.registroFerti, REGISTRO_FERTI_COLUMNS, REGISTRO_FERTI_COMPUTED, ferti))) {
    await addTableRow(TABLES.registroFerti, ferti);
  }
  if (
    financeiro &&
    !(await linhaJaGravadaExata(TABLES.financeiro, FINANCEIRO_COLUMNS, FINANCEIRO_IGNORAR_NA_COMPARACAO, financeiro))
  ) {
    await addTableRow(TABLES.financeiro, financeiro);
  }
  if (pulverizacao && !(await linhaJaGravadaExata(TABLES.pulverizacao, REGISTRO_PULVERIZACAO_COLUMNS, REGISTRO_PULVERIZACAO_COMPUTED, pulverizacao))) {
    await addTableRow(TABLES.pulverizacao, pulverizacao);
  }

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
