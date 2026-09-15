# Vendored build dependency

`marked.esm.js` is the unmodified ESM distribution of [Marked](https://github.com/markedjs/marked/tree/v17.0.5), version **17.0.5**, from the installed `marked` package. Its MIT license is in `marked-LICENSE.md`.

Used only by the article build script. Browsers receive complete static HTML and do not load this parser. Vendoring keeps the existing project runnable with Node alone, without an install step or runtime CDN. To upgrade, replace the distribution and license together and run the article build and site checks.
