// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
// Progressive enhancement for the Product Check dashboard: tab switching, table filters and a theme toggle.
// Every figure is server-rendered from the results JSON; without JavaScript all views are shown in sequence.
(function () {
  var views = Array.prototype.slice.call(document.querySelectorAll("section.view"));
  var links = Array.prototype.slice.call(document.querySelectorAll("nav.tabs a"));
  function show(id) {
    if (
      !views.some(function (v) {
        return v.id === id;
      })
    )
      id = views[0] && views[0].id;
    views.forEach(function (v) {
      v.hidden = v.id !== id;
    });
    links.forEach(function (a) {
      if (a.getAttribute("href") === "#" + id) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }
  links.forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      var id = a.getAttribute("href").slice(1);
      show(id);
      try {
        window.history.replaceState(null, "", "#" + id);
      } catch {
        /* file:// may refuse */
      }
    });
  });
  show((window.location.hash || "").slice(1));

  Array.prototype.slice.call(document.querySelectorAll("[data-filter-table]")).forEach(function (box) {
    var table = document.getElementById(box.getAttribute("data-filter-table"));
    if (!table) return;
    var controls = Array.prototype.slice.call(box.querySelectorAll("select, input"));
    var count = box.querySelector("[data-count]");
    function apply() {
      var shown = 0;
      Array.prototype.slice.call(table.tBodies[0].rows).forEach(function (row) {
        var ok = controls.every(function (c) {
          var v = (c.value || "").toLowerCase();
          if (!v) return true;
          var key = c.getAttribute("data-key");
          if (key === "text") return row.textContent.toLowerCase().indexOf(v) !== -1;
          return (row.getAttribute("data-" + key) || "").toLowerCase() === v;
        });
        row.hidden = !ok;
        if (ok) shown++;
      });
      if (count) count.textContent = shown + " shown";
    }
    controls.forEach(function (c) {
      c.addEventListener("input", apply);
    });
    apply();
  });

  var toggle = document.querySelector(".theme-toggle");
  var root = document.documentElement;
  function setTheme(t) {
    if (t === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", t);
    if (toggle) toggle.textContent = "Theme: " + t;
  }
  var saved;
  try {
    saved = window.localStorage.getItem("product-check-theme") || "auto";
  } catch {
    saved = "auto";
  }
  setTheme(saved);
  if (toggle) {
    toggle.hidden = false;
    toggle.addEventListener("click", function () {
      var order = ["auto", "light", "dark"];
      var next = order[(order.indexOf(root.getAttribute("data-theme") || "auto") + 1) % 3];
      setTheme(next);
      try {
        window.localStorage.setItem("product-check-theme", next);
      } catch {
        /* storage unavailable */
      }
    });
  }
})();
