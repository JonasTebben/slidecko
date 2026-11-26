# Known limitations

Where the formats or the browser set limits. What each format gets is described per feature in [features.md](features.md).

- Click steps show as the fully revealed slide in PDF and images, unless "One page per click step" is ticked. PPTX/ODP animate whole elements only: list items shown one by one appear together, code highlight steps show the last step.
- Runnable code: TypeScript types are removed, not checked; no Monaco editor, a plain text field while presenting; the HTML presentation runs the code as on the slide, without editing.
- Slidev import: Vue components without an element in Slidecko stay in the Markdown (an unchanged slide is exported as it was) but are not shown in the editor: `<Tweet>`, `<SlidevVideo>` and `<video>`, `<iframe>` and the `iframe` layouts, your own components. `<v-switch>` shows all its steps one below the other, `<LightOrDark>` the light part, `<Transform>`, `<v-drag>` and `v-motion` the content unmoved, Shiki Magic Move its source. A `<<<` snippet shows the whole file (`#region` is ignored). MDC syntax (`[text]{style=…}`) stays as text.
- Editable PPTX/ODP: line breaks match the editor, so they stay as soft breaks if the text is reworded later. Text shadows are missing. `system-ui` is written as Helvetica Neue (Mac) or Segoe UI (Windows). Use the "exact" export for identical looks.
- PPTX/ODP cannot embed fonts: included and uploaded fonts are written by name and must be installed where the file is opened.
- Formulas in editable PPTX/ODP: a formula, and a text box with `$…$` in it, become a picture (TeX source as alt text); KaTeX cannot be written as Office math. Slidev's `$$ {1|3}` line marks are dropped on import.
- Keynote has no open file format and opens the PPTX. Google Slides imports the PPTX; use the "Google Slides" variant. Code fonts are written as Courier New there.
