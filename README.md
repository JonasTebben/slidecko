# Slidecko

Präsentationseditor, der komplett im Browser läuft: Folien gestalten, PowerPoint-, OpenDocument-, PDF- und Slidev-Präsentationen importieren und als PowerPoint, OpenDocument, PDF, HTML oder Slidev-Projekt exportieren. Projekte bleiben lokal in IndexedDB; der Server liefert nur die Dateien aus.

```bash
bun install
bun run dev      # Editor starten (Vite)
bun run build    # statische Dateien in dist/
bun run start    # dist/ ausliefern wie auf Railway: http://localhost:3000
bun test         # Parser-/Export-/Server-Tests
```

## Betrieb auf Railway

Wie die anderen Tools (z. B. `../ginkgo`): Bun (Version in `package.json` → `packageManager`) auf Railway.

| Was | Wert |
|---|---|
| Build | Railpack, `bun run build` (`railway.json`) |
| Start | `bun server.js` – liefert `dist/` aus, Port über `PORT` |
| Healthcheck | `GET /health` → `ok` |
| App-Sleeping | an (kein Zustand auf dem Server, kein Volume nötig) |
| Domain | `slidecko.tebben.dev` |

```bash
railway link                              # Projekt/Service wählen
railway up --service slidecko --ci        # deployen (lädt den lokalen Ordner hoch, ohne .gitignore-Inhalte)
railway logs --service slidecko
```

## Seiten, Fußzeile, Unterstützung, Datenschutz

- **Landing Page** `index.html` (Englisch, statisches HTML ohne Framework) unter `/`, mit Icon `public/icon.png` und Screenshots `public/shots/`. Die App selbst liegt unter `/app/` (`app/index.html`); `server.js` leitet `/app` auf `/app/` um. tools.tebben.dev verlinkt nur per Kachel hierher.
- **Fußzeile** (`src/AppFooter.vue`, in Editor und Projektübersicht): „Slidecko ist ein kostenloses Tool von Jonas Tebben“ mit Links zu `slidecko.tebben.dev` und `tebben.dev`, Impressum (`jonas-tebben.de/legal-notice/`), Datenschutz (`../datenschutz.html`) und dem Sprachumschalter.
- **Spendenlink (Stripe)**: Den Payment Link in `src/support.js` bei `SUPPORT_URL` eintragen (Stripe-Dashboard → Payment Links → „Kunde wählt den Preis“, SEPA-Lastschrift aktivieren). Ist er leer, fehlt der Kaffee-Link in der Fußzeile, und `vite.config.js` entfernt beim Build den Abschnitt zwischen `<!-- stripe -->` und `<!-- /stripe -->` aus `datenschutz.html`. Nach dem Eintragen neu bauen und deployen.
- **Datenschutzseite** `datenschutz.html` (wird von Vite mitgebaut, nicht aus `public/` kopiert): die einzige Datenschutzseite von Slidecko. Sie gilt für `slidecko.tebben.dev`; Landing Page und App verlinken auf sie. Die Abschnittsnummern zählt CSS, damit beim Weglassen von Stripe keine Lücke entsteht.
- **YouTube** lädt erst nach Klick auf „YouTube-Inhalte laden“ (`src/SlideView.vue`, Merker `ui.yt`, pro Tab im sessionStorage). Exporte blenden den Button aus (`src/exportFormats.js`).

**Vor dem Livegang offen:**
- Stripe-Link in `src/support.js` (optional).
- Railway-Projekt/-Service `slidecko` anlegen, Domain `slidecko.tebben.dev` verbinden (DNS bei INWX: CNAME + `_railway-verify` TXT).

## Sprachen

Die Oberfläche gibt es auf Deutsch und Englisch (`src/i18n.js`). Ohne gespeicherte Wahl gilt die Browsersprache (Deutsch, sonst Englisch); die Wahl steht im localStorage (`slides-builder:lang`). Der Wechsel über die Fußzeile wirkt sofort, ohne Neuladen.

- Im Code steht der deutsche Text: `t('Folie {0} von {1}', a, b)`. Das Wörterbuch `src/locales/en.js` ordnet ihm die Übersetzung zu; fehlt sie, erscheint der deutsche Text.
- Neue UI-Texte immer in `t()` setzen und in `src/locales/en.js` eintragen. Labels in Konstanten (z. B. `presets.js`, `themes.js`) bleiben deutsch und werden erst beim Anzeigen mit `t(x.name)` übersetzt.
- Beispielinhalte neuer Folien und Elemente (`src/presets.js`) entstehen in der eingestellten Sprache; vorhandene Inhalte ändern sich beim Umschalten nicht.
- Weitere Sprache: `src/locales/<code>.js` anlegen und in `LOCALES` in `src/i18n.js` eintragen.
- In Node-Tests ist die Sprache immer Deutsch, weil die Tests deutsche Texte prüfen.

## Datenschutz beim eigenen Hosting

Wer Slidecko selbst öffentlich betreibt, braucht eine eigene Datenschutzerklärung. `datenschutz.html` nennt Jonas Tebben als Verantwortlichen und Railway als Hoster; beides muss angepasst werden (oder die Seite ersetzt und der Link in `src/AppFooter.vue` geändert). Was die App selbst tut, steht hier; Hosting, Server-Logs usw. kommen vom jeweiligen Betreiber dazu.

| Wo | Was | Wie lange |
|---|---|---|
| IndexedDB `slides-builder` | Projekte (Folien, Bilder, Projektdateien), Projektliste | bis zum Löschen des Projekts („Entfernen“) oder der Website-Daten |
| localStorage `slides-builder:*` | zuletzt geöffnetes Projekt (`last`), Sprache (`lang`), Exportformat (`export`), „Schriftgrößen beibehalten“ (`keep-sizes`), eigene Textstile (`text-presets`), Suchoptionen ohne Suchbegriff (`find`) | dauerhaft |
| sessionStorage `slides-builder:session` | Ansicht des Tabs (Projekt, Folie, Auswahl, eingeklappte Foliensätze, Scrollposition), Suchbegriff, YouTube-Freigabe | bis der Tab geschlossen wird |

- Die App setzt keine Cookies, nutzt kein Tracking und lädt keine Daten hoch. Importe werden im Browser gelesen, Exporte im Browser erzeugt.
- YouTube wird erst nach einem Klick auf „YouTube-Inhalte laden“ geladen: Vorschaubilder von `i.ytimg.com`, der Player von `www.youtube-nocookie.com`. Dabei gehen Daten an Google. Rechtsgrundlage ist die Einwilligung durch den Klick. Die Freigabe gilt pro Tab.
- Ändert sich, was die App speichert (`src/session.js`, `src/store.js`, `src/i18n.js`), müssen diese Tabelle und `datenschutz.html` mitgezogen werden.

## Was es kann

- **Slidev-Projekt öffnen**: Ordner wählen – geladen wird über die `slides.md`, wie bei Slidev. Per `src:` eingebundene Foliensätze, Bilder (auch aus `public/`), Theme, Komponenten und `package.json` werden übernommen. Folien werden mit Slidevs Layout- und UnoCSS-Regeln gerendert und vermessen, damit sie so aussehen wie in Slidev. Wird derselbe Ordner noch einmal geöffnet, fragt das Tool: vorhandenes öffnen, Kopie anlegen oder überschreiben.
- **Präsentation importieren** (Startseite oder per Drag & Drop), jeweils als neues Projekt:
  - *PowerPoint (.pptx/.potx)*, auch Exporte aus Google Slides und Keynote, und *OpenDocument (.odp/.otp)* aus LibreOffice/Impress: Textfelder, Listen, Tabellen, Formen, Bilder, Hintergründe, Master-/Layout-Elemente und Sprechernotizen werden bearbeitbare Elemente an ihrer Position. Schriftgröße, -farbe, -art, fett/kursiv/unterstrichen und Ausrichtung kommen auch aus Platzhaltern von Layout und Master. Vertikale Ausrichtung im Textfeld (oben/mittig/unten) bleibt erhalten und lässt sich im Inspector ändern. Gedrehte, gespiegelte oder zugeschnittene Bilder, Freiformen, Pfeile und (gestrichelte) Verbinder werden als Bild übernommen; Schriften im Namen („DM Sans Bold“), Nummerierung, Aufzählungszeichen und Wingdings-Symbole bleiben erhalten. Tabellen behalten Spaltenbreiten, Zellfarben und Zellrahmen (Stärke, Farbe, gestrichelt/gepunktet), auch aus Tabellenvorlagen: in der Datei definierte (PowerPoint, Google Slides) und die 74 eingebauten PowerPoint-Vorlagen (Kopf-/Ergebniszeile, erste/letzte Spalte, Bänder), wenn eine Datei sie nur per Kennung nennt. Die Foliennummer setzt der Editor selbst. Nicht übernommen: gedrehter Text, Verläufe, Animationen, eingebettete Schriften (es greift die installierte bzw. Ersatzschrift), seltene Formvorlagen, Diagramme/SmartArt (deren Ersatzbild schon).
  - *PDF*: jede Seite wird eine Bildfolie (nicht bearbeitbar), ihr Text landet in den Sprechernotizen.
  - *HTML*: eigene HTML-Exporte enthalten das Projekt und öffnen sich verlustfrei. Jedes Bild steckt nur einmal in der Datei, CSS ungenutzter Themes wird weggelassen. Die ZIP-Variante des HTML-Exports lässt sich ebenso öffnen. Fremde HTML-Dateien werden nicht unterstützt.
  - *Bilder*: jedes Bild wird eine Folie, nach Dateinamen sortiert.
- **Foliensätze**: Lose `.md`-Dateien werden – nach Namen sortiert – je ein Foliensatz. In der Seitenleiste lassen sie sich per Drag & Drop am Namen verschieben, umbenennen, entfernen und einzeln exportieren.
- **Export** (Menü „Export“ oder Dialog „Exportieren …“, ⌘E), jeweils für das Gesamtprojekt oder einen einzelnen Foliensatz:
  - *Slidev (.zip)*: Gesamt-`slides.md` mit `src:`-Verweisen, ein `.md` pro Foliensatz, Bilder an ihren Originalpfaden. Unveränderte Folien bleiben Byte für Byte erhalten (auch Leerzeilen), bearbeitete werden als positionierte HTML-Blöcke geschrieben. Das JBT Theme wird als Paket eingebunden (`theme: jbt-theme`, Abhängigkeit [`github:JonasTebben/jbt-theme`](https://github.com/JonasTebben/jbt-theme) in `package.json`), die übrigen Themes werden als `style.css` mitgeliefert; Bilder, die im Markdown stehen, aber nicht mit hochgeladen wurden, nennt die Export-Meldung.
  - *PDF*: über den Druckdialog, eine Seite pro Folie, der Text bleibt auswählbar. Hintergründe mit CSS-Blend-Modes, die Druck-Engines nicht können, werden vorher als Bild eingesetzt.
  - *PowerPoint (.pptx)*: bearbeitbarer Text mit der tatsächlich verwendeten Schrift, klickbare und unterstrichene Links, native Tabellen und Formen, Bilder, Sprechernotizen. Zeilenumbrüche werden aus dem Editor übernommen (weiche Umbrüche im selben Absatz), verschachtelte Listen werden echte Gliederungsebenen, Nummerierungen behalten ihren Startwert, Spalten (Flex/Grid) werden eigene Textfelder an ihrer Position. Hintergründe (Verläufe, Overlays, Rahmen) rendert der Browser einmal pro Variante in einen Folienmaster. Öffnet in PowerPoint, Keynote, Google Slides und LibreOffice. Die Folien-XML entspricht dem OOXML-Schema (ISO/IEC 29500); einen zweiten `<a:pPr>` je Absatz, den pptxgenjs schreibt und der dem Schema widerspricht, entfernt der Export. Nummerierungen stehen in Schrift und Größe des Textes (sonst zeichnet Google Slides sie kleiner).
  - *Google Slides (.pptx)*: dieselbe PPTX, aber mit Zeilenabständen als Vielfaches. Google Slides vergrößert feste Abstände um den Faktor 1,2, Keynote rechnet Vielfache anders – deshalb zwei Varianten.
  - *PowerPoint originalgetreu (.pptx)*: jede Folie als Bild in 1960 × 1104 px, mit Notizen – sieht in jedem Programm exakt aus wie im Editor.
  - *OpenDocument (.odp)*: natives Format von LibreOffice Impress/OpenOffice/Collabora, bearbeitbar; entsteht aus demselben Layout-Durchlauf wie die PPTX.
  - *HTML-Präsentation (.html)*: eine Datei mit allen Folien, Bildern und Schriften, läuft offline in jedem Browser (Pfeiltasten, Wischen, F = Vollbild, `#12` springt zu Folie 12, druckbar).
  - *HTML-Präsentation (ZIP)*: dieselbe Präsentation als `index.html` mit Bildern und Schriften als eigenen Dateien (`images/`, `assets/`) – kleiner, weil ohne Base64, und gut für Webserver oder Lernplattformen. Entpacken und `index.html` öffnen.
  - *Bilder (.zip)*: eine PNG-Datei pro Folie.
- **Bearbeiten**: Text (Einfügen aus Word, Google Docs oder Webseiten behält fett/kursiv/unterstrichen, Farben, Links, Absätze und Listen; in importiertem Text übernehmen eingefügte Absätze und Listen Schrift, Größe und Farbe des Ziels, Absätze auch dessen Abstände und Ausrichtung, Listenpunkte Aufzählungszeichen und Einzug der Zielliste je Ebene), Überschriften, Listen, Zitate, Hinweisboxen, Code mit Syntax-Highlighting (Zeilennummern per Häkchen und Slidevs hervorgehobene Zeilen wie `{2,4-5}` schon im Editor sichtbar – die übrigen Zeilen abgedimmt, auch im PPTX-Export –; Hintergrundfarbe, Deckkraft und Eckenradius einstellbar; auf dunklem Hintergrund schalten Text- und Syntaxfarben automatisch auf ein dunkles Schema – auch im Slidev-, PPTX- und ODP-Export), Bilder, Tabellen (8 Presets, Zeilen/Spalten per Plus/Minus an der Tabelle, Spaltenbreiten ziehen, aus Excel, Numbers, Google Sheets, Word oder Google Docs einfügen – mit fett/kursiv/unterstrichen/durchgestrichen, Textfarbe, Links, Zeilenumbrüchen und Zellfarben –, mehrere Zellen markieren (⇧-Klick, Ziehen, ⇧+Pfeile) und gemeinsam füllen (Tippen ersetzt alle; Einfügen füllt alle mit einem Wert oder wiederholt einen passenden Block wie in Excel), färben, umrahmen, ausrichten, leeren, kopieren oder ihre Zeilen/Spalten löschen, sortieren, Zellfarben für Zelle, Zeile oder Spalte – im PPTX/ODP-Export als Zellfüllung, im Slidev-Export als HTML-Tabelle; Zellrahmen für Zelle, Zeile, Spalte oder Tabelle – alle, außen, innen oder einzelne Seiten, mit Stärke, Linienart und Farbe; die Knöpfe zeigen die vorhandenen Linien, ein zweiter Klick entfernt sie –, auch importierte, in allen Exporten erhalten), Formen und YouTube.
  - Textstile mit Live-Vorschau im Theme sowie eigene Stil-Presets. Textfelder und Codeblöcke wachsen mit ihrem Inhalt.
  - **Schrift für alle Folien**: Ist nichts ausgewählt, legt der Inspector die Größen für Text, Titel und Code im ganzen Projekt fest. Sie gelten in jedem Theme und werden beim Slidev-Export in `style.css` geschrieben.
  - Hilfslinien mit Einrasten (Alt schaltet es aus), Format übertragen (Pinsel im Inspector oder ⌘⌥C / ⌘⌥V: Schrift, Größe, Farben, Füllung, Deckkraft, Ausrichtung, Kontur, Ecken – zwischen Textfeldern, Formen, Codeblöcken und Bildern nur das, was beide haben), Mehrfachauswahl (mehrere Textfelder gemeinsam formatieren: Schriftart, -größe, Ausrichtung, Text- und Hintergrundfarbe; Schatten und Position sperren für alle markierten Elemente; „Gemischt“ zeigt unterschiedliche Werte), Kontur für Textfelder (Farbe, Stärke, durchgezogen/gestrichelt/gepunktet – in allen Exporten), Schatten (weich/deutlich) für Textfelder, Formen, Bilder und Codeblöcke – im Slidev-, PPTX- und ODP-Export, Position sperren (gesperrte Elemente lassen sich bearbeiten, aber nicht verschieben, skalieren oder ausrichten; bleibt im Slidev-Projekt erhalten), Deckkraft für Hintergründe von Textfeldern, Formen und Codeblöcken (in allen Exporten), Ausrichten (einzeln an der Folie, mehrere aneinander oder an der Folie) und Verteilen, Text links/zentriert/rechts/Blocksatz und oben/mittig/unten, Kopieren und Einfügen, Rückgängig/Wiederholen.
  - Folien-Presets, 14 Themes.
- **Theme wechseln ohne Layoutbruch**: „Schriftgrößen beim Wechsel beibehalten“ ist standardmäßig an. Das neue Theme übernimmt dann Farben und Schriften, aber die Größen des bisherigen Themes, sodass Boxen und Umbrüche bleiben. Beim Zurückwechseln wird das aufgehoben. Ein Theme-Wechsel ändert nie gespeicherte Boxgrößen.
- **Auf Import-Stand zurücksetzen**: Eine importierte Folie (oder per Befehl alle geänderten) wird aus ihrem Original-Markdown neu dargestellt und danach wieder unverändert exportiert.
- **Markdown/KI**: „Folien aus Markdown einfügen“ (⇧M) nimmt Slidev-Markdown entgegen, z. B. von einer KI erzeugt. „Markdown dieser Folie“ (M) bearbeitet eine einzelne Folie als Text.
- **Präsentieren**: Vollbild (P/F5), Referentenansicht mit Notizen, nächster Folie und Timer (⌥P), klickbare Links, Videos laufen live.
- **Tastenkürzel**: ⌘K bzw. `?` zeigt alle Befehle mit ihren Kürzeln.
- **Neu laden ohne Verlust**: Offenes Projekt bzw. Projektübersicht, aktuelle Folie, ausgewählte Elemente, eingeklappte Foliensätze und die Scrollposition der Folienliste stehen pro Tab im `sessionStorage` und sind nach einem Reload wieder da (ein neuer Tab startet mit dem zuletzt geöffneten Projekt).

## Aufbau

| Datei | Zweck |
| --- | --- |
| `src/parseSlidev.js` | Markdown → Folien (Frontmatter, `src:`-Einbindung, Blöcke) |
| `src/importSlidev.js` | rendert jede Folie wie Slidev und misst die Elemente aus |
| `src/toSlidev.js` | Folien → Slidev-Projektdateien |
| `src/exportPptx.js` | PPTX/ODP aus den gerenderten Folien (ein Layout-Durchlauf) |
| `src/pptxFix.js` | Schema-Korrektur der von pptxgenjs geschriebenen Folien-XML |
| `src/exportOdp.js` | OpenDocument-Writer mit der Schnittstelle von pptxgenjs |
| `src/exportFormats.js` | Bilder, originalgetreue PPTX, HTML-Präsentation, Druck-Vorbereitung |
| `src/themes.js`, `src/slide.css` | Themes, Tabellen- und Hinweisbox-Stile (identisch im Editor und im Slidev-Export) |
| `src/store.js`, `src/actions.js` | Projektzustand, Speicherung, Befehle |
| `src/session.js` | Ansichtszustand des Tabs für den Reload (sessionStorage) |
| `src/i18n.js`, `src/locales/` | Übersetzungen der Oberfläche (deutscher Text ist der Schlüssel) |
| `server.js` | Bun-Server für Railway: liefert `dist/` aus, `/health` |
| `src/AppFooter.vue`, `src/support.js` | Fußzeile, Stripe-Link |
| `index.html` | Landing Page (`/`) |
| `app/index.html` | Einstieg der App (`/app/`) |
| `datenschutz.html` | Datenschutzseite für den Betrieb auf Railway |

## Bekannte Grenzen

- `v-click`-Schritte werden als vollständig aufgedeckte Folie dargestellt (wie im PDF-Export von Slidev).
- Vue-Komponenten außer `<Youtube>` und Mermaid-Diagramme bleiben unverändert im Markdown, werden im Editor aber nicht gerendert.
- PPTX/ODP (bearbeitbar): Umbrüche entsprechen dem Editor; wird ein Absatz später in PowerPoint umformuliert, bleiben diese weichen Umbrüche stehen. Textschatten fehlen. Die Systemschrift (`system-ui`) gibt es in anderen Programmen nicht unter einem Namen – auf dem Mac wird Helvetica Neue, unter Windows Segoe UI eingetragen. Für exakt gleiches Aussehen: „originalgetreu“.
- Keynote hat kein offenes Dateiformat; es öffnet die PPTX direkt. Google Slides importiert die PPTX; dafür gibt es die Variante „Google Slides“. Code-Schriften werden als Courier New geschrieben, weil Google Menlo & Co. durch eine Proportionalschrift ersetzt. Helvetica Neue hat Google nicht, die Ersatzschrift ist etwas breiter.
