(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.FreeVoiceReaderUi = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function getSpeedLabel(rate) {
    if (rate <= 0.9) {
      return "Relaxed";
    }

    if (rate >= 1.25) {
      return "Fast";
    }

    return "Comfort";
  }

  function derivePageMode(preview) {
    if (preview.selectionLength >= 25) {
      return {
        actionType: "READ_SELECTION",
        actionLabel: "Read Selection",
        helperText: "A text selection is active. The main button will read that first.",
        sourceLabel: "Selection"
      };
    }

    if (preview.mainContent) {
      return {
        actionType: "READ_MAIN_CONTENT",
        actionLabel: "Read Page",
        helperText: "No selection found. The main button will read the main page content.",
        sourceLabel: "Page"
      };
    }

    return {
      actionType: "READ_MAIN_CONTENT",
      actionLabel: "Try Read Page",
      helperText: "This page looks sparse. The reader will try the best available text.",
      sourceLabel: "Fallback"
    };
  }

  return {
    derivePageMode,
    getSpeedLabel
  };
});
