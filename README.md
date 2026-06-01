# AmandaFlix Aprovador PWA

Painel familiar publicado no GitHub Pages. O PWA nao acessa o provedor e nao grava diretamente no Firestore.

## Seguranca

- A senha e validada pelo AmandaFlix Proxy Worker.
- O navegador armazena somente uma sessao temporaria em `sessionStorage`.
- Decisoes e historico ficam no Cloudflare D1.
- O worker e a unica camada autorizada a acessar o provedor e transmitir midia.

## Configuracao

Defina o endpoint publicado em `api-config.js` e publique esta pasta no GitHub Pages.
