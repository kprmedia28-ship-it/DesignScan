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

  function init() {
    drawGauge();
    animateScore(78);
    wireCards();
    wireReveal();
    wireScan();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
