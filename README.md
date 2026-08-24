# Paper Radio

Drop in a PDF and it reads the document out loud — your voice, your speed —
while you highlight the parts worth keeping and write your own notes beside
them.

**→ [Open it](https://landen-finkel-engineering.github.io/paper-radio/)**

Everything runs in the browser. The PDF is never uploaded, no account is
involved, there is no server, and after the first load the app works with no
network at all.

It reads the document to you and helps you keep track of what you thought about
it. It deliberately does **not** summarize, condense, or tell you which parts
matter — that is the reader's job, and this is a listening and note-taking tool,
not a substitute for having read the thing.

---

## What it does

**Reads it aloud.** Every text-to-speech voice your operating system has
installed, grouped by language, at 0.5×–3× with separate pitch, volume, and an
optional pause between sentences. The sentence being spoken lights up and the
page follows it; click any sentence to start reading from there, or skip by
sentence or page.

**Finds things.** ⌘F opens a find bar: every match is highlighted and counted,
arrow keys walk through them, and you can start reading aloud from any hit.

**Points at what matters, without telling you what it says.** The Notable panel
maps where the document puts its weight — which sections carry the figures, the
findings, the conclusions, the recommendations — as page numbers, headings and
reason tags. It deliberately quotes nothing. It tells you where to read; it
cannot read it for you.

**Reads scans.** A PDF that is images of pages has no text to speak. Open one
and the app offers to run character recognition on it, in the browser, with
nothing uploaded — then reads the result like any other document, with a
standing caveat that OCR makes mistakes.

**Keeps what you marked.** Select any text to highlight it in one of four
colours, or press <kbd>M</kbd> while it's reading to keep the sentence you just
heard without reaching for the mouse. Attach a note to any highlight. The Notes
panel lists everything with page numbers, jumps back to any of them, filters by
colour, and copies or downloads the lot as Markdown you can paste into whatever
you actually write in.

**Remembers where you were.** Reopen a document you've listened to before and it
picks up at the sentence you stopped on, with your highlights and notes intact.

### Keyboard

| | |
|---|---|
| <kbd>space</kbd> | play / pause |
| <kbd>←</kbd> <kbd>→</kbd> | previous / next sentence |
| <kbd>[</kbd> <kbd>]</kbd> | previous / next page |
| <kbd>↑</kbd> <kbd>↓</kbd> | speed |
| <kbd>M</kbd> | note the current sentence |
| <kbd>N</kbd> | open the notes panel |
| <kbd>W</kbd> | open the notable-sections panel |
| <kbd>⌘F</kbd> / <kbd>Ctrl F</kbd> | find in the document |

---

## How it works

### Getting readable text out of a PDF

A PDF has no paragraphs — it has glyphs at coordinates. Turning that back into
something worth listening to is most of the work:

- **Lines** are rebuilt by grouping text items by their y coordinate, then joined
  left to right with a space inserted wherever the horizontal gap exceeds a
  fraction of the font size.
- **Columns** are detected once per document from an x-coverage histogram: a real
  gutter is a vertical band that text never crosses. Two-column pages are read
  down one column and then the other, and a row that *does* cross the gutter (a
  spanning title or figure) is emitted in place rather than torn in half.
- **Running heads and folios** are found by normalising every line in the top and
  bottom bands of each page and dropping the ones that repeat across at least
  45% of pages — so the voice never says "Page 14 of 92" ninety-two times.
- **Paragraphs** are reassembled from vertical gaps, font-size changes, short
  final lines, and indents, with words hyphenated across a line break rejoined.
- **Sentences** are split with an abbreviation table, initials, and decimals
  guarded, then any sentence too long for a comfortable utterance is broken at
  clause boundaries.
- **Headings** are found three ways — larger type, a different embedded font from
  the body face, or a short line set off by extra space — because no single
  signal survives every PDF.
- **Table rows** are detected by gaps far wider than the line's own word spacing,
  appearing at least twice, and get commas inserted so the voice pauses between
  cells instead of running the columns together. Justified text, whose stretched
  spaces look similar, is deliberately excluded.
- **Footnote and citation markers** — the raised little numbers — are dropped,
  because "the yield rose twelve fourteen percent" is not what the page says.

### What the voice says vs what the page shows

They are not the same string. URLs become "link", email addresses become "email
address", `[12]` disappears, `°C` becomes "degrees Celsius", `§` becomes
"section", bullets are not pronounced. Every spoken character carries an index
back to the character it came from, so the word highlight still lands on the
right word on the page while the voice says something more sayable.

### Reading scans

If a page has no text layer, [Tesseract](https://github.com/naptha/tesseract.js)
runs in a worker over pages rendered to canvas at ~200 dpi. Recognised lines come
back with bounding boxes, which get fed through the same column, running-head and
paragraph logic as a normal PDF — so a scan ends up structured, not as one wall
of text. The engine is vendored and lazy-loaded: nothing is fetched until you
open a scan, and nothing is uploaded ever. You can stop partway and read the
pages that finished.

### Notable sections

Sections are scored on numeric density, claim and conclusion language, result
language, recommendation language and definitions, then normalised against the
strongest section in the document. What surfaces is a page number, a heading and
up to three reason tags — never a sentence. If nothing scores meaningfully above
the median, it says so rather than ranking noise.

### Highlights

A highlight is stored as a pair of (sentence index, character offset) positions
rather than a DOM range, so it survives re-rendering, reloading, and the
word-by-word repainting that happens while a sentence is being spoken. Each
sentence is rendered from its plain text plus whatever highlight segments and
current-word range apply to it, which is what lets the speech highlight travel
through a highlighted passage without destroying it.

Everything lives in `localStorage`, keyed by a fingerprint of the file.

### Speech

Utterances are queued one sentence at a time — which is also the fix for the
long-standing Chrome bug where speech stops partway through a long utterance.
A watchdog notices when the engine has gone quiet without firing `end` and
nudges or advances it, and word-boundary events drive both the word highlight and
the level meter in the player.

---

## Running it yourself

No build step, no dependencies to install. It is static files:

```bash
git clone https://github.com/landen-finkel-engineering/paper-radio.git
cd paper-radio
python3 -m http.server 8000     # or: npx serve .
```

Then open <http://localhost:8000>. A server is needed rather than opening
`index.html` directly, because service workers and module loading want a real
origin.

### Building the single-file version

```bash
node tools/build-single-file.mjs
```

Writes `dist/paper-radio.html` — one file, ~1.5 MB, with the stylesheet, the app,
and both PDF.js files inlined. Open it from a USB stick on a machine with no
internet and it still works. `--fragment` emits the same thing without the
document wrapper, for hosts that supply their own.

The one difference between the two: served as separate files, PDF.js parses in a
real background worker. In the single file the worker script is inlined into the
page, which makes PDF.js register a main-thread handler and skip creating a
Worker — the only way to run it where `blob:` workers are blocked.

## Layout

```
index.html                    the page
assets/styles.css             one stylesheet, themed with custom properties
assets/app.js                 everything: extraction, speech, highlights, notes
vendor/                       PDF.js and Tesseract, committed rather than from a CDN
tools/build-single-file.mjs   the bundler
sw.js                         offline cache — bump CACHE when the shell changes
```

`assets/app.js` is written in plain ES5-compatible JavaScript with no framework
and no transpiler, in numbered sections that follow the pipeline: normalisation,
PDF → lines, running heads, lines → blocks, sentences, state, voices, player,
rendering, highlights.

## Privacy

The PDF is read with `FileReader` and parsed in the page. Nothing is uploaded.
Highlights, notes, reading positions, and preferences live in your browser's
`localStorage` and never leave the device. The only network request the app makes is for the web fonts — and, the first
time you OCR something, the recognition engine from this same site. Once the
service worker has installed, not even that.

## License

MIT — see [LICENSE](LICENSE). Bundles [PDF.js](https://github.com/mozilla/pdf.js)
(Apache-2.0, `vendor/LICENSE-pdfjs.txt`) and
[Tesseract.js](https://github.com/naptha/tesseract.js) with the Tesseract engine
(Apache-2.0, `vendor/tesseract/`).
