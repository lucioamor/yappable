# Plano — streaming do áudio ElevenLabs com cache local e histórico

Status: fases 1–2 implementadas em `your-ai`; fase 3 = opção B (sem streaming, decidido); fase 4 pendente · Alvo: `yappable-for-your-ai` primeiro, depois `yappable-for-lovable` · Origem: PR #4 do `yappable-for-lovable` (fechado por estar defasado)

## Objetivo

Hoje a narração ElevenLabs espera o MP3 inteiro chegar antes de tocar, e o cache de
áudio fica só em memória. Três ganhos:

1. **Começar a tocar antes** — streaming do MP3 enquanto chega.
2. **Não gastar caracteres de novo** — cache persistente em IndexedDB.
3. **Histórico de narrações** — replay, download, copiar texto, abrir página de origem,
   apagar áudio e registro separadamente.

## Referência

O PR #4 do `yappable-for-lovable` implementou isso sobre a v0.2.0, incluindo um plano
de 945 linhas. O branch foi apagado, mas os commits continuam acessíveis pelo PR:

```bash
git fetch origin pull/4/head:ref/pr4
git show ref/pr4:2026-06-23-update-to-straming-audio.md
git show ref/pr4:offscreen/offscreen-audio-player.js
git show ref/pr4 -- src/background.js popup/popup.js tests/qa.test.js
```

Usar como referência de arquitetura. Não mergear: `content.js`, popup e manifest
mudaram demais desde então (1.0.0 e split da 1.3.0).

## Arquitetura do PR #4 (resumo)

- **Offscreen document** (MV3, permissão `offscreen`, `minimum_chrome_version: 116`)
  toca o áudio via `MediaSource`, alimentado pelo stream da API
  (`/v1/text-to-speech/{voice}/stream`).
- **Chave de cache** = hash de texto + voz + modelo + `output_format` + voice settings
  + seed + normalização + idioma.
- **IndexedDB** guarda blobs MP3 completos, com limite de tamanho e expurgo dos mais
  antigos.
- **Fallback explícito** para download do MP3 inteiro se o streaming falhar.
- `output_format` vem sempre da qualidade salva pelo usuário (streaming e fallback
  usam a mesma fonte).
- Controles de privacidade no popup: desligar histórico, limpar cache.

## Atenção específica ao `yappable-for-your-ai`

- O player atual (`src/media-hook.js`, `src/player-ui.js`) oferece **pause, seek e
  velocidade com pitch preservado** a partir de um blob WAV. Streaming via
  `MediaSource` complica seek/velocidade. Decidir antes:
  - opção A: streaming só para o início; ao terminar o download, trocar para o blob
    completo e liberar seek;
  - opção B: manter blob completo (sem streaming) e fazer só cache + histórico.
- Existe uma **fila única de voz entre abas** ("one voice at a time across tabs").
  Mover a reprodução para um offscreen document pode simplificar isso (um player
  central), mas muda a arquitetura da fila — avaliar junto.
- `fetchEleven` em `src/chat-narrator.js` gera o áudio antes de ganhar a vez na fila;
  manter esse comportamento (pré-geração) ao introduzir cache.

## Fases sugeridas

1. **Cache persistente** (IndexedDB) com a chave completa e limite de tamanho. Ganho
   imediato, pouco risco, não mexe no player.
2. **Histórico** no popup: listar, replay, download, copiar, abrir origem, apagar;
   opção para desligar histórico e limpar tudo. Atualizar política de privacidade.
3. **Streaming** (opção A ou B acima), com fallback para MP3 inteiro.
4. **Portar para `yappable-for-lovable`.**

## Validação

- `node --check` em todos os `.js`;
- testes de unidade para a chave de cache (mudar qualquer parâmetro gera chave nova);
- mesmo texto narrado duas vezes → segunda vez sem chamada à API (ver aba Network);
- streaming: áudio começa antes do download terminar; falha no stream cai no fallback;
- histórico: apagar áudio mantém o registro e vice-versa; limpar tudo zera o IndexedDB.
