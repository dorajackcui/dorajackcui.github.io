# YIZHI. — Personal portfolio

A bilingual landing page for momoCAT, QAtools and Tool Hub, with a Markdown article section. Neutral colors, locally hosted Inter, orange brand punctuation and coordinated color illustrations. Static HTML, CSS and JavaScript; a small Node script generates articles ahead of time, with no browser-side Markdown parser or runtime CDN dependency.

## Preview and checks

With Node.js 22 or later:

```sh
npm run dev
npm run check
```

Open http://localhost:4173/ for the homepage and http://localhost:4173/reference.html for the visual reference. The preview server binds to the local machine only; set `PORT` to use another port.

`npm run dev` and `npm run preview` regenerate articles before starting the server. Rerun `npm run build` after editing Markdown while the server is running, then refresh the page.

Checks cover local assets, anchor destinations, all three project links, external-link isolation, design tokens, JavaScript syntax, article routes and whether generated articles match their Markdown sources. Browser testing is separate from these automated checks.

## Writing articles

Add a UTF-8 Markdown file to `content/articles/`, using a lowercase, hyphenated filename. The filename becomes the URL: `localization-consistency.md` → `/articles/localization-consistency/`.

Start with flat front matter (one string per line, unquoted or JSON double-quoted; not full YAML):

```md
---
title: 文章标题
date: 2026-09-15
description: 用一句话说明这篇文章的内容。
lang: zh-CN
category: 本地化
cover: assets/previews/example.png
coveralt: 一句描述文章配图内容的替代文字。
---

正文使用 **Markdown**。

## 小标题

![图片说明](../../assets/articles/example.svg "可选的图注")
```

`title`, `date` and `description` are required. Use `##` for sections; the page title comes from front matter. Headings, links, lists, blockquotes, code blocks, images and GFM tables are supported by the vendored [Marked](https://marked.js.org/) parser. Markdown is trusted, repository-authored content and may include HTML; do not use this build script for untrusted submissions.

`cover` and `coveralt` are optional together. Use a local path from the site root and a 3:2 image, ideally 1536 × 1024. Articles with a cover use the same text-left, image-right arrangement as the project section, stacking on small screens. Cover artwork appears on the homepage; diagrams embedded in Markdown remain in the article body. The first cover's generation prompt is in `assets/articles/IMAGE-PROMPTS.md`.

```sh
npm run build
npm run check
```

The build generates each article's `index.html` and updates the homepage article list in descending date order. Commit the Markdown, supporting images and generated HTML together so the existing GitHub Pages configuration can serve them directly. When deleting or renaming an article, also remove its old generated directory under `articles/`.

Article layout lives in `scripts/templates/article.html` and `css/article.css`; the shared font, header and footer styles come from `css/home.css`. Wide SVG diagrams and tables scroll within their own containers on smaller screens. The first article is written in Chinese; its title and summary remain in Chinese when the homepage navigation is switched to English.

Keep article chrome and figure captions minimal: no duplicate description beneath the article title, no top “all articles” backlink, and no explanatory captions that repeat a title or diagram. Alt text stays accessible without becoming a visible caption; only an explicit Markdown image title adds a caption. The first article uses fantasy RPG examples from Chinese to English.

## Source

- `index.html`, `css/home.css`, `main.js`: homepage content, styles and persistent Chinese/English preference.
- `content/articles/*.md`: article sources and front matter; `articles/*/index.html`: generated reading pages.
- `assets/articles/localization-consistency.svg`: an editable, standalone annotated bilingual table for the first article.
- `scripts/build-articles.mjs`, `scripts/templates/article.html`, `css/article.css`: Markdown build and article layout.
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
