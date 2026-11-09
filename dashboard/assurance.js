// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
// Progressive enhancement for the assurance dashboard: copy buttons for the agent export and Mermaid sources.
// Every figure is server-rendered from the JSON artifacts; without JavaScript everything is still readable.
(function () {
  Array.prototype.slice.call(document.querySelectorAll("[data-copy]")).forEach(function (btn) {
    var target = document.getElementById(btn.getAttribute("data-copy"));
    if (!target || !window.navigator || !window.navigator.clipboard) return;
    btn.hidden = false;
    btn.addEventListener("click", function () {
      window.navigator.clipboard.writeText(target.textContent || "").then(
        function () {
          btn.textContent = "Copied";
        },
        function () {
          btn.textContent = "Copy failed";
        }
      );
    });
  });
})();
