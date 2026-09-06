// ============================================================================
// AUTENTICAÇÃO — MSAL.js (Microsoft Authentication Library)
// Login delegado do usuário de campo, para gravar no OneDrive em nome dele.
// ============================================================================

const msalConfig = {
  auth: {
    clientId: APP_CONFIG.clientId,
    authority: `https://login.microsoftonline.com/${APP_CONFIG.tenant}`,
    redirectUri: APP_CONFIG.redirectUri,
  },
  cache: {
    cacheLocation: "localStorage", // sobrevive a fechar o navegador — importante para reabrir o PWA offline
    storeAuthStateInCookie: false,
  },
};

const msalInstance = new msal.PublicClientApplication(msalConfig);
let activeAccount = null;

async function initAuth() {
  await msalInstance.initialize();
  const response = await msalInstance.handleRedirectPromise();
  if (response) {
    activeAccount = response.account;
  } else {
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) activeAccount = accounts[0];
  }
  return activeAccount;
}

async function login() {
  try {
    const result = await msalInstance.loginPopup({ scopes: APP_CONFIG.scopes });
    activeAccount = result.account;
    return activeAccount;
  } catch (e) {
    // Popup pode ser bloqueado em navegadores de celular — cai para redirect
    await msalInstance.loginRedirect({ scopes: APP_CONFIG.scopes });
  }
}

function logout() {
  msalInstance.logoutRedirect();
}

// Retorna um access token válido, renovando silenciosamente quando possível.
// Se estiver offline, lança erro — quem chamar deve tratar (ex: enfileirar apontamento).
async function getAccessToken() {
  if (!activeAccount) throw new Error("Usuário não autenticado");
  const request = { scopes: APP_CONFIG.scopes, account: activeAccount };
  try {
    const result = await msalInstance.acquireTokenSilent(request);
    return result.accessToken;
  } catch (e) {
    if (!navigator.onLine) {
      throw new Error("OFFLINE");
    }
    // Token expirado e não foi possível renovar silenciosamente — pede login de novo
    const result = await msalInstance.acquireTokenPopup(request).catch(() =>
      msalInstance.acquireTokenRedirect(request)
    );
    return result.accessToken;
  }
}

function isLoggedIn() {
  return !!activeAccount;
}

function getUserDisplayName() {
  return activeAccount ? (activeAccount.name || activeAccount.username) : null;
}
