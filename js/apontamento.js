// ============================================================================
// REGRAS DE NEGÓCIO — validação e montagem das linhas gravadas DIRETO nas
// tabelas finais (Registro de Inventario / Registro Ferti / Financeiro).
//
// Histórico: a versão anterior gravava numa aba "Apontamentos" (só uma fila
// de entrada) e dependia de uma fórmula "Validação" + uma macro no Excel pra
// só então lançar no Registro de Inventario. Por decisão do usuário, essa
// etapa intermediária foi removida — o app grava direto, e por isso assume
// 100% da validação que antes era feita pela planilha (replicada aqui a
// partir da macro VBA original "Motor"/"mdlLancamento").
// ============================================================================

// --- Colunas das tabelas de destino, na ordem exata da planilha real -------

const REGISTRO_INVENTARIO_COLUMNS = [
  "Código", "Tipo Movimentação", "Data", "Código Estufa", "Estufa", "Código Meeiro", "Meeiro",
  "Tipo", "Descricao", "Volume Calda", "Qtde.", "Valor Entrada", "Operação", "Fornecedor",
  "Nota Fiscal", "Plantio", "Complemento", "Seq", "Total Entrada", "Custo Medio saida",
  "Total Saida", "Cliente", "Total Venda", "Venda Liquida", "Valor Caixa", "Total Caixa",
  "Status", "Estação", "Data Vencimento", "Origem", "Usuario", "Gravado em", "Valor Unit. Venda",
];
// Colunas que a PRÓPRIA TABELA calcula (fórmula) — o app nunca escreve nelas.
const REGISTRO_INVENTARIO_COMPUTED = new Set([
  "Total Entrada", "Custo Medio saida", "Total Saida", "Total Caixa", "Estação",
]);

const REGISTRO_FERTI_COLUMNS = [
  "Data", "Estufa", "Produto", "Dosagem", "Setor 1", "Setor 2", "Setor 3",
  "Setor 4", "Setor 5", "Setor 6", "Total", "Plantio", "D.A.T", "Meeiro",
];
const REGISTRO_FERTI_COMPUTED = new Set(["Total"]);

const FINANCEIRO_COLUMNS = [
  "Seq Inventario", "Data Compra", "Data Vencimento", "Fornecedor", "Nota Fiscal", "Produto",
  "Qtde.", "Valor Unit.", "Valor Total", "Status", "Data Pagamento", "Valor Pago",
  "Dias em Atraso", "Pagador", "Origem", "Usuario", "Gravado em",
];
const FINANCEIRO_COMPUTED = new Set(["Data Pagamento", "Valor Pago", "Dias em Atraso"]);

function montarLinha(colunas, computadas, valores) {
  return colunas.map((col) => {
    if (computadas.has(col)) return null;
    const v = valores[col];
    return v === undefined ? null : v;
  });
}

// Converte data JS/string para o serial numérico do Excel (evita ambiguidade de fuso).
function toExcelSerial(dateInput) {
  const d = typeof dateInput === "string" ? new Date(dateInput + "T00:00:00") : dateInput;
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const utcDate = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  return Math.round((utcDate - excelEpoch) / 86400000);
}

// Como acima, mas preservando a hora (usado em "Gravado em"). Usa os campos
// LOCAIS da data (getFullYear/getHours/...), não o instante UTC absoluto —
// senão o horário gravado fica ~3h à frente do horário do Brasil (o Excel
// não guarda fuso horário, só o número "de fachada" que se vê na tela).
function toExcelSerialDateTime(date) {
  const excelEpoch = Date.UTC(1899, 11, 30);
  const comoSeFosseUTC = Date.UTC(
    date.getFullYear(), date.getMonth(), date.getDate(),
    date.getHours(), date.getMinutes(), date.getSeconds()
  );
  return (comoSeFosseUTC - excelEpoch) / 86400000;
}

// Campos obrigatórios por bloco (entrada do usuário, antes de qualquer cálculo).
const REQUIRED_FIELDS = {
  Uso: ["Bloco", "Data", "Código Meeiro", "Código Estufa", "Produto", "Operação", "Quantidade"],
  Ferti: ["Bloco", "Data", "Código Meeiro", "Código Estufa", "Produto", "Dosagem Ferti"], // + ao menos 1 setor
  Venda: ["Bloco", "Data", "Código Meeiro", "Código Estufa", "Produto", "Operação", "Quantidade", "Valor Unitário", "Cliente"],
  Compra: ["Bloco", "Data", "Produto", "Operação", "Quantidade", "Valor Unitário", "Fornecedor"],
};

const SETOR_FIELDS = ["Qtde Setor 1", "Qtde Setor 2", "Qtde Setor 3", "Qtde Setor 4", "Qtde Setor 5", "Qtde Setor 6"];

function achar(lista, prop, valor) {
  return (lista || []).find((x) => x[prop] === valor);
}
function acharPorCod(lista, cod) {
  return (lista || []).find((x) => String(x.__cod) === String(cod));
}

// Acha o(s) plantio(s) ATIVO(s) de uma estufa (por nome). Espelha a checagem
// da macro original: precisa existir exatamente UM plantio Ativo — nenhum ou
// mais de um bloqueia o lançamento (evita registrar na safra errada).
function plantiosAtivos(lookups, estufaNome) {
  const rows = (lookups.plantio || []).filter(
    (p) => p["Estufa"] === estufaNome && String(p["Status"]).trim().toLowerCase() === "ativo"
  );
  const labels = [...new Set(rows.map((p) => p["Plantio"]).filter(Boolean))];
  return labels;
}

// Validação client-side — ÚNICA linha de defesa agora que o app grava direto
// (não existe mais uma fórmula "Validação" da planilha conferindo depois).
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

  if (!lookups) return null;

  if (fields["Código Meeiro"] && !acharPorCod(lookups.meeiros, fields["Código Meeiro"])) {
    return "Meeiro inexistente";
  }
  if (fields["Código Estufa"] && !acharPorCod(lookups.estufas, fields["Código Estufa"])) {
    return "Estufa inexistente";
  }
  if (fields["Produto"]) {
    // Na Venda, o produto vem do Cadastro de Vendas (ProdVenda) — não do
    // cadastro geral de insumos (Tabela613), que é outra lista.
    const encontrado =
      bloco === "Venda" ? achar(lookups.produtosVenda, "Tipo", fields["Produto"]) : achar(lookups.produtos, "Produto", fields["Produto"]);
    if (!encontrado) return "Produto inexistente";
  }
  if (fields["Operação"] && bloco !== "Venda" && !achar(lookups.operacoes, "Operação", fields["Operação"])) {
    return "Operação inexistente";
  }

  // Plantio: obrigatório pra Uso/Ferti/Venda (não pra Compra, que não é por estufa).
  if (bloco !== "Compra" && fields["Código Estufa"]) {
    const estufa = acharPorCod(lookups.estufas, fields["Código Estufa"]);
    const estufaNome = estufa ? estufa["Estufa"] : null;
    if (estufaNome) {
      const labels = plantiosAtivos(lookups, estufaNome);
      if (labels.length === 0) return `Plantio não localizado para a estufa ${estufaNome}`;
      if (labels.length > 1) {
        return `A estufa ${estufaNome} tem mais de um PLANTIO Ativo. Encerre a safra anterior antes de lançar.`;
      }
    }
  }

  return null; // ok
}

// ============================================================================
// MONTAGEM DAS LINHAS FINAIS — espelha PreencheInventario/PreencheFerti/
// PreencheFinanceiro da macro "Motor" original.
// Devolve { inventario, ferti, financeiro, seq } prontos pra addTableRow.
// `seq` já vem calculado (próximo número livre) e é usado em Inventario e,
// se for Compra, também no Financeiro (pra ligar os dois registros).
// ============================================================================
function prepararRegistro(fields, lookups, seq, usuario) {
  const bloco = fields["Bloco"];
  const agora = new Date();

  const estufa = fields["Código Estufa"] ? acharPorCod(lookups.estufas, fields["Código Estufa"]) : null;
  const meeiro = fields["Código Meeiro"] ? acharPorCod(lookups.meeiros, fields["Código Meeiro"]) : null;
  const estufaNome = estufa ? estufa["Estufa"] : null;
  const meeiroNome = meeiro ? meeiro["Meeiro"] : null;
  const plantioLabel = estufaNome ? (plantiosAtivos(lookups, estufaNome)[0] || null) : null;

  // Código/Tipo(classificação)/Descrição do produto — fonte depende do bloco:
  // Venda usa a ProdVenda (Cadastro de Vendas); os demais usam a Tabela613
  // (Cadastro de Produtos E Estoque).
  let codigoProduto = null, tipoProduto = null, descricaoProduto = null, dosagemPadrao = 0;
  if (bloco === "Venda") {
    const p = achar(lookups.produtosVenda, "Tipo", fields["Produto"]);
    if (p) {
      codigoProduto = p["Cod."];
      tipoProduto = p["GRUPO"]; // classificação (ex.: PIMENTAO/TOMATE)
      descricaoProduto = p["Tipo"]; // nome do produto (ex.: P.VERMELHO) — cabeçalho confuso, é da planilha original
    }
  } else {
    const p = achar(lookups.produtos, "Produto", fields["Produto"]);
    if (p) {
      codigoProduto = p["Código"];
      tipoProduto = p[" "]; // classificação (DEFENSIVO/FOLIARES/...) — coluna sem nome na planilha original
      descricaoProduto = p["Produto"];
      dosagemPadrao = Number(p["Dosagem ML/20LT"]) || 0;
    }
  }

  const base = {
    "Código": codigoProduto,
    "Data": toExcelSerial(fields["Data"]),
    "Tipo": tipoProduto,
    "Descricao": descricaoProduto,
    "Operação": fields["Operação"] || null,
    "Seq": seq,
    "Status": "Ativo",
    "Complemento": fields["Complemento"] || null,
    "Origem": "App Campo",
    "Usuario": usuario,
    "Gravado em": toExcelSerialDateTime(agora),
  };

  let inventario = { ...base };
  let ferti = null;
  let financeiro = null;

  if (bloco === "Uso") {
    const dosagemAlterada = Number(fields["Alterar dosagem para:"]) || 0;
    const quantidadeLitros = Number(fields["Quantidade"]) || 0;
    let totalProduto;
    if (dosagemPadrao + dosagemAlterada === 0) {
      totalProduto = quantidadeLitros;
    } else if (dosagemAlterada > 0) {
      totalProduto = (quantidadeLitros / 20) * dosagemAlterada / 1000;
    } else {
      totalProduto = (quantidadeLitros / 20) * dosagemPadrao / 1000;
    }
    Object.assign(inventario, {
      "Tipo Movimentação": "S",
      "Código Estufa": fields["Código Estufa"],
      "Estufa": estufaNome,
      "Código Meeiro": fields["Código Meeiro"],
      "Meeiro": meeiroNome,
      "Plantio": plantioLabel,
      "Volume Calda": quantidadeLitros,
      "Qtde.": totalProduto,
    });
  } else if (bloco === "Ferti") {
    const setores = SETOR_FIELDS.map((f) => Number(fields[f]) || 0);
    const totalFerti = setores.reduce((a, b) => a + b, 0);
    Object.assign(inventario, {
      "Tipo Movimentação": "S",
      "Código Estufa": fields["Código Estufa"],
      "Estufa": estufaNome,
      "Código Meeiro": fields["Código Meeiro"],
      "Meeiro": meeiroNome,
      "Plantio": plantioLabel,
      "Operação": "Saída Consumo",
      "Volume Calda": totalFerti,
      "Qtde.": totalFerti / 1000,
    });
    ferti = {
      "Data": toExcelSerial(fields["Data"]),
      "Estufa": estufaNome,
      "Produto": descricaoProduto,
      "Dosagem": Number(fields["Dosagem Ferti"]) || 0,
      "Setor 1": setores[0], "Setor 2": setores[1], "Setor 3": setores[2],
      "Setor 4": setores[3], "Setor 5": setores[4], "Setor 6": setores[5],
      "Plantio": plantioLabel,
      "D.A.T": Number(fields["D.A.T"]) || null,
      "Meeiro": meeiroNome,
    };
  } else if (bloco === "Venda") {
    const quantidade = Number(fields["Quantidade"]) || 0;
    const valorUnitario = Number(fields["Valor Unitário"]) || 0;
    const valorEmbalagem = Number(fields["Valor Embalagem"]) || 0;
    const totalVenda = quantidade * valorUnitario;
    const vendaLiquida = valorEmbalagem > 0 ? totalVenda - quantidade * valorEmbalagem : totalVenda;
    Object.assign(inventario, {
      "Tipo Movimentação": "V",
      "Código Estufa": fields["Código Estufa"],
      "Estufa": estufaNome,
      "Código Meeiro": fields["Código Meeiro"],
      "Meeiro": meeiroNome,
      "Plantio": plantioLabel,
      "Qtde.": quantidade,
      "Cliente": fields["Cliente"],
      "Valor Unit. Venda": valorUnitario,
      "Total Venda": totalVenda,
      "Venda Liquida": vendaLiquida,
      "Valor Caixa": valorEmbalagem,
    });
  } else if (bloco === "Compra") {
    const quantidade = Number(fields["Quantidade"]) || 0;
    const valorUnitario = Number(fields["Valor Unitário"]) || 0;
    Object.assign(inventario, {
      "Tipo Movimentação": "E",
      "Qtde.": quantidade,
      "Valor Entrada": valorUnitario,
      "Fornecedor": fields["Fornecedor"],
      "Nota Fiscal": fields["Nota Fiscal"] || null,
      "Data Vencimento": fields["Data Vencimento"] ? toExcelSerial(fields["Data Vencimento"]) : null,
    });
    financeiro = {
      "Seq Inventario": seq,
      "Data Compra": toExcelSerial(fields["Data"]),
      "Data Vencimento": fields["Data Vencimento"] ? toExcelSerial(fields["Data Vencimento"]) : null,
      "Fornecedor": fields["Fornecedor"],
      "Nota Fiscal": fields["Nota Fiscal"] || null,
      "Produto": descricaoProduto,
      "Qtde.": quantidade,
      "Valor Unit.": valorUnitario,
      "Valor Total": quantidade * valorUnitario,
      "Status": "A Pagar",
      "Origem": "App Campo",
      "Usuario": usuario,
      "Gravado em": toExcelSerialDateTime(agora),
    };
  }

  return {
    seq,
    inventario: montarLinha(REGISTRO_INVENTARIO_COLUMNS, REGISTRO_INVENTARIO_COMPUTED, inventario),
    ferti: ferti ? montarLinha(REGISTRO_FERTI_COLUMNS, REGISTRO_FERTI_COMPUTED, ferti) : null,
    financeiro: financeiro ? montarLinha(FINANCEIRO_COLUMNS, FINANCEIRO_COMPUTED, financeiro) : null,
  };
}
