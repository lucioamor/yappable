// Extraction helpers adapted from Download as Markdown; Mozilla Readability is vendored.
(() => {
  if (globalThis.YapPageExtractor) return;
  function isUsefulText(element) {
    return (element?.textContent || '').replace(/\s+/g, ' ').trim().length > 120;
  }

  function pageHeading() {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const expectedTitles = [
      document.querySelector('meta[property="og:title"]')?.getAttribute('content'),
      document.title
    ].map(normalize).filter(Boolean);
    const candidates = [...new Set([
      ...document.querySelectorAll('main article h1, main article h2, article h1, article h2'),
      ...document.querySelectorAll('h1')
    ])].filter(heading => normalize(heading.textContent));

    return candidates.find(heading => expectedTitles.includes(normalize(heading.textContent)))
      || candidates.find(heading => heading.matches('article h1, main h1'))
      || candidates.find(heading => heading.tagName === 'H1')
      || candidates[0]
      || null;
  }

  function addPageHeading(content) {
    const heading = pageHeading();
    if (!heading) return content;

    const headingText = heading.textContent.replace(/\s+/g, ' ').trim();
    const alreadyPresent = [...content.querySelectorAll('h1, h2')]
      .some(candidate => candidate.textContent.replace(/\s+/g, ' ').trim() === headingText);
    if (alreadyPresent) return content;

    const wrapper = document.createElement('article');
    const topHeading = document.createElement('h1');
    topHeading.textContent = headingText;
    wrapper.append(topHeading, content);
    return wrapper;
  }

  function readabilityDocument() {
    const clone = document.cloneNode(true);
    const semanticRootSelector = 'article, main, [role="main"]';

    clone.querySelectorAll(`${semanticRootSelector} h1, ${semanticRootSelector} h2, ${semanticRootSelector} h3, ${semanticRootSelector} h4, ${semanticRootSelector} h5, ${semanticRootSelector} h6`)
      .forEach(heading => {
        // Readability treats class/id fragments such as "header" as evidence
        // that a node is page chrome. Substack uses header-anchor-post on real
        // article headings, so keep the semantics and discard styling hints.
        heading.removeAttribute('class');
        heading.removeAttribute('id');
      });

    clone.querySelectorAll(`${semanticRootSelector} div`).forEach(wrapper => {
      const elementChildren = [...wrapper.children];
      const hasOnlyWhitespaceOutsideChild = [...wrapper.childNodes]
        .every(node => node.nodeType !== 3 || !node.textContent.trim());
      if (elementChildren.length === 1 && elementChildren[0].tagName === 'P' && hasOnlyWhitespaceOutsideChild) {
        // A styling-only div around a short, link-heavy paragraph is otherwise
        // removed by Readability's conditional div cleanup (for example
        // Substack's "Listen on" pullquote).
        wrapper.replaceWith(elementChildren[0]);
      }
    });

    return clone;
  }

  function extractMainContent() {
    // Substack's explicit article body avoids Readability dropping short link paragraphs.
    const substack = document.querySelector('.available-content .body.markup, .post-content .body.markup');
    if (substack && isUsefulText(substack)) return addPageHeading(substack.cloneNode(true));
    if (typeof Readability === 'function') {
      try {
        const parsed = new Readability(readabilityDocument(), { keepClasses: false }).parse();
        if (parsed?.content && parsed.textContent?.trim().length > 120) {
          const container = document.createElement('article');
          container.innerHTML = parsed.content;
          return addPageHeading(container);
        }
      } catch (error) {
        console.debug('[Download as Markdown] Readability fallback', error);
      }
    }

    const semantic = [...document.querySelectorAll('article, main, [role="main"]')]
      .filter(isUsefulText)
      .sort((left, right) => right.textContent.length - left.textContent.length)[0];
    return addPageHeading((semantic || document.body).cloneNode(true));
  }


  function extract() {
    const element = extractMainContent();
    element.querySelectorAll("script,style,noscript,template,svg,canvas,iframe,object,embed,form,input,select,textarea,button,dialog,img,picture,video,audio,nav,footer,aside,[hidden],[aria-hidden=true],#yappable-player").forEach(n => n.remove());
    element.querySelectorAll("a").forEach(n => {
      if (/^(https?:\/\/|www\.)/i.test(n.textContent.trim())) n.remove();
      else n.replaceWith(...n.childNodes);
    });
    const blocks = [];
    let runs = [];
    const flush = (kind = "paragraph") => {
      if (runs.some(r => r.text.trim())) blocks.push({ kind, runs, pauseMs: kind === "heading" ? 1000 : kind === "line" ? 350 : 650 });
      runs = [];
    };
    function walk(node, emphasis = false, kind = "paragraph") {
      if (node.nodeType === 3) {
        const text = node.textContent.replace(/https?:\/\/[^\s<>]+/g, "").replace(/\s+/g, " ");
        const last = runs.at(-1);
        if (last && last.emphasis === emphasis) last.text += text;
        else runs.push({ text, emphasis });
        return;
      }
      if (node.nodeType !== 1) return;
      if (node.tagName === "BR") { flush("line"); return; }
      const boundary = /^(P|H[1-6]|LI|BLOCKQUOTE|DIV|TR|SECTION|ARTICLE)$/.test(node.tagName);
      const nextKind = /^H[1-6]$/.test(node.tagName) ? "heading" : kind;
      if (boundary) flush(kind);
      for (const child of node.childNodes) walk(child, emphasis || /^(STRONG|B)$/.test(node.tagName), nextKind);
      if (boundary) flush(nextKind);
    }
    walk(element);
    flush();
    const text = blocks.map(b => b.runs.map(r => r.text).join("").trim()).join("\n\n");
    if (!text) throw new Error("No readable text found on this page.");
    // Do not confuse the browser's UI language with the article's language.
    const candidates = [element.getAttribute("lang"), document.querySelector("article[lang], main[lang]")?.getAttribute("lang"), document.documentElement.lang,
      document.querySelector('meta[property="og:locale"]')?.content];
    const lang = candidates.map(normalizeLang).find(Boolean) || "";
    return { text, blocks, title: document.title, lang };
  }

  function normalizeLang(value) {
    try { return value ? Intl.getCanonicalLocales(value.trim().replace(/_/g, "-"))[0] : ""; }
    catch (_) { return ""; }
  }

  // Delivery hints only: no summary, translation, language model or new wording.
  function speechChunks(blocks, model) {
    const expressive = /^eleven_v[34](?:_|$)/.test(model);
    const ssml = /^(eleven_flash_v2(?:_5)?|eleven_turbo_v2(?:_5)?|eleven_multilingual_v2)$/.test(model);
    const chunks = [];
    let current = { text: "", elevenText: "", nativeUnits: [] };
    const flush = () => { if (current.text.trim()) chunks.push(current); current = { text: "", elevenText: "", nativeUnits: [] }; };
    let breaks = 0;
    for (const block of blocks) {
      for (const run of block.runs) {
        // Prefer sentence/word boundaries, with a hard bound for unbroken text.
        const parts = run.text.match(/[^.!?]{1,200}(?:[.!?]+|\s|$)|[\s\S]{1,200}/g) || [];
        for (const text of parts) {
          if (current.elevenText.length + text.length > 1200) { flush(); breaks = 0; }
          current.text += text;
          const emphasis = run.emphasis && text.trim().length <= 80;
          const spoken = emphasis ? text.toLocaleUpperCase() : text;
          current.elevenText += ssml ? spoken.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : spoken;
          if (text.trim()) current.nativeUnits.push({ text, rateScale: block.kind === "heading" ? 0.9 : run.emphasis ? 0.94 : 1, pauseMs: 0 });
        }
      }
      if (!current.nativeUnits.length) continue;
      current.nativeUnits.at(-1).pauseMs = block.pauseMs;
      current.text += "\n\n";
      // Give headings an explicit sentence ending as well as a longer pause.
      if (block.kind === "heading" && !/[.!?:;]\s*$/.test(current.elevenText)) current.elevenText += ".";
      current.elevenText += ssml ? ` <break time="${(block.pauseMs / 1000).toFixed(2)}s" />\n`
        : expressive ? (block.pauseMs >= 650 ? " [long pause]\n" : " [short pause]\n") : "\n\n";
      if (++breaks >= 6) { flush(); breaks = 0; }
    }
    flush();
    return chunks;
  }
  globalThis.YapPageExtractor = { extract, speechChunks, normalizeLang };
})();
