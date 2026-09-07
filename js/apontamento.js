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

// Extrai o número do "Setor" (ex.: "Setor 3", "setor 3" -> 3) — a planilha
// grafa com maiúscula/minúscula inconsistente, mas o número é o que importa.
function numeroDoSetor(texto) {
  const m = String(texto || "").match(/\d+/);
  return m ? Number(m[0]) : null;
}

// Quantas plantas cada setor da estufa tem no PLANTIO ATIVO (aba "Setores
// Ferti") — essa aba guarda o histórico de todos os plantios, então filtra
// pelo mesmo plantio que plantiosAtivos() já usa em outras validações, senão
// misturaria setores de safras antigas com a atual.
function setoresDoPlantioAtivo(lookups, estufaNome) {
  const plantioAtivo = plantiosAtivos(lookups, estufaNome)[0];
  if (!plantioAtivo) return [];
  return (lookups.setoresFerti || [])
    .filter((s) => s["Estufa"] === estufaNome && s["Plantio"] === plantioAtivo)
    .map((s) => ({ setor: numeroDoSetor(s["Setor"]), plantas: Number(s["Plantas"]) || 0 }))
    .filter((s) => s.setor && s.setor >= 1 && s.setor <= 6)
    .sort((a, b) => a.setor - b.setor);
}

// Arredonda pra centena de grama mais próxima (ex.: 620 -> 600, 660 -> 700) —
// a pedido do usuário: balança de campo não pesa de grama em grama, e a
// centena redonda facilita a leitura tanto no card quanto no relatório do
// WhatsApp. Usado em todo lugar que mostra ou grava quantidade de Ferti.
function arredondarGramasFerti(valor) {
  return Math.round((Number(valor) || 0) / 100) * 100;
}

// Quanto de produto cada setor recebe numa Fertirrigação: plantas do setor ÷
// 1.000 × dosagem informada (mesma fórmula da aba "Registro Ferti", coluna
// "Setor N"). Devolve um objeto { "Qtde Setor 1": valor, ... } pronto pra
// entrar em `fields` — setor sem planta ativa fica null (planilha ignora).
function calcularSetoresFerti(lookups, estufaNome, dosagem) {
  const dosagemNum = Number(dosagem) || 0;
  const resultado = {};
  SETOR_FIELDS.forEach((_, i) => (resultado[`Qtde Setor ${i + 1}`] = null));
  setoresDoPlantioAtivo(lookups, estufaNome).forEach((s) => {
    resultado[`Qtde Setor ${s.setor}`] = arredondarGramasFerti((s.plantas / 1000) * dosagemNum);
  });
  return resultado;
}

// Data de plantio do PLANTIO ATIVO da estufa (aba "Plantio") — usada pra
// calcular o D.A.T (dias após transplantio) sozinho, sem o usuário ter que
// contar na mão. Vem como serial Excel (mesmo formato de "Data").
function dataPlantioAtiva(lookups, estufaNome) {
  const plantioAtivo = plantiosAtivos(lookups, estufaNome)[0];
  if (!plantioAtivo) return null;
  const linha = (lookups.plantio || []).find(
    (p) => p["Estufa"] === estufaNome && p["Plantio"] === plantioAtivo && p["Data Plantio"]
  );
  return linha ? Number(linha["Data Plantio"]) : null;
}

// D.A.T = data do lançamento − data de plantio do plantio ativo, em dias.
function calcularDAT(lookups, estufaNome, dataFormulario) {
  if (!estufaNome || !dataFormulario) return null;
  const dataPlantio = dataPlantioAtiva(lookups, estufaNome);
  if (dataPlantio === null) return null;
  const serialForm = toExcelSerial(dataFormulario);
  return Math.max(0, Math.round(serialForm - dataPlantio));
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
    // Uso consome do estoque físico do insumo — nunca deixa lançar algo que
    // deixaria o saldo negativo (nem quando já está zerado, nem quando a
    // quantidade pedida é maior do que o que resta).
    if (bloco === "Uso") {
      const estoqueAtual = Number(encontrado["Estoque"]) || 0;
      if (estoqueAtual <= 0) {
        return `${fields["Produto"]} está sem estoque disponível`;
      }
      const totalProduto = calcularQtdeUso(fields, encontrado["Dosagem ML/20LT"]);
      if (totalProduto > estoqueAtual) {
        return `${fields["Produto"]}: quantidade pedida (${totalProduto.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}) é maior que o estoque disponível (${estoqueAtual.toLocaleString("pt-BR", { maximumFractionDigits: 3 })})`;
      }
    }
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

// Quanto do produto (coluna K) uma aplicação de Uso realmente consome —
// mesma fórmula usada tanto pra validar estoque antes de enviar quanto pra
// montar a linha final gravada, garantindo que as duas contas nunca divirjam.
// `dosagemPadrao` é a dosagem cadastrada no produto (ml/20L), Tabela613.
function calcularQtdeUso(fields, dosagemPadrao) {
  dosagemPadrao = Number(dosagemPadrao) || 0;
  const dosagemAlterada = Number(fields["Alterar dosagem para:"]) || 0;
  const quantidadeLitros = Number(fields["Quantidade"]) || 0;
  if (dosagemPadrao + dosagemAlterada === 0) return quantidadeLitros;
  if (dosagemAlterada > 0) return (quantidadeLitros / 20) * dosagemAlterada / 1000;
  return (quantidadeLitros / 20) * dosagemPadrao / 1000;
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
      tipoProduto = p[acharChaveGrupo(lookups.produtos)]; // classificação (DEFENSIVO/FOLIARES/...)
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
    const quantidadeLitros = Number(fields["Quantidade"]) || 0;
    const totalProduto = calcularQtdeUso(fields, dosagemPadrao);
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
