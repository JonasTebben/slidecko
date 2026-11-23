// Markdown tutorial: lessons and their checks. Pure apart from the open state; the texts are English t() keys.
import { reactive } from 'vue'
import { parseSlidev } from './parseSlidev.js'
import { LAYOUTS } from './themes.js'

// API for other parts of the app (e.g. the tour): openTutorial({ fromTour, onClose }) opens it (fromTour skips the intro);
// onClose({ finished, created }) runs once when it closes: finished = the last lesson was solved, created = a project was made from it
export const tutorial = reactive({ open: false, fromTour: false, onClose: null })
export const openTutorial = ({ fromTour = false, onClose = null } = {}) => Object.assign(tutorial, { open: true, fromTour, onClose })
export function closeTutorial(result = { finished: false, created: false }) {
  const cb = tutorial.onClose
  Object.assign(tutorial, { open: false, fromTour: false, onClose: null })
  cb?.(result)
}

const lines = (md, rx) => md.split('\n').filter(l => rx.test(l)).length
const slides = md => parseSlidev(md)

// check(md) -> true when the task is done; start fails it, solution passes it (tutorial.test.js)
export const LESSONS = [
  {
    title: 'Headings', text: 'A # at the start of a line makes a heading. ## is a smaller one.',
    task: 'Turn the first line into a heading: put # and a space in front of it.',
    hint: 'The line should read “# My first slide”.',
    start: 'My first slide\n\nMarkdown is just text with a few signs.\n',
    solution: '# My first slide\n\nMarkdown is just text with a few signs.\n',
    check: md => /^#{1,2} +\S/m.test(md),
  },
  {
    title: 'Bullet list', text: 'Lines starting with - (dash and space) become a bullet list.',
    task: 'Make a bullet list of the three fruits.',
    hint: 'Put “- ” in front of each fruit, one per line.',
    start: '# Shopping\n\nApples\nPears\nCherries\n',
    solution: '# Shopping\n\n- Apples\n- Pears\n- Cherries\n',
    check: md => lines(md, /^\s*[-*+] +\S/) >= 3,
  },
  {
    title: 'Bold and italic', text: 'Two stars around a word make it **bold**, one star *italic*.',
    task: 'Make “important” bold and “really” italic.',
    hint: 'Write **important** and *really*.',
    start: '# Emphasis\n\nThis is important and really easy.\n',
    solution: '# Emphasis\n\nThis is **important** and *really* easy.\n',
    check: md => /\*\*[^*\n]+\*\*|__[^_\n]+__/.test(md) && /(^|[^*])\*[^*\s][^*\n]*\*(?!\*)|(^|[^_])_[^_\s][^_\n]*_(?!_)/m.test(md),
  },
  {
    title: 'Numbered list', text: 'Lines starting with 1. 2. 3. become a numbered list.',
    task: 'Number the three steps.',
    hint: 'Start the lines with “1. ”, “2. ” and “3. ”.',
    start: '# Make tea\n\nBoil water\nAdd the tea\nWait three minutes\n',
    solution: '# Make tea\n\n1. Boil water\n2. Add the tea\n3. Wait three minutes\n',
    check: md => lines(md, /^\s*\d+[.)] +\S/) >= 3,
  },
  {
    title: 'New slide', text: 'A line with only --- starts the next slide. One file, a whole talk.',
    task: 'Split this into two slides.',
    hint: 'Put a line with just --- between the two parts, with an empty line before and after it.',
    start: '# Part one\n\nThe first idea\n\n# Part two\n\nThe second idea\n',
    solution: '# Part one\n\nThe first idea\n\n---\n\n# Part two\n\nThe second idea\n',
    check: md => slides(md).length >= 2,
  },
  {
    title: 'Layout', text: 'Settings for a slide go between two --- lines at its top (frontmatter). layout: cover makes a title slide.',
    task: 'Turn this slide into a title slide with layout: cover.',
    hint: 'The first three lines are “---”, “layout: cover” and “---”.',
    start: '# My talk\n\nWhy Markdown is fast\n',
    solution: '---\nlayout: cover\n---\n\n# My talk\n\nWhy Markdown is fast\n',
    check: md => slides(md).some(s => s.layout !== 'default' && LAYOUTS.some(([id]) => id === s.layout)),
  },
  {
    title: 'Code', text: 'Three backticks and a language name make a highlighted code block.',
    task: 'Put the code into a code block for js.',
    hint: 'Write ```js on the line before the code and ``` on the line after it.',
    start: '# Code\n\nconst answer = 42\nconsole.log(answer)\n',
    solution: '# Code\n\n```js\nconst answer = 42\nconsole.log(answer)\n```\n',
    check: md => slides(md).some(s => s.blocks.some(b => b.type === 'code' && b.lang)),
  },
  {
    title: 'Links', text: '[text](address) makes a link. ![description](picture.png) works the same way for images.',
    task: 'Make “Slidev” a link to https://sli.dev.',
    hint: 'Write [Slidev](https://sli.dev).',
    start: '# Learn more\n\nRead the docs of Slidev.\n',
    solution: '# Learn more\n\nRead the docs of [Slidev](https://sli.dev).\n',
    check: md => /\[[^\]\n]+\]\(\S+\)/.test(md),
  },
  {
    title: 'Table', text: 'Columns are separated by |, and a line of dashes under the first row makes it the header.',
    task: 'Add the separator line under the header row to make this a table.',
    hint: 'The second line should read | --- | --- |.',
    start: '# Prices\n\n| Item | Price |\n| Coffee | 2 € |\n| Tea | 1 € |\n',
    solution: '# Prices\n\n| Item | Price |\n| --- | --- |\n| Coffee | 2 € |\n| Tea | 1 € |\n',
    check: md => /^.*\|.*\n\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/m.test(md),
  },
  {
    title: 'Speaker notes', text: 'A comment <!-- … --> at the end of a slide is not shown: it becomes your speaker notes.',
    task: 'Add a note for yourself at the end of the slide.',
    hint: 'Write <!-- Smile and breathe --> as the last line.',
    start: '# Thank you\n\nQuestions?\n',
    solution: '# Thank you\n\nQuestions?\n\n<!-- Smile and breathe -->\n',
    check: md => slides(md).some(s => s.notes),
  },
  {
    title: 'Challenge: a talk in 60 seconds', challenge: true,
    text: 'Now all together. The stopwatch starts with your first key press.',
    task: 'Write a talk with at least 3 slides, each with a heading – one of them with a list.',
    hint: 'Heading, a list, ---, the next heading … Use what you just learned.',
    start: '',
    solution: '---\nlayout: cover\n---\n\n# My talk\n\n---\n\n# Three reasons\n\n- Fast\n- Simple\n- Portable\n\n---\n\n# Thank you\n',
    check: md => { const s = slides(md); return s.length >= 3 && s.every(x => /^#{1,3} +\S/m.test(x.md)) && lines(md, /^\s*([-*+]|\d+[.)]) +\S/) >= 2 },
  },
]

// what was typed against what came out, for the closing screen
export const typed = md => ({ chars: md.replace(/\s/g, '').length, lines: md.split('\n').filter(l => l.trim()).length })
