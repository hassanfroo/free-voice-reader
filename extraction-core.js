(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.FreeVoiceReaderExtractor = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const BLOCKED_SELECTOR_PARTS = [
    "nav",
    "aside",
    "footer",
    "header",
    "form",
    "button",
    "label",
    "input",
    "select",
    "textarea",
    "noscript",
    "script",
    "style",
    "svg",
    "canvas",
    "figure",
    "img",
    "video",
    "audio",
    "iframe",
    "dialog",
    "[role='navigation']",
    "[role='menu']",
    "[role='complementary']",
    "[role='banner']",
    "[role='contentinfo']",
    "[aria-hidden='true']",
    ".menu",
    ".sidebar",
    ".ad",
    ".ads",
    ".advertisement",
    ".promo",
    ".newsletter",
    ".comments",
    ".share",
    ".social",
    ".cookie",
    ".consent",
    ".modal",
    ".popup",
    ".popover",
    ".related",
    ".recommended",
    ".trending",
    ".author-box",
    ".tag-list",
    ".breadcrumbs"
  ];

  const POSITIVE_HINT_RE = /\b(article|body|content|entry|main|page|post|story|text)\b/i;
  const NEGATIVE_HINT_RE = /\b(ad|alert|author|banner|comment|cookie|footer|header|hero|menu|meta|modal|nav|newsletter|promo|recommend|related|share|sidebar|social|subscribe|tag|toolbar)\b/i;
  const BOILERPLATE_LINE_RE = /\b(accept|agree|allow all|all rights reserved|cookie|copyright|create account|feature is well established|follow us|learn more|log in|menu|newsletter|next article|open in app|privacy policy|related stories|report feedback|see full compatibility|share this|sign up|skip to content|sponsored|subscribe|terms of use|trending)\b/i;
  const CANDIDATE_SELECTOR = "article, main, section, div";
  const BLOCK_SELECTOR = "h1, h2, h3, h4, p, li, blockquote, pre";

  function normalizeWhitespace(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function getText(node) {
    return normalizeWhitespace(node?.textContent || "");
  }

  function getClassAndId(node) {
    return normalizeWhitespace(
      `${node?.className || ""} ${node?.id || ""}`.replace(/\s+/g, " ")
    );
  }

  function isElementHidden(element, windowRef) {
    if (!element || !windowRef?.getComputedStyle) {
      return false;
    }

    const style = windowRef.getComputedStyle(element);
    return (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0" ||
      element.hidden
    );
  }

  function removeNoisyNodes(root, windowRef) {
    root.querySelectorAll(BLOCKED_SELECTOR_PARTS.join(",")).forEach((node) => {
      node.remove();
    });

    root.querySelectorAll("*").forEach((node) => {
      if (isElementHidden(node, windowRef)) {
        node.remove();
      }
    });
  }

  function getLinkDensity(node) {
    const textLength = getText(node).length || 1;
    const linkTextLength = Array.from(node.querySelectorAll("a"))
      .map((link) => getText(link).length)
      .reduce((sum, length) => sum + length, 0);

    return linkTextLength / textLength;
  }

  function scoreNode(node) {
    const text = getText(node);
    if (text.length < 140) {
      return 0;
    }

    const classAndId = getClassAndId(node);
    const paragraphCount = node.querySelectorAll("p").length;
    const blockCount = node.querySelectorAll(BLOCK_SELECTOR).length;
    const sentenceCount = (text.match(/[.!?](\s|$)/g) || []).length;
    const commaCount = (text.match(/,\s/g) || []).length;
    const linkDensity = getLinkDensity(node);

    let score = text.length;
    score += paragraphCount * 180;
    score += blockCount * 45;
    score += sentenceCount * 28;
    score += commaCount * 12;
    score -= linkDensity * 900;

    if (node.matches("main, article, [role='main']")) {
      score += 700;
    }

    if (POSITIVE_HINT_RE.test(classAndId)) {
      score += 240;
    }

    if (NEGATIVE_HINT_RE.test(classAndId)) {
      score -= 260;
    }

    return score;
  }

  function dedupeLines(lines) {
    const seen = new Set();
    const output = [];

    lines.forEach((line) => {
      const normalized = normalizeWhitespace(line).toLowerCase();
      if (!normalized || normalized.length < 8 || seen.has(normalized)) {
        return;
      }

      if (BOILERPLATE_LINE_RE.test(normalized)) {
        return;
      }

      const isNearDuplicate = Array.from(seen).some(
        (existing) =>
          existing.includes(normalized) ||
          normalized.includes(existing)
      );

      if (isNearDuplicate) {
        return;
      }

      seen.add(normalized);
      output.push(normalizeWhitespace(line));
    });

    return output;
  }

  function collectReadableBlocks(node) {
    const blocks = Array.from(node.querySelectorAll(BLOCK_SELECTOR))
      .map((item) => ({
        tagName: item.tagName,
        text: getText(item)
      }))
      .filter(({ tagName, text }) => {
        if (!text) {
          return false;
        }

        if (/^H[1-4]$/.test(tagName)) {
          return text.length >= 8;
        }

        return text.length >= 40;
      })
      .map(({ text }) => text)
      .filter((text) => !NEGATIVE_HINT_RE.test(text.slice(0, 80)));

    const dedupedBlocks = dedupeLines(blocks);
    if (dedupedBlocks.length >= 2) {
      return dedupedBlocks;
    }

    const fallbackText = getText(node);
    return fallbackText ? dedupeLines(fallbackText.split(/\n+/)) : [];
  }

  function collectFallbackBodyBlocks(root) {
    const blocks = Array.from(root.querySelectorAll("p, li, blockquote, div"))
      .map((node) => getText(node))
      .filter((text) => text.length >= 60);

    return dedupeLines(blocks).slice(0, 12);
  }

  function chooseBestNode(root) {
    const candidates = Array.from(root.querySelectorAll(CANDIDATE_SELECTOR));
    let bestNode = root;
    let bestScore = scoreNode(root);

    candidates.forEach((node) => {
      const score = scoreNode(node);
      if (score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    });

    return { bestNode, bestScore };
  }

  function extractMainContentFromDocument(documentRef, windowRef) {
    const body = documentRef?.body;
    if (!body) {
      return {
        text: "",
        blocks: [],
        confidence: "low",
        bestScore: 0
      };
    }

    const clone = body.cloneNode(true);
    removeNoisyNodes(clone, windowRef);

    const { bestNode, bestScore } = chooseBestNode(clone);
    let blocks = collectReadableBlocks(bestNode);
    if (blocks.length < 2) {
      blocks = collectFallbackBodyBlocks(clone);
    }
    const text = normalizeWhitespace(blocks.join(" "));

    return {
      text,
      blocks,
      confidence: bestScore > 1800 ? "high" : bestScore > 900 ? "medium" : "low",
      bestScore
    };
  }

  function chooseBetterExtraction(primary, secondary) {
    if (!secondary?.text) {
      return primary;
    }

    if (!primary?.text) {
      return secondary;
    }

    const primaryScore = (primary.bestScore || 0) + primary.text.length;
    const secondaryScore = (secondary.bestScore || 0) + secondary.text.length;

    return secondaryScore > primaryScore ? secondary : primary;
  }

  return {
    chooseBetterExtraction,
    extractMainContentFromDocument,
    normalizeWhitespace
  };
});
