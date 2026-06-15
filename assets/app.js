/* DesignScan — interaction & instrument rendering
   Everything here is progressive enhancement: the page is fully
   readable with JS disabled. JS adds the live gauge, demo scan,
   real HTML scanner, industry weighting, fix-it request flow and
   the EN/NL language toggle. */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var CX = 140, CY = 140, R = 92;
  var A_MIN = -120, A_MAX = 120;          // sweep, degrees from 12 o'clock
  var svgNS = "http://www.w3.org/2000/svg";
  var LANG = "en";

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

    arc.appendChild(seg(arcPath(R, A_MIN, A_MAX), "#E4E6E9", 12));
    arc.appendChild(seg(arcPath(R, valToAngle(0),  valToAngle(50)),  "#E23A2E", 12));
    arc.appendChild(seg(arcPath(R, valToAngle(50), valToAngle(75)),  "#E0A12B", 12));
    arc.appendChild(seg(arcPath(R, valToAngle(75), valToAngle(100)), "#2E9E5B", 12));

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

  function updateGaugeAriaLabel(score) {
    var svg = document.querySelector(".gauge__svg");
    if (!svg) return;
    var gradeKey = score >= 85 ? "hero.gradeStrong" : score >= 70 ? "hero.gradeGood" : "hero.gradeWeak";
    svg.setAttribute("aria-label", t("aria.gaugeLabel", { score: score, grade: t(gradeKey) }));
  }

  function animateScore(target) {
    var needle = document.getElementById("gauge-needle");
    var scoreEl = document.getElementById("gauge-score");
    var endA = valToAngle(target);
    if (reduce) {
      if (needle) needle.style.transform = "rotate(" + endA + "deg)";
      if (scoreEl) scoreEl.textContent = target;
      updateGaugeAriaLabel(target);
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
      else updateGaugeAriaLabel(target);
    }
    requestAnimationFrame(frame);
  }

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
    var industrySelect = document.getElementById("hero-industry-select");
    var industryLine = document.getElementById("readout-industry-line");
    var errorEl = document.getElementById("url-error");
    var bridge = document.getElementById("hero-bridge");
    if (!form) return;

    if (input && errorEl) {
      input.addEventListener("input", function () {
        if (input.getAttribute("aria-invalid") === "true") {
          input.removeAttribute("aria-invalid");
          errorEl.hidden = true;
        }
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var url = (input.value || "").trim();
      if (!url) {
        input.setAttribute("aria-invalid", "true");
        if (errorEl) { errorEl.textContent = t("field.urlRequired"); errorEl.hidden = false; }
        input.focus();
        return;
      }
      input.removeAttribute("aria-invalid");
      if (errorEl) errorEl.hidden = true;
      var host = url.replace(/^https?:\/\//, "").replace(/\/.*$/, "") || "your-site.com";
      var industryKey = industrySelect ? industrySelect.value : "general";
      var profile = INDUSTRY_PROFILES[industryKey] || INDUSTRY_PROFILES.general;

      if (label) label.textContent = t("hero.scanBtnLoading");
      btn.disabled = true;

      // derive 4 pseudo category scores (62–96) from the hostname, deterministically
      var seed = 0; for (var k = 0; k < host.length; k++) seed += host.charCodeAt(k);
      var catScores = {};
      CATEGORY_KEYS.forEach(function (cat, idx) {
        var offset = [0, 9, -7, 4][idx] || 0;
        catScores[cat] = Math.max(55, Math.min(97, 62 + ((seed * (idx + 3)) % 32) + offset));
      });
      var w = profile.weights;
      var score = Math.round(CATEGORY_KEYS.reduce(function (sum, cat) { return sum + catScores[cat] * w[cat]; }, 0));

      setTimeout(function () {
        if (src) src.textContent = "demo · " + host;
        if (industryLine) {
          if (industryKey === "general") {
            industryLine.hidden = true;
          } else {
            industryLine.hidden = false;
            industryLine.textContent = t("scanner.weightedFor", { industry: t(profile.labelKey) });
          }
        }
        document.getElementById("gauge-needle").style.transform = "rotate(-120deg)";
        document.getElementById("gauge-score").textContent = "0";
        animateScore(score);
        var grade = document.getElementById("gauge-grade");
        if (grade) {
          grade.dataset.locked = "true";
          grade.textContent = score >= 85 ? t("hero.gradeStrong")
                         : score >= 70 ? t("hero.gradeGood")
                         : t("hero.gradeWeak");
        }
        document.querySelectorAll("#submeters .sm").forEach(function (sm, idx) {
          var cat = CATEGORY_KEYS[idx];
          var v = Math.round(catScores[cat]);
          sm.querySelector(".sm__val").textContent = v;
          sm.querySelector(".sm__bar i").style.width = v + "%";
        });
        if (label) label.textContent = t("hero.scanBtnAgain");
        btn.disabled = false;
        if (bridge) { bridge.innerHTML = t("hero.bridge"); bridge.hidden = false; }
        // make this URL available to the Fix-it brief without retyping
        var ffUrlInput = document.getElementById("ff-url");
        if (ffUrlInput && (!ffUrlInput.value.trim() || ffUrlInput.dataset.autofilled === "true")) {
          ffUrlInput.value = url;
          ffUrlInput.dataset.autofilled = "true";
          var prefillNote = document.getElementById("ff-prefill-note");
          if (prefillNote) prefillNote.hidden = false;
        }
        document.querySelector(".readout").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      }, reduce ? 50 : 900);
    });
  }

  // ================================================================
  //  i18n — static UI strings (EN/NL)
  // ================================================================
  var I18N = {
    en: {
      "skip": "Skip to content",
      "aria.gaugeLabel": "Overall design score: {score} out of 100, rated {grade}",
      "nav.how": "How it works", "nav.criteria": "What we measure", "nav.industries": "By industry",
      "nav.scan": "Real scan", "nav.report": "Sample report", "nav.cta": "Scan a page",
      "hero.eyebrow": "Objective UI/UX measurement",
      "hero.title": 'How good is your<br>design, <span class="ink-em">really</span>?',
      "hero.lede": "Paste a URL and DesignScan reads it the way a senior product designer would — six calibrated criteria, a single honest score, and the specific fixes that move the needle.",
      "hero.scanLabel": "Page to scan", "hero.scanBtn": "Scan my design", "hero.scanBtnLoading": "Reading…", "hero.scanBtnAgain": "Scan again",
      "hero.scanNote": "Free preview · No sign-up · Result in seconds",
      "field.urlRequired": "Enter a URL so DesignScan knows what to read.",
      "hero.bridge": 'Want the real analysis, not a demo? <a href="#run-scan">Paste your page HTML below</a> — your industry choice carries over.',
      "hero.trust1": "Heuristic-based", "hero.trust2": "Accessibility-aware", "hero.trust3": "Conversion-focused",
      "hero.live": "LIVE&nbsp;READING", "hero.grade": "Good — three fixes from great",
      "hero.gradeStrong": "Strong — minor polish only", "hero.gradeGood": "Good — three fixes from great", "hero.gradeWeak": "Needs work — clear wins available",
      "cat.ux": "UX", "cat.ui": "UI", "cat.journey": "Journey Score", "cat.engagement": "Engagement Score",
      "crit.interactionClarity": "Interaction clarity", "crit.cognitiveLoad": "Cognitive load", "crit.accessibilityBasics": "Accessibility basics",
      "crit.visualHierarchy": "Visual hierarchy", "crit.colorContrast": "Color & contrast", "crit.typography": "Typography",
      "crit.flowToAction": "Flow from entry to action", "crit.frictionPoints": "Friction points", "crit.dropOffRisk": "Drop-off risk",
      "crit.feedbackLoops": "Feedback loops", "crit.motivation": "Motivation", "crit.progressSignals": "Progress signals",
      "how.eyebrow": "The method", "how.title": "Three steps, no questionnaire",
      "how.s1.title": "Point it at a page",
      "how.s1.body": "Drop in a live URL or upload a screenshot. DesignScan captures the layout, type, color and structure as a real visitor receives it.",
      "how.s2.title": "It reads against the rubric",
      "how.s2.body": "Every element is checked against six calibrated criteria drawn from established usability heuristics and accessibility standards — not vibes.",
      "how.s3.title": "You get the fixes",
      "how.s3.body": "A scored breakdown lands with the highest-impact issues first, each paired with a concrete change your team can ship today.",
      "criteria.eyebrow": "The rubric", "criteria.title": "Four scores, twelve signals",
      "criteria.sub": "Every page is read against twelve signals, grouped into four scores. You see exactly where the points leak — and where you already win.",
      "cat.ux.body": "Can people understand and operate the page without extra effort?",
      "cat.ui.body": "Does the page look intentional — structured, legible and consistent?",
      "cat.journey.body": "Does the page actually move people from arrival to the action that matters?",
      "cat.engagement.body": "Does the page respond, reassure and motivate people to keep going?",
      "criteria.interactionClarity.body": "Are links, buttons and navigation labelled clearly enough to act on without guessing?",
      "criteria.cognitiveLoad.body": "Is content broken into digestible pieces, or does it ask too much at once?",
      "criteria.accessibilityBasics.body": "Alt text, labels, language and semantics — the foundations assistive tech relies on.",
      "criteria.visualHierarchy.body": "Does the eye land where it should? We check headings, scale, spacing and grouping against the page's actual goal.",
      "criteria.colorContrast.body": "Do text/background pairs meet WCAG contrast thresholds, so content is legible for everyone?",
      "criteria.typography.body": "One type scale, one set of voices. We flag the drift that quietly erodes trust.",
      "criteria.flowToAction.body": "Is the next action obvious, singular and reachable from where people land?",
      "criteria.frictionPoints.body": "Long forms, missing search, hidden contact details — the small costs that add up.",
      "criteria.dropOffRisk.body": "Technical signals — scripts, image weight, layout stability — that predict who leaves early.",
      "criteria.feedbackLoops.body": "Does the page confirm what just happened, especially after a form is submitted?",
      "criteria.motivation.body": "Trust signals, social proof and reassurance that make people comfortable continuing.",
      "criteria.progressSignals.body": "For longer tasks, can people see how far they are and how much remains?",
      "industries.eyebrow": "Same rubric, different stakes", "industries.title": "What matters most in your industry",
      "industries.sub": "The six criteria stay the same everywhere — but how much each one weighs, and which extra checks apply, depends on what your visitors came to do.",
      "ind.weightsHeading": "Where the score weight goes", "ind.focusHeading": "What the scan focuses on",
      "scanner.eyebrow": "Try it on your own page", "scanner.title": "Scan your HTML — for real",
      "scanner.sub": 'Paste the page source or drop in an <code>.html</code> file. DesignScan reads it against the rubric right here in your browser — nothing is uploaded anywhere.',
      "scanner.inputLabel": "Page source (HTML)",
      "scanner.placeholder": "Right-click your page → View Page Source → copy/paste here. Or use the file picker below.",
      "scanner.industryLabel": "Industry", "scanner.chooseFile": "Choose .html file", "scanner.runBtn": "Run real scan",
      "scanner.loadSample": "Try a sample",
      "scanner.overall": "Overall",
      "scanner.hintEmpty": "Paste some HTML or choose a file first.",
      "scanner.hintLoaded": "Loaded {file} — click \"Run real scan\".",
      "scanner.hintSampleLoaded": "Sample page loaded — click \"Run real scan\" to see it in action.",
      "scanner.hintError": "Couldn't read that file. Try pasting the HTML instead.",
      "scanner.weightedFor": "Weighted for {industry}",
      "scanner.followup.text": "Want this turned into a plan your team can execute, with us reviewing it personally?",
      "scanner.followup.btn": "Fill in your Fix-it brief for this scan",
      "report.eyebrow": "What lands in your inbox", "report.title": "A report you can act on",
      "report.sub": "Issues ranked by impact, each with the change to make. No 40-page PDF, no fluff.",
      "report.fixLabel": "Fix:",
      "report.i1.title": "Primary CTA competes with three secondary buttons",
      "report.i1.fix": 'Demote secondary actions to text links so "Add to cart" is the only filled button above the fold. Expected lift in click-through clarity.',
      "report.i2.title": "Body text contrast fails AA on the hero",
      "report.i2.fix": "#8A8A8A on white reads 2.9:1. Darken to #595959 to clear the 4.5:1 threshold without touching the palette.",
      "report.i3.title": "Inconsistent spacing between sections",
      "report.i3.fix": "Three different vertical gaps (48 / 56 / 72px) read as accidental. Snap to an 8px scale — pick 64px and hold it.",
      "report.i4.title": "Focus state missing on the search field",
      "report.i4.fix": "Add a 2px visible focus ring so keyboard users can see where they are.",
      "fixit.eyebrow": "Done for you",
      "fixit.title": "Don't want to fix it yourself?<br>We will.",
      "fixit.lede": 'A scan tells you what\'s wrong. The <strong>Fix my website</strong> service tells you exactly how to make it right — and gives your team a ready-to-build plan.',
      "fixit.f1.title": "Core issues, ranked by impact",
      "fixit.f1.body": "The exact blockers hurting conversion, clarity and trust — not a generic checklist.",
      "fixit.f2.title": "Turnaround",
      "fixit.f2.body": "Delivered within four working days, so you can act before more visitors leave.",
      "fixit.f3.title": "Built for your team",
      "fixit.f3.body": "Each fix is written so a designer or developer can implement it the same day — copy, layout and code references included.",
      "fixit.priceFrom": "From", "fixit.priceUnit": " · one-time",
      "fixit.cta": "Build my Fix-it brief",
      "fixit.note": 'Or run a free scan first — <a href="#run-scan">scan your HTML</a> or <a href="#scan">scan a URL</a>.',
      "fixitForm.title": "Build your Fix-it brief",
      "fixitForm.intro": "Fill in a few details below. If you've run a scan, its full results — scores, fixes and ready-to-build plans for every issue — are bundled in automatically. No email required: download the brief or copy it to share with your team.",
      "fixitForm.name": "Your name", "fixitForm.url": "Website",
      "fixitForm.industry": "Industry", "fixitForm.notes": "Anything specific you'd like us to focus on? (optional)",
      "fixitForm.attached": "Attached scan summary:",
      "fixitForm.prefillNote": "Website and industry are filled in from your scan above — change them here if needed.",
      "fixitForm.submit": "Download brief", "fixitForm.copy": "Copy brief as text",
      "fixitForm.disclaimer": "Everything stays on your device — nothing is sent anywhere. The brief downloads as a text file you can share however you like.",
      "fixitForm.doneTitle": "<strong>Brief ready.</strong>",
      "fixitForm.doneBody": "Your brief has downloaded as a text file. Open it, attach it to an email, or paste it wherever you need it — share it with your team or agency to get started.",
      "fixitForm.hintMissing": "Please fill in your name and your website.",
      "fixitForm.copied": "Copied to clipboard.",
      "fixitForm.copyFailed": "Couldn't copy automatically — select the text below and copy it manually.",
      "fixitForm.briefTitle": "DesignScan Fix-it brief",
      "fixitForm.summaryTitle": "DesignScan summary",
      "fixitForm.summaryScore": "Overall score",
      "fixitForm.summaryIndustry": "Industry",
      "fixitForm.summaryTopIssues": "Top issues",
      "fixitForm.summaryMore": "...and {n} more issue(s) — full list included in the downloaded brief.",
      "fixitForm.categoryScores": "Score breakdown",
      "fixitForm.allIssues": "All issues, ranked by impact, with fixes and a ready-to-build plan",
      "fixitForm.codeLabel": "Code",
      "fixitForm.noScanYet": "No scan has been run yet. Run a real scan above, then come back here — your results, fixes and ready-to-build plans will be included in the brief automatically.",
      "fixitForm.noScanInline": 'No scan results yet — a demo reading on the homepage doesn\u2019t count. <a href="#run-scan">Run the real HTML scan above</a> and your scores, fixes and plans will be added to this brief automatically.',
      "cta.title": "Stop guessing what's wrong.<br>Measure it.", "cta.btn": "Scan my design",
      "footer.tag": "Objective design analysis", "footer.privacy": "Privacy Policy", "footer.terms": "Terms of Service",
      "issue.tag": "Industry",
      "issue.planShow": "Show fix plan", "issue.planHide": "Hide fix plan",
      "issue.planHeading": "Ready-to-build plan",
      "industries.general.label": "General (no industry focus)",
      "industries.ecommerce.label": "E-commerce / webshop",
      "industries.saas.label": "SaaS / software",
      "industries.healthcare.label": "Zorg & gezondheid",
      "industries.finance.label": "Financiële diensten",
      "industries.hospitality.label": "Horeca & lokale dienstverlening",
      "industries.education.label": "Onderwijs",
      "industries.realestate.label": "Vastgoed",
      "industries.nonprofit.label": "Non-profit & overheid",
      "industries.agency.label": "Agency / portfolio"
    },
    nl: {
      "skip": "Naar de inhoud",
      "aria.gaugeLabel": "Algemene designscore: {score} van de 100, beoordeeld als {grade}",
      "nav.how": "Hoe het werkt", "nav.criteria": "Wat we meten", "nav.industries": "Per branche",
      "nav.scan": "Echte scan", "nav.report": "Voorbeeldrapport", "nav.cta": "Scan een pagina",
      "hero.eyebrow": "Objectieve UI/UX-meting",
      "hero.title": 'Hoe goed is je<br>design, <span class="ink-em">echt</span>?',
      "hero.lede": "Plak een URL en DesignScan leest je pagina zoals een senior productdesigner dat zou doen — zes gecalibreerde criteria, één eerlijke score, en de exacte fixes die het verschil maken.",
      "hero.scanLabel": "Pagina om te scannen", "hero.scanBtn": "Scan mijn design", "hero.scanBtnLoading": "Aan het lezen…", "hero.scanBtnAgain": "Opnieuw scannen",
      "hero.scanNote": "Gratis preview · Geen account · Resultaat in seconden",
      "field.urlRequired": "Vul een URL in zodat DesignScan weet wat te lezen.",
      "hero.bridge": 'Liever een echte analyse dan een demo? <a href="#run-scan">Plak de HTML van je pagina hieronder</a> — je branchekeuze blijft behouden.',
      "hero.trust1": "Heuristiek-gebaseerd", "hero.trust2": "Toegankelijkheidsbewust", "hero.trust3": "Conversiegericht",
      "hero.live": "LIVE&nbsp;METING", "hero.grade": "Goed — drie fixes van geweldig",
      "hero.gradeStrong": "Sterk — alleen kleine puntjes op de i", "hero.gradeGood": "Goed — drie fixes van geweldig", "hero.gradeWeak": "Werk aan de winkel — duidelijke quick wins",
      "cat.ux": "UX", "cat.ui": "UI", "cat.journey": "Journey Score", "cat.engagement": "Engagement Score",
      "crit.interactionClarity": "Interactiehelderheid", "crit.cognitiveLoad": "Cognitieve belasting", "crit.accessibilityBasics": "Toegankelijkheidsbasis",
      "crit.visualHierarchy": "Visuele hiërarchie", "crit.colorContrast": "Kleur & contrast", "crit.typography": "Typografie",
      "crit.flowToAction": "Pad van binnenkomst naar actie", "crit.frictionPoints": "Frictiepunten", "crit.dropOffRisk": "Afhaakrisico",
      "crit.feedbackLoops": "Feedbackloops", "crit.motivation": "Motivatie", "crit.progressSignals": "Voortgangssignalen",
      "how.eyebrow": "De methode", "how.title": "Drie stappen, geen vragenlijst",
      "how.s1.title": "Richt het op een pagina",
      "how.s1.body": "Voer een live URL in of upload een screenshot. DesignScan legt de layout, typografie, kleur en structuur vast zoals een echte bezoeker die ziet.",
      "how.s2.title": "Het toetst aan de rubric",
      "how.s2.body": "Elk element wordt getoetst aan zes gecalibreerde criteria, gebaseerd op gangbare usability-heuristieken en toegankelijkheidsstandaarden — geen onderbuikgevoel.",
      "how.s3.title": "Je krijgt de fixes",
      "how.s3.body": "Je krijgt een gescoorde uitsplitsing met de issues met de meeste impact eerst, elk gekoppeld aan een concrete wijziging die je team vandaag kan doorvoeren.",
      "criteria.eyebrow": "De rubric", "criteria.title": "Vier scores, twaalf signalen",
      "criteria.sub": "Elke pagina wordt getoetst op twaalf signalen, gegroepeerd in vier scores. Je ziet precies waar punten weglekken — en waar je al goed scoort.",
      "cat.ux.body": "Kunnen mensen de pagina begrijpen en bedienen zonder extra moeite?",
      "cat.ui.body": "Oogt de pagina doordacht — gestructureerd, leesbaar en consistent?",
      "cat.journey.body": "Beweegt de pagina mensen écht van binnenkomst naar de actie die telt?",
      "cat.engagement.body": "Reageert de pagina, stelt ze gerust en motiveert ze mensen om door te gaan?",
      "criteria.interactionClarity.body": "Zijn links, knoppen en navigatie duidelijk genoeg gelabeld om zonder gokken te gebruiken?",
      "criteria.cognitiveLoad.body": "Is de inhoud opgedeeld in behapbare stukken, of vraagt het te veel in één keer?",
      "criteria.accessibilityBasics.body": "Alt-tekst, labels, taal en semantiek — de basis waarop hulptechnologie steunt.",
      "criteria.visualHierarchy.body": "Landt het oog waar het moet? We checken koppen, schaal, ruimte en groepering tegen het feitelijke doel van de pagina.",
      "criteria.colorContrast.body": "Voldoen tekst/achtergrond-combinaties aan WCAG-contrastdrempels, zodat inhoud voor iedereen leesbaar is?",
      "criteria.typography.body": "Eén type-schaal, één stem. We signaleren de afwijkingen die langzaam vertrouwen ondermijnen.",
      "criteria.flowToAction.body": "Is de volgende actie duidelijk, enkelvoudig en bereikbaar vanaf het punt van binnenkomst?",
      "criteria.frictionPoints.body": "Lange formulieren, geen zoekfunctie, verstopte contactgegevens — de kleine kosten die optellen.",
      "criteria.dropOffRisk.body": "Technische signalen — scripts, beeldgewicht, layout-stabiliteit — die voorspellen wie vroeg afhaakt.",
      "criteria.feedbackLoops.body": "Bevestigt de pagina wat er net is gebeurd, vooral na het versturen van een formulier?",
      "criteria.motivation.body": "Vertrouwenssignalen, social proof en geruststelling die mensen comfortabel laten doorgaan.",
      "criteria.progressSignals.body": "Kunnen mensen bij langere taken zien hoe ver ze zijn en hoeveel er nog rest?",
      "industries.eyebrow": "Dezelfde rubric, andere belangen", "industries.title": "Wat het meest telt in jouw branche",
      "industries.sub": "De zes criteria blijven overal hetzelfde — maar hoe zwaar elk criterium telt, en welke extra checks gelden, hangt af van waarvoor je bezoekers komen.",
      "ind.weightsHeading": "Waar het scoregewicht naartoe gaat", "ind.focusHeading": "Waar de scan extra op focust",
      "scanner.eyebrow": "Probeer het op je eigen pagina", "scanner.title": "Scan je HTML — echt",
      "scanner.sub": 'Plak de paginabron of upload een <code>.html</code>-bestand. DesignScan toetst het direct in je browser aan de rubric — er wordt niets geüpload.',
      "scanner.inputLabel": "Paginabron (HTML)",
      "scanner.placeholder": "Rechtsklik je pagina → Paginabron weergeven → kopieer/plak hier. Of gebruik de bestandskiezer hieronder.",
      "scanner.industryLabel": "Branche", "scanner.chooseFile": "Kies .html-bestand", "scanner.runBtn": "Voer echte scan uit",
      "scanner.loadSample": "Probeer een voorbeeld",
      "scanner.overall": "Totaal",
      "scanner.hintEmpty": "Plak eerst HTML of kies een bestand.",
      "scanner.hintLoaded": "{file} geladen — klik op \"Voer echte scan uit\".",
      "scanner.hintSampleLoaded": "Voorbeeldpagina geladen — klik op \"Voer echte scan uit\" om te zien hoe het werkt.",
      "scanner.hintError": "Kon dat bestand niet lezen. Probeer de HTML te plakken.",
      "scanner.weightedFor": "Gewogen voor {industry}",
      "scanner.followup.text": "Hier een plan van willen waarmee je team aan de slag kan, persoonlijk door ons doorgenomen?",
      "scanner.followup.btn": "Vul je Fix-it-brief in voor deze scan",
      "report.eyebrow": "Wat in je inbox landt", "report.title": "Een rapport waar je mee aan de slag kunt",
      "report.sub": "Issues gerangschikt op impact, elk met de aanpassing die nodig is. Geen rapport van 40 pagina's, geen ruis.",
      "report.fixLabel": "Fix:",
      "report.i1.title": "Primaire CTA concurreert met drie secundaire knoppen",
      "report.i1.fix": 'Demoot secundaire acties tot tekstlinks zodat "In winkelwagen" de enige gevulde knop boven de vouw is. Verwacht effect: duidelijkere klikrichting.',
      "report.i2.title": "Contrast van bodytekst voldoet niet aan AA in de hero",
      "report.i2.fix": "#8A8A8A op wit geeft 2,9:1. Verdonker naar #595959 om de 4,5:1-drempel te halen zonder het palet aan te passen.",
      "report.i3.title": "Inconsistente ruimte tussen secties",
      "report.i3.fix": "Drie verschillende verticale marges (48 / 56 / 72px) ogen onbedoeld. Stap over op een 8px-schaal — kies 64px en houd dat vast.",
      "report.i4.title": "Focusstatus ontbreekt op het zoekveld",
      "report.i4.fix": "Voeg een zichtbare focusring van 2px toe zodat toetsenbordgebruikers zien waar ze zijn.",
      "fixit.eyebrow": "Voor je gedaan",
      "fixit.title": "Geen tijd om het zelf te fixen?<br>Wij doen het.",
      "fixit.lede": 'Een scan laat zien wat er mis is. De <strong>Fix my website</strong>-service laat precies zien hoe je het oplost — en geeft je team een direct uitvoerbaar plan.',
      "fixit.f1.title": "Kernissues, gerangschikt op impact",
      "fixit.f1.body": "De exacte blokkades die conversie, helderheid en vertrouwen schaden — geen generieke checklist.",
      "fixit.f2.title": "Doorlooptijd",
      "fixit.f2.body": "Geleverd binnen vier werkdagen, zodat je kunt handelen voordat er meer bezoekers afhaken.",
      "fixit.f3.title": "Gemaakt voor jouw team",
      "fixit.f3.body": "Elke fix is zo geschreven dat een designer of developer hem dezelfde dag kan doorvoeren — inclusief copy-, layout- en coderichtlijnen.",
      "fixit.priceFrom": "Vanaf", "fixit.priceUnit": " · eenmalig",
      "fixit.cta": "Stel mijn Fix-it-brief samen",
      "fixit.note": 'Of draai eerst een gratis scan — <a href="#run-scan">scan je HTML</a> of <a href="#scan">scan een URL</a>.',
      "fixitForm.title": "Stel je Fix-it-brief samen",
      "fixitForm.intro": "Vul hieronder een paar details in. Heb je een scan uitgevoerd? Dan worden de volledige resultaten — scores, fixes en direct uitvoerbare plannen per issue — automatisch toegevoegd. Geen e-mail nodig: download de brief of kopieer hem om te delen met je team.",
      "fixitForm.name": "Je naam", "fixitForm.url": "Website",
      "fixitForm.industry": "Branche", "fixitForm.notes": "Iets specifieks waar we op moeten focussen? (optioneel)",
      "fixitForm.attached": "Bijgevoegde scansamenvatting:",
      "fixitForm.prefillNote": "Website en branche zijn overgenomen van je scan hierboven — pas ze hier aan indien nodig.",
      "fixitForm.submit": "Download brief", "fixitForm.copy": "Kopieer brief als tekst",
      "fixitForm.disclaimer": "Alles blijft op je eigen apparaat — er wordt niets verzonden. De brief downloadt als tekstbestand dat je kunt delen zoals jij wilt.",
      "fixitForm.doneTitle": "<strong>Brief gereed.</strong>",
      "fixitForm.doneBody": "Je brief is gedownload als tekstbestand. Open het, voeg het toe aan een e-mail, of plak het waar je het nodig hebt — deel het met je team of bureau om aan de slag te gaan.",
      "fixitForm.hintMissing": "Vul je naam en je website in.",
      "fixitForm.copied": "Gekopieerd naar klembord.",
      "fixitForm.copyFailed": "Kon niet automatisch kopiëren — selecteer de tekst hieronder en kopieer hem handmatig.",
      "fixitForm.briefTitle": "DesignScan Fix-it-brief",
      "fixitForm.summaryTitle": "DesignScan-samenvatting",
      "fixitForm.summaryScore": "Totaalscore",
      "fixitForm.summaryIndustry": "Branche",
      "fixitForm.summaryTopIssues": "Belangrijkste issues",
      "fixitForm.summaryMore": "...en nog {n} issue(s) — volledige lijst staat in de gedownloade brief.",
      "fixitForm.categoryScores": "Score-uitsplitsing",
      "fixitForm.allIssues": "Alle issues, gerangschikt op impact, met fixes en een direct uitvoerbaar plan",
      "fixitForm.codeLabel": "Code",
      "fixitForm.noScanYet": "Er is nog geen scan uitgevoerd. Voer hierboven een echte scan uit en kom dan terug — je resultaten, fixes en stappenplannen worden automatisch in de brief opgenomen.",
      "fixitForm.noScanInline": 'Nog geen scanresultaten — een demo-meting op de homepage telt niet mee. <a href="#run-scan">Voer hierboven de echte HTML-scan uit</a> en je scores, fixes en plannen worden automatisch aan deze brief toegevoegd.',
      "cta.title": "Stop met gokken wat er mis is.<br>Meet het.", "cta.btn": "Scan mijn design",
      "footer.tag": "Objectieve designanalyse", "footer.privacy": "Privacybeleid", "footer.terms": "Algemene voorwaarden",
      "issue.tag": "Branche",
      "issue.planShow": "Toon stappenplan", "issue.planHide": "Verberg stappenplan",
      "issue.planHeading": "Direct uitvoerbaar plan",
      "industries.general.label": "Algemeen (geen branchefocus)",
      "industries.ecommerce.label": "E-commerce / webshop",
      "industries.saas.label": "SaaS / software",
      "industries.healthcare.label": "Zorg & gezondheid",
      "industries.finance.label": "Financiële diensten",
      "industries.hospitality.label": "Horeca & lokale dienstverlening",
      "industries.education.label": "Onderwijs",
      "industries.realestate.label": "Vastgoed",
      "industries.nonprofit.label": "Non-profit & overheid",
      "industries.agency.label": "Agency / portfolio"
    }
  };

  function t(key, vars) {
    var dict = I18N[LANG] || I18N.en;
    var s = (dict[key] !== undefined) ? dict[key] : (I18N.en[key] !== undefined ? I18N.en[key] : key);
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.replace("{" + k + "}", vars[k]);
      });
    }
    return s;
  }

  // Apply static UI translations to every [data-i18n] element
  function applyStaticTranslations() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      var val = t(key);
      el.innerHTML = val;
    });
    document.documentElement.setAttribute("lang", LANG);
  }


  // ================================================================
  //  Industry profiles: weighting + extra checks + framing copy
  //  All copy is bilingual: { en: "...", nl: "..." }
  // ================================================================
  // New rubric: 4 categories, each with 3 sub-criteria (12 dimensions total)
  var CATEGORY_KEYS = ["ux", "ui", "journey", "engagement"];
  var CATEGORY_CRITERIA = {
    ux:         ["interactionClarity", "cognitiveLoad", "accessibilityBasics"],
    ui:         ["visualHierarchy", "colorContrast", "typography"],
    journey:    ["flowToAction", "frictionPoints", "dropOffRisk"],
    engagement: ["feedbackLoops", "motivation", "progressSignals"]
  };
  var CRIT_KEYS = CATEGORY_KEYS.reduce(function (acc, cat) { return acc.concat(CATEGORY_CRITERIA[cat]); }, []);
  function categoryOf(critKey) {
    for (var i = 0; i < CATEGORY_KEYS.length; i++) {
      if (CATEGORY_CRITERIA[CATEGORY_KEYS[i]].indexOf(critKey) !== -1) return CATEGORY_KEYS[i];
    }
    return null;
  }

  function bodyTextOf(doc) {
    return doc.body ? doc.body.textContent.replace(/\s+/g, " ").trim().toLowerCase() : "";
  }
  function textMatches(doc, list) {
    var txt = bodyTextOf(doc);
    return list.some(function (w) { return txt.indexOf(w) !== -1; });
  }
  function elementsMatchText(doc, selector, re) {
    return Array.prototype.slice.call(doc.querySelectorAll(selector))
      .filter(function (el) { return re.test((el.textContent || "").trim()); });
  }
  function avgSentenceLength(doc) {
    var txt = doc.body ? doc.body.textContent.replace(/\s+/g, " ").trim() : "";
    var sentences = txt.split(/[.!?]+/).map(function (s) { return s.trim(); }).filter(function (s) { return s.split(" ").length > 3; });
    if (sentences.length < 3) return null;
    var totalWords = sentences.reduce(function (sum, s) { return sum + s.split(/\s+/).length; }, 0);
    return totalWords / sentences.length;
  }

  // ---- Color/contrast helpers (WCAG 2.x relative luminance) ----
  var NAMED_COLORS = {
    white: "#ffffff", black: "#000000", red: "#ff0000", green: "#008000", blue: "#0000ff",
    gray: "#808080", grey: "#808080", silver: "#c0c0c0", yellow: "#ffff00", orange: "#ffa500",
    purple: "#800080", pink: "#ffc0cb", brown: "#a52a2a", navy: "#000080", teal: "#008080"
  };
  function parseColor(val) {
    val = val.trim().toLowerCase();
    if (NAMED_COLORS[val]) val = NAMED_COLORS[val];
    var m = val.match(/^#([0-9a-f]{3})$/);
    if (m) {
      var s = m[1];
      return [parseInt(s[0]+s[0],16), parseInt(s[1]+s[1],16), parseInt(s[2]+s[2],16)];
    }
    m = val.match(/^#([0-9a-f]{6})$/);
    if (m) {
      var h = m[1];
      return [parseInt(h.substr(0,2),16), parseInt(h.substr(2,2),16), parseInt(h.substr(4,2),16)];
    }
    m = val.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return [parseInt(m[1],10), parseInt(m[2],10), parseInt(m[3],10)];
    return null;
  }
  function relLuminance(rgb) {
    var c = rgb.map(function (v) {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrastRatio(rgb1, rgb2) {
    var l1 = relLuminance(rgb1), l2 = relLuminance(rgb2);
    var lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  // bi(en, nl) -> { en, nl } shorthand
  function bi(en, nl) { return { en: en, nl: nl }; }

  var INDUSTRY_PROFILES = {
    general: {
      labelKey: "industries.general.label",
      framing: bi(
        "A balanced read across all six criteria — useful as a baseline before zooming in on what your sector cares about most.",
        "Een evenwichtige meting over alle zes criteria — een goede basis voordat je inzoomt op wat in jouw branche het meest telt."
      ),
      weights: { ux: 0.28, ui: 0.24, journey: 0.26, engagement: 0.22 },
      focus: [
        bi("Visual hierarchy, usability and accessibility carry the most weight by default.",
           "Visuele hiërarchie, bruikbaarheid en toegankelijkheid wegen standaard het zwaarst."),
        bi("Conversion and consistency matter, but rarely decide the outcome on their own.",
           "Conversie en consistentie doen ertoe, maar bepalen zelden alleen de uitkomst."),
        bi("Performance signals round out the picture without dominating it.",
           "Performance-signalen maken het beeld compleet zonder te domineren.")
      ],
      checks: null
    },
    ecommerce: {
      labelKey: "industries.ecommerce.label",
      framing: bi(
        "Every extra click, every unclear price and every missing trust signal costs sales directly. Conversion clarity carries the most weight here.",
        "Elke extra klik, elke onduidelijke prijs en elk ontbrekend vertrouwenssignaal kost direct omzet. Conversiehelderheid weegt hier het zwaarst."
      ),
      weights: { ux: 0.20, ui: 0.18, journey: 0.36, engagement: 0.26 },
      focus: [
        bi("Conversion clarity is weighted heaviest — the path from product to checkout is the product.",
           "Conversiehelderheid weegt het zwaarst — het pad van product naar checkout is hét product."),
        bi("We check for trust signals (shipping, returns, guarantees) near the call-to-action.",
           "We checken op vertrouwenssignalen (verzending, retour, garantie) bij de call-to-action."),
        bi("We check for a visible search field, since shoppers who can't find a product leave.",
           "We checken op een zichtbaar zoekveld — shoppers die niets vinden, vertrekken.")
      ],
      checks: function (doc, push) {
        if (!textMatches(doc, ["return", "retour", "shipping", "verzending", "guarantee", "garantie", "secure checkout", "veilig betalen", "warranty"])) {
          push("motivation", 10, "med",
            bi("No shipping, returns or guarantee text detected", "Geen tekst over verzending, retour of garantie gevonden"),
            bi("Add a short trust line near your call-to-action — free returns, delivery time or a guarantee. Shoppers look for this before they buy.",
               "Voeg een korte vertrouwensregel toe bij je call-to-action — gratis retour, levertijd of garantie. Shoppers zoeken hier vóór ze kopen naar."),
            {
              steps: [
                bi("Pick one trust signal that's actually true for your store (e.g. \"30 days free returns\", \"Free shipping over €50\", \"2-year warranty\").",
                   "Kies één vertrouwenssignaal dat echt klopt voor jouw winkel (bv. \"30 dagen gratis retour\", \"Gratis verzending vanaf €50\", \"2 jaar garantie\")."),
                bi("Place it directly above or below the primary \"Add to cart\" / \"Buy\" button — not buried in the footer.",
                   "Plaats het direct boven of onder de primaire \"In winkelwagen\"/\"Koop\"-knop — niet verstopt in de footer."),
                bi("Repeat the same line (or icon row) on product and cart pages so it's never in doubt.",
                   "Herhaal dezelfde regel (of iconenrij) op product- en winkelwagenpagina's, zodat het nooit twijfelachtig is.")
              ],
              code: '<div class="trust-line">\n  <svg aria-hidden="true" ...></svg>\n  Free returns within 30 days\n</div>\n\n.trust-line {\n  display: flex; align-items: center; gap: 6px;\n  font-size: 13px; color: #4b5563; margin-top: 8px;\n}'
            }, true);
        }
        var search = doc.querySelector('input[type="search"], input[name*="search" i], input[id*="search" i], input[placeholder*="search" i], input[placeholder*="zoek" i]');
        if (!search) {
          push("frictionPoints", 8, "low",
            bi("No search field detected", "Geen zoekveld gevonden"),
            bi("Add a visible search field. On a catalogue of any size, search is the fastest path to a product.",
               "Voeg een zichtbaar zoekveld toe. Bij elke catalogusgrootte is zoeken de snelste route naar een product."),
            {
              steps: [
                bi("Add a labelled <input type=\"search\"> in the header, visible without scrolling.",
                   "Voeg een gelabeld <input type=\"search\"> toe in de header, zichtbaar zonder scrollen."),
                bi("Wire it to your existing product index or a simple client-side filter if the catalogue is small.",
                   "Koppel het aan je bestaande productindex, of een eenvoudig client-side filter bij een kleine catalogus."),
                bi("Show \"no results\" with a suggestion (popular categories) instead of an empty page.",
                   "Toon bij \"geen resultaten\" een suggestie (populaire categorieën) in plaats van een lege pagina.")
              ],
              code: '<form role="search" action="/search">\n  <label for="q" class="sr-only">Search products</label>\n  <input type="search" id="q" name="q" placeholder="Search products…">\n  <button type="submit">Search</button>\n</form>'
            }, true);
        }
      }
    },
    saas: {
      labelKey: "industries.saas.label",
      framing: bi(
        "Buyers compare you to three other tabs at once. Clarity on what it does, what it costs and how to try it decides whether they stay.",
        "Kopers vergelijken je met drie andere tabbladen tegelijk. Duidelijkheid over wat het doet, wat het kost en hoe je het uitprobeert bepaalt of ze blijven."
      ),
      weights: { ux: 0.22, ui: 0.20, journey: 0.30, engagement: 0.28 },
      focus: [
        bi("Conversion clarity and usability lead — the trial/demo path needs to be obvious within seconds.",
           "Conversiehelderheid en bruikbaarheid voorop — het trial/demo-pad moet binnen seconden duidelijk zijn."),
        bi("We check for visible pricing or a clear link to it.",
           "We checken op zichtbare prijzen of een duidelijke link daarnaartoe."),
        bi("We check for a primary 'start trial / book demo' action, not just generic buttons.",
           "We checken op een primaire \"start trial / boek demo\"-actie, niet alleen generieke knoppen.")
      ],
      checks: function (doc, push) {
        var pricingHeading = elementsMatchText(doc, "h1,h2,h3,a,button", /pricing|price|plan|\/\s*month|per\s*seat|\bprijs|\btarieven/i);
        var hasTable = doc.querySelector("table");
        if (!pricingHeading.length && !hasTable && !textMatches(doc, ["pricing", "€", "$", "/mo", "per month", "prijs"])) {
          push("flowToAction", 10, "med",
            bi("No pricing information or pricing link detected", "Geen prijsinformatie of prijslink gevonden"),
            bi("Show pricing, or at least a clear link to it. SaaS buyers expect to gauge cost before they invest time in a demo.",
               "Toon prijzen, of in elk geval een duidelijke link daarnaartoe. SaaS-kopers willen kosten kunnen inschatten voordat ze tijd in een demo steken."),
            {
              steps: [
                bi("Add a \"Pricing\" link to the main navigation, pointing to a dedicated page or section.",
                   "Voeg een \"Pricing\"-link toe aan de hoofdnavigatie, naar een eigen pagina of sectie."),
                bi("On that page, show at least one concrete number per plan — even \"from €X/month\" reduces hesitation.",
                   "Toon op die pagina minstens één concreet bedrag per plan — ook \"vanaf €X/maand\" verlaagt twijfel."),
                bi("If pricing is custom/enterprise-only, say so explicitly with a \"Contact sales\" path rather than leaving it blank.",
                   "Is prijzen op aanvraag/enterprise? Zeg dat dan expliciet, met een \"Contact sales\"-pad in plaats van niets te tonen.")
              ],
              code: null
            }, true);
        }
        var trialCta = elementsMatchText(doc, "a,button", /free trial|start trial|sign up|get started|book a demo|request a demo|probeer|gratis/i);
        if (!trialCta.length) {
          push("flowToAction", 8, "med",
            bi("No trial / sign-up / demo call-to-action detected", "Geen trial-, sign-up- of demo-CTA gevonden"),
            bi("Add one primary action like \"Start free trial\" or \"Book a demo\" — make the next step unmistakable.",
               "Voeg één primaire actie toe, zoals \"Start gratis trial\" of \"Plan een demo\" — maak de volgende stap onmiskenbaar."),
            {
              steps: [
                bi("Choose one primary CTA verb (\"Start free trial\" or \"Book a demo\") and use it consistently.",
                   "Kies één primair CTA-werkwoord (\"Start gratis trial\" of \"Plan een demo\") en gebruik dat consequent."),
                bi("Place it in the header, the hero, and again after the pricing/feature sections.",
                   "Plaats het in de header, de hero, en opnieuw na de prijzen-/featuresecties."),
                bi("Make all other buttons visually secondary (outline or text style) so this one stands out.",
                   "Maak alle andere knoppen visueel secundair (outline of tekststijl) zodat deze opvalt.")
              ],
              code: '<a class="btn btn-primary" href="/signup">Start free trial</a>'
            }, true);
        }
      }
    },
    healthcare: {
      labelKey: "industries.healthcare.label",
      framing: bi(
        "Visitors are often stressed, time-pressed or have access needs. Accessibility and plain language aren't nice-to-haves here — they're the product.",
        "Bezoekers zijn vaak gestrest, hebben weinig tijd of hebben toegankelijkheidsbehoeften. Toegankelijkheid en duidelijke taal zijn hier geen extraatje — het is het product."
      ),
      weights: { ux: 0.40, ui: 0.18, journey: 0.24, engagement: 0.18 },
      focus: [
        bi("Accessibility dominates the score — contrast, labels and structure for assistive tech.",
           "Toegankelijkheid domineert de score — contrast, labels en structuur voor hulptechnologie."),
        bi("We check sentence length: long, clinical sentences are a barrier for people under stress.",
           "We checken zinslengte: lange, klinische zinnen vormen een drempel voor mensen onder druk."),
        bi("We check that contact or appointment information is easy to find.",
           "We checken of contact- of afsprakeninformatie makkelijk te vinden is.")
      ],
      checks: function (doc, push) {
        var avg = avgSentenceLength(doc);
        if (avg && avg > 25) {
          push("cognitiveLoad", 10, "med",
            bi("Body text averages over 25 words per sentence", "Bodytekst telt gemiddeld meer dan 25 woorden per zin"),
            bi("Shorten sentences. Visitors reading about a health concern, often under stress, need plain, direct language.",
               "Maak zinnen korter. Bezoekers die over een gezondheidskwestie lezen, vaak onder druk, hebben behoefte aan duidelijke, directe taal."),
            {
              steps: [
                bi("Run key pages through a readability check and aim for under ~18 words per sentence on average.",
                   "Toets kernpagina's op leesbaarheid en streef naar gemiddeld minder dan ~18 woorden per zin."),
                bi("Split compound sentences (with \"and\"/\"which\") into two short ones.",
                   "Splits samengestelde zinnen (met \"en\"/\"die\") in twee korte zinnen."),
                bi("Replace clinical jargon with everyday terms, and explain any term you must keep.",
                   "Vervang klinisch jargon door alledaagse termen, en leg elke term die je moet behouden uit.")
              ],
              code: null
            }, true);
        }
        var tel = doc.querySelector('a[href^="tel:"]');
        var contactWord = textMatches(doc, ["contact", "afspraak", "appointment", "spoed", "emergency", "telefoonnummer"]);
        if (!tel && !contactWord) {
          push("frictionPoints", 10, "med",
            bi("No visible contact or appointment information detected", "Geen zichtbare contact- of afsprakeninformatie gevonden"),
            bi("Show a phone number or appointment link near the top. Many visitors arrive needing to act immediately.",
               "Toon een telefoonnummer of afsprakenlink dicht bij de top. Veel bezoekers komen met de behoefte om direct te handelen."),
            {
              steps: [
                bi("Add a clickable phone number (tel: link) and/or \"Book an appointment\" link to the header.",
                   "Voeg een klikbaar telefoonnummer (tel:-link) en/of een \"Maak een afspraak\"-link toe aan de header."),
                bi("If there's an emergency or out-of-hours number, show it separately and clearly labelled.",
                   "Toon een spoednummer of nummer buiten kantooruren apart en duidelijk gelabeld."),
                bi("Repeat the contact path in the footer so it's reachable from anywhere on the page.",
                   "Herhaal het contactpad in de footer, zodat het overal op de pagina bereikbaar is.")
              ],
              code: '<a href="tel:+31201234567">Call us: 020 123 4567</a>'
            }, true);
        }
      }
    },
    finance: {
      labelKey: "industries.finance.label",
      framing: bi(
        "People hesitate to hand over financial details to a page that feels uncertain. Trust signals and accessible, well-labelled forms carry real weight.",
        "Mensen aarzelen om financiële gegevens te delen op een pagina die onzeker aanvoelt. Vertrouwenssignalen en toegankelijke, goed gelabelde formulieren wegen hier zwaar."
      ),
      weights: { ux: 0.34, ui: 0.18, journey: 0.28, engagement: 0.20 },
      focus: [
        bi("Accessibility and conversion clarity lead — forms must be both usable and trustworthy.",
           "Toegankelijkheid en conversiehelderheid voorop — formulieren moeten zowel bruikbaar als betrouwbaar zijn."),
        bi("We check for security, privacy or regulatory trust signals (encryption, AVG/GDPR, licensing).",
           "We checken op security-, privacy- of toezicht-signalen (encryptie, AVG/GDPR, vergunning)."),
        bi("If the page has a form, we check it links to a privacy or terms policy.",
           "Heeft de pagina een formulier? Dan checken we of het naar een privacy- of voorwaardenpagina linkt.")
      ],
      checks: function (doc, push) {
        if (!textMatches(doc, ["ssl", "secure", "veilig", "privacy", "avg", "gdpr", "vergunning", "license", "dnb", "afm", "encrypt"])) {
          push("motivation", 8, "med",
            bi("No security or regulatory trust signal detected", "Geen security- of toezicht-signaal gevonden"),
            bi("Mention encryption, your privacy approach, or relevant licensing (e.g. AFM/DNB) near forms — financial visitors look for this before entering data.",
               "Vermeld encryptie, je privacy-aanpak of relevante vergunning (bv. AFM/DNB) bij formulieren — financiële bezoekers zoeken hier naar voordat ze gegevens invoeren."),
            {
              steps: [
                bi("Add a short line near any data-entry form: \"256-bit encrypted\" or \"Regulated by [authority]\", whichever is true.",
                   "Voeg een korte regel toe bij elk gegevensformulier: \"256-bit versleuteld\" of \"Onder toezicht van [instantie]\", wat ook van toepassing is."),
                bi("Link your AFM/DNB registration or equivalent certification where visitors can verify it.",
                   "Link naar je AFM/DNB-registratie of gelijkwaardige certificering, zodat bezoekers het kunnen verifiëren."),
                bi("Use a small lock icon next to payment or data fields — a familiar, low-effort trust cue.",
                   "Gebruik een klein slotje-icoon naast betaal- of gegevensvelden — een herkenbaar, laagdrempelig vertrouwenssignaal.")
              ],
              code: null
            }, true);
        }
        var form = doc.querySelector("form");
        var policyLink = elementsMatchText(doc, "a", /privacy|terms|voorwaarden|privacybeleid/i);
        if (form && !policyLink.length) {
          push("feedbackLoops", 8, "med",
            bi("A form is present but no privacy/terms link was found", "Er is een formulier, maar geen privacy-/voorwaardenlink gevonden"),
            bi("Link to your privacy policy near any form that collects data — for trust, and often for compliance.",
               "Link naar je privacybeleid bij elk formulier dat gegevens verzamelt — voor vertrouwen, en vaak ook verplicht."),
            {
              steps: [
                bi("Add a short sentence under the submit button: \"By submitting, you agree to our Privacy Policy.\"",
                   "Voeg onder de verzendknop een korte zin toe: \"Door te verzenden ga je akkoord met ons privacybeleid.\""),
                bi("Link the policy name to an actual, up-to-date privacy page.",
                   "Link de naam van het beleid naar een echte, actuele privacypagina."),
                bi("For forms collecting sensitive data, consider an explicit checkbox rather than implied consent.",
                   "Bij formulieren met gevoelige gegevens: overweeg een expliciete checkbox in plaats van impliciete toestemming.")
              ],
              code: '<p class="form-note">By submitting, you agree to our <a href="/privacy">Privacy Policy</a>.</p>'
            }, true);
        }
      }
    },
    hospitality: {
      labelKey: "industries.hospitality.label",
      framing: bi(
        "Most visits start on a phone, often while standing outside. Can they see your hours, find your address and call you in one tap?",
        "De meeste bezoeken starten op een telefoon, vaak terwijl iemand buiten staat. Zie je in één oogopslag de openingstijden, het adres, en kun je met één tik bellen?"
      ),
      weights: { ux: 0.22, ui: 0.18, journey: 0.38, engagement: 0.22 },
      focus: [
        bi("Conversion clarity and performance lead — speed and a one-tap call matter most on mobile.",
           "Conversiehelderheid en performance voorop — snelheid en één-tik-bellen tellen het meest op mobiel."),
        bi("We check for a visible address or opening hours.",
           "We checken op een zichtbaar adres of openingstijden."),
        bi("We check for a clickable phone number (tel: link) — the #1 local conversion.",
           "We checken op een klikbaar telefoonnummer (tel:-link) — de belangrijkste lokale conversie.")
      ],
      checks: function (doc, push) {
        var hasAddress = doc.querySelector("address");
        var hoursWord = textMatches(doc, ["open", "hours", "openingstijden", "geopend", "maandag", "monday"]);
        var postcode = /\b\d{4}\s?[a-z]{2}\b/i.test(doc.body ? doc.body.textContent : "");
        if (!hasAddress && !hoursWord && !postcode) {
          push("frictionPoints", 10, "med",
            bi("No address or opening hours detected", "Geen adres of openingstijden gevonden"),
            bi("Show your address and opening hours near the top. Local visitors decide in seconds whether to call or visit.",
               "Toon je adres en openingstijden dicht bij de top. Lokale bezoekers besluiten binnen seconden of ze bellen of langskomen."),
            {
              steps: [
                bi("Wrap your address in a semantic <address> element in the header or footer.",
                   "Plaats je adres in een semantisch <address>-element in de header of footer."),
                bi("List today's opening hours prominently, with a link to the full week.",
                   "Toon de openingstijden van vandaag prominent, met een link naar de hele week."),
                bi("Embed a small map or \"Get directions\" link pointing to Google/Apple Maps.",
                   "Voeg een kleine kaart of \"Routebeschrijving\"-link naar Google/Apple Maps toe.")
              ],
              code: '<address>\n  Hoofdstraat 12, 1234 AB Lelystad<br>\n  Open today: 09:00–17:30\n</address>'
            }, true);
        }
        var tel = doc.querySelector('a[href^="tel:"]');
        if (!tel) {
          push("flowToAction", 8, "med",
            bi("No clickable phone number (tel: link) detected", "Geen klikbaar telefoonnummer (tel:-link) gevonden"),
            bi("Add a tel: link to your phone number so mobile visitors can call you with one tap.",
               "Voeg een tel:-link toe aan je telefoonnummer, zodat mobiele bezoekers met één tik kunnen bellen."),
            {
              steps: [
                bi("Wrap your phone number in <a href=\"tel:+31...\">.",
                   "Plaats je telefoonnummer in <a href=\"tel:+31...\">."),
                bi("Place it in the header so it's visible on every page, not just \"Contact\".",
                   "Plaats het in de header zodat het op elke pagina zichtbaar is, niet alleen op \"Contact\"."),
                bi("On mobile, consider a sticky \"Call now\" button for restaurants/services taking reservations.",
                   "Overweeg op mobiel een vaste \"Bel nu\"-knop voor horeca/diensten met reserveringen.")
              ],
              code: '<a href="tel:+31201234567">020 123 4567</a>'
            }, true);
        }
      }
    },
    education: {
      labelKey: "industries.education.label",
      framing: bi(
        "Prospective students are comparing programmes across multiple tabs and devices. Clear language and one obvious next step keep them from bouncing.",
        "Potentiële studenten vergelijken opleidingen via meerdere tabbladen en apparaten. Duidelijke taal en één voor de hand liggende volgende stap voorkomen afhakers."
      ),
      weights: { ux: 0.36, ui: 0.18, journey: 0.26, engagement: 0.20 },
      focus: [
        bi("Accessibility leads — a diverse audience, often on varied devices and connections.",
           "Toegankelijkheid voorop — een divers publiek, vaak op uiteenlopende apparaten en verbindingen."),
        bi("We check sentence length for plain, scannable copy.",
           "We checken zinslengte voor duidelijke, scanbare tekst."),
        bi("We check for a clear enrol / apply / contact call-to-action.",
           "We checken op een duidelijke inschrijf-/aanmeld-/contact-CTA.")
      ],
      checks: function (doc, push) {
        var avg = avgSentenceLength(doc);
        if (avg && avg > 25) {
          push("cognitiveLoad", 8, "med",
            bi("Body text averages over 25 words per sentence", "Bodytekst telt gemiddeld meer dan 25 woorden per zin"),
            bi("Break up long, formal sentences. Prospective students scan — short, direct copy keeps them reading.",
               "Breek lange, formele zinnen op. Potentiële studenten scannen — korte, directe tekst houdt ze lezend."),
            {
              steps: [
                bi("Identify the three longest sentences on the page and rewrite each as two shorter ones.",
                   "Zoek de drie langste zinnen op de pagina en herschrijf elke zin als twee kortere."),
                bi("Replace formal/institutional phrasing with direct, second-person language (\"you'll learn\" vs \"students will be instructed in\").",
                   "Vervang formele/institutionele taal door directe taal in de tweede persoon (\"je leert\" i.p.v. \"studenten worden onderwezen in\")."),
                bi("Use subheadings every 2–3 paragraphs so the page is scannable, not a wall of text.",
                   "Gebruik elke 2-3 alinea's een subkop, zodat de pagina scanbaar is en geen lange lap tekst.")
              ],
              code: null
            }, true);
        }
        var cta = elementsMatchText(doc, "a,button", /enroll|enrol|apply|inschrijv|aanmeld|open day|contact|info/i);
        if (!cta.length) {
          push("flowToAction", 8, "med",
            bi("No enrol / apply / contact call-to-action detected", "Geen inschrijf-/aanmeld-/contact-CTA gevonden"),
            bi("Add a clear next step like \"Apply now\" or \"Request information\" — give visitors an obvious way forward.",
               "Voeg een duidelijke volgende stap toe, zoals \"Nu aanmelden\" of \"Vraag informatie aan\" — geef bezoekers een duidelijk vervolg."),
            {
              steps: [
                bi("Add one primary button (\"Apply now\" or \"Request information\") to the header and the end of each programme page.",
                   "Voeg één primaire knop toe (\"Nu aanmelden\" of \"Vraag informatie aan\") aan de header en het einde van elke opleidingspagina."),
                bi("Link it to a short form (name, email, programme of interest) rather than a generic contact page.",
                   "Link naar een kort formulier (naam, e-mail, opleiding van interesse) in plaats van een algemene contactpagina."),
                bi("If there's an open day or deadline, surface the date next to the CTA — urgency helps decisions.",
                   "Is er een open dag of deadline? Toon de datum naast de CTA — urgentie helpt bij besluiten.")
              ],
              code: '<a class="btn btn-primary" href="/apply">Apply now</a>'
            }, true);
        }
      }
    },
    realestate: {
      labelKey: "industries.realestate.label",
      framing: bi(
        "Listings live or die on photos and the ability to narrow them down. Image quality, alt text and filtering decide whether people keep browsing.",
        "Aanbod leeft of sterft op foto's en de mogelijkheid om te filteren. Beeldkwaliteit, alt-tekst en filters bepalen of mensen blijven bladeren."
      ),
      weights: { ux: 0.22, ui: 0.22, journey: 0.34, engagement: 0.22 },
      focus: [
        bi("Performance and conversion clarity lead — image-heavy pages must still load fast and stay browsable.",
           "Performance en conversiehelderheid voorop — beeldzware pagina's moeten toch snel laden en doorbladerbaar blijven."),
        bi("We check the share of property images missing descriptive alt text.",
           "We checken het aandeel objectfoto's zonder beschrijvende alt-tekst."),
        bi("We check for search or filter controls so visitors can narrow listings.",
           "We checken op zoek- of filteropties zodat bezoekers het aanbod kunnen verfijnen.")
      ],
      checks: function (doc, push) {
        var imgs = Array.prototype.slice.call(doc.querySelectorAll("img"));
        var noAlt = imgs.filter(function (i) { return !i.getAttribute("alt") || !i.getAttribute("alt").trim(); });
        if (imgs.length >= 3 && noAlt.length / imgs.length > 0.3) {
          push("accessibilityBasics", 10, "med",
            bi("Over 30% of images are missing descriptive alt text", "Meer dan 30% van de afbeeldingen mist beschrijvende alt-tekst"),
            bi("Describe each property image (e.g. \"Living room with garden view\") — it helps screen readers and image search alike.",
               "Beschrijf elke objectfoto (bv. \"Woonkamer met uitzicht op tuin\") — dit helpt screenreaders én beeldzoekmachines."),
            {
              steps: [
                bi("For listing photos, use the pattern \"[Room/area] of [property], [notable feature]\" — e.g. \"Kitchen with island, Vondelstraat 12\".",
                   "Gebruik voor objectfoto's het patroon \"[Ruimte] van [object], [opvallend kenmerk]\" — bv. \"Keuken met eiland, Vondelstraat 12\"."),
                bi("Skip alt text (alt=\"\") only for purely decorative icons, never for listing photos.",
                   "Laat alt-tekst (alt=\"\") alleen weg bij puur decoratieve iconen, nooit bij objectfoto's."),
                bi("If photos are loaded via a gallery script, confirm the alt attribute is preserved in the rendered <img>.",
                   "Worden foto's via een galerij-script geladen? Controleer of het alt-attribuut behouden blijft in de gerenderde <img>.")
              ],
              code: '<img src="kitchen.jpg" alt="Kitchen with island, Vondelstraat 12">'
            }, true);
        }
        var hasFilter = doc.querySelector('select, input[type="search"]');
        if (!hasFilter) {
          push("frictionPoints", 8, "low",
            bi("No search or filter controls detected", "Geen zoek- of filteropties gevonden"),
            bi("Let visitors filter by price, location or type — essential for browsing more than a handful of listings.",
               "Laat bezoekers filteren op prijs, locatie of type — essentieel bij meer dan een handvol aanbod."),
            {
              steps: [
                bi("Add filter controls for the 2-3 attributes buyers care about most: price range, location/area, property type.",
                   "Voeg filters toe voor de 2-3 kenmerken die kopers het meest interesseren: prijsklasse, locatie/wijk, woningtype."),
                bi("Use native <select> or range inputs for filters so they work without extra JS.",
                   "Gebruik native <select>- of range-inputs voor filters, zodat ze ook zonder extra JS werken."),
                bi("Show the active filters and a result count, so visitors trust the list is actually filtered.",
                   "Toon de actieve filters en een resultaattelling, zodat bezoekers vertrouwen dat de lijst echt gefilterd is.")
              ],
              code: '<select name="type" aria-label="Property type">\n  <option value="">All types</option>\n  <option value="apartment">Apartment</option>\n  <option value="house">House</option>\n</select>'
            }, true);
        }
      }
    },
    nonprofit: {
      labelKey: "industries.nonprofit.label",
      framing: bi(
        "These sites must work for everyone, often by law. Accessibility is the baseline, and the path to donate, register or find information must be unmistakable.",
        "Deze sites moeten voor iedereen werken, vaak verplicht. Toegankelijkheid is de basis, en het pad naar doneren, aanmelden of informatie moet onmiskenbaar zijn."
      ),
      weights: { ux: 0.38, ui: 0.16, journey: 0.26, engagement: 0.20 },
      focus: [
        bi("Accessibility leads by a wide margin — frequently a legal requirement (WCAG/EN 301 549).",
           "Toegankelijkheid voert met afstand de boventoon — vaak een wettelijke eis (WCAG/EN 301 549)."),
        bi("We check sentence length for plain-language compliance.",
           "We checken zinslengte voor naleving van \"Klare taal\"."),
        bi("We check for a clear donate / get-involved / contact call-to-action.",
           "We checken op een duidelijke doneer-/betrokken-raken-/contact-CTA.")
      ],
      checks: function (doc, push) {
        var avg = avgSentenceLength(doc);
        if (avg && avg > 25) {
          push("cognitiveLoad", 10, "med",
            bi("Body text averages over 25 words per sentence", "Bodytekst telt gemiddeld meer dan 25 woorden per zin"),
            bi("Use plain language — many public-sector guidelines require it, and it widens who can use the site.",
               "Gebruik klare taal — veel richtlijnen voor de publieke sector vereisen dit, en het maakt de site voor meer mensen bruikbaar."),
            {
              steps: [
                bi("Rewrite the homepage intro and main calls-to-action at a B1 reading level.",
                   "Herschrijf de intro van de homepage en de belangrijkste CTA's op B1-niveau."),
                bi("Replace bureaucratic phrasing (\"in het kader van\", \"ten behoeve van\") with direct verbs.",
                   "Vervang bureaucratische taal (\"in het kader van\", \"ten behoeve van\") door directe werkwoorden."),
                bi("Test key pages with the Klare Taal or similar plain-language checker.",
                   "Test kernpagina's met Klare Taal of een vergelijkbare taalchecker.")
              ],
              code: null
            }, true);
        }
        var cta = elementsMatchText(doc, "a,button", /donate|doneer|steun|support|volunteer|vrijwilliger|contact|aanvraag/i);
        if (!cta.length) {
          push("flowToAction", 8, "med",
            bi("No donate / get-involved / contact call-to-action detected", "Geen doneer-/betrokken-raken-/contact-CTA gevonden"),
            bi("Add a clear way to act — donate, volunteer or get in touch. Visitors who arrive here are often ready to.",
               "Voeg een duidelijke manier toe om te handelen — doneren, vrijwilligerswerk of contact. Bezoekers die hier komen, zijn daar vaak al klaar voor."),
            {
              steps: [
                bi("Add one primary action (\"Donate\", \"Volunteer\" or \"Get in touch\") to the header, visible on every page.",
                   "Voeg één primaire actie toe (\"Doneer\", \"Word vrijwilliger\" of \"Neem contact op\") aan de header, zichtbaar op elke pagina."),
                bi("Keep the donation/sign-up flow to as few steps and fields as possible.",
                   "Houd het doneer-/aanmeldproces zo kort mogelijk in stappen en velden."),
                bi("Explain in one sentence what the action achieves (\"€10 provides...\") to motivate completion.",
                   "Leg in één zin uit wat de actie oplevert (\"€10 voorziet in...\") om afronding te motiveren.")
              ],
              code: '<a class="btn btn-primary" href="/donate">Donate</a>'
            }, true);
        }
      }
    },
    agency: {
      labelKey: "industries.agency.label",
      framing: bi(
        "The site is the work sample. Restraint, consistency and a fast route to your best projects say more than any case study text.",
        "De site is het werkmonster. Terughoudendheid, consistentie en een snelle route naar je beste projecten zeggen meer dan welke case-tekst dan ook."
      ),
      weights: { ux: 0.20, ui: 0.38, journey: 0.22, engagement: 0.20 },
      focus: [
        bi("Visual hierarchy and consistency lead — judged as a craft sample, not just a brochure.",
           "Visuele hiërarchie en consistentie voorop — beoordeeld als vakwerk, niet alleen als brochure."),
        bi("We check how many distinct colours are declared inline — restraint reads as intent.",
           "We checken hoeveel losse kleuren inline zijn gedeclareerd — terughoudendheid oogt als intentie."),
        bi("We check for a one-click link to your work or case studies.",
           "We checken op een link naar je werk of cases binnen één klik.")
      ],
      checks: function (doc, push) {
        var colors = {};
        Array.prototype.slice.call(doc.querySelectorAll("[style]")).forEach(function (el) {
          var style = el.getAttribute("style") || "";
          var m = style.match(/(?:^|;)\s*(?:color|background-color)\s*:\s*([^;]+)/ig);
          if (m) m.forEach(function (decl) {
            var val = decl.split(":")[1].trim().toLowerCase();
            colors[val] = true;
          });
        });
        var n = Object.keys(colors).length;
        if (n > 6) {
          push("colorContrast", 12, "med",
            bi(n + " distinct inline colour values found", n + " losse, inline gedeclareerde kleurwaarden gevonden"),
            bi("Limit your palette to a handful of intentional colours. A portfolio is judged on restraint as much as range.",
               "Beperk je palet tot een handvol bewuste kleuren. Een portfolio wordt net zo goed beoordeeld op terughoudendheid als op variatie."),
            {
              steps: [
                bi("Define 2-3 brand colours plus neutrals (ink, paper, grey) as CSS custom properties.",
                   "Definieer 2-3 merkkleuren plus neutrale tinten (inkt, papier, grijs) als CSS custom properties."),
                bi("Replace inline color/background-color declarations with classes that reference those variables.",
                   "Vervang inline color/background-color-declaraties door classes die naar die variabelen verwijzen."),
                bi("Audit one page at a time — start with the homepage hero, where inconsistency is most visible.",
                   "Pak één pagina per keer aan — begin met de hero van de homepage, waar inconsistentie het meest opvalt.")
              ],
              code: ':root {\n  --ink: #11161A;\n  --paper: #F5F5F3;\n  --accent: #E2562A;\n}\n\n.highlight { color: var(--accent); }'
            }, true);
        }
        var workLink = elementsMatchText(doc, "a", /work|project|portfolio|cases|case stud/i);
        if (!workLink.length) {
          push("flowToAction", 6, "low",
            bi("No link to work or case studies detected", "Geen link naar werk of cases gevonden"),
            bi("Make your best work one click away from the homepage — it's usually the main reason people are here.",
               "Maak je beste werk bereikbaar binnen één klik vanaf de homepage — dat is meestal de hoofdreden dat mensen er zijn."),
            {
              steps: [
                bi("Add \"Work\" or \"Projects\" as the first or second item in the main navigation.",
                   "Voeg \"Werk\" of \"Projecten\" toe als eerste of tweede item in de hoofdnavigatie."),
                bi("Feature 2-3 best projects directly on the homepage with a link to the full overview.",
                   "Toon 2-3 topprojecten direct op de homepage, met een link naar het volledige overzicht."),
                bi("Make sure each project links through to a case page — a teaser image with no link is a dead end.",
                   "Zorg dat elk project doorlinkt naar een casepagina — een teaserafbeelding zonder link is een doodlopend pad.")
              ],
              code: null
            }, true);
        }
      }
    }
  };


  // ================================================================
  //  General checks + scoring
  // ================================================================
  function runAnalysis(html, filename, industryKey) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var issues = [];   // { sev, title:{en,nl}, fix:{en,nl}, plan:{steps:[{en,nl}], code}|null, industry }
    var scores = {};
    CRIT_KEYS.forEach(function (k) { scores[k] = 100; });

    function deduct(key, amount, sev, title, fix, plan, industry) {
      scores[key] = Math.max(0, scores[key] - amount);
      issues.push({ sev: sev, title: title, fix: fix, plan: plan || null, industry: !!industry });
    }

    // --- Accessibility ---
    var imgs = Array.prototype.slice.call(doc.querySelectorAll("img"));
    var imgsNoAlt = imgs.filter(function (i) { return !i.hasAttribute("alt"); });
    if (imgsNoAlt.length) {
      var n1 = imgsNoAlt.length;
      deduct("accessibilityBasics", Math.min(30, n1 * 6), n1 > 2 ? "high" : "med",
        bi(n1 + " image" + (n1 > 1 ? "s" : "") + " missing an alt attribute",
           n1 + " afbeelding" + (n1 > 1 ? "en" : "") + " zonder alt-attribuut"),
        bi("Add a short, descriptive alt text to every <img> (or alt=\"\" for purely decorative images) so screen readers can describe them.",
           "Voeg bij elke <img> een korte, beschrijvende alt-tekst toe (of alt=\"\" voor puur decoratieve afbeeldingen), zodat screenreaders ze kunnen beschrijven."),
        {
          steps: [
            bi("List every <img> without an alt attribute (browser dev tools → Elements → search for \"<img\" without \"alt\").",
               "Zoek elke <img> zonder alt-attribuut op (devtools → Elements → zoek op \"<img\" zonder \"alt\")."),
            bi("For meaningful images, write alt text describing content and purpose in under ~125 characters.",
               "Schrijf voor betekenisvolle afbeeldingen een alt-tekst die inhoud en doel beschrijft in minder dan ~125 tekens."),
            bi("For purely decorative images (spacers, background flourishes), use alt=\"\" so screen readers skip them.",
               "Gebruik voor puur decoratieve afbeeldingen (spacers, decoratie) alt=\"\", zodat screenreaders ze overslaan.")
          ],
          code: '<img src="team-photo.jpg" alt="Our team at the Amsterdam office">\n<img src="divider.svg" alt="">'
        });
    }
    if (!doc.documentElement.getAttribute("lang")) {
      deduct("accessibilityBasics", 10, "med",
        bi("No lang attribute on <html>", "Geen lang-attribuut op <html>"),
        bi("Add lang=\"en\" (or the page's language) to <html> so assistive tech and translators pick the right language.",
           "Voeg lang=\"nl\" (of de taal van de pagina) toe aan <html>, zodat hulptechnologie en vertalers de juiste taal kiezen."),
        {
          steps: [
            bi("Open the page template's <html> tag.", "Open de <html>-tag van het paginatemplate."),
            bi("Add the lang attribute matching the page's primary language, e.g. lang=\"nl\" or lang=\"en\".",
               "Voeg het lang-attribuut toe dat past bij de hoofdtaal van de pagina, bv. lang=\"nl\" of lang=\"en\"."),
            bi("If sections are in a different language, add lang=\"..\" on that specific element too.",
               "Staan delen in een andere taal? Voeg dan ook daar een lang=\"..\"-attribuut toe op dat element.")
          ],
          code: '<html lang="nl">'
        });
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
      var n2 = unlabelled.length;
      deduct("accessibilityBasics", Math.min(25, n2 * 8), "high",
        bi(n2 + " form field" + (n2 > 1 ? "s" : "") + " without a label", n2 + " formuliervelden zonder label"),
        bi("Give each input a <label for=\"...\"> (or aria-label) so people using screen readers know what to enter.",
           "Geef elk invoerveld een <label for=\"...\"> (of aria-label), zodat screenreadergebruikers weten wat ze moeten invullen."),
        {
          steps: [
            bi("For each input, add a <label> with a matching for/id pair, or wrap the input in the label.",
               "Voeg voor elk invoerveld een <label> toe met een bijpassend for/id-paar, of plaats het veld in het label."),
            bi("If a visible label doesn't fit the design, use aria-label or aria-labelledby instead — but never leave it unlabelled.",
               "Past een zichtbaar label niet in het ontwerp? Gebruik dan aria-label of aria-labelledby — maar laat het nooit ongelabeld."),
            bi("Re-test by tabbing through the form with a screen reader (VoiceOver/NVDA) to confirm each field announces its purpose.",
               "Test opnieuw door met een screenreader (VoiceOver/NVDA) door het formulier te tabben en te checken of elk veld zijn doel aankondigt.")
          ],
          code: '<label for="email">Email address</label>\n<input id="email" name="email" type="email">'
        }, false);
    }
    var viewport = doc.querySelector('meta[name="viewport"]');
    if (!viewport) {
      deduct("accessibilityBasics", 10, "med",
        bi("No viewport meta tag", "Geen viewport-metatag"),
        bi("Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> so the page scales correctly on phones.",
           "Voeg <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> toe, zodat de pagina correct schaalt op telefoons."),
        {
          steps: [
            bi("Open the <head> of the page template.", "Open de <head> van het paginatemplate."),
            bi("Add the viewport meta tag as the first or second line in <head>.",
               "Voeg de viewport-metatag toe als eerste of tweede regel in <head>."),
            bi("Reload on a phone (or device emulator) and confirm text is readable without pinch-zooming.",
               "Herlaad op een telefoon (of device-emulator) en check of tekst leesbaar is zonder in te zoomen.")
          ],
          code: '<meta name="viewport" content="width=device-width, initial-scale=1">'
        });
      deduct("dropOffRisk", 5, "low",
        bi("Missing viewport meta may affect mobile rendering", "Ontbrekende viewport-meta kan mobiele weergave beïnvloeden"),
        bi("Same fix as above — it also keeps mobile layout stable.", "Zelfde fix als hierboven — dit houdt ook de mobiele layout stabiel."),
        null);
    }

    // --- Visual hierarchy ---
    var h1s = doc.querySelectorAll("h1");
    if (h1s.length === 0) {
      deduct("visualHierarchy", 20, "high",
        bi("No <h1> on the page", "Geen <h1> op de pagina"),
        bi("Give the page a single, clear <h1> that states what it's for — it anchors the visual and semantic hierarchy.",
           "Geef de pagina één duidelijke <h1> die zegt waar de pagina voor is — dit verankert de visuele en semantische hiërarchie."),
        {
          steps: [
            bi("Identify the main heading of the page — usually the headline in the hero.",
               "Bepaal de hoofdkop van de pagina — meestal de kop in de hero."),
            bi("Change its tag to <h1>, and ensure it appears only once on the page.",
               "Verander de tag naar <h1> en zorg dat deze maar één keer op de pagina voorkomt."),
            bi("Re-check the rest of the heading order (h2, h3, ...) still makes sense underneath it.",
               "Controleer of de rest van de koppenvolgorde (h2, h3, ...) er daaronder nog klopt.")
          ],
          code: '<h1>Fresh pasta, made daily</h1>'
        });
    } else if (h1s.length > 1) {
      deduct("visualHierarchy", 12, "med",
        bi(h1s.length + " <h1> elements found", h1s.length + " <h1>-elementen gevonden"),
        bi("Keep one <h1> per page. Demote the others to <h2>/<h3> based on their place in the structure.",
           "Houd één <h1> per pagina aan. Demoot de andere naar <h2>/<h3>, passend bij hun plek in de structuur."),
        {
          steps: [
            bi("List all <h1> elements and decide which one is the true page title.",
               "Maak een lijst van alle <h1>-elementen en bepaal welke de echte paginatitel is."),
            bi("Change the others to <h2> or <h3> depending on their position in the outline.",
               "Verander de andere naar <h2> of <h3>, afhankelijk van hun plek in de structuur."),
            bi("Verify the resulting outline reads logically top to bottom (use a heading-outline browser extension).",
               "Controleer of de resulterende structuur logisch leest van boven naar onder (gebruik een heading-outline-extensie).")
          ],
          code: null
        });
    }
    var headings = Array.prototype.slice.call(doc.querySelectorAll("h1,h2,h3,h4,h5,h6"));
    var lastLevel = 0, skipped = false;
    headings.forEach(function (h) {
      var lvl = parseInt(h.tagName.substring(1), 10);
      if (lastLevel && lvl - lastLevel > 1) skipped = true;
      lastLevel = lvl;
    });
    if (skipped) {
      deduct("visualHierarchy", 10, "med",
        bi("Heading levels skip a step (e.g. h2 → h4)", "Koppenniveaus slaan een stap over (bv. h2 → h4)"),
        bi("Keep heading levels sequential. Skipping levels breaks the outline for screen-reader users and signals an unplanned structure.",
           "Houd koppenniveaus opeenvolgend. Het overslaan van niveaus breekt de structuur voor screenreadergebruikers en wijst op een ongeplande opbouw."),
        {
          steps: [
            bi("Map out the current heading order on the page (h1 → h2 → h4 → ...).",
               "Zet de huidige koppenvolgorde op de pagina op een rijtje (h1 → h2 → h4 → ...)."),
            bi("Insert the missing level or renumber so each step increases by exactly one.",
               "Voeg het ontbrekende niveau toe, of hernummer zodat elke stap precies één hoger is."),
            bi("Keep visual size separate from semantic level — style with CSS, not by choosing a different tag.",
               "Houd visuele grootte los van het semantische niveau — stylen via CSS, niet door een andere tag te kiezen.")
          ],
          code: null
        });
    }

    // --- Usability: interaction clarity ---
    if (!doc.querySelector("nav")) {
      deduct("interactionClarity", 8, "low",
        bi("No <nav> landmark found", "Geen <nav>-landmark gevonden"),
        bi("Wrap the primary navigation in <nav> so it's identifiable as a navigation region.",
           "Plaats de hoofdnavigatie in <nav>, zodat deze herkenbaar is als navigatiegebied."),
        {
          steps: [
            bi("Find the element containing the main navigation links (often a <div> or <ul>).",
               "Zoek het element met de hoofdnavigatielinks (vaak een <div> of <ul>)."),
            bi("Wrap it in (or change its tag to) <nav aria-label=\"Primary\">.",
               "Plaats het in (of verander de tag naar) <nav aria-label=\"Primary\">."),
            bi("If there are multiple nav regions (header + footer), give each a distinct aria-label.",
               "Zijn er meerdere navigatiegebieden (header + footer)? Geef elk een eigen aria-label.")
          ],
          code: '<nav aria-label="Primary">\n  <a href="/">Home</a>\n  <a href="/about">About</a>\n</nav>'
        });
    }
    var genericText = /^(click here|here|read more|learn more|submit|more|link)$/i;
    var links = Array.prototype.slice.call(doc.querySelectorAll("a, button"));
    var vagueLinks = links.filter(function (el) { return genericText.test((el.textContent || "").trim()); });
    if (vagueLinks.length) {
      var n3 = vagueLinks.length;
      deduct("interactionClarity", Math.min(20, n3 * 5), "med",
        bi(n3 + " link" + (n3 > 1 ? "s" : "") + "/button" + (n3 > 1 ? "s" : "") + " use vague text like \"click here\"",
           n3 + " link" + (n3 > 1 ? "s" : "") + "/knop" + (n3 > 1 ? "pen" : "") + " met vage tekst zoals \"klik hier\""),
        bi("Rewrite link and button text so it describes the destination or action on its own, e.g. \"Download the report\" instead of \"Click here\".",
           "Herschrijf link- en knoptekst zodat deze op zichzelf de bestemming of actie beschrijft, bv. \"Download het rapport\" i.p.v. \"Klik hier\"."),
        {
          steps: [
            bi("Find each link/button with text like \"click here\", \"read more\" or \"submit\".",
               "Zoek elke link/knop met tekst als \"klik hier\", \"lees meer\" of \"verzenden\"."),
            bi("Rewrite using a verb + object that describes the result: \"Download the report\", \"View pricing\", \"Send message\".",
               "Herschrijf met een werkwoord + object dat het resultaat beschrijft: \"Download het rapport\", \"Bekijk de prijzen\", \"Verstuur bericht\"."),
            bi("For icon-only buttons, add a visually-hidden label so screen readers get the same clarity.",
               "Geef knoppen met alleen een icoon een visueel verborgen label, zodat screenreaders dezelfde duidelijkheid krijgen.")
          ],
          code: '<a href="/report.pdf">Download the 2025 report (PDF)</a>'
        }, false);
    }
    var titleEl = doc.querySelector("title");
    var titleText = titleEl ? titleEl.textContent.trim() : "";
    if (!titleText) {
      deduct("interactionClarity", 8, "med",
        bi("Missing or empty <title>", "Ontbrekende of lege <title>"),
        bi("Add a descriptive <title> — it's the first thing people see in tabs, bookmarks and search results.",
           "Voeg een beschrijvende <title> toe — dit is het eerste dat mensen zien in tabbladen, bladwijzers en zoekresultaten."),
        {
          steps: [
            bi("Open <head> and add a <title> tag if missing.", "Open <head> en voeg een <title>-tag toe als deze ontbreekt."),
            bi("Write a title in the pattern \"Page topic — Site name\", under ~60 characters.",
               "Schrijf een titel volgens \"Paginaonderwerp — Sitenaam\", onder ~60 tekens."),
            bi("Make sure every page has a unique title — duplicates hurt both users and SEO.",
               "Zorg dat elke pagina een unieke titel heeft — duplicaten zijn slecht voor gebruikers én SEO.")
          ],
          code: '<title>Pricing — DesignScan</title>'
        });
    } else if (titleText.length > 60) {
      deduct("interactionClarity", 4, "low",
        bi("<title> is longer than 60 characters", "<title> is langer dan 60 tekens"),
        bi("Shorten the page title so it doesn't get truncated in browser tabs and search results.",
           "Maak de paginatitel korter, zodat deze niet wordt afgekapt in tabbladen en zoekresultaten."),
        {
          steps: [
            bi("Identify the core topic and drop secondary descriptors.", "Bepaal het kernonderwerp en laat secundaire toevoegingen weg."),
            bi("Aim for 50–60 characters including the site name.", "Streef naar 50-60 tekens inclusief sitenaam.")
          ],
          code: null
        });
    }

    // --- Interactive elements without a discernible label (interaction clarity) ---
    var iconOnly = Array.prototype.slice.call(doc.querySelectorAll("a, button")).filter(function (el) {
      var text = (el.textContent || "").replace(/\s+/g, "");
      var hasAria = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title");
      var hasImgAlt = el.querySelector("img[alt]") && el.querySelector("img[alt]").getAttribute("alt").trim();
      return text.length === 0 && !hasAria && !hasImgAlt;
    });
    if (iconOnly.length) {
      var n6 = iconOnly.length;
      deduct("interactionClarity", Math.min(15, n6 * 5), "med",
        bi(n6 + " icon-only link" + (n6 > 1 ? "s" : "") + "/button" + (n6 > 1 ? "s" : "") + " with no accessible label",
           n6 + " link" + (n6 > 1 ? "s" : "") + "/knop" + (n6 > 1 ? "pen" : "") + " met alleen een icoon en geen toegankelijk label"),
        bi("Add an aria-label (or visually-hidden text) describing the action — icons alone are ambiguous for everyone, not just screen readers.",
           "Voeg een aria-label (of visueel verborgen tekst) toe die de actie beschrijft — alleen een icoon is voor iedereen ambigu, niet alleen voor screenreaders."),
        {
          steps: [
            bi("Find every <a>/<button> whose only content is an icon or SVG.",
               "Zoek elke <a>/<button> waarvan de enige inhoud een icoon of SVG is."),
            bi("Add aria-label=\"...\" describing the action in a few words (e.g. \"Close\", \"Open menu\", \"Search\").",
               "Voeg aria-label=\"...\" toe met de actie in een paar woorden (bv. \"Sluiten\", \"Open menu\", \"Zoeken\")."),
            bi("Where space allows, consider adding visible text alongside the icon — it helps everyone, not just assistive tech.",
               "Voeg waar mogelijk ook zichtbare tekst naast het icoon toe — dit helpt iedereen, niet alleen hulptechnologie.")
          ],
          code: '<button aria-label="Close dialog">\n  <svg aria-hidden="true">...</svg>\n</button>'
        }, false);
    }

    // --- Consistency ---
    var inlineStyled = doc.querySelectorAll("[style]");
    if (inlineStyled.length > 8) {
      var n4 = inlineStyled.length;
      deduct("typography", Math.min(20, Math.floor(n4 / 4)), "low",
        bi(n4 + " elements use inline style attributes", n4 + " elementen gebruiken inline style-attributen"),
        bi("Move repeated inline styles into shared CSS classes so spacing, color and type stay consistent across the page.",
           "Verplaats herhaalde inline stijlen naar gedeelde CSS-classes, zodat ruimte, kleur en typografie consistent blijven."),
        {
          steps: [
            bi("Find the most-repeated inline style declarations (e.g. margin, color, font-size).",
               "Zoek de meest herhaalde inline stijldeclaraties (bv. margin, kleur, font-size)."),
            bi("Create utility or component classes for those patterns in your stylesheet.",
               "Maak utility- of componentclasses voor die patronen in je stylesheet."),
            bi("Replace the style=\"...\" attributes with class=\"...\" referencing the new rules, one section at a time.",
               "Vervang de style=\"...\"-attributen door class=\"...\" die naar de nieuwe regels verwijzen, sectie voor sectie.")
          ],
          code: null
        });
    }
    var fontFamilies = {};
    Array.prototype.slice.call(doc.querySelectorAll("[style*='font-family']")).forEach(function (el) {
      var m = el.getAttribute("style").match(/font-family\s*:\s*([^;]+)/i);
      if (m) fontFamilies[m[1].trim().toLowerCase()] = true;
    });
    var fontCount = Object.keys(fontFamilies).length;
    if (fontCount > 2) {
      deduct("typography", Math.min(15, (fontCount - 2) * 5), "med",
        bi(fontCount + " different font-family declarations found inline", fontCount + " verschillende font-family-declaraties inline gevonden"),
        bi("Standardise on one display and one body typeface (set globally via CSS) so the page reads as one product.",
           "Kies één displayfont en één bodyfont (globaal ingesteld via CSS), zodat de pagina als één geheel oogt."),
        {
          steps: [
            bi("List all font-family values currently in use across the page.",
               "Maak een lijst van alle font-family-waarden die nu op de pagina worden gebruikt."),
            bi("Choose one heading typeface and one body typeface; define both as CSS variables.",
               "Kies één kopfont en één bodyfont; definieer beide als CSS-variabelen."),
            bi("Remove inline font-family declarations and apply the variables via classes instead.",
               "Verwijder inline font-family-declaraties en pas de variabelen toe via classes.")
          ],
          code: ':root {\n  --font-display: "Space Grotesk", sans-serif;\n  --font-body: "Inter", sans-serif;\n}'
        });
    }

    // --- Conversion clarity ---
    var buttons = Array.prototype.slice.call(doc.querySelectorAll("button, a.btn, input[type=submit], .button, .cta"));
    var ctaCandidates = buttons.length ? buttons : links;
    if (ctaCandidates.length === 0) {
      deduct("flowToAction", 25, "high",
        bi("No buttons or call-to-action elements found", "Geen knoppen of call-to-action-elementen gevonden"),
        bi("Add at least one clear, primary call-to-action that tells visitors exactly what to do next.",
           "Voeg minstens één duidelijke, primaire call-to-action toe die bezoekers precies vertelt wat de volgende stap is."),
        {
          steps: [
            bi("Decide the single most important action for this page (buy, sign up, contact, download).",
               "Bepaal de belangrijkste actie voor deze pagina (kopen, aanmelden, contact, downloaden)."),
            bi("Add a visually distinct button for that action in the hero and repeat it where relevant.",
               "Voeg een visueel onderscheidende knop toe voor die actie in de hero en herhaal die waar relevant."),
            bi("Make sure the button has descriptive text, not just an icon or \"Submit\".",
               "Zorg dat de knop beschrijvende tekst heeft, niet alleen een icoon of \"Verzenden\".")
          ],
          code: '<a class="btn btn-primary" href="/contact">Get in touch</a>'
        });
    } else if (ctaCandidates.length > 6) {
      deduct("flowToAction", 12, "med",
        bi(ctaCandidates.length + " competing call-to-action elements found", ctaCandidates.length + " concurrerende call-to-action-elementen gevonden"),
        bi("Pick one primary action per view. Demote the rest to text links or secondary buttons so the main CTA stands out.",
           "Kies één primaire actie per scherm. Demoot de rest tot tekstlinks of secundaire knoppen, zodat de hoofd-CTA opvalt."),
        {
          steps: [
            bi("List every button/CTA visible in the first viewport.", "Maak een lijst van elke knop/CTA die zichtbaar is in het eerste scherm."),
            bi("Pick the one that matches the page's primary goal and style it as the only filled/solid button.",
               "Kies degene die past bij het hoofddoel van de pagina en stijl die als enige gevulde/solide knop."),
            bi("Restyle the rest as outline or text-link buttons — same action available, less visual competition.",
               "Stijl de rest als outline- of tekstlink-knoppen — actie blijft beschikbaar, minder visuele concurrentie.")
          ],
          code: null
        });
    }

    // --- Cognitive load: long unbroken text without subheadings ---
    var paragraphs = Array.prototype.slice.call(doc.querySelectorAll("p"));
    var longParas = paragraphs.filter(function (p) {
      return (p.textContent || "").trim().split(/\s+/).length > 120;
    });
    var subheadingCount = doc.querySelectorAll("h2, h3").length;
    if (longParas.length > 0 && subheadingCount < 2) {
      deduct("cognitiveLoad", 8, "low",
        bi("Long blocks of text with few subheadings", "Lange tekstblokken met weinig subkoppen"),
        bi("Break long paragraphs into shorter chunks and add subheadings every few paragraphs — it lowers cognitive load and makes the page scannable.",
           "Breek lange alinea's op in kortere stukken en voeg om de paar alinea's een subkop toe — dit verlaagt de cognitieve belasting en maakt de pagina scanbaar."),
        {
          steps: [
            bi("Find paragraphs longer than ~120 words and split them at natural topic breaks.",
               "Zoek alinea's langer dan ~120 woorden en splits ze op natuurlijke onderwerpovergangen."),
            bi("Add an <h2>/<h3> before each major topic shift so the page outline reflects its content.",
               "Voeg vóór elke belangrijke onderwerpwisseling een <h2>/<h3> toe, zodat de structuur de inhoud weerspiegelt."),
            bi("Where useful, convert sequential steps or options into a list instead of a prose paragraph.",
               "Zet stappen of opties waar nuttig om in een lijst in plaats van een lopende alinea.")
          ],
          code: null
        }, false);
    }

    // --- Performance signals ---
    var scripts = doc.querySelectorAll("script");
    if (scripts.length > 10) {
      deduct("dropOffRisk", Math.min(20, scripts.length), "med",
        bi(scripts.length + " <script> tags found", scripts.length + " <script>-tags gevonden"),
        bi("Bundle and defer non-critical scripts. Each extra <script> tag adds a render-blocking risk on first load.",
           "Bundel en stel niet-kritieke scripts uit. Elke extra <script>-tag vergroot het risico op een render-blokkade bij de eerste load."),
        {
          steps: [
            bi("List all <script> tags and identify which are needed before first render (rarely more than one or two).",
               "Maak een lijst van alle <script>-tags en bepaal welke nodig zijn vóór de eerste render (zelden meer dan één of twee)."),
            bi("Add defer or async to the rest, and move non-critical scripts to just before </body>.",
               "Voeg defer of async toe aan de rest, en verplaats niet-kritieke scripts naar net voor </body>."),
            bi("Where possible, bundle multiple small scripts into one file to reduce request overhead.",
               "Bundel waar mogelijk meerdere kleine scripts in één bestand om overhead te verminderen.")
          ],
          code: '<script src="app.js" defer></script>'
        });
    }
    var imgsNoSize = imgs.filter(function (i) { return !i.hasAttribute("width") || !i.hasAttribute("height"); });
    if (imgsNoSize.length) {
      var n5 = imgsNoSize.length;
      deduct("dropOffRisk", Math.min(20, n5 * 4), "med",
        bi(n5 + " image" + (n5 > 1 ? "s" : "") + " missing width/height", n5 + " afbeelding" + (n5 > 1 ? "en" : "") + " zonder width/height"),
        bi("Set explicit width and height on <img> elements so the browser reserves space and avoids layout shift while images load.",
           "Geef <img>-elementen een expliciete width en height, zodat de browser ruimte reserveert en layout shift voorkomt tijdens het laden."),
        {
          steps: [
            bi("For each <img> missing width/height, find the image's natural dimensions.",
               "Zoek voor elke <img> zonder width/height de natuurlijke afmetingen van de afbeelding op."),
            bi("Add width and height attributes matching the aspect ratio (CSS can still control display size).",
               "Voeg width- en height-attributen toe die de beeldverhouding respecteren (CSS kan de weergavegrootte nog steeds bepalen)."),
            bi("For responsive images, use aspect-ratio in CSS alongside the attributes to prevent shift at any size.",
               "Gebruik bij responsieve afbeeldingen aspect-ratio in CSS naast de attributen, om shift op elke schermgrootte te voorkomen.")
          ],
          code: '<img src="hero.jpg" alt="Product hero shot" width="1200" height="800">'
        });
    }

    // --- UI: color & contrast (inline color/background pairs) ---
    var lowContrastFound = false, lowestRatio = null;
    Array.prototype.slice.call(doc.querySelectorAll("[style]")).forEach(function (el) {
      var style = el.getAttribute("style") || "";
      var fg = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
      var bg = style.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i);
      if (!fg || !bg) return;
      var rgb1 = parseColor(fg[1]), rgb2 = parseColor(bg[1]);
      if (!rgb1 || !rgb2) return;
      var ratio = contrastRatio(rgb1, rgb2);
      if (ratio < 4.5) {
        lowContrastFound = true;
        if (lowestRatio === null || ratio < lowestRatio) lowestRatio = ratio;
      }
    });
    if (lowContrastFound) {
      var ratioStr = lowestRatio.toFixed(1);
      deduct("colorContrast", 14, lowestRatio < 3 ? "high" : "med",
        bi("Text/background colour pair found with a contrast ratio around " + ratioStr + ":1",
           "Tekst/achtergrond-kleurcombinatie gevonden met een contrastratio van ongeveer " + ratioStr + ":1"),
        bi("WCAG AA requires at least 4.5:1 for normal text. Darken the text or lighten the background until the ratio clears that threshold.",
           "WCAG AA vereist minimaal 4,5:1 voor normale tekst. Maak de tekst donkerder of de achtergrond lichter totdat de ratio die drempel haalt."),
        {
          steps: [
            bi("Find the element(s) with this inline color/background combination (devtools → search styles for \"color:\" near \"background\").",
               "Zoek het element/de elementen met deze inline kleurcombinatie (devtools → zoek stijlen op \"color:\" naast \"background\")."),
            bi("Run the two colours through a contrast checker (e.g. WebAIM) and adjust one until it reaches 4.5:1 (3:1 for large text).",
               "Voer de twee kleuren door een contrastchecker (bv. WebAIM) en pas er één aan tot 4,5:1 (3:1 voor grote tekst)."),
            bi("Re-check any related states (hover, disabled, placeholder) — they often inherit the same low-contrast pairing.",
               "Controleer ook gerelateerde staten (hover, disabled, placeholder) — die erven vaak dezelfde lage contrastcombinatie.")
          ],
          code: '/* before: #999999 on #FFFFFF ≈ 2.8:1 */\ncolor: #595959; /* on #FFFFFF ≈ 7:1 */'
        }, false);
    }

    // --- Engagement: feedback loops (forms without live validation feedback) ---
    var anyForm = doc.querySelector("form");
    var hasLiveRegion = doc.querySelector('[aria-live], [role="alert"], [role="status"]');
    if (anyForm && !hasLiveRegion) {
      deduct("feedbackLoops", 10, "med",
        bi("Form present but no live-feedback region (aria-live / role=\"alert\") detected",
           "Formulier aanwezig, maar geen live-feedbackregio (aria-live / role=\"alert\") gevonden"),
        bi("Add a region that announces success or validation errors as they happen — silent forms leave people unsure whether anything worked.",
           "Voeg een regio toe die succes of validatiefouten direct aankondigt — stille formulieren laten mensen in onzekerheid of er iets is gebeurd."),
        {
          steps: [
            bi("Add an empty container near the form with role=\"status\" (for success) or role=\"alert\" (for errors).",
               "Voeg een leeg containerelement toe bij het formulier met role=\"status\" (voor succes) of role=\"alert\" (voor fouten)."),
            bi("On submit, populate that container with a short message (\"Message sent\", \"Please fill in your email\").",
               "Vul dat element bij verzenden met een korte melding (\"Bericht verstuurd\", \"Vul je e-mailadres in\")."),
            bi("Keep the message in the DOM (don't remove it instantly) so screen readers have time to announce it.",
               "Laat de melding even in de DOM staan (niet direct verwijderen), zodat screenreaders de tijd hebben om het aan te kondigen.")
          ],
          code: '<form>\n  ...\n  <div role="status" aria-live="polite" id="form-feedback"></div>\n</form>'
        }, false);
    }

    // --- Engagement: progress signals (long forms without a stepper/progress indicator) ---
    var formFieldCount = inputs.length;
    var hasProgressIndicator = doc.querySelector('progress, [role="progressbar"], [class*="step" i], [class*="progress" i]');
    if (anyForm && formFieldCount > 5 && !hasProgressIndicator) {
      deduct("progressSignals", 10, "low",
        bi("Form with " + formFieldCount + " fields has no progress or step indicator",
           "Formulier met " + formFieldCount + " velden heeft geen voortgangs- of stapindicator"),
        bi("Long forms feel shorter when people can see how far they are. Break it into steps with a visible progress indicator, or show a field count.",
           "Lange formulieren voelen korter aan als mensen kunnen zien hoe ver ze zijn. Verdeel het in stappen met een zichtbare voortgangsindicator, of toon een veldenteller."),
        {
          steps: [
            bi("Group related fields into 2-4 logical steps (e.g. \"Your details\", \"Address\", \"Payment\").",
               "Groepeer gerelateerde velden in 2-4 logische stappen (bv. \"Jouw gegevens\", \"Adres\", \"Betaling\")."),
            bi("Add a simple step indicator (\"Step 2 of 3\") or a <progress> element above the form.",
               "Voeg een eenvoudige stapindicator toe (\"Stap 2 van 3\") of een <progress>-element boven het formulier."),
            bi("If a single-page form is preferred, at least show a live count of completed vs. remaining required fields.",
               "Geef bij een formulier op één pagina in elk geval een live telling van ingevulde vs. resterende verplichte velden.")
          ],
          code: '<p aria-live="polite">Step 2 of 3</p>\n<progress value="2" max="3"></progress>'
        }, false);
    }

    // --- Industry-specific checks ---
    var profileKey = (industryKey && INDUSTRY_PROFILES[industryKey]) ? industryKey : "general";
    var profile = INDUSTRY_PROFILES[profileKey];
    if (profile.checks) {
      profile.checks(doc, function (key, amount, sev, title, fix, plan, industry) {
        deduct(key, amount, sev, title, fix, plan, industry);
      });
    }

    if (issues.length === 0) {
      issues.push({
        sev: "low",
        title: bi("No structural issues detected in this static check", "Geen structurele issues gevonden in deze statische check"),
        fix: bi("Nice work. This client-side check covers structure and semantics — pair it with a visual review for contrast, spacing and copy.",
                "Goed gedaan. Deze client-side check dekt structuur en semantiek — combineer dit met een visuele review op contrast, ruimte en tekst."),
        plan: null, industry: false
      });
    }

    var categoryScores = {};
    CATEGORY_KEYS.forEach(function (cat) {
      var subs = CATEGORY_CRITERIA[cat];
      var sum = subs.reduce(function (s, k) { return s + scores[k]; }, 0);
      categoryScores[cat] = sum / subs.length;
    });

    var w = profile.weights;
    var overall = Math.round(
      CATEGORY_KEYS.reduce(function (sum, cat) { return sum + categoryScores[cat] * w[cat]; }, 0)
    );

    return {
      overall: overall, scores: scores, categoryScores: categoryScores, issues: issues,
      filename: filename || "your-page.html", industryKey: profileKey, profile: profile
    };
  }


  // ================================================================
  //  Rendering scan results
  // ================================================================
  var SEV_ORDER = { high: 0, med: 1, low: 2 };
  var SEV_LABEL = { high: "HIGH", med: "MED", low: "LOW" };
  var SEV_CLASS = { high: "issue--high", med: "issue--med", low: "issue--low" };
  var SEV_TAG_CLASS = { high: "", med: "issue__sev--med", low: "issue__sev--low" };

  var LAST_RESULT_KEY = "designscan:lastResult";

  function saveLastResult(result) {
    try {
      if (window.localStorage) localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(result));
    } catch (e) { /* storage unavailable (private mode, sandboxed preview, etc.) — fine, just in-memory */ }
  }
  function loadLastResult() {
    try {
      if (!window.localStorage) return null;
      var raw = localStorage.getItem(LAST_RESULT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  var lastResult = null; // cached so we can re-render on language switch / page reload

  function renderResults(result, opts) {
    var scroll = !opts || opts.scroll !== false;
    lastResult = result;
    saveLastResult(result);
    var box = document.getElementById("scanner-results");
    document.getElementById("result-file").textContent = result.filename;
    document.getElementById("result-score").textContent = result.overall;
    var industryEl = document.getElementById("result-industry");
    if (industryEl) {
      industryEl.textContent = result.industryKey === "general"
        ? ""
        : t("scanner.weightedFor", { industry: t(result.profile.labelKey) });
    }

    var subWrap = document.getElementById("result-submeters");
    subWrap.innerHTML = "";
    CATEGORY_KEYS.forEach(function (cat) {
      var catScore = Math.round(result.categoryScores[cat]);
      var groupLi = document.createElement("li");
      groupLi.className = "sm-group";
      groupLi.innerHTML = '<span class="sm-group__name">' + t("cat." + cat) + '</span>' +
        '<span class="sm-group__val">' + catScore + '</span>';
      subWrap.appendChild(groupLi);

      CATEGORY_CRITERIA[cat].forEach(function (key) {
        var v = Math.round(result.scores[key]);
        var li = document.createElement("li");
        li.className = "sm";
        li.innerHTML = '<span class="sm__name">' + t("crit." + key) + '</span>' +
          '<span class="sm__bar"><i style="--v:' + v + '%"></i></span>' +
          '<span class="sm__val">' + v + '</span>';
        subWrap.appendChild(li);
      });
    });

    var issuesWrap = document.getElementById("result-issues");
    issuesWrap.innerHTML = "";
    var sorted = result.issues.slice().sort(function (a, b) { return SEV_ORDER[a.sev] - SEV_ORDER[b.sev]; });
    sorted.forEach(function (it, idx) {
      var li = document.createElement("li");
      li.className = "issue " + SEV_CLASS[it.sev];

      var sevSpan = document.createElement("span");
      sevSpan.className = "issue__sev " + SEV_TAG_CLASS[it.sev];
      sevSpan.setAttribute("aria-label", it.sev + " impact");
      sevSpan.textContent = SEV_LABEL[it.sev];

      var content = document.createElement("div");
      var h3 = document.createElement("h3");
      h3.textContent = it.title[LANG] || it.title.en;
      if (it.industry) {
        var tag = document.createElement("span");
        tag.className = "issue__tag";
        tag.textContent = t("issue.tag");
        h3.appendChild(document.createTextNode(" "));
        h3.appendChild(tag);
      }

      var p = document.createElement("p");
      var fixLabel = document.createElement("span"); fixLabel.className = "fix"; fixLabel.textContent = t("report.fixLabel");
      p.appendChild(fixLabel);
      p.appendChild(document.createTextNode(" " + (it.fix[LANG] || it.fix.en)));

      content.appendChild(h3); content.appendChild(p);

      if (it.plan) {
        var planId = "plan-" + idx;
        var toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "issue__plan-toggle";
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-controls", planId);
        toggle.innerHTML = '<span class="chev">▸</span> <span class="label">' + t("issue.planShow") + '</span>';

        var planBox = document.createElement("div");
        planBox.className = "issue__plan";
        planBox.id = planId;
        planBox.hidden = true;

        var heading = document.createElement("p");
        heading.className = "ind-sub";
        heading.style.marginBottom = "8px";
        heading.textContent = t("issue.planHeading");
        var ol = document.createElement("ol");
        it.plan.steps.forEach(function (step) {
          var sLi = document.createElement("li");
          sLi.textContent = step[LANG] || step.en;
          ol.appendChild(sLi);
        });
        planBox.appendChild(heading);
        planBox.appendChild(ol);
        if (it.plan.code) {
          var pre = document.createElement("pre");
          pre.textContent = it.plan.code;
          planBox.appendChild(pre);
        }

        toggle.addEventListener("click", function () {
          var open = toggle.getAttribute("aria-expanded") === "true";
          toggle.setAttribute("aria-expanded", open ? "false" : "true");
          toggle.querySelector(".label").textContent = open ? t("issue.planShow") : t("issue.planHide");
          planBox.hidden = open;
        });

        content.appendChild(toggle);
        content.appendChild(planBox);
      }

      li.appendChild(sevSpan); li.appendChild(content);
      issuesWrap.appendChild(li);
    });

    box.hidden = false;
    var followup = document.getElementById("scanner-followup");
    if (followup) followup.hidden = false;
    if (wireFixitRequest.refreshSummary) wireFixitRequest.refreshSummary();

    requestAnimationFrame(function () {
      subWrap.querySelectorAll(".sm__bar i").forEach(function (i) {
        i.style.transition = "width 1s cubic-bezier(.2,.7,.2,1)";
        i.style.width = i.style.getPropertyValue("--v");
      });
    });
    if (scroll && !reduce) box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function wireRealScanner() {
    var textarea = document.getElementById("html-input");
    var fileInput = document.getElementById("html-file");
    var btn = document.getElementById("run-scan-btn");
    var hint = document.getElementById("scanner-hint");
    var industrySelect = document.getElementById("industry-select");
    if (!btn) return;

    var currentFilename = "";

    var SAMPLE_HTML = '<!DOCTYPE html>\n<html>\n<head>\n<title>Sample Bakery Website With A Title That Runs On For Quite A While</title>\n</head>\n<body>\n<div style="color:#999999;background:#ffffff;font-family:Georgia;">\n<h1>Welcome</h1>\n<h1>Fresh bread every day</h1>\n<h3>Our story</h3>\n<p>' +
      'Founded in 1998 our bakery has been serving the neighbourhood with fresh bread, pastries and cakes made from scratch every single morning using traditional techniques passed down through generations of bakers who cared deeply about quality and flavour and the community we are proud to be part of and we hope you will visit us soon to taste the difference that real craftsmanship makes every single day of the week. '.repeat(2) +
      '</p>\n<img src="bread.jpg">\n<img src="shop.jpg" style="font-family:Verdana;">\n<a href="#">click here</a>\n<a href="#menu">Menu</a>\n<a href="#about">About</a>\n<a href="#contact">Contact</a>\n<a href="#jobs">Jobs</a>\n<a href="#press">Press</a>\n<a href="#faq">FAQ</a>\n<a href="#blog">Blog</a>\n<form>\n<input type="text" name="name" required>\n<input type="email" name="email" required>\n<input type="tel" name="phone" required>\n<input type="text" name="address" required>\n<input type="text" name="city" required>\n<input type="text" name="zip" required>\n<button type="submit">Submit</button>\n</form>\n</div>\n</body>\n</html>';

    function loadSample() {
      textarea.value = SAMPLE_HTML;
      currentFilename = "sample-bakery.html";
      hint.textContent = t("scanner.hintSampleLoaded");
      hint.className = "scanner__hint";
      textarea.focus();
    }
    var sampleBtn = document.getElementById("load-sample-btn");
    if (sampleBtn) sampleBtn.addEventListener("click", loadSample);

    fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      currentFilename = file.name;
      var reader = new FileReader();
      reader.onload = function (e) {
        textarea.value = e.target.result;
        hint.textContent = t("scanner.hintLoaded", { file: file.name });
        hint.className = "scanner__hint";
      };
      reader.onerror = function () {
        hint.textContent = t("scanner.hintError");
        hint.className = "scanner__hint scanner__hint--err";
      };
      reader.readAsText(file);
    });

    btn.addEventListener("click", function () {
      var html = textarea.value;
      if (!html || !html.trim()) {
        hint.textContent = t("scanner.hintEmpty");
        hint.className = "scanner__hint scanner__hint--err";
        textarea.focus();
        return;
      }
      hint.textContent = "";
      var industryKey = industrySelect ? industrySelect.value : "general";
      var result = runAnalysis(html, currentFilename || "pasted-source.html", industryKey);
      renderResults(result);
    });
  }

  // ================================================================
  //  Industry order, shared field sync, and <select> population
  // ================================================================
  var INDUSTRY_ORDER = ["general", "ecommerce", "saas", "healthcare", "finance", "hospitality", "education", "realestate", "nonprofit", "agency"];

  // ================================================================
  //  Field sync — don't make people re-enter the same thing twice.
  //  The hero URL pre-fills the Fix-it brief's Website field, but
  //  stops overriding it the moment the person edits it themselves.
  //  (The three "Industry" selects are synced separately, via
  //  wireIndustrySync.)
  // ================================================================
  function wireFieldSync() {
    var heroUrl = document.getElementById("url");
    var ffUrl = document.getElementById("ff-url");
    var prefillNote = document.getElementById("ff-prefill-note");

    if (heroUrl && ffUrl) {
      function applyHeroUrlToBrief() {
        var val = heroUrl.value.trim();
        if (!val) return;
        if (!ffUrl.value.trim() || ffUrl.dataset.autofilled === "true") {
          ffUrl.value = val;
          ffUrl.dataset.autofilled = "true";
          if (prefillNote) prefillNote.hidden = false;
        }
      }
      heroUrl.addEventListener("change", applyHeroUrlToBrief);
      heroUrl.addEventListener("blur", applyHeroUrlToBrief);

      // Once the person edits the brief's website field themselves,
      // stop overwriting it from the hero field.
      ffUrl.addEventListener("input", function () {
        ffUrl.dataset.autofilled = "false";
        if (prefillNote) prefillNote.hidden = true;
      });
    }
  }

  function populateIndustrySelects() {
    document.querySelectorAll("#industry-select, #ff-industry, #hero-industry-select").forEach(function (select) {
      var current = select.value;
      select.innerHTML = "";
      INDUSTRY_ORDER.forEach(function (key) {
        var opt = document.createElement("option");
        opt.value = key;
        opt.textContent = t(INDUSTRY_PROFILES[key].labelKey);
        select.appendChild(opt);
      });
      if (current) select.value = current;
    });
  }

  function wireIndustryTabs() {
    var tabsWrap = document.getElementById("industry-tabs");
    var panel = document.getElementById("industry-content");
    if (!tabsWrap || !panel) return;

    var activeKey = INDUSTRY_ORDER[0];

    function renderTabs() {
      tabsWrap.innerHTML = "";
      INDUSTRY_ORDER.forEach(function (key) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "ind-tab";
        b.id = "ind-tab-" + key;
        b.setAttribute("role", "tab");
        b.setAttribute("aria-selected", key === activeKey ? "true" : "false");
        b.setAttribute("aria-controls", "industry-content");
        if (key === activeKey) b.classList.add("ind-tab--active");
        b.textContent = t(INDUSTRY_PROFILES[key].labelKey);
        b.addEventListener("click", function () { selectIndustry(key); });
        tabsWrap.appendChild(b);
      });
    }

    function renderPanel() {
      var profile = INDUSTRY_PROFILES[activeKey];
      var maxW = Math.max.apply(null, Object.values(profile.weights));
      var barsHtml = CATEGORY_KEYS.map(function (ck) {
        var w = profile.weights[ck];
        var pct = Math.round((w / maxW) * 100);
        return '<li class="ind-weight"><span class="ind-weight__name">' + t("cat." + ck) + '</span>' +
          '<span class="ind-weight__bar"><i style="width:' + pct + '%"></i></span>' +
          '<span class="ind-weight__val">' + Math.round(w * 100) + '%</span></li>';
      }).join("");

      var focusHtml = profile.focus.map(function (f) { return "<li>" + (f[LANG] || f.en) + "</li>"; }).join("");

      panel.innerHTML =
        '<p class="ind-framing">' + (profile.framing[LANG] || profile.framing.en) + '</p>' +
        '<div class="ind-grid">' +
          '<div><h3 class="ind-sub">' + t("ind.weightsHeading") + '</h3><ul class="ind-weights">' + barsHtml + '</ul></div>' +
          '<div><h3 class="ind-sub">' + t("ind.focusHeading") + '</h3><ul class="ind-focus">' + focusHtml + '</ul></div>' +
        '</div>';
    }

    function selectIndustry(key) {
      activeKey = key;
      renderTabs();
      renderPanel();
    }

    renderTabs();
    renderPanel();

    // expose for language toggle re-render
    wireIndustryTabs.refresh = function () { renderTabs(); renderPanel(); };
  }

  // ================================================================
  //  Fix-it request flow (mailto + copy-as-text)
  // ================================================================
  function buildSummaryText() {
    if (!lastResult) return "";
    var lines = [];
    lines.push(t("fixitForm.summaryTitle"));
    lines.push(t("fixitForm.summaryScore") + ": " + lastResult.overall + "/100");
    if (lastResult.industryKey !== "general") {
      lines.push(t("fixitForm.summaryIndustry") + ": " + t(lastResult.profile.labelKey));
    }
    lines.push("");
    lines.push(t("fixitForm.summaryTopIssues") + ":");
    var sorted = lastResult.issues.slice().sort(function (a, b) { return SEV_ORDER[a.sev] - SEV_ORDER[b.sev]; });
    sorted.slice(0, 6).forEach(function (it) {
      lines.push("- [" + SEV_LABEL[it.sev] + "] " + (it.title[LANG] || it.title.en));
    });
    if (sorted.length > 6) {
      lines.push("");
      lines.push(t("fixitForm.summaryMore", { n: sorted.length - 6 }));
    }
    return lines.join("\n");
  }

  // Full report: overall + 4 category scores + every issue with fix and
  // ready-to-build plan (steps + code). This is what goes into the
  // downloadable/copyable Fix-it brief.
  function buildFullReportText() {
    if (!lastResult) return "";
    var lines = [];
    var divider = "----------------------------------------";

    lines.push(t("fixitForm.summaryTitle"));
    lines.push(divider);
    lines.push(t("fixitForm.summaryScore") + ": " + lastResult.overall + "/100");
    if (lastResult.industryKey !== "general") {
      lines.push(t("fixitForm.summaryIndustry") + ": " + t(lastResult.profile.labelKey));
    }
    lines.push("");

    lines.push(t("fixitForm.categoryScores") + ":");
    CATEGORY_KEYS.forEach(function (cat) {
      lines.push("- " + t("cat." + cat) + ": " + Math.round(lastResult.categoryScores[cat]) + "/100");
      CATEGORY_CRITERIA[cat].forEach(function (key) {
        lines.push("    · " + t("crit." + key) + ": " + Math.round(lastResult.scores[key]) + "/100");
      });
    });
    lines.push("");

    var sorted = lastResult.issues.slice().sort(function (a, b) { return SEV_ORDER[a.sev] - SEV_ORDER[b.sev]; });
    lines.push(t("fixitForm.allIssues") + " (" + sorted.length + "):");
    lines.push(divider);

    sorted.forEach(function (it, idx) {
      lines.push("");
      lines.push((idx + 1) + ". [" + SEV_LABEL[it.sev] + "] " + (it.title[LANG] || it.title.en) + (it.industry ? " (" + t("issue.tag") + ")" : ""));
      lines.push(t("report.fixLabel") + " " + (it.fix[LANG] || it.fix.en));
      if (it.plan) {
        lines.push("");
        lines.push(t("issue.planHeading") + ":");
        it.plan.steps.forEach(function (step, sIdx) {
          lines.push("  " + (sIdx + 1) + ") " + (step[LANG] || step.en));
        });
        if (it.plan.code) {
          lines.push("");
          lines.push("  " + t("fixitForm.codeLabel") + ":");
          it.plan.code.split("\n").forEach(function (codeLine) {
            lines.push("  | " + codeLine);
          });
        }
      }
    });

    return lines.join("\n");
  }

  function wireFixitRequest() {
    var openFromScan = document.getElementById("open-fixit-from-scan");
    var panel = document.getElementById("fixit-request");
    var form = document.getElementById("fixit-form");
    var doneBox = document.getElementById("fixit-done");
    var summaryRow = document.getElementById("ff-summary");
    var summaryPre = document.getElementById("ff-summary-pre");
    var hint = document.getElementById("ff-hint");
    var copyBtn = document.getElementById("ff-copy");
    if (!panel) return;

    var noScanNote = document.getElementById("ff-noscan-note");

    function refreshSummary() {
      var summary = buildSummaryText();
      if (summary) {
        summaryRow.hidden = false;
        summaryPre.textContent = summary;
      } else {
        summaryRow.hidden = true;
      }
      if (noScanNote) {
        if (lastResult) {
          noScanNote.hidden = true;
        } else {
          noScanNote.innerHTML = t("fixitForm.noScanInline");
          noScanNote.hidden = false;
        }
      }
    }

    function scrollToForm() {
      refreshSummary();
      form.hidden = false;
      doneBox.hidden = true;
      hint.textContent = "";
      hint.className = "ff-hint";
      panel.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      var nameEl = document.getElementById("ff-name");
      if (nameEl) nameEl.focus({ preventScroll: true });
    }

    if (openFromScan) openFromScan.addEventListener("click", scrollToForm);

    // expose so language toggle / scan completion can refresh the attached summary
    wireFixitRequest.refreshSummary = refreshSummary;
    refreshSummary();

    function buildBrief() {
      var name = document.getElementById("ff-name").value.trim();
      var url = document.getElementById("ff-url").value.trim();
      var industry = document.getElementById("ff-industry").value;
      var notes = document.getElementById("ff-notes").value.trim();

      var lines = [];
      lines.push(t("fixitForm.briefTitle"));
      lines.push("");
      lines.push((LANG === "nl" ? "Naam" : "Name") + ": " + name);
      lines.push((LANG === "nl" ? "Website" : "Website") + ": " + url);
      lines.push((LANG === "nl" ? "Branche" : "Industry") + ": " + t(INDUSTRY_PROFILES[industry] ? INDUSTRY_PROFILES[industry].labelKey : "industries.general.label"));
      if (notes) {
        lines.push("");
        lines.push((LANG === "nl" ? "Opmerkingen" : "Notes") + ":");
        lines.push(notes);
      }
      var report = buildFullReportText();
      if (report) {
        lines.push("");
        lines.push("==========================================");
        lines.push("");
        lines.push(report);
      } else {
        lines.push("");
        lines.push(t("fixitForm.noScanYet"));
      }

      var hostSlug = (url || "site").replace(/^https?:\/\//, "").replace(/[^a-z0-9.-]+/gi, "-").replace(/^-+|-+$/g, "") || "site";
      return {
        text: lines.join("\n"),
        filename: "designscan-fixit-brief-" + hostSlug + ".txt",
        valid: !!(name && url)
      };
    }

    function downloadText(text, filename) {
      var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var brief = buildBrief();
        if (!brief.valid) {
          hint.textContent = t("fixitForm.hintMissing");
          hint.className = "ff-hint ff-hint--err";
          return;
        }
        downloadText(brief.text, brief.filename);
        form.hidden = true;
        doneBox.hidden = false;
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var brief = buildBrief();
        if (!brief.valid) {
          hint.textContent = t("fixitForm.hintMissing");
          hint.className = "ff-hint ff-hint--err";
          return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(brief.text).then(function () {
            hint.textContent = t("fixitForm.copied");
            hint.className = "ff-hint";
          }, function () {
            hint.textContent = t("fixitForm.copyFailed");
            hint.className = "ff-hint ff-hint--err";
          });
        } else {
          hint.textContent = t("fixitForm.copyFailed");
          hint.className = "ff-hint ff-hint--err";
        }
      });
    }
  }

  // ================================================================
  //  Language toggle (EN/NL)
  // ================================================================
  function wireLangToggle() {
    var btn = document.getElementById("lang-toggle");
    if (!btn) return;
    var opts = btn.querySelectorAll(".lang-toggle__opt");

    function setLang(lang) {
      LANG = lang;
      opts.forEach(function (o) { o.classList.toggle("lang-toggle__opt--active", o.dataset.lang === lang); });
      applyStaticTranslations();
      populateIndustrySelects();
      if (wireIndustryTabs.refresh) wireIndustryTabs.refresh();
      if (lastResult) renderResults(lastResult);
      // gauge grade re-translate if it's still the default
      var grade = document.getElementById("gauge-grade");
      if (grade && grade.dataset.locked !== "true") grade.textContent = t("hero.grade");
      var scoreEl = document.getElementById("gauge-score");
      if (scoreEl) updateGaugeAriaLabel(parseInt(scoreEl.textContent, 10) || 78);
    }

    btn.addEventListener("click", function () {
      setLang(LANG === "en" ? "nl" : "en");
    });
  }

  function wireMobileMenu() {
    var btn = document.getElementById("menu-toggle");
    var panel = document.getElementById("mobile-nav");
    if (!btn || !panel) return;

    function close() {
      panel.classList.remove("is-open");
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    }
    function open() {
      panel.hidden = false;
      panel.classList.add("is-open");
      btn.setAttribute("aria-expanded", "true");
    }

    btn.addEventListener("click", function () {
      if (panel.classList.contains("is-open")) close(); else open();
    });
    panel.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", close);
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth > 900) close();
    });
  }

  function wireIndustrySync() {
    var selects = Array.prototype.slice.call(document.querySelectorAll("#hero-industry-select, #industry-select, #ff-industry"));
    selects.forEach(function (select) {
      select.addEventListener("change", function () {
        var val = select.value;
        selects.forEach(function (other) {
          if (other !== select) other.value = val;
        });
      });
    });
  }

  function init() {
    drawGauge();
    animateScore(78);
    wireCards();
    wireReveal();
    wireScan();
    populateIndustrySelects();
    wireIndustrySync();
    wireFieldSync();
    wireRealScanner();
    wireIndustryTabs();
    wireFixitRequest();
    wireLangToggle();
    wireMobileMenu();

    // Restore the last scan result (if any) so a page reload doesn't
    // lose the report — without yanking the viewport on load.
    var restored = loadLastResult();
    if (restored) renderResults(restored, { scroll: false });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
