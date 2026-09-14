# Zhiyang Cui · Personal portfolio

A bilingual portfolio for localization tools, with a Three.js point-cloud globe and scroll-linked project chapters. Pure static HTML, CSS, and JavaScript; no build step or package installation is required.

## Preview

With Node.js 22 or later:

```sh
npm run dev
```

Open http://localhost:4173. `PORT=...` can change the preview port. The preview server binds to the local machine only.

```sh
npm run check
```

This checks local assets, anchor links, project destinations, globe geometry, and JavaScript syntax. Responsive layout, language switching, project navigation, and animation controls are checked in the browser.

## GitHub Pages

Serve the repository root on `master` using GitHub Pages (Settings → Pages → Deploy from a branch). The `.nojekyll` file allows the static assets to be served directly. There is no frontend build and no required CDN request at runtime. The previous homepage, PMS subdirectories, and OTA mail-sync workflow have been removed. The previous /project.html URL redirects to the portfolio project section.

## Editing

- `index.html`: name, project links, descriptions, preview markup, and about text. `data-zh` / `data-en` hold the Chinese / English copy; both languages are intentionally written by hand.
- `css/home.css`: layout, colors, fonts, and responsive breakpoints.
- `main.js`: language preference, natural scroll progress, navigation, pause control, and reduced-motion behavior.
- `globe.js`: globe points, graticules, routes, and rendering. The globe is decorative and does not represent project locations.
- `assets/previews/`: screenshots of the two project sites, captured on 2026-09-14. Tool Hub uses an explicitly labelled capability illustration because its live page could not be loaded reliably in the preview browser. Its description is based on the site's own metadata.
- `assets/vendor/`: pinned Three.js r170 and its MIT license.
- `assets/fonts/`: locally bundled Space Grotesk and its SIL Open Font License.

To refresh the pinned graphics dependencies and regenerate the land points:

```sh
npm run assets:fetch
npm run assets:globe
```

The map comes from world-atlas 2.0.2 / Natural Earth (public-domain geographical data). Source: https://github.com/topojson/world-atlas. The compact point geometry is generated ahead of time, so no polygon processing is needed in the browser.

On mobile, the globe stays in the introduction and projects form a normal vertical list. On desktop, scrolling rotates and moves the globe beside the projects. The pause button freezes globe animation, and the OS reduced-motion preference starts it paused. Rendering stops when the globe is out of view or the browser tab is hidden. A CSS globe remains if WebGL cannot initialize; all project links and text still work.
