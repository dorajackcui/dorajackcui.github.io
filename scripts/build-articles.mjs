import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from './vendor/marked.esm.js';

const root = resolve(import.meta.dirname, '..');
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

// Front matter deliberately supports flat string fields, not arbitrary YAML.
export function readArticle(source, filename) {
  const match = source.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${filename}: expected front matter followed by Markdown`);
  const metadata = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue;
    const field = line.match(/^([a-z]+):\s*(.+)$/);
    if (!field || Object.hasOwn(metadata, field[1])) throw new Error(`${filename}: invalid or duplicate metadata: ${line}`);
    metadata[field[1]] = field[2].startsWith('"') ? JSON.parse(field[2]) : field[2].trim();
  }
  for (const key of ['title', 'date', 'description']) {
    if (typeof metadata[key] !== 'string' || !metadata[key].trim()) throw new Error(`${filename}: missing ${key}`);
  }
  if (metadata.cover && (!/^assets\/[a-zA-Z0-9/_-]+\.(?:png|jpe?g|webp)$/.test(metadata.cover) || typeof metadata.coveralt !== 'string' || !metadata.coveralt.trim())) throw new Error(`${filename}: cover needs a local assets/ image and coveralt text`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.date) || Number.isNaN(Date.parse(metadata.date)) || new Date(metadata.date).toISOString().slice(0, 10) !== metadata.date) throw new Error(`${filename}: invalid date`);
  const slug = filename.replace(/\.md$/, '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`${filename}: use a lowercase, hyphenated filename`);
  return { ...metadata, lang: metadata.lang || 'zh-CN', category: metadata.category || '文章', slug, body: match[2] };
}

export function renderMarkdown(body, previews = {}) {
  const headings = new Set(['top', 'article-title', 'article-content']);
  let previewCount = 0;
  const marked = new Marked({ gfm: true, renderer: {
    link({ href, tokens }) {
      if (!href.startsWith('preview:')) return false;
      const key = href.slice('preview:'.length);
      const preview = previews[key];
      if (!/^[a-z0-9-]+$/.test(key) || !preview) throw new Error(`Unknown image preview: ${key}`);
      if (!/^\.\.\/\.\.\/assets\/[a-zA-Z0-9/_-]+\.(?:png|jpe?g|webp)$/.test(preview.image) || !Number.isInteger(preview.width) || !Number.isInteger(preview.height) || preview.width <= 0 || preview.height <= 0) throw new Error(`Invalid image preview: ${key}`);
      for (const field of ['name', 'caption', 'alt', 'source', 'sourceLabel']) {
        if (typeof preview[field] !== 'string' || !preview[field]) throw new Error(`Image preview ${key} needs ${field}`);
      }
      const id = `preview-${key}-${++previewCount}`;
      const credit = preview.credit ? `<span class="preview-credit">${escape(preview.credit)} · <a href="${escape(preview.licenseUrl)}" target="_blank" rel="noopener noreferrer">${escape(preview.license)}</a></span>` : '';
      return `<span class="pokemon-peek" data-preview="${key}"><button class="pokemon-trigger" type="button" aria-label="查看 ${escape(preview.name)} 的图片" aria-expanded="false" aria-controls="${id}">${this.parser.parseInline(tokens)}<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><rect x="1.5" y="2" width="13" height="12" rx="2"/><circle cx="5" cy="6" r="1"/><path d="M2 12L6.5 8.5L9 10.5L11 8.5L14 11"/></svg></button><span class="pokemon-card" id="${id}" role="region" aria-label="${escape(preview.name)}" hidden><img src="${escape(preview.image)}" width="${preview.width}" height="${preview.height}" alt="${escape(preview.alt)}" decoding="async"><span class="pokemon-card-footer"><strong>${escape(preview.caption)}</strong><a href="${escape(preview.source)}" target="_blank" rel="noopener noreferrer">${escape(preview.sourceLabel)}</a></span>${credit}</span></span>`;
    },
    heading({ tokens, depth, text }) {
      if (depth === 1) throw new Error('Use the front matter title for H1 and ## for article sections');
      const base = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'section';
      let id = base;
      let suffix = 2;
      while (headings.has(id)) id = `${base}-${suffix++}`;
      headings.add(id);
      return `<h${depth} id="${escape(id)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
    paragraph({ tokens }) {
      const previewChain = tokens.some(token => token.type === 'link' && token.href.startsWith('preview:')) && tokens.every(token => ['link', 'strong'].includes(token.type) || token.type === 'text' && /^[\s→＋＝+]+$/.test(token.text));
      if (previewChain) return `<p class="name-chain">${this.parser.parseInline(tokens)}</p>\n`;
      if (tokens.length !== 1 || tokens[0].type !== 'image') return false;
      const token = tokens[0];
      const diagram = /\.svg(?:[?#].*)?$/i.test(token.href);
      const picture = this.parser.parseInline(tokens);
      return `<figure${diagram ? ' class="wide-figure"' : ''}>${diagram ? `<div class="figure-scroll" tabindex="0" role="region" aria-label="文章配图，可横向滚动">${picture}</div>` : picture}<figcaption>${token.title ? `<span>${escape(token.title)}</span>` : ''}<a href="${escape(token.href)}">查看完整图 ↗</a></figcaption></figure>\n`;
    },
    table(token) {
      if (token.header.map(cell => cell.text).join('|') === '宝可梦|日本語|Français') {
        const names = token.rows.map(row => {
          const [chinese, japanese, french] = row.map(cell => this.parser.parseInline(cell.tokens));
          return `<div class="name-species" role="listitem"><div class="name-chinese" lang="zh-CN">${chinese}</div><div class="name-japanese"><span class="name-language" aria-label="日语">JA</span><span lang="ja">${japanese}</span></div><div class="name-french"><span class="name-language" aria-label="法语">FR</span><span lang="fr">${french}</span></div></div>`;
        }).join('\n');
        return `<div class="pokemon-names${token.rows.length === 1 ? ' is-single' : ''}" role="list" aria-label="宝可梦的中文、日文与法文名字">${names}</div>\n`;
      }
      const header = token.header.map(cell => this.tablecell(cell)).join('');
      const body = token.rows.map(row => `<tr>${row.map(cell => this.tablecell(cell)).join('')}</tr>`).join('\n');
      return `<div class="table-scroll" tabindex="0" role="region" aria-label="文章表格，可横向滚动"><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>\n`;
    }
  } });
  // Only repository-authored, reviewed Markdown is accepted; no user uploads.
  return marked.parse(body);
}

export async function buildArticles({ check = false } = {}) {
  const directory = resolve(root, 'content/articles');
  const files = (await readdir(directory)).filter(file => file.endsWith('.md')).sort();
  const articles = await Promise.all(files.map(async file => {
    const article = readArticle(await readFile(resolve(directory, file), 'utf8'), file);
    article.previews = {};
    try { article.previews = JSON.parse(await readFile(resolve(directory, `${article.slug}.previews.json`), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    return article;
  }));
  articles.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  const template = await readFile(resolve(root, 'scripts/templates/article.html'), 'utf8');
  const outputs = new Map();
  for (const article of articles) {
    const values = { TITLE: escape(article.title), DESCRIPTION: escape(article.description), LANG: escape(article.lang), CATEGORY: escape(article.category), DATE: article.date, DISPLAY_DATE: article.date.replaceAll('-', '.'), SLUG: article.slug, SOURCE: `content/articles/${article.slug}.md`, CONTENT: renderMarkdown(article.body, article.previews) };
    outputs.set(`articles/${article.slug}/index.html`, template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
      if (!(key in values)) throw new Error(`Unknown template field: ${key}`);
      return values[key];
    }));
  }
  const entries = articles.map(article => `      <article class="article-entry${article.cover ? ' has-cover' : ''}" lang="${escape(article.lang)}">
        <div class="article-copy">
          <time datetime="${article.date}">${article.date.replaceAll('-', '.')}</time>
          <h3><a href="articles/${article.slug}/">${escape(article.title)}</a></h3>
          <p>${escape(article.description)}</p>
        </div>${article.cover ? `
        <a class="project-preview article-preview" href="articles/${article.slug}/" aria-label="${escape(article.title)}">
          <img src="${escape(article.cover)}" width="1536" height="1024" alt="${escape(article.coveralt)}" loading="lazy" decoding="async">
        </a>` : ''}
      </article>`).join('\n');
  const home = (await readFile(resolve(root, 'index.html'), 'utf8')).replace(/\r\n/g, '\n');
  const region = /(<!-- articles:start -->\n)[\s\S]*?(      <!-- articles:end -->)/;
  if (!region.test(home)) throw new Error('Homepage article markers are missing');
  outputs.set('index.html', home.replace(region, (_, start, end) => `${start}${entries}\n${end}`));
  for (const [path, contents] of outputs) {
    const destination = resolve(root, path);
    let current;
    try { current = (await readFile(destination, 'utf8')).replace(/\r\n/g, '\n'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (contents === current) continue;
    if (check) throw new Error(`${path} is missing or stale. Run npm run build.`);
    await mkdir(resolve(destination, '..'), { recursive: true });
    await writeFile(destination, contents, 'utf8');
  }
  return articles.map(article => `articles/${article.slug}/index.html`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pages = await buildArticles({ check: process.argv.includes('--check') });
  console.log(`${process.argv.includes('--check') ? 'Verified' : 'Built'} ${pages.length} Markdown article(s) and the homepage article list.`);
}
