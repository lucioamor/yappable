(() => {
  if (globalThis.__yapPageReader) return;
  globalThis.__yapPageReader = true;
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type !== "YAP_OPEN_PAGE") return;
    try {
      const article = globalThis.YapPageExtractor.extract();
      globalThis.YapNarrator.cancel();
      let provider = "yappable";
      const read = async () => {
        if (provider === "yappable") return globalThis.YapNarrator.read(article.text, article.lang, { blocks: article.blocks });
        globalThis.YapPlayer.setStatus("Connecting to voice tab…");
        try {
          const result = await chrome.runtime.sendMessage({ type: "YAP_RELAY_PAGE", provider, text: article.text, lang: article.lang });
          if (!result?.ok) throw new Error(result?.error || "The voice session did not respond.");
          globalThis.YapPlayer.setStatus(`Text sent to ${provider}. Use playback controls in that tab.`);
        } catch (error) { globalThis.YapPlayer.setStatus(error.message); }
      };
      globalThis.YapPlayer.setReading({
        label: `${article.title} · ~${Math.ceil(article.text.split(/\s+/).length / 150)} min`,
        language: article.lang,
        provider,
        setProvider: value => { provider = value; },
        setLanguage: lang => { article.lang = lang; },
        play: read
      });
      chrome.storage.sync.get({ pageAutoplay: false }, ({ pageAutoplay }) => {
        if (pageAutoplay) read();
      });
      respond({ ok: true });
    } catch (error) {
      globalThis.YapPlayer.setStatus(error.message);
      respond({ ok: false, error: error.message });
    }
  });
})();
