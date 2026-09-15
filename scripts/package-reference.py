"""Build an offline reference bundle from the website's canonical files."""
from pathlib import Path
import re
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
PREFIX = "YIZHI-reference/"
html = (ROOT / "reference.html").read_text()
html = re.sub(r'<a\b[^>]*data-online-only[^>]*>.*?</a>', "", html)
html = html.replace('href="./"', 'href="https://dorajackcui.github.io/"')
html = html.replace('href="design-reference/', 'href="')
html = html.replace('href="css/reference.css"', 'href="reference.css"')
html = html.replace('href="assets/favicon.svg"', 'href="favicon.svg"')
html = html.replace('src="assets/previews/', 'src="artwork/')
html = html.replace('href="assets/previews/', 'href="artwork/')
tokens = (ROOT / "design-reference/tokens.css").read_text()
tokens = tokens.replace('../assets/fonts/', 'fonts/')

with ZipFile(ROOT / "YIZHI-design-reference.zip", "w", ZIP_DEFLATED) as archive:
    archive.writestr(PREFIX + "index.html", html)
    archive.writestr(PREFIX + "tokens.css", tokens)
    files = {
        "css/reference.css": "reference.css",
        "reference.js": "reference.js",
        "assets/favicon.svg": "favicon.svg",
        "design-reference/REFERENCE.md": "REFERENCE.md",
        "design-reference/IMAGE-PROMPTS.md": "IMAGE-PROMPTS.md",
        "design-reference/tokens.json": "tokens.json",
        "assets/fonts/InterVariable.woff2": "fonts/InterVariable.woff2",
        "assets/fonts/Inter-OFL.txt": "fonts/Inter-OFL.txt",
    }
    for name in ("momocat", "qatools", "toolhub"):
        files[f"assets/previews/{name}-artwork.jpg"] = f"artwork/{name}-artwork.jpg"
    for source, destination in files.items():
        archive.write(ROOT / source, PREFIX + destination)

print("Built YIZHI-design-reference.zip with offline HTML, tokens, fonts and artwork.")
