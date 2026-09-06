# App de Campo — Controle Sitio EPI 2026

App web (PWA) que implementa as 5 telas da especificação da aba **"Spec App Campo"**
da planilha, gravando apontamentos diretamente no arquivo Excel via **Microsoft
Graph API**, sem passar por nenhum servidor intermediário — o app fala direto
com o OneDrive/SharePoint onde o arquivo está guardado.

Funciona offline (fila local em IndexedDB) e pode ser instalado na tela inicial
do celular/tablet como um app nativo.

---

## Antes de publicar: 3 passos obrigatórios

### 1. Registrar o app no Azure AD (Entra ID)

Isso é necessário para que o Excel "reconheça" o app e permita login. Leva
uns 5 minutos e você só faz isso uma vez.

1. Acesse **https://entra.microsoft.com** (ou portal.azure.com → "Microsoft Entra ID")
   com a conta que é dona do arquivo (ou uma conta de administrador, se for
   OneDrive for Business/SharePoint da Peterfrut).
2. Vá em **Aplicativos > Registros de aplicativo > Novo registro**.
3. Nome: `App de Campo` (ou o que preferir).
4. Tipos de conta com suporte: se o arquivo está num OneDrive **pessoal**,
   escolha "Contas em qualquer diretório organizacional e contas pessoais
   da Microsoft". Se está no OneDrive **corporativo/SharePoint da Peterfrut**,
   escolha "Contas somente neste diretório organizacional".
5. Em **URI de redirecionamento**, escolha tipo **SPA (Single-page application)**
   e cole a URL exata onde o app vai ficar publicado, terminando com `/`
   (ex: `https://seunome.github.io/app-campo/`). Você pode adicionar mais de
   uma (ex: uma para testar local e outra para produção).
6. Clique em Registrar. Copie o **"ID do aplicativo (cliente)"** — esse é o
   `clientId` que vai no arquivo `js/config.js`.
7. Vá em **Permissões de API > Adicionar uma permissão > Microsoft Graph >
   Permissões delegadas** e adicione:
   - `Files.ReadWrite`
   - `User.Read`
   Se for conta corporativa, pode ser necessário um admin clicar em
   **"Conceder consentimento do administrador"**.

### 2. Preencher `js/config.js`

Abra `js/config.js` e preencha:
- `clientId`: o ID copiado no passo anterior.
- `tenant`: `"common"` (funciona tanto para contas pessoais quanto corporativas,
  desde que o tipo de conta do registro inclua ambas).
- `redirectUri`: já é preenchido automaticamente com a URL onde o app está
  rodando — só confirme que bate com o que foi cadastrado no Azure AD.

**Não é preciso descobrir nenhum "Item ID" manualmente.** Na primeira vez que
o app abrir (depois de publicado), ele mostra uma tela de busca que lista os
arquivos do OneDrive do usuário logado — basta clicar no arquivo certo, e o
app guarda essa escolha naquele aparelho (em `localStorage`). Cada pessoa que
usar o app faz essa escolha uma vez, no primeiro uso.

---

## Publicar o app

Qualquer hospedagem de arquivos estáticos com HTTPS serve. Duas opções simples:

**GitHub Pages** (grátis):
1. Crie um repositório no GitHub e suba esta pasta inteira.
2. Em Settings → Pages, ative o GitHub Pages apontando para a branch `main`.
3. A URL final (algo como `https://seunome.github.io/app-campo/`) precisa
   ser exatamente a que você cadastrou como Redirect URI no Azure AD.

**Azure Static Web Apps** (grátis, e fica no mesmo ecossistema Microsoft):
1. No portal Azure, crie um "Static Web App" apontando para este repositório.
2. Copie a URL gerada e cadastre como Redirect URI no Azure AD.

Depois de publicado, no celular: abra a URL no navegador (Chrome/Safari) →
menu → **"Adicionar à tela inicial"** (ou vai aparecer um banner de instalação
automaticamente). Isso instala o PWA como um ícone de app normal.

---

## Como o app grava na planilha

Segue exatamente o princípio da especificação: **o app nunca escreve no
Registro de Inventario — só na aba Apontamentos.** O motor VBA que já existe
na planilha continua responsável por ler as linhas com coluna `Validação = OK`
e transferir para o inventário (isso não muda; o app não interfere nessa parte).

Fluxo técnico de cada gravação:
1. App monta a linha completa (43 colunas) deixando em branco as colunas que
   a própria planilha calcula (Meeiro, Estufa, Tipo, Total Produto, Validação, etc.)
2. Envia via Graph API (`workbook/tables('Apontamentos')/rows/add`).
3. Pede ao Excel Online para recalcular (`workbook/application/calculate`).
4. Relê a linha gravada para conferir a coluna `Validação`. Se vier diferente
   de "OK", o apontamento fica na Fila com o erro devolvido pela própria
   planilha — igual o app nunca teria mandado.

**Importante — teste isso primeiro:** colunas calculadas em Tabelas do Excel
(como `Fórmula` aplicada em toda a coluna) normalmente se auto-preenchem
quando uma linha nova é adicionada, mesmo via API — mas isso depende de como
cada coluna foi configurada na sua planilha. Recomendo testar um apontamento
de cada bloco (Uso/Ferti/Venda/Compra) logo de início e conferir se `Meeiro`,
`Estufa`, `Validação`, `Total Produto`, etc. vieram preenchidos certos. Se
alguma coluna não se autopreencheu, me avise o nome dela que ajusto o app
para reconstituir a fórmula manualmente antes de enviar.

---

## Decisões que tomei e que talvez você queira revisar

- **"Quem está lançando" (Meeiro logado):** a especificação assume que o app
  já sabe qual Meeiro está logado, mas o login é feito com uma conta
  Microsoft, que não tem relação direta com o cadastro de Meeiros da
  planilha. Resolvi isso com uma tela simples: no primeiro uso, o usuário
  escolhe seu nome numa lista (Cadastros Gerais → Meeiros) e isso fica salvo
  naquele aparelho. Se preferir outra lógica (ex: vincular por e-mail
  corporativo), me diga que ajusto.
- **"Recusar com justificativa" (T2):** a especificação não define uma coluna
  ou fluxo na planilha para registrar uma recusa (só fala em gravar
  apontamentos válidos). Por ora, uma recusa fica só registrada localmente
  no aparelho (aba Fila), sem virar linha em Apontamentos. Se quiser que a
  recusa também vire um registro na planilha, me diga onde ela deveria
  aparecer (nova coluna? aba própria?) que eu implemento.
- **Complemento como ID de idempotência:** para evitar apontamento duplicado
  ao reenviar, o app grava um identificador único do dispositivo dentro da
  coluna `Complemento` (ex: `#1725649200-x7f3a1`). Isso é visível para quem
  olhar a planilha — se preferir esconder isso em outra coluna, dá pra ajustar
  (a especificação já reserva justamente a coluna Z/Complemento para isso).

## Estrutura de arquivos

```
app-campo/
├── index.html            Estrutura das telas (login + shell + navegação)
├── manifest.json          Configuração do PWA (ícone, nome, modo standalone)
├── service-worker.js      Cache do app shell para funcionar offline
├── css/styles.css         Estilo (mobile-first)
├── icons/                 Ícones do app (placeholder — troque pela logo da Peterfrut se quiser)
└── js/
    ├── config.js          ← PREENCHER: clientId, tenant, fileItemId
    ├── auth.js            Login MSAL (Microsoft)
    ├── graph.js            Chamadas à API do Excel (ler/gravar tabelas)
    ├── db.js               IndexedDB: cache de listas + fila offline
    ├── apontamento.js      Monta a linha de 43 colunas por Bloco + validação
    ├── sync.js             Processa a fila e reenvia quando volta internet
    ├── app.js              Roteamento entre telas e inicialização
    └── screens/
        ├── ordens.js              T1 — Minhas Ordens
        ├── ordemCard.js           T2 — Card da Ordem
        ├── apontamentoLivre.js    T3 — Apontamento Livre
        ├── estoque.js             T4 — Consulta Estoque
        └── fila.js                T5 — Fila de Sincronização
```
