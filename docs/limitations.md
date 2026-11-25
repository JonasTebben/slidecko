# Known limitations

Where the formats or the browser set limits. What each format gets is described per feature in [features.md](features.md).

- Click steps show as the fully revealed slide in PDF and images, unless "One page per click step" is ticked. PPTX/ODP animate whole elements only: list items shown one by one appear together, code highlight steps show the last step.
- Runnable code: TypeScript types are removed, not checked; no Monaco editor, a plain text field while presenting; the HTML presentation runs the code as on the slide, without editing.
- Vue components other than `<Youtube>` stay in the Markdown but are not rendered in the editor.
- Editable PPTX/ODP: line breaks match the editor, so they stay as soft breaks if the text is reworded later. Text shadows are missing. `system-ui` is written as Helvetica Neue (Mac) or Segoe UI (Windows). Use the "exact" export for identical looks.
- PPTX/ODP cannot embed fonts: included and uploaded fonts are written by name and must be installed where the file is opened.
- Formulas in editable PPTX/ODP: a formula, and a text box with `$…$` in it, become a picture (TeX source as alt text); KaTeX cannot be written as Office math. Slidev's `$$ {1|3}` line marks are dropped on import.
- Keynote has no open file format and opens the PPTX. Google Slides imports the PPTX; use the "Google Slides" variant. Code fonts are written as Courier New there.
