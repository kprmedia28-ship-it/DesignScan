# DesignScan

Een verbeterde variant van [designmeter.ai](https://designmeter.ai/) — een landingspagina voor een AI-tool die de UI/UX van een website objectief beoordeelt en concrete verbeterpunten teruggeeft.

Statische site (HTML/CSS/JS, geen build-stap). Direct te hosten op GitHub Pages.

---

## 1. Diepe analyse van het origineel (designmeter.ai)

### Wat de site doet
DesignMeter positioneert zich als *"objective UI/UX scores with actionable insights"*. Je levert een pagina aan en krijgt een score plus aanbevelingen, gemeten op o.a. **visuele hiërarchie, bruikbaarheid, user experience en toegankelijkheid**. De propositie draait om conversie en retentie: *"what's hurting your UX — and exactly what to fix."*

### Welke UX/UI-criteria de site zelf hanteert/uitstraalt
| Criterium | Observatie op het origineel |
|---|---|
| **Waardepropositie** | Sterke, duidelijke kop ("How good is your design, really?") en concrete belofte (15 issues in 4 dagen). |
| **Visuele hiërarchie** | Eén dominante claim + ondersteunende subtekst; redelijk gefocust. |
| **Call-to-action** | "Fix my website" als primaire actie; relatief duidelijk. |
| **Vertrouwen** | Privacy/Terms aanwezig, versievermelding (v2.0.0), social meta (OG/Twitter) netjes ingevuld. |
| **Toegankelijkheid** | Beperkt te beoordelen door client-side rendering, maar de logo-alt is aanwezig. |

### Zwakke plekken (de aangrijpingspunten voor verbetering)
1. **Rendering & first paint.** De site is een client-side gerenderde SPA (Next.js). Een rauwe fetch levert letterlijk *"Loading page content, please wait..."* op. Dat betekent: trage *perceived performance*, een lege eerste render en zwakkere indexeerbaarheid voor crawlers die geen JS draaien. Ironisch voor een tool die *performance signals* meet.
2. **Inhoud verstopt achter JS.** Zonder JavaScript is er geen leesbare inhoud. Dat is een toegankelijkheids- én SEO-risico.
3. **Geen onmiddellijk bewijs van kunde.** Een tool die design *meet* zou zijn eigen kwaliteit meteen moeten tonen. Er is geen directe, zichtbare demo van het kernproduct (de score) boven de vouw.
4. **Friction in de funnel.** De primaire flow stuurt richting "praat met ons", terwijl de belofte ("score in seconden") schreeuwt om een directe, zelfbedienings-input.

---

## 2. Wat deze variant beter doet

| Verbetering | Hoe |
|---|---|
| **Inhoud direct zichtbaar** | Volledig statische HTML — alle tekst en de score staan er meteen, ook zonder JS. JS is *progressive enhancement*. |
| **Het product is de hero** | De signatuur is een gekalibreerde **meter (wijzerplaat + tickmarks)** die live naar een score loopt, met de vier hoofdscores (UX, UI, Journey, Engagement). De bezoeker ziet binnen één seconde wát de tool oplevert. |
| **Directe zelfbediening** | URL-veld + "Scan my design" boven de vouw. Lagere drempel dan een contactformulier. (In deze statische demo draait de scan client-side als preview.) |
| **Transparante rubric** | Een sectie "Four scores, twelve signals" maakt expliciet waarop gescoord wordt — vier hoofdscores, elk opgebouwd uit drie signalen — dat bouwt vertrouwen op dat het origineel impliciet laat. |
| **Toegankelijkheid als basislijn** | Semantische HTML, skip-link, zichtbare focus-states, `aria-label` op de meter, voldoende contrast, en respect voor `prefers-reduced-motion`. |
| **Concrete sample-report** | Issues gerangschikt op impact (HIGH/MED/LOW) met de exacte fix erbij — laat de belofte "actionable" zien in plaats van hem te claimen. |
| **Echte werkende scan** | Een sectie "Scan your HTML" waar je écht HTML plakt of uploadt; de pagina parseert die client-side (`DOMParser`) en scoort op echte bevindingen — geen nepgetallen. |
| **"Fix my website"-service** | Een uitlegsectie die de done-for-you service van het origineel naspeelt: 15 gerangschikte issues, levertijd, prijsindicatie en een duidelijke CTA. |
| **Per-industrie weging** | Een sectie "What matters most in your industry" met 9 branches (e-commerce, SaaS, zorg, financieel, horeca, onderwijs, vastgoed, non-profit/overheid, agency/portfolio) die elk laten zien hoe de vier hoofdscores anders wegen en welke extra checks gelden. |
| **Industrie-bewuste scan** | De echte scanner heeft een branche-keuze. Per branche worden 2 extra, branche-specifieke checks uitgevoerd (bijv. trust-signalen bij e-commerce, leesbaarheid bij zorg/onderwijs, tel-link bij horeca) en wordt de eindscore herwogen volgens het profiel van die branche. |
| **Mobiel menu** | De navigatie was op kleine schermen volledig verborgen zonder alternatief. Er is nu een hamburger-menu met dezelfde links plus de scan-CTA. |
| **Gesynchroniseerde branchekeuze** | De drie Industry-selects (hero-scan, echte scanner, Fix-it-brief) staan gekoppeld: kies 'm één keer, de andere twee volgen automatisch (blijven los aanpasbaar). |
| **Dynamisch toegankelijkheidslabel op de meter** | De `aria-label` van de meter-SVG geeft nu de actuele score en beoordeling weer (en in de juiste taal), in plaats van een vast "78/100, rated good". |
| **"Try a sample"** | Een knop bij de echte scanner laadt een opzettelijk gebrekkige voorbeeldpagina, zodat bezoekers de tool direct kunnen zien werken zonder eigen HTML te zoeken. |
| **Ready-to-build plan per issue** | Elk gevonden issue in de echte scan heeft een uitklapbaar stappenplan: concrete, genummerde stappen en — waar relevant — een codevoorbeeld. Direct uitvoerbaar voor een designer/developer. |
| **Fix-it-brief downloaden** | De "Done for you"-sectie heeft een formulier (naam, website, branche, opmerkingen — geen e-mailadres) dat een gerangschikte Fix-it-brief samenstelt, inclusief de scansamenvatting als die er is. Bij versturen wordt een `.txt`-bestand gedownload; "Copy brief as text" kopieert dezelfde inhoud naar het klembord. Alles blijft lokaal, er wordt niets verzonden. |
| **Scanresultaat blijft bewaard** | Het resultaat van de echte scan wordt (via `localStorage`, met fallback) onthouden, zodat het na een paginarefresh nog steeds in de Fix-it-brief wordt meegenomen — geen "geen scan gevonden" meer na een herlaad. |
| **Demo vs. echte scan, duidelijk onderscheiden** | De demo-meting op de homepage (URL invoeren) telt niet als "scan" voor de brief. Zolang er geen échte HTML-scan is uitgevoerd, toont de Fix-it-sectie een duidelijke melding met een link naar de echte scanner. |
| **Geen herhaalde invoer (URL)** | De website-URL uit de hero-scan vult automatisch het "Website"-veld van de Fix-it-brief, met een zichtbare melding. Past de gebruiker dat veld zelf aan, dan stopt de automatische overname — geen ongewenste overschrijvingen. |
| **Duidelijke veldvalidatie** | Een lege URL bij de demo-scan toont nu een echte foutmelding (`role="alert"`, `aria-invalid`) in plaats van alleen een rode rand — en verdwijnt zodra je begint te typen. |
| **Bruggetje tussen demo en echte scan** | Na een demo-scan verschijnt een directe link naar de echte HTML-scanner, met de melding dat de branchekeuze meegaat. |
| **Browser-autofill** | Naam- en website-velden hebben `autocomplete`-attributen, zodat browsers eerder ingevulde gegevens kunnen aanbieden. |
| **EN/NL taalwisseling** | Een EN/NL-knop in de header vertaalt de hele site — statische teksten, de branchetabs, en de scanresultaten (titels, fixes, stappenplannen) — direct, zonder te herladen. |
| **Performance** | Geen framework, geen build, ~3 kleine bestanden. Snelle first paint, stabiele layout. |

### De rubric: vier scores, twaalf signalen

De score is opgebouwd uit vier hoofdscores, elk gemiddelde van drie signalen:

- **UX** — Interaction clarity, Cognitive load, Accessibility basics
- **UI** — Visual hierarchy, Color & contrast, Typography
- **Journey Score** — Flow from entry to action, Friction points, Drop-off risk
- **Engagement Score** — Feedback loops, Motivation, Progress signals

De overall-score is een gewogen gemiddelde van de vier hoofdscores; de gewichten verschillen per branche (zie hieronder). In de scanresultaten zie je per hoofdscore de drie onderliggende signalen, zodat duidelijk is *waar* punten weglekken.

### Ontwerprichting — "The Readout"
Een tool die meet, hoort eruit te zien als een precisie-instrument. Daarom: koel instrument-grijs + diepe ink + één warme **ember**-signaalkleur (de naald), een **monospace** font voor alle numerieke uitlezingen (scores, ticks, labels), en een terugkerend **tick/liniaal-motief** als sectie-scheiding. Bewust géén standaard "donkere SaaS met felgroen"-look.

- **Display:** Space Grotesk · **Body:** Inter · **Data:** JetBrains Mono
- **Kleuren:** `--paper #ECEDEF` · `--ink #11161A` · `--ember #E2562A` · `--teal #0E6E66`

---

## 3. Lokaal bekijken

Geen build nodig. Open `index.html` rechtstreeks, of serveer de map:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## 4. Hosten op GitHub Pages

1. Push deze repo (zie hieronder).
2. Repo → **Settings → Pages** → *Source: Deploy from a branch* → branch `main`, map `/ (root)`.
3. De site verschijnt op `https://kprmedia28-ship-it.github.io/DesignScan/`.

---

## Structuur
```
DesignScan/
├── index.html          # de pagina (alle inhoud, ook zonder JS leesbaar)
├── assets/
│   ├── styles.css       # design tokens + layout (instrument-esthetiek)
│   └── app.js           # meter-geometrie, animatie, demo-scan (enhancement)
└── README.md
```

> De "scan" in de hero draait client-side en genereert een voorbeeldscore. De sectie **"Scan your HTML — for real"** doet een echte analyse: hij parseert de geplakte/geüploade HTML met `DOMParser` en checkt o.a. ontbrekende `alt`-attributen, koppenhiërarchie (`h1`–`h6`), labels op formuliervelden, `lang`-attribuut, viewport-meta, vage link-/knoptekst (zoals "click here"), aantal concurrerende CTA's, inline-stijl-drift en `<img>` zonder `width`/`height`. Op basis daarvan wordt per criterium een score berekend en een issue-lijst met concrete fixes getoond — alles lokaal, niets wordt verzonden.

> De **"Fix my website"**-sectie is een service-aanbod naar het voorbeeld van het origineel (15 issues, 4 dagen levertijd, prijsindicatie). De "Request my Fix-it report"-knop opent een formulier (naam, website, branche, opmerkingen — geen e-mail). Bij "Download brief" wordt een `.txt`-bestand gegenereerd en gedownload met die gegevens plus (indien aanwezig) de scansamenvatting; "Copy brief as text" kopieert hetzelfde naar het klembord. Er wordt niets verzonden of opgeslagen — de gebruiker bepaalt zelf wat ermee gebeurt.

> **Per industrie:** elk van de 9 profielen (in `INDUSTRY_PROFILES` in `app.js`) heeft eigen gewichten voor de vier hoofdscores (UX/UI/Journey/Engagement, sommen tot 100%) en — op "General" na — twee extra checks op specifieke signalen. Bijvoorbeeld: e-commerce checkt op trust-/retourtekst (Motivation) en een zoekveld (Friction points); zorg en onderwijs checken de gemiddelde zinslengte (Cognitive load); horeca checkt op een `tel:`-link (Flow to action) en adres/openingstijden (Friction points); agency/portfolio checkt het aantal losse inline-kleuren (Color & contrast). Resultaten van die extra checks krijgen een "Industry"/"Branche"-label in de issue-lijst. Pas gewichten of checks aan door het betreffende object in `INDUSTRY_PROFILES` te bewerken.

> **Ready-to-build plan:** elk issue (algemeen én branche-specifiek) heeft een `plan`-veld met genummerde stappen en optioneel een codevoorbeeld. In de resultaten is dit een uitklapbare "Show fix plan"/"Toon stappenplan"-sectie per issue.

> **Vertaling (EN/NL):** alle statische tekst gebruikt `data-i18n="..."`-attributen die verwijzen naar de `I18N`-dictionary in `app.js`. De EN/NL-knop in de header (`#lang-toggle`) herschrijft alle `[data-i18n]`-elementen, de branchetabs en — als er al een scan is uitgevoerd — de scanresultaten. Nieuwe teksten toevoegen: voeg een `data-i18n="jouw.key"` toe in `index.html` en de bijbehorende `en`/`nl`-waarden in `I18N` in `app.js`.
