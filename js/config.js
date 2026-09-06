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

// Nomes das Tabelas do Excel (definidos na planilha — não altere a menos que renomeie as tabelas lá)
const TABLES = {
  apontamentos: "Apontamentos",
  ordens: "Ordens",
  produtos: "Tabela613",
  operacao: "Operacao",
  fornecedor: "Fornecedor",
  estufas: "Estufas",
  meeiros: "Meeiros",
  cliente: "Cliente",
  setor: "Setor",
};

const SHEETS = {
  apontamentos: "Apontamentos",
  ordens: "Ordens de Aplicacao",
  produtos: "Cadastro de Produtos E Estoque.",
  cadastrosGerais: "Cadastros Gerais",
  registroInventario: "Registro de Inventario",
};
