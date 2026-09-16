// ============================================================================
// CONFIGURAÇÃO DO APP — preencha estes valores antes de publicar
// Veja README.md → "1. Registrar o app no Azure AD" para saber onde pegar cada um
// ============================================================================
const APP_CONFIG = {
  // Client ID (Application ID) do app registrado no Azure AD / Entra ID
  clientId: "ed709a67-524b-43cb-9838-0d925e183d8a",

  // Mesmo o app estando registrado no tenant da Peterfrut, usamos "common" porque
  // o tipo de conta escolhido no registro foi "Todos os usuários da conta Microsoft"
  // (inclui contas pessoais como a do Hotmail que é dona do arquivo). Se usássemos o
  // Tenant ID da Peterfrut aqui, só contas @peterfrut.com.br conseguiriam logar.
  tenant: "common",

  // URL exata onde este app vai ficar publicado (deve bater com o "Redirect URI" cadastrado no Azure AD)
  // Ex: "https://seunome.github.io/app-campo/" — TEM que terminar com "/"
  redirectUri: window.location.origin + window.location.pathname,

  // fileItemId e driveId NÃO são mais preenchidos aqui manualmente.
  // Na primeira vez que o app abre, ele mostra uma tela para você escolher o arquivo
  // direto da lista do seu OneDrive, e guarda a escolha neste aparelho (localStorage).
  // Veja js/fileSelector.js.

  // Permissões (scopes) que o app pede ao usuário
  scopes: ["Files.ReadWrite", "User.Read"],
};

// Número de versão exibido em letras miúdas no cabeçalho do app — só pra dar
// pra conferir visualmente (numa captura de tela, por exemplo) se o celular
// já está rodando o código mais novo depois de um deploy, sem precisar abrir
// o console. Sempre que mudar algo, atualize aqui E o CACHE_NAME em
// service-worker.js (os dois números não precisam ser o mesmo, só sempre subir).
const APP_VERSION = "v08";

// Nomes das Tabelas do Excel (definidos na planilha — não altere a menos que renomeie as tabelas lá)
const TABLES = {
  // O app grava DIRETO nas tabelas finais — sem passar pela aba "Apontamentos"
  // (que era só uma caixa de entrada temporária, processada por uma macro no
  // Excel). Por decisão do usuário, essa etapa intermediária foi removida:
  // a validação passou a ser 100% responsabilidade do app.
  registroInventario: "Tabela2", // aba "Registro de Inventario" — tabela principal de estoque
  registroFerti: "Tabela216", // aba "Registro Ferti" — detalhe por setor de aplicações de Ferti
  financeiro: "Financeiro", // aba "Financeiro" — contas a pagar geradas por Compra
  ordens: "Ordens",
  produtos: "Tabela613", // aba "Cadastro de Produtos E Estoque." — insumos (defensivos/fertilizantes)
  produtosVenda: "ProdVenda", // lista de produtos vendáveis (aba "Cadastro de Vendas")
  operacao: "Operacao",
  fornecedor: "Fornecedor",
  estufas: "Estufas",
  meeiros: "Meeiros",
  cliente: "Cliente",
  setor: "Setor",
  plantio: "Plantio", // usado pra achar o plantio ATIVO de cada estufa (obrigatório em Uso/Ferti/Venda)
  setoresFerti: "Setores", // aba "Setores Ferti" — nº de plantas por setor/plantio, usado pra calcular a Fertirrigação sozinho
};

