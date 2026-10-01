# Plano — permissão opcional do ElevenLabs (menos avisos na instalação)

Status: proposta · Alvo: `yappable-for-your-ai` primeiro, depois `yappable-for-lovable` · Origem: PR #3 do `yappable-for-lovable` (fechado por estar defasado)

## Objetivo

Hoje os dois manifests pedem `https://api.elevenlabs.io/*` como `host_permissions`
obrigatória. Todo usuário vê esse aviso ao instalar, mesmo quem só usa a voz nativa
(padrão: `engine: "native"`). Mover o ElevenLabs para `optional_host_permissions` e
pedir acesso só quando o usuário ativar o ElevenLabs.

## Referência

O PR #3 do `yappable-for-lovable` implementou isso sobre a v0.2.0. O branch foi
apagado, mas os commits continuam acessíveis pelo PR:

```bash
git fetch origin pull/3/head:ref/pr3
git show ref/pr3 -- manifest.json popup/popup.js popup/onboarding.js
```

Usar só como referência de abordagem. O `content.js` daquele PR está muito
defasado (antes da 1.0.0 e do split da 1.3.0) e não deve ser mergeado.

## Passos — `yappable-for-your-ai`

1. **`manifest.json`**: tirar `https://api.elevenlabs.io/*` de `host_permissions` e
   criar `"optional_host_permissions": ["https://api.elevenlabs.io/*"]`.
2. **Popup — pedir acesso no gesto do usuário**: `chrome.permissions.request` precisa
   rodar dentro de um handler de clique. Pontos:
   - botão de engine ElevenLabs (`segEleven` → `setEngine("elevenlabs")`, `popup/popup.js:242`);
   - salvar/validar a API key (fluxo de `auth.providers.elevenlabs`, ~`popup/popup.js:130`).
   Se o usuário negar: voltar para `native` e mostrar mensagem curta.
3. **Popup — lista de vozes** (`popup/popup.js:504`): checar
   `chrome.permissions.contains({ origins: ["https://api.elevenlabs.io/*"] })` antes do
   `fetch`; sem acesso, não chamar e mostrar estado "ElevenLabs não autorizado".
4. **Content script** (`src/chat-narrator.js:424`): o `fetch` roda no content script.
   Confirmar que continua funcionando com a permissão opcional concedida (content
   scripts herdam host permissions concedidas em runtime). Se não houver permissão,
   cair no provider nativo em vez de tentar e falhar.
5. **Usuários existentes**: a expectativa é que a permissão já concedida continue
   valendo após o update quando ela vira opcional. Confirmar em teste: instalar a
   versão atual, atualizar para a nova, verificar que o ElevenLabs segue funcionando
   sem novo pedido. Se não seguir, detectar a falta de permissão e pedir no popup.
6. **Docs**: atualizar `docs/privacy-policy.md` e `docs/chrome-store-listing.md`
   (justificativa de permissões).

## Passos extras — `yappable-for-lovable`

Mesmos passos 1–6, mais:

- Trocar `declarativeNetRequest` por `declarativeNetRequestWithHostAccess` (a regra
  de áudio do Lovable continua ativa via host access de `lovable.dev`). Isso remove o
  aviso amplo de "bloquear conteúdo" na instalação.
- Fluxo de onboarding (`popup/onboarding.js`) também precisa pedir a permissão ao
  escolher ElevenLabs.

## Fora de escopo (ideias do PR #3 para avaliar depois, separadamente)

- detecção automática de idioma e amostras de voz por idioma;
- rótulos falados localizados e anúncios de erro traduzidos;
- tradução on-device com fila única, cache, timeout e cooldown;
- debounce do widget de tarefa e descarte de atualizações velhas.

## Validação

- `node --check` em todos os `.js` de `src/` e `popup/`;
- `manifest.json` parseia e tem a origem do ElevenLabs só em `optional_host_permissions`;
- instalação limpa: aviso só cita os sites de chat (ou `lovable.dev`);
- ativar ElevenLabs → prompt de permissão → narração funciona;
- negar → volta para nativo sem erro no console.
