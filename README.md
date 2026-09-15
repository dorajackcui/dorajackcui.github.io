# YIZHI. — Personal portfolio

A bilingual landing page for momoCAT, QAtools and Tool Hub. Neutral colors, locally hosted Inter, orange brand punctuation and coordinated color illustrations. Static HTML, CSS and JavaScript; no frontend build or runtime CDN dependency.

## Preview and checks

With Node.js 22 or later:

```sh
npm run dev
npm run check
```

Open http://localhost:4173/ for the homepage and http://localhost:4173/reference.html for the visual reference. The preview server binds to the local machine only; set `PORT` to use another port.

Checks cover local assets, anchor destinations, all three project links, external-link isolation, design tokens and JavaScript syntax. Responsive layout, language switching and the reference interactions are also checked in the browser.

## Source

- `index.html`, `css/home.css`, `main.js`: homepage content, styles and persistent Chinese/English preference.
- `reference.html`, `css/reference.css`, `reference.js`: visual reference, section navigation and a copyable handoff prompt.
- `design-reference/REFERENCE.md`: general guidelines for websites and applications, with density adapted to each task.
- `design-reference/tokens.css` and `tokens.json`: optional semantic tokens and sample controls.
- `assets/fonts/`: self-hosted [Inter](https://rsms.me/inter/) and its SIL Open Font License.
- `assets/previews/*-artwork.jpg`: text-free concept illustrations generated with the built-in imagegen tool. Full prompts are in `design-reference/IMAGE-PROMPTS.md`.

`/notion/` redirects to the homepage. `/design-reference/` redirects to `/reference.html`. `/project.html` and the old `#work` anchor lead to the current projects section.

## Portable reference

The reference page links to `YIZHI-design-reference.zip`. The package contains offline HTML, CSS/JSON tokens, fonts, artwork, guidelines and illustration prompts. It preserves each target product's structure and workflow.

After changing the reference or its assets, rebuild the package with Python 3:

```sh
npm run reference:pack
npm run check
```

The packager collects canonical source files directly; separate copies of fonts and images are not maintained in the repository.

## Publishing

GitHub Pages serves the root of `master` at https://dorajackcui.github.io/. Push a checked commit to `master`, then verify that the Pages deployment completed. `.nojekyll` keeps the static files directly accessible.
