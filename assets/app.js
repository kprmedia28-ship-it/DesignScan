/* DesignScan — interaction & instrument rendering
   Everything here is progressive enhancement: the page is fully
   readable with JS disabled. JS adds the live gauge + demo scan. */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var CX = 140, CY = 140, R = 92;
  var A_MIN = -120, A_MAX = 120;          // sweep, degrees from 12 o'clock
  var svgNS = "http://www.w3.org/2000/svg";

  function valToAngle(v) { return A_MIN + (Math.max(0, Math.min(100, v)) / 100) * (A_MAX - A_MIN); }

  // angle measured clockwise from top (12 o'clock = 0)
  function polar(cx, cy, r, deg) {
    var a = (deg) * Math.PI / 180;
    return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
  }
  function arcPath(r, a0, a1) {
    var s = polar(CX, CY, r, a0), e = polar(CX, CY, r, a1);
    var large = (a1 - a0) > 180 ? 1 : 0;
    return "M " + s.x.toFixed(1) + " " + s.y.toFixed(1) +
           " A " + r + " " + r + " 0 " + large + " 1 " + e.x.toFixed(1) + " " + e.y.toFixed(1);
  }
  function seg(d, color, w) {
    var p = document.createElementNS(svgNS, "path");
    p.setAttribute("d", d); p.setAttribute("fill", "none");
    p.setAttribute("stroke", color); p.setAttribute("stroke-width", w || 12);
    p.setAttribute("stroke-linecap", "round");
    return p;
  }

  function drawGauge() {
    var arc = document.getElementById("gauge-arc");
    var ticks = document.getElementById("gauge-ticks");
    if (!arc) return;

    // track
    arc.appendChild(seg(arcPath(R, A_MIN, A_MAX), "#E4E6E9", 12));
    // semantic zones: red 0-50, amber 50-75, green 75-100
    arc.appendChild(seg(arcPath(R, valToAngle(0),  valToAngle(50)),  "#E23A2E", 12));
    arc.appendChild(seg(arcPath(R, valToAngle(50), valToAngle(75)),  "#E0A12B", 12));
    arc.appendChild(seg(arcPath(R, valToAngle(75), valToAngle(100)), "#2E9E5B", 12));

    // tick marks every 10 points
    for (var v = 0; v <= 100; v += 10) {
      var a = valToAngle(v);
      var o = polar(CX, CY, R + 12, a), i = polar(CX, CY, R + (v % 50 === 0 ? 4 : 7), a);
      var t = document.createElementNS(svgNS, "line");
      t.setAttribute("x1", i.x.toFixed(1)); t.setAttribute("y1", i.y.toFixed(1));
      t.setAttribute("x2", o.x.toFixed(1)); t.setAttribute("y2", o.y.toFixed(1));
      t.setAttribute("stroke", "#11161A"); t.setAttribute("stroke-width", v % 50 === 0 ? 2 : 1);
      t.setAttribute("opacity", v % 50 === 0 ? "0.8" : "0.35");
      ticks.appendChild(t);
    }
  }

  // animate a number + needle from 0 to target
  function animateScore(target) {
    var needle = document.getElementById("gauge-needle");
    var scoreEl = document.getElementById("gauge-score");
    var endA = valToAngle(target);
    if (reduce) {
      if (needle) needle.style.transform = "rotate(" + endA + "deg)";
      if (scoreEl) scoreEl.textContent = target;
      return;
    }
    var start = null, dur = 1400;
    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var ease = 1 - Math.pow(1 - p, 3);
      if (needle) needle.style.transform = "rotate(" + (A_MIN + (endA - A_MIN) * ease).toFixed(2) + "deg)";
      if (scoreEl) scoreEl.textContent = Math.round(target * ease);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // fill the criteria card meterlines when scrolled into view
  function wireCards() {
    var cards = document.querySelectorAll(".card");
    if (!("IntersectionObserver" in window)) {
      cards.forEach(function (c) { var i = c.querySelector(".meterline i"); if (i) i.style.width = (c.dataset.v || 0) + "%"; });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var i = en.target.querySelector(".meterline i");
          if (i) { i.style.transition = "width 1s cubic-bezier(.2,.7,.2,1)"; i.style.width = (en.target.dataset.v || 0) + "%"; }
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.4 });
    cards.forEach(function (c) { io.observe(c); });
  }

  // generic scroll reveal
  function wireReveal() {
    var els = document.querySelectorAll(".sec-head, .step, .report__card, .readout");
    els.forEach(function (e) { e.classList.add("reveal"); });
    if (!("IntersectionObserver" in window) || reduce) { els.forEach(function (e) { e.classList.add("in"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold: 0.15 });
    els.forEach(function (e) { io.observe(e); });
  }

  // demo scan: validate-ish, run a believable read, update the readout
  function wireScan() {
    var form = document.getElementById("scan");
    var input = document.getElementById("url");
    var btn = document.getElementById("scan-btn");
    var label = btn ? btn.querySelector(".btn__label") : null;
    var src = document.getElementById("readout-src");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var url = (input.value || "").trim();
      if (!url) { input.focus(); input.style.borderColor = "var(--ember)"; return; }
      var host = url.replace(/^https?:\/\//, "").replace(/\/.*$/, "") || "your-site.com";

      if (label) label.textContent = "Reading…";
      btn.disabled = true;

      // pseudo-random but stable-ish score from the hostname
      var seed = 0; for (var k = 0; k < host.length; k++) seed += host.charCodeAt(k);
      var score = 62 + (seed % 32); // 62–93

      setTimeout(function () {
        if (src) src.textContent = "demo · " + host;
        // re-trigger gauge to new value
        document.getElementById("gauge-needle").style.transform = "rotate(-120deg)";
        document.getElementById("gauge-score").textContent = "0";
        animateScore(score);
        var grade = document.getElementById("gauge-grade");
        if (grade) grade.textContent = score >= 85 ? "Strong — minor polish only"
                       : score >= 70 ? "Good — three fixes from great"
                       : "Needs work — clear wins available";
        // nudge sub-meters
        document.querySelectorAll(".sm").forEach(function (sm, idx) {
          var base = [3, -6, -9, 7][idx] || 0;
          var v = Math.max(40, Math.min(96, score + base));
          sm.querySelector(".sm__val").textContent = v;
          sm.querySelector(".sm__bar i").style.width = v + "%";
        });
        if (label) label.textContent = "Scan again";
        btn.disabled = false;
        document.querySelector(".readout").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      }, reduce ? 50 : 900);
    });
  }

  // ---------- Real scanner: parses pasted/uploaded HTML and scores it ----------
  function runAnalysis(html, filename) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var issues = [];   // { sev: 'high'|'med'|'low', title, fix }
    var scores = { hierarchy: 100, usability: 100, accessibility: 100, consistency: 100, conversion: 100, performance: 100 };

    function deduct(key, amount, sev, title, fix) {
      scores[key] = Math.max(0, scores[key] - amount);
      issues.push({ sev: sev, title: title, fix: fix });
    }

    // --- Accessibility ---
    var imgs = Array.prototype.slice.call(doc.querySelectorAll("img"));
    var imgsNoAlt = imgs.filter(function (i) { return !i.hasAttribute("alt"); });
    if (imgsNoAlt.length) {
      deduct("accessibility", Math.min(30, imgsNoAlt.length * 6), imgsNoAlt.length > 2 ? "high" : "med",
        imgsNoAlt.length + " image" + (imgsNoAlt.length > 1 ? "s" : "") + " missing an alt attribute",
        "Add a short, descriptive alt text to every <img> (or alt=\"\" for purely decorative images) so screen readers can describe them.");
    }
    if (!doc.documentElement.getAttribute("lang")) {
      deduct("accessibility", 10, "med", "No lang attribute on <html>",
        "Add lang=\"en\" (or the page's language) to <html> so assistive tech and translators pick the right language.");
    }
    var inputs = Array.prototype.slice.call(doc.querySelectorAll("input, textarea, select"))
      .filter(function (el) { return el.type !== "hidden" && el.type !== "submit" && el.type !== "button"; });
    var unlabelled = inputs.filter(function (el) {
      var id = el.getAttribute("id");
      var hasLabel = id && doc.querySelector("label[for='" + id + "']");
      var ariaLabel = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby");
      var wrapped = el.closest && el.closest("label");
      return !hasLabel && !ariaLabel && !wrapped;
    });
    if (unlabelled.length) {
      deduct("accessibility", Math.min(25, unlabelled.length * 8), "high",
        unlabelled.length + " form field" + (unlabelled.length > 1 ? "s" : "") + " without a label",
        "Give each input a <label for=\"...\"> (or aria-label) so people using screen readers know what to enter.");
    }
    var viewport = doc.querySelector('meta[name="viewport"]');
    if (!viewport) {
      deduct("accessibility", 10, "med", "No viewport meta tag",
        "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> so the page scales correctly on phones.");
      deduct("performance", 5, "low", "Missing viewport meta may affect mobile rendering", "Same fix as above — it also keeps mobile layout stable.");
    }

    // --- Visual hierarchy ---
    var h1s = doc.querySelectorAll("h1");
    if (h1s.length === 0) {
      deduct("hierarchy", 20, "high", "No <h1> on the page",
        "Give the page a single, clear <h1> that states what it's for — it anchors the visual and semantic hierarchy.");
    } else if (h1s.length > 1) {
      deduct("hierarchy", 12, "med", h1s.length + " <h1> elements found",
        "Keep one <h1> per page. Demote the others to <h2>/<h3> based on their place in the structure.");
    }
    var headings = Array.prototype.slice.call(doc.querySelectorAll("h1,h2,h3,h4,h5,h6"));
    var lastLevel = 0, skipped = false;
    headings.forEach(function (h) {
      var lvl = parseInt(h.tagName.substring(1), 10);
      if (lastLevel && lvl - lastLevel > 1) skipped = true;
      lastLevel = lvl;
    });
    if (skipped) {
      deduct("hierarchy", 10, "med", "Heading levels skip a step (e.g. h2 → h4)",
        "Keep heading levels sequential. Skipping levels breaks the outline for screen-reader users and signals an unplanned structure.");
    }

    // --- Usability ---
    if (!doc.querySelector("nav")) {
      deduct("usability", 8, "low", "No <nav> landmark found",
        "Wrap the primary navigation in <nav> so it's identifiable as a navigation region.");
    }
    var genericText = /^(click here|here|read more|learn more|submit|more|link)$/i;
    var links = Array.prototype.slice.call(doc.querySelectorAll("a, button"));
    var vagueLinks = links.filter(function (el) { return genericText.test((el.textContent || "").trim()); });
    if (vagueLinks.length) {
      deduct("usability", Math.min(20, vagueLinks.length * 5), "med",
        vagueLinks.length + " link" + (vagueLinks.length > 1 ? "s" : "") + "/button" + (vagueLinks.length > 1 ? "s" : "") + " use vague text like \"click here\"",
        "Rewrite link and button text so it describes the destination or action on its own, e.g. \"Download the report\" instead of \"Click here\".");
    }
    var titleEl = doc.querySelector("title");
    var titleText = titleEl ? titleEl.textContent.trim() : "";
    if (!titleText) {
      deduct("usability", 8, "med", "Missing or empty <title>",
        "Add a descriptive <title> — it's the first thing people see in tabs, bookmarks and search results.");
    } else if (titleText.length > 60) {
      deduct("usability", 4, "low", "<title> is longer than 60 characters",
        "Shorten the page title so it doesn't get truncated in browser tabs and search results.");
    }

    // --- Consistency ---
    var inlineStyled = doc.querySelectorAll("[style]");
    if (inlineStyled.length > 8) {
      deduct("consistency", Math.min(20, Math.floor(inlineStyled.length / 4)), "low",
        inlineStyled.length + " elements use inline style attributes",
        "Move repeated inline styles into shared CSS classes so spacing, color and type stay consistent across the page.");
    }
    var fontFamilies = {};
    Array.prototype.slice.call(doc.querySelectorAll("[style*='font-family']")).forEach(function (el) {
      var m = el.getAttribute("style").match(/font-family\s*:\s*([^;]+)/i);
      if (m) fontFamilies[m[1].trim().toLowerCase()] = true;
    });
    var fontCount = Object.keys(fontFamilies).length;
    if (fontCount > 2) {
      deduct("consistency", Math.min(15, (fontCount - 2) * 5), "med",
        fontCount + " different font-family declarations found inline",
        "Standardise on one display and one body typeface (set globally via CSS) so the page reads as one product.");
    }

    // --- Conversion clarity ---
    var buttons = Array.prototype.slice.call(doc.querySelectorAll("button, a.btn, input[type=submit], .button, .cta"));
    var ctaCandidates = buttons.length ? buttons : links;
    if (ctaCandidates.length === 0) {
      deduct("conversion", 25, "high", "No buttons or call-to-action elements found",
        "Add at least one clear, primary call-to-action that tells visitors exactly what to do next.");
    } else if (ctaCandidates.length > 6) {
      deduct("conversion", 12, "med", ctaCandidates.length + " competing call-to-action elements found",
        "Pick one primary action per view. Demote the rest to text links or secondary buttons so the main CTA stands out.");
    }

    // --- Performance signals ---
    var scripts = doc.querySelectorAll("script");
    if (scripts.length > 10) {
      deduct("performance", Math.min(20, scripts.length), "med",
        scripts.length + " <script> tags found",
        "Bundle and defer non-critical scripts. Each extra <script> tag adds a render-blocking risk on first load.");
    }
    var imgsNoSize = imgs.filter(function (i) { return !i.hasAttribute("width") || !i.hasAttribute("height"); });
    if (imgsNoSize.length) {
      deduct("performance", Math.min(20, imgsNoSize.length * 4), "med",
        imgsNoSize.length + " image" + (imgsNoSize.length > 1 ? "s" : "") + " missing width/height",
        "Set explicit width and height on <img> elements so the browser reserves space and avoids layout shift while images load.");
    }

    if (issues.length === 0) {
      issues.push({ sev: "low", title: "No structural issues detected in this static check",
        fix: "Nice work. This client-side check covers structure and semantics — pair it with a visual review for contrast, spacing and copy." });
    }

    var overall = Math.round(
      scores.hierarchy * 0.18 + scores.usability * 0.18 + scores.accessibility * 0.22 +
      scores.consistency * 0.14 + scores.conversion * 0.16 + scores.performance * 0.12
    );

    return { overall: overall, scores: scores, issues: issues, filename: filename || "your-page.html" };
  }

  var SEV_ORDER = { high: 0, med: 1, low: 2 };
  var SEV_LABEL = { high: "HIGH", med: "MED", low: "LOW" };
  var SEV_CLASS = { high: "issue--high", med: "issue--med", low: "issue--low" };
  var SEV_TAG_CLASS = { high: "", med: "issue__sev--med", low: "issue__sev--low" };

  function renderResults(result) {
    var box = document.getElementById("scanner-results");
    document.getElementById("result-file").textContent = result.filename;
    document.getElementById("result-score").textContent = result.overall;

    var subWrap = document.getElementById("result-submeters");
    subWrap.innerHTML = "";
    var labels = { hierarchy: "Visual hierarchy", usability: "Usability", accessibility: "Accessibility", consistency: "Consistency", conversion: "Conversion clarity", performance: "Performance signals" };
    Object.keys(labels).forEach(function (key) {
      var v = Math.round(result.scores[key]);
      var li = document.createElement("li");
      li.className = "sm";
      li.innerHTML = '<span class="sm__name">' + labels[key] + '</span>' +
        '<span class="sm__bar"><i style="--v:' + v + '%"></i></span>' +
        '<span class="sm__val">' + v + '</span>';
      subWrap.appendChild(li);
    });

    var issuesWrap = document.getElementById("result-issues");
    issuesWrap.innerHTML = "";
    var sorted = result.issues.slice().sort(function (a, b) { return SEV_ORDER[a.sev] - SEV_ORDER[b.sev]; });
    sorted.forEach(function (it) {
      var li = document.createElement("li");
      li.className = "issue " + SEV_CLASS[it.sev];
      var sevSpan = document.createElement("span");
      sevSpan.className = "issue__sev " + SEV_TAG_CLASS[it.sev];
      sevSpan.setAttribute("aria-label", it.sev + " impact");
      sevSpan.textContent = SEV_LABEL[it.sev];
      var content = document.createElement("div");
      var h3 = document.createElement("h3"); h3.textContent = it.title;
      var p = document.createElement("p");
      var fixLabel = document.createElement("span"); fixLabel.className = "fix"; fixLabel.textContent = "Fix:";
      p.appendChild(fixLabel); p.appendChild(document.createTextNode(" " + it.fix));
      content.appendChild(h3); content.appendChild(p);
      li.appendChild(sevSpan); li.appendChild(content);
      issuesWrap.appendChild(li);
    });

    box.hidden = false;
    requestAnimationFrame(function () {
      subWrap.querySelectorAll(".sm__bar i").forEach(function (i) {
        i.style.transition = "width 1s cubic-bezier(.2,.7,.2,1)";
        i.style.width = i.style.getPropertyValue("--v");
      });
    });
    if (!reduce) box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function wireRealScanner() {
    var textarea = document.getElementById("html-input");
    var fileInput = document.getElementById("html-file");
    var btn = document.getElementById("run-scan-btn");
    var hint = document.getElementById("scanner-hint");
    if (!btn) return;

    var currentFilename = "";

    fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      currentFilename = file.name;
      var reader = new FileReader();
      reader.onload = function (e) {
        textarea.value = e.target.result;
        hint.textContent = "Loaded " + file.name + " — click \"Run real scan\".";
        hint.className = "scanner__hint";
      };
      reader.onerror = function () {
        hint.textContent = "Couldn't read that file. Try pasting the HTML instead.";
        hint.className = "scanner__hint scanner__hint--err";
      };
      reader.readAsText(file);
    });

    btn.addEventListener("click", function () {
      var html = textarea.value;
      if (!html || !html.trim()) {
        hint.textContent = "Paste some HTML or choose a file first.";
        hint.className = "scanner__hint scanner__hint--err";
        textarea.focus();
        return;
      }
      hint.textContent = "";
      var result = runAnalysis(html, currentFilename || "pasted-source.html");
      renderResults(result);
    });
  }

  function init() {
    drawGauge();
    animateScore(78);
    wireCards();
    wireReveal();
    wireScan();
    wireRealScanner();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
