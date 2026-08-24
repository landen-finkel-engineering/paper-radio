# Vendored dependencies

## PDF.js — `pdf.min.js`, `pdf.worker.min.js`

[Mozilla PDF.js](https://github.com/mozilla/pdf.js) v3.11.174, from the
`pdfjs-dist` package's `legacy/build` directory (the legacy build is the UMD one,
which works without a bundler and in older browsers).

Licensed under Apache-2.0 — see `LICENSE-pdfjs.txt`.

These files are committed rather than fetched from a CDN so the app has no
third-party runtime dependency: it keeps working offline, and no request ever
leaves the page carrying information about what you are reading.

To update, replace both files with the matching pair from a newer `pdfjs-dist`
release. They must come from the same version.

## Tesseract — `tesseract/`

[Tesseract.js](https://github.com/naptha/tesseract.js) v5 plus the Tesseract WASM
core and the English model, used to read PDFs that are images of pages rather
than text.

- `tesseract.min.js`, `worker.min.js` — the library and its worker
- `tesseract-core-simd-lstm.wasm.js` — the engine (SIMD build)
- `tesseract-core-lstm.wasm.js` — fallback for browsers without SIMD
- `lang/eng.traineddata.gz` — the English model (`4.0.0_best_int`, ~3 MB)

Apache-2.0 — see `LICENSE-tesseract-core.txt` and `tesseract.min.js.LICENSE.txt`.

About 11 MB in total, and none of it is fetched until someone actually opens a
scanned PDF: `assets/app.js` injects `tesseract.min.js` on demand and points it
at this directory, so the app itself stays a fast load.
