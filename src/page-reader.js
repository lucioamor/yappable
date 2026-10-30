(() => {
  if (globalThis.__yapPageReader) return;
  globalThis.__yapPageReader = true;
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type !== "YAP_OPEN_PAGE") return;
    try {
      const article = globalThis.YapPageExtractor.extract();
      globalThis.YapNarrator.cancel();
      const read = () => globalThis.YapNarrator.read(article.text, article.lang, { blocks: article.blocks });
      globalThis.YapPlayer.setReading({
        label: `${article.title} · ~${Math.ceil(article.text.split(/\s+/).length / 150)} min`,
        language: article.lang,
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
