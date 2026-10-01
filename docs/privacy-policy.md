# Yappable for your AI: Privacy Policy

Last updated: 2026-09-30

Yappable for your AI is a Chrome extension that reads finished AI chat replies aloud on ChatGPT, Claude,
Gemini and Grok.

## Information Yappable Processes

On `https://chatgpt.com/*`, `https://chat.openai.com/*`, `https://claude.ai/*`, `https://gemini.google.com/*`
and `https://grok.com/*`, Yappable reads the text of the **assistant's latest reply** once it has finished,
so it can read it aloud. It does not read your prompts, your conversation list or your account details,
and it does not store reply text.

Yappable stores in Chrome extension storage: your settings (engine, language, voices, per-site switches,
intro style, voice mode, player speed), local daily counters (words, minutes, replies), an optional ElevenLabs
API key and optional ElevenLabs voice metadata.

## Voice Modes

- **Site voice:** Yappable presses the site's own "read aloud" control, so the reply is spoken by that site's
  text-to-speech service, the same service you already use. On Claude and Gemini, Yappable can change the text
  the site sends to its own text-to-speech request (to add a spoken "reply from…" prefix, or to send a shorter
  on-device summary instead of the full reply). ChatGPT and Grok read the stored reply on their servers, so
  Yappable cannot change what they read.
- **Yappable voice:** the reply is optionally shortened on your device (Chrome Built-in AI) and spoken by your
  browser's native voice, or by ElevenLabs if you enabled it.

## Local Processing

By default Yappable uses native browser speech. The Chrome Built-in AI summary path runs locally in the browser
when available. Yappable does not send reply text to a remote summarization service. Yappable does not load
remote scripts, stylesheets or fonts.

## Optional ElevenLabs Processing

ElevenLabs access is an optional browser permission (`api.elevenlabs.io`). Yappable asks for it only when you
turn ElevenLabs on, and nothing is sent to ElevenLabs until you grant it.

If you add an ElevenLabs API key and select ElevenLabs as the voice engine, Yappable sends the reply text as it
will be spoken, plus voice settings, to ElevenLabs to generate audio. Your key is stored in `chrome.storage.local`
and is sent to ElevenLabs only for API authentication.

## Affiliate Links

Yappable may show an optional outbound affiliate link to ElevenLabs. It is not required to use the extension.
If you click it, your browser opens the destination site, which may receive the `utm_source=yappable` parameter.
Yappable uses `rel="noopener noreferrer"` and does not store click history.

## What Yappable Does Not Do

Yappable does not collect analytics, sell data, run ad networks, retarget users, broker data, determine
credit-worthiness, or track browsing outside the chat sites listed above.

## Data Sharing

Yappable shares data only with ElevenLabs when you enable and configure that engine. In site-voice mode the reply
text goes to the chat site you are already using, through that site's own read-aloud request. Nothing else is shared.

## Data Deletion

Remove the ElevenLabs API key in the Yappable settings. You can clear all Yappable data by removing the extension
or clearing its stored data in Chrome.

## Limited Use

Yappable uses information only to provide its single purpose: reading AI chat replies aloud. Its use of information
complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.
