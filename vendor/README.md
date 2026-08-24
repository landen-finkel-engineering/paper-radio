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
