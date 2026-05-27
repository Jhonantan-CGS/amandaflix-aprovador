# AmandaFlix Aprovador PWA

Este web app e o painel dos pais para aprovar ou rejeitar reproducoes.

## Publicacao no GitHub Pages

1. Crie um projeto Firebase com Firestore.
2. Copie as credenciais Web para `firebase-config.js`.
3. Publique a pasta `approval-pwa` no GitHub Pages.
4. Use a mesma `projectId`, `apiKey` e colecao no worker/proxy `workerContent.js`.

## Colecao Firestore

Colecao padrao: `amandaflixApprovalRequests`.

Campos principais:
- `id`
- `status`: `pending`, `approved`, `rejected`
- `title`
- `type`
- `category`
- `rating`
- `createdAt`
- `updatedAt`
- `decidedAt`

## Observacao

GitHub Pages hospeda o PWA, mas a fila em tempo real fica no Firebase Firestore.
