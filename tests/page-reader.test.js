"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const source = (name) => fs.readFileSync(path.join(__dirname, "../src", name), "utf8");
const tick = () => new Promise(resolve => setImmediate(resolve));

function browser(html = "<p>Hello</p>") {
  const dom = new JSDOM(html, { url: "https://example.substack.com/p/test", runScripts: "outside-only" });
  const w = dom.window;
  let portListener;
  w.chrome = {
    runtime: {
      onMessage: { addListener() {} },
      connect: () => ({
        onMessage: { addListener(fn) { portListener = fn; } },
        onDisconnect: { addListener() {} },
        postMessage(m) {
          if (m.type === "YAP_AUDIO_READY") queueMicrotask(() => portListener({ type: "YAP_AUDIO_GRANTED", jobId: m.jobId }));
        }
      })
    },
    storage: {
      onChanged: { addListener() {} },
      local: { get: (defaults, cb) => queueMicrotask(() => cb(defaults)), set() {} },
      sync: { get: (defaults, cb) => queueMicrotask(() => cb(defaults)), set() {} }
    }
  };
  return dom;
}

test("Substack extraction preserves title and prose, removes images/URLs, leaves DOM intact", (t) => {
  const prose = "This paragraph describes a practical experiment and its complete results. ".repeat(12);
  const dom = browser(`<html lang="pt-BR"><head><title>Article</title></head><body><nav>Navigation</nav><article class="available-content"><div class="body markup"><h1 class="header-anchor-post">Article</h1><p>${prose}</p><div><p><a href="https://example.org">Useful context</a></p></div><img alt="NEVER SPEAK IMAGE" src="x"><p>https://example.org/tracking</p><button>Subscribe</button></div></article></body></html>`);
  const before = dom.window.document.body.innerHTML;
  t.after(() => dom.window.close());
  dom.window.eval(source("vendor/Readability.js"));
  dom.window.eval(source("page-extractor.js"));
  const result = dom.window.YapPageExtractor.extract();
  assert.match(result.text, /Article/);
  assert.match(result.text, /Useful context/);
  assert.match(result.text, /complete results/);
  assert.doesNotMatch(result.text, /https:|NEVER SPEAK|Subscribe|Navigation/);
  assert.equal(result.lang, "pt-BR");
  assert.equal(dom.window.document.body.innerHTML, before);
  dom.window.close();
});

test("player hides idle waveform and offers an explicit existing reading", async (t) => {
  const dom = browser();
  t.after(() => dom.window.close());
  const w = dom.window;
  w.eval(source("player-ui.js"));
  await tick();
  w.YapPlayer.render();
  const root = w.document.getElementById("yappable-player").shadowRoot;
  assert.equal(root.querySelector(".screenwave").hidden, true);
  assert.match(root.querySelector("style").textContent, /\[hidden\]\s*\{\s*display: none !important/);
  let reads = 0;
  w.YapPlayer.setReading({ label: "Article ready", play: () => reads++ });
  const read = root.querySelector('[data-a="read"]');
  assert.equal(read.hidden, false);
  read.click();
  assert.equal(reads, 1);
  dom.window.close();
});

test("page delivery preserves structure and applies model-specific pauses without changing source text", (t) => {
  const dom = browser('<html lang="en"><body><article><h1>A heading</h1><p>First <strong>important</strong> idea.<br>Second line.</p><p>Next paragraph.</p></article></body></html>');
  t.after(() => dom.window.close());
  const w = dom.window;
  w.eval(source("page-extractor.js"));
  const article = w.YapPageExtractor.extract();
  assert.equal(article.lang, "en");
  assert.deepEqual(Array.from(article.blocks, b => b.kind), ["heading", "line", "paragraph", "paragraph"]);
  const flash = w.YapPageExtractor.speechChunks(article.blocks, "eleven_flash_v2_5");
  assert.match(flash[0].elevenText, /IMPORTANT/);
  for (const duration of ["1.00", "0.35", "0.65"]) assert.ok(flash[0].elevenText.includes(`time="${duration}s"`));
  assert.equal(flash.map(c => c.text).join("").trim(), article.text);
  assert.equal(flash[0].nativeUnits[0].rateScale, 0.9);
  assert.ok(flash[0].nativeUnits.some(u => u.rateScale === 0.94));
  const v3 = w.YapPageExtractor.speechChunks(article.blocks, "eleven_v3")[0].elevenText;
  assert.doesNotMatch(v3, /<break/);
  assert.match(v3, /\[long pause\]/);
  assert.match(v3, /\[short pause\]/);
  w.document.documentElement.removeAttribute("lang");
  assert.equal(w.YapPageExtractor.extract().lang, "", "missing article language must not become browser language");
});

test("structured English page sends English and delivery hints to ElevenLabs, with plain native fallback", async (t) => {
  const dom = browser('<html lang="en"><body><article><h1>Title</h1><p>Read <b>this</b> paragraph.</p></article></body></html>');
  t.after(() => dom.window.close());
  const w = dom.window;
  w.chrome.storage.sync.get = (defaults, cb) => queueMicrotask(() => cb({ ...defaults, engine: "elevenlabs", lang: "pt-BR", elevenCache: false }));
  w.chrome.storage.local.get = (defaults, cb) => queueMicrotask(() => cb({ ...defaults, elevenKey: "test-only" }));
  let request, utterance;
  w.fetch = async (_url, options) => { request = JSON.parse(options.body); return { ok: false, status: 503 }; };
  w.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  w.speechSynthesis = { getVoices: () => [], speak(u) { utterance = u; }, cancel() { utterance?.onerror(); } };
  w.eval(source("page-extractor.js"));
  w.eval(source("player-ui.js"));
  w.eval(source("chat-narrator.js"));
  const article = w.YapPageExtractor.extract();
  const running = w.YapNarrator.read(article.text, article.lang, { blocks: article.blocks });
  await tick();
  assert.equal(request.language_code, "en");
  assert.match(request.text, /<break/);
  assert.match(request.text, /THIS/);
  assert.equal(utterance.lang, "en");
  assert.doesNotMatch(utterance.text, /<break|\[long pause\]/);
  w.YapNarrator.cancel();
  await running;
});

test("manual reading uses no inference, pauses/resumes and cancels subsequent blocks", async (t) => {
  const dom = browser();
  t.after(() => dom.window.close());
  const w = dom.window;
  const utterances = [];
  let current;
  w.LanguageModel = { create() { throw new Error("Inference must not run"); } };
  w.LanguageDetector = { create() { throw new Error("Detection must not run"); } };
  w.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  w.speechSynthesis = {
    getVoices: () => [],
    speak(u) { utterances.push(u); current = u; },
    cancel() { const u = current; current = null; u?.onend(); }
  };
  w.eval(source("player-ui.js"));
  w.eval(source("chat-narrator.js"));
  const running = w.YapNarrator.read("A complete sentence. ".repeat(160), "en-US");
  await tick();
  assert.ok(utterances.length > 0);
  assert.equal(w.YapPlayer.snapshot().active, true);
  w.YapPlayer.pauseAll();
  await tick();
  assert.equal(w.YapPlayer.snapshot().paused, true);
  w.YapPlayer.resume();
  await tick();
  assert.equal(w.YapPlayer.snapshot().paused, false);
  w.YapNarrator.cancel();
  await running;
  assert.equal(w.YapPlayer.snapshot().active, false);
  assert.equal(w.YapNarrator.progress(), null);
  const count = utterances.length;
  await tick();
  assert.equal(utterances.length, count);
  assert.ok(utterances.every(u => u.text.length <= 221));
  dom.window.close();
});
