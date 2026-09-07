// ============================================================================
// REGRAS DE NEGÓCIO — montagem da linha de Apontamentos por Bloco e validação
// client-side (espelha a Seção 3 e 4 da aba "Spec App Campo" da planilha).
// A validação definitiva continua sendo a coluna AF, lida de volta após gravar.
// ============================================================================

// Ordem exata das 43 colunas da tabela Apontamentos (A:AQ)
const APONTAMENTOS_COLUMNS = [
  "Seq", "Bloco", "Data", "Código Meeiro", "Meeiro", "Código Estufa", "Estufa",
  "Produto", "Código Produto", "Tipo", "Dosagem ML/20LT", "Alterar dosagem para:",
  "Operação", "Tipo Movimentação", "Quantidade", "Total Produto", "Plantio",
  "Valor Unitário", "Valor Total", "Valor Embalagem", "Venda Líquida", "Cliente",
  "Data Vencimento", "Fornecedor", "Nota Fiscal", "Complemento", "Status",
  "Origem", "Usuario", "Gravado em", "Seq Inventario", "Validação", "Setor",
  "Dosagem Ferti", "D.A.T", "Qtde Setor 1", "Qtde Setor 2", "Qtde Setor 3",
  "Qtde Setor 4", "Qtde Setor 5", "Qtde Setor 6", "Total Ferti", "ID Ordem",
];

// Colunas que a PLANILHA calcula sozinha — o app nunca envia valor nelas.
// "Meeiro", "Estufa" e "Tipo" SAÍRAM daqui de propósito: o app já tem essas listas
// carregadas em memória (mesmos dados usados pra validar antes de enviar), então
// preencherNomesCalculados() manda o valor pronto em vez de depender de uma fórmula
// de VLOOKUP rodando de novo pra cada linha nova — menos fórmula, planilha mais leve.
const COMPUTED_COLUMNS = new Set([
  "Seq", "Código Produto", "Tipo Movimentação", "Total Produto",
  "Plantio", "Valor Total", "Venda Líquida", "Seq Inventario", "Validação", "Total Ferti",
]);
COMPUTED_COLUMNS.add("Dosagem ML/20LT"); // calculada, a menos que "Alterar dosagem para" seja usada

// Preenche "Meeiro", "Estufa" e "Tipo" a partir das listas já carregadas (lookups),
// espelhando os VLOOKUPs que a planilha faria sozinha — assim o app manda o valor
// pronto e a planilha não precisa recalcular isso a cada apontamento novo.
// Quando não encontra (ex.: produto de Venda que só existe na ProdVenda, não na
// Tabela613), deixa em branco de propósito: cai de volta pra fórmula da planilha,
// que vai continuar acusando "Produto inexistente" nesse caso, como já acontecia.
function preencherNomesCalculados(fields, lookups) {
  if (!lookups) return;
  if (fields["Código Meeiro"]) {
    const m = lookups.meeiros.find((x) => String(x.__cod) === String(fields["Código Meeiro"]));
    if (m) fields["Meeiro"] = m["Meeiro"];
  }
  if (fields["Código Estufa"]) {
    const e = lookups.estufas.find((x) => String(x.__cod) === String(fields["Código Estufa"]));
    if (e) fields["Estufa"] = e["Estufa"];
  }
  if (fields["Produto"]) {
    // Na planilha, a coluna "Tipo" (classificação: DEFENSIVO/FOLIARES/FERTIRRIGACAO...)
    // vem da Tabela613 (Cadastro de Produtos E Estoque), numa coluna cujo cabeçalho
    // é só um espaço em branco (" ") — herdado assim do arquivo original do usuário.
    const p = lookups.produtos.find((x) => x["Produto"] === fields["Produto"]);
    if (p && p[" "] !== undefined) fields["Tipo"] = p[" "];
  }
}

// Converte uma data JS (ou string yyyy-mm-dd) para o serial numérico do Excel.
// A API do Excel aceita string ISO também, mas serial evita ambiguidade de fuso/formatação.
function toExcelSerial(dateInput) {
  const d = typeof dateInput === "string" ? new Date(dateInput + "T00:00:00") : dateInput;
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const utcDate = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  return Math.round((utcDate - excelEpoch) / 86400000);
}

// Monta o array de 43 valores para enviar via addTableRow, a partir de um objeto
// { "Bloco": "Uso", "Data": "2026-09-06", "Código Meeiro": "M03", ... }
function buildApontamentoRow(fields) {
  return APONTAMENTOS_COLUMNS.map((col) => {
    if (COMPUTED_COLUMNS.has(col)) return null;
    const v = fields[col];
    return v === undefined ? null : v;
  });
}

// Campos obrigatórios por bloco, conforme Seção 3 da especificação.
const REQUIRED_FIELDS = {
  Uso: ["Bloco", "Data", "Código Meeiro", "Código Estufa", "Produto", "Operação", "Quantidade"],
  Ferti: ["Bloco", "Data", "Código Meeiro", "Código Estufa", "Produto", "Dosagem Ferti"], // + ao menos 1 setor
  Venda: ["Bloco", "Data", "Código Meeiro", "Código Estufa", "Produto", "Operação", "Quantidade", "Valor Unitário", "Cliente"],
  Compra: ["Bloco", "Data", "Produto", "Operação", "Quantidade", "Valor Unitário", "Fornecedor"],
};

const SETOR_FIELDS = ["Qtde Setor 1", "Qtde Setor 2", "Qtde Setor 3", "Qtde Setor 4", "Qtde Setor 5", "Qtde Setor 6"];

// Validação client-side ANTES de tentar enviar (bloqueia o pior caso ainda no app,
// sem gastar uma sincronização). Não substitui a leitura da coluna AF depois de gravar.
function validateBeforeSend(fields, lookups) {
  const bloco = fields["Bloco"];
  if (!bloco) return "Bloco não informado";

  const required = REQUIRED_FIELDS[bloco];
  if (!required) return `Bloco desconhecido: ${bloco}`;

  for (const f of required) {
    if (fields[f] === undefined || fields[f] === null || fields[f] === "") {
      return `Campo obrigatório faltando: ${f}`;
    }
  }

  if (bloco === "Ferti") {
    const algumSetor = SETOR_FIELDS.some((f) => Number(fields[f]) > 0);
    if (!algumSetor) return "Informe qtde por setor";
  } else {
    if (Number(fields["Quantidade"]) <= 0) return "Quantidade inválida";
  }

  if (lookups) {
    // Comparação por String() porque o <select> do formulário sempre devolve
    // texto, mas o "Codigo" na planilha vem como número via Graph API
    // (ex.: 3 !== "3" com === faria "Meeiro inexistente" mesmo estando certo).
    if (fields["Código Meeiro"] && !lookups.meeiros.some((m) => String(m.__cod) === String(fields["Código Meeiro"]))) {
      return "Meeiro inexistente";
    }
    if (fields["Código Estufa"] && !lookups.estufas.some((e) => String(e.__cod) === String(fields["Código Estufa"]))) {
      return "Estufa inexistente";
    }
    if (fields["Produto"]) {
      // Na Venda, a lista válida de produtos é a de "Cadastro de Venda" (coluna "Tipo").
      const listaValida =
        bloco === "Venda"
          ? (lookups.produtosVenda || []).some((p) => p["Tipo"] === fields["Produto"])
          : lookups.produtos.some((p) => p["Produto"] === fields["Produto"]);
      if (!listaValida) return "Produto inexistente";
    }
    if (fields["Operação"] && !lookups.operacoes.some((o) => o["Operação"] === fields["Operação"])) {
      return "Operação inexistente";
    }
  }

  return null; // ok
}
