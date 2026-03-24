const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const {
  chooseBetterExtraction,
  extractMainContentFromDocument
} = require("../extraction-core.js");

function extract(html) {
  const dom = new JSDOM(html);
  return extractMainContentFromDocument(dom.window.document, dom.window);
}

test("prefers article body over nav and sidebar clutter", () => {
  const result = extract(`
    <body>
      <header><nav>Home News Sports Markets Lifestyle</nav></header>
      <main>
        <article class="story article-body">
          <h1>Lunch Break Cities</h1>
          <p>Office workers now spend more time eating outside as downtown parks become quieter and better designed for short breaks.</p>
          <p>Researchers say the pattern became more visible once employers encouraged shorter meetings and more flexible midday routines.</p>
          <p>The result is a modest but consistent rise in cafes, food stalls, and small public performances near business districts.</p>
        </article>
        <aside class="sidebar">Trending links and paid partner offers</aside>
      </main>
      <footer>About Contact Careers</footer>
    </body>
  `);

  assert.match(result.text, /Office workers now spend more time eating outside/);
  assert.doesNotMatch(result.text, /Home News Sports Markets Lifestyle/);
  assert.doesNotMatch(result.text, /paid partner offers/);
});

test("removes cookie banners and repeated headings", () => {
  const result = extract(`
    <body>
      <div class="cookie-banner">Accept cookies to continue reading this article</div>
      <main class="content">
        <h1>Quiet Trains Are Back</h1>
        <h1>Quiet Trains Are Back</h1>
        <p>Rail operators are bringing back quiet carriages after complaints that long journeys now feel like open-plan offices on wheels.</p>
        <p>Passengers said they wanted a carriage where calls, videos, and speakerphone meetings were clearly discouraged.</p>
      </main>
    </body>
  `);

  assert.equal((result.text.match(/Quiet Trains Are Back/g) || []).length, 1);
  assert.doesNotMatch(result.text, /Accept cookies/);
});

test("falls back cleanly on simple text-heavy markup", () => {
  const result = extract(`
    <body>
      <div id="page">
        <div class="hero">Feature</div>
        <div class="copy">
          <div>People often underestimate how helpful spoken reading can be during lunch when their eyes are tired from morning work.</div>
          <div>Even a simple browser voice feels useful if it starts quickly, skips clutter, and stops exactly when asked.</div>
        </div>
      </div>
    </body>
  `);

  assert.match(result.text, /spoken reading can be during lunch/);
  assert.match(result.text, /starts quickly, skips clutter/);
});

test("filters common boilerplate phrases from extracted text", () => {
  const result = extract(`
    <body>
      <main>
        <p>Subscribe to keep reading this story and get access to more features.</p>
        <p>Lunch readers mostly want a fast way to hear one useful article without opening another app or signing into anything new.</p>
        <p>They do not want cookie banners, social prompts, or repeated widgets mixed into the narration.</p>
      </main>
    </body>
  `);

  assert.doesNotMatch(result.text, /Subscribe to keep reading/);
  assert.match(result.text, /Lunch readers mostly want a fast way/);
});

test("chooses the stronger extraction when a retry finds more content", () => {
  const first = { text: "Short paragraph only.", bestScore: 250 };
  const second = {
    text: "Longer article body with several useful sentences that would clearly be a better lunch-reading candidate.",
    bestScore: 900
  };

  assert.equal(chooseBetterExtraction(first, second), second);
});
