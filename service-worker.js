// ============================================================================
// SERVICE WORKER — cacheia apenas o "app shell" (HTML/CSS/JS/ícones) para o
// app abrir offline. Chamadas à Microsoft Graph e ao login NUNCA passam por
// aqui (network-only), porque dados sempre precisam ser os mais recentes
// possíveis e o app já trata offline por conta própria (fila em IndexedDB).
// ============================================================================

// IMPORTANTE: mude este número sempre que qualquer arquivo do app mudar.
// É a MUDANÇA NO TEXTO deste arquivo que faz o navegador perceber que existe
// uma versão nova do Service Worker e buscar tudo de novo — se só os outros
// arquivos (js/*.js) mudarem e este número não mudar, o navegador pode
// continuar servindo os arquivos antigos do cache indefinidamente.
const CACHE_NAME = "app-campo-shell-v29";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/vendor/msal-browser.min.js",
  "./js/config.js",
  "./js/auth.js",
  "./js/graph.js",
  "./js/db.js",
  "./js/apontamento.js",
  "./js/sync.js",
  "./js/combobox.js",
  "./js/app.js",
  "./js/screens/fileSelector.js",
  "./js/screens/ordens.js",
  "./js/screens/ordemCard.js",
  "./js/screens/apontamentoLivre.js",
  "./js/screens/estoque.js",
  "./js/screens/fila.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Nunca interceptar Microsoft Graph, login ou qualquer domínio externo — sempre rede.
  if (url.origin !== self.location.origin) return;

  // Rede primeiro, cache só como reserva pra funcionar offline em campo.
  // (Antes era "cache primeiro", o que fazia o app continuar rodando código
  // antigo por tempo indefinido depois de cada atualização, mesmo com o
  // arquivo novo já publicado no GitHub — essa troca evita esse problema.)
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        return res;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
  );
});
