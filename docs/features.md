# Features in detail

## Import

Everything is read in the browser and opens as a new project (from the start page or by drag and drop).

- **Slidev project**: pick a folder. Loading starts from `slides.md`, like in Slidev. Decks included with `src:`, images (also from `public/`), the theme, components and `package.json` come along. Slides are rendered and measured with Slidev's layout and UnoCSS rules, so they look as they do in Slidev. Opening the same folder again asks whether to open the existing project, make a copy or overwrite it.
- **PowerPoint (`.pptx`/`.potx`)**, also exports from Google Slides and Keynote, and **OpenDocument (`.odp`/`.otp`)** from LibreOffice Impress:
  - Text boxes, lists, tables, shapes, images, backgrounds, master and layout elements and speaker notes become editable elements at their position.
  - Font size, colour and family, bold/italic/underline and alignment are also taken from layout and master placeholders. Vertical alignment inside a text box is kept and can be changed in the inspector.
  - Rotated, flipped or cropped images, freeforms, arrows and (dashed) connectors come in as images. Fonts named with their weight ("DM Sans Bold"), numbering, bullets and Wingdings symbols are kept.
  - Tables keep column widths, cell colours and cell borders (width, colour, dashed/dotted), also from table styles: styles defined in the file (PowerPoint, Google Slides) and the 74 built-in PowerPoint styles when a file only names one by id.
  - Not imported: rotated text, gradients, animations, embedded fonts (the installed or a fallback font is used), rare shape presets, charts and SmartArt (their fallback image is).
- **PDF**: each page becomes an image slide (not editable), its text goes into the speaker notes.
- **HTML**: Slidecko's own HTML exports (single file or ZIP) contain the project and open without loss. Other HTML files are not supported.
- **Images**: each image becomes a slide, sorted by file name.

Loose `.md` files each become a deck, sorted by name. Decks can be moved by dragging their name in the sidebar, renamed, removed and exported one by one.

## Export

From the Export menu or the export dialog (⌘E), for the whole project or one deck.

- **Slidev (`.zip`)**: a main `slides.md` with `src:` references, one `.md` per deck, images at their original paths. Unchanged slides stay byte for byte (blank lines included); edited ones are written as positioned HTML blocks. Themes that stand for a Slidev theme package (such as `themes/jbt.theme.json`) are added as a package dependency; all others ship as `style.css`. The export message names images that the Markdown references but that were not uploaded.
- **PDF**: through the print dialog, one page per slide, text stays selectable. Backgrounds with CSS blend modes that print engines cannot draw are replaced by an image first.
- **PowerPoint (`.pptx`)**: editable text in the font actually used, clickable links, native tables and shapes, images and speaker notes.
  - Line breaks come from the editor (soft breaks in the same paragraph). Nested lists become real outline levels, numbering keeps its start value, columns (flex/grid) become separate text boxes.
  - Backgrounds (gradients, overlays, frames) are rendered once per variant into a slide master.
  - The slide XML follows the OOXML schema (ISO/IEC 29500). A second `<a:pPr>` per paragraph that pptxgenjs writes, against the schema, is removed.
  - Opens in PowerPoint, Keynote, Google Slides and LibreOffice.
- **Google Slides (`.pptx`)**: the same file with line spacing as multiples. Google Slides enlarges fixed spacing by 1.2 and Keynote handles multiples differently, hence two variants.
- **PowerPoint exact (`.pptx`)**: each slide as a 1960 × 1104 px image, with notes. Looks exactly like the editor in every program.
- **OpenDocument (`.odp`)**: editable, for LibreOffice Impress, OpenOffice and Collabora. Comes from the same layout pass as the PPTX.
- **HTML presentation (`.html`)**: one file with all slides, images and fonts. Runs offline in any browser (arrow keys, swipe, F for full screen, `#12` jumps to slide 12, printable).
- **HTML presentation (ZIP)**: the same as `index.html` with images and fonts as separate files. Smaller, good for web servers and learning platforms.
- **Images (`.zip`)**: one PNG per slide.

## Editing

- **Text**: pasting from Word, Google Docs or web pages keeps bold/italic/underline, colours, links, paragraphs and lists. In imported text, pasted paragraphs and list items take the font, size, colour, spacing, bullets and indents of the target.
- **Elements**: headings, lists, quotes, callouts, code, images, tables, shapes and YouTube.
- **Code**: syntax highlighting, optional line numbers and Slidev's highlighted lines (`{2,4-5}`, the other lines dimmed, also in the PPTX export). Background colour, opacity and corner radius are adjustable. On a dark background, text and syntax colours switch to a dark scheme, also in the Slidev, PPTX and ODP exports.
- **Tables**: 8 presets, add rows and columns with the plus/minus buttons on the table, drag column widths, paste from Excel, Numbers, Google Sheets, Word or Google Docs (with formatting, links, line breaks and cell colours).
  - Select several cells (⇧-click, drag, ⇧+arrows) and fill them together. Typing replaces all; pasting fills all with one value or repeats a matching block like in Excel.
  - Colour, border, align, clear, copy, sort, or delete the selected cells' rows and columns.
  - Cell colours for a cell, row or column. Cell borders for a cell, row, column or the table (all, outside, inside or single sides, with width, style and colour); the buttons show existing lines and a second click removes them. Kept in all exports.
- **Text styles** with a live preview in the theme, and your own style presets. Text boxes and code blocks grow with their content.
- **Font for all slides**: with nothing selected, the inspector sets the sizes for text, titles and code across the project, in every theme and in the Slidev export (`style.css`).
- **Layout tools**: snapping guides (Alt turns snapping off), format painter (⌘⌥C / ⌘⌥V: only what both elements have), multi-selection (common font, size, alignment, colours; "Mixed" shows differing values), outlines and shadows (in all exports), position lock (kept in the Slidev project), background opacity, align and distribute, horizontal and vertical text alignment, copy and paste, undo and redo.
- **Slide presets** and **13 built-in themes**.
- **Keep font sizes when switching themes** (on by default): the new theme takes colours and fonts but keeps the previous sizes, so boxes and line breaks stay. Switching back undoes it. A theme switch never changes stored box sizes.
- **Reset to the imported state**: an imported slide (or all changed ones) is re-rendered from its original Markdown and is then exported unchanged again.
- **Markdown**: "Insert slides from Markdown" (⇧M) takes Slidev Markdown, for example generated by an AI. "Edit this slide's Markdown" (M) edits one slide as text, with syntax highlighting.
- **Sidebars** can be folded away with the arrows at the canvas edges, from the View menu or with ⌥B (slide list) and ⌥E (properties).
- **Shortcuts**: ⌘K or `?` lists every command with its shortcut.

## Theme editor

Colours, fonts and your own CSS (`&` is the slide) with a live preview. Built-in themes stay unchanged; changes to them are saved as a new theme. Your themes live in the browser, travel inside the project file and can be exported and imported as `.theme.json` (Theme menu → Import …). Importing a theme again replaces the stored copy; projects keep their theme. The CSS field is a code editor (CodeMirror) with line numbers and highlighting.

## Presenting

Full screen (P or F5) and a presenter view with notes, the next slide and a timer (⌥P). Links are clickable and videos play.

## Phone and tablet

- Under 760 px wide the app becomes one column: the slide stays on top, the slide strip (horizontal) and the properties follow, the toolbar wraps into two rows.
- On touch screens buttons and handles are larger (handles keep their screen size at any zoom). A second tap on the selected element starts typing, a long press opens the context menu (also on iPhone and iPad, where Safari has none).
- When presenting, a tap on the left edge goes back one slide and the controls stay visible.
- Form fields are 16 px on touch screens so iOS does not zoom in.
- The app asks the browser to keep its storage. Safari otherwise deletes site data after 7 days without a visit; add Slidecko to the home screen or save projects as files to be safe.
- Pending changes are saved the moment the page is hidden or closed, because iOS freezes hidden tabs and has no leave warning.

## Accessibility

Text and buttons reach 4.5:1 contrast (also in dark mode), every control has an accessible name, the command palette is a combobox with a list, and `prefers-reduced-motion` turns animations off. Checked with Lighthouse and axe on the start page and the editor, desktop and mobile.

## Light and dark

The interface follows the system or is fixed to light or dark (sun/moon switch in the footer). `src/scheme.js` sets `<html data-scheme="light|dark">`, which `app.css` reads; the choice is stored under `slides-builder:scheme`, so pages on the same site can share it. Slides keep their theme colours in either mode.

## Languages

German and English. Without a stored choice the browser language decides (German, otherwise English). A link with `?lang=de` or `?lang=en` picks the language and stores it like the switch does (under `slides-builder:lang`, so pages on the same site can share it). Switching in the footer works at once, without reloading.

## View in the URL

The project overview (`#home`) or the open project and slide (`#<project>/<slide>`) are in the address hash. Every change is a browser history entry, so back and forward move between overview, projects and slides, and reloads and links open exactly that view. The app's address without a hash opens the last project. What the URL does not hold (selection, folded decks, scroll position, search term) is kept per tab in `sessionStorage` and restored after a reload.
