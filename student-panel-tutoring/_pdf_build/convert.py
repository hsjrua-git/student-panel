#!/usr/bin/env python3
"""Convert the database-design lesson files to styled HTML (for Chrome -> PDF).

- .md files: full Markdown render (tables, fenced code), with ```mermaid blocks
  turned into <pre class="mermaid"> so mermaid.js can draw them.
- .txt files: faithful monospace render (preserves the hand-drawn ASCII tables,
  crow's-foot diagrams and === rules) wrapped in a clean page.
"""
import html
import re
import sys
import textwrap
from pathlib import Path

import markdown

SRC = Path("/data/projects/for AI/student-panel/student-panel-tutoring")
OUT = SRC / "_pdf_build"

MD_FILES = [
    ("database-design-revised-lesson.md", "Database Design — The Revised Lesson"),
    ("database-design-revised-samples.md", "Database Design — Samples (Revised)"),
]
TXT_FILES = [
    ("database-design-primer.txt", "Database Design — The Primer"),
    ("database-design-companion-lesson.txt", "Database Design — Companion Lesson"),
    ("database-design-practice-lesson.txt", "Database Design — Hands-On Practice Lesson"),
    ("database-design-AI-pieces-review.txt", "Review of the Other-AI Pieces"),
    ("database-design-quick-reference.txt", "Database Design — Quick Reference Card"),
]

MERMAID_RE = re.compile(r"^([ \t]*)```mermaid[ \t]*\n(.*?)^[ \t]*```[ \t]*$", re.DOTALL | re.MULTILINE)
PLACEHOLDER = "zzzmermaidblockzzz%d"

# Indented (list-nested) fenced code blocks: python-markdown's fenced_code does
# not recognise a ``` fence that sits at a list item's content column, so it
# leaks the language word and mangles the block. Pre-extract those (indent >= 1)
# ourselves and re-emit a proper <pre><code>; column-0 fences are left to markdown.
CODE_RE = re.compile(r"^([ \t]+)```(\w*)[ \t]*\n(.*?)^[ \t]*```[ \t]*$", re.DOTALL | re.MULTILINE)
CODEPH = "zzzcodeblockzzz%d"

CSS_MD = r"""
:root { --ink:#1c2230; --muted:#5b6475; --accent:#2f5bdb; --rule:#d9dee8;
        --code-bg:#f4f6fa; --quote-bg:#eef3fb; --quote-bar:#2f5bdb;
        --th-bg:#eef1f7; --zebra:#f7f9fc; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  font-family: Georgia, "DejaVu Serif", "Times New Roman", serif;
  color: var(--ink); font-size: 11pt; line-height: 1.55;
  margin: 0; padding: 0;
}
.doc { max-width: 100%; }
h1, h2, h3, h4 {
  font-family: "Helvetica Neue", Arial, "DejaVu Sans", sans-serif;
  color: #16203a; line-height: 1.25; font-weight: 700;
  margin: 1.4em 0 0.5em; page-break-after: avoid;
}
h1 { font-size: 22pt; margin-top: 0; padding-bottom: .25em;
     border-bottom: 3px solid var(--accent); }
h2 { font-size: 15.5pt; margin-top: 1.6em; padding-bottom: .18em;
     border-bottom: 1px solid var(--rule); }
h3 { font-size: 12.5pt; color: #26324e; }
h4 { font-size: 11pt; color: var(--muted); text-transform: uppercase;
     letter-spacing: .04em; }
p { margin: .55em 0; }
em { color: #2a3550; }
strong { color: #14213d; }
a { color: #28459c; text-decoration: none; }
ul, ol { margin: .5em 0 .7em; padding-left: 1.5em; }
li { margin: .22em 0; }
li > ul, li > ol { margin: .2em 0; }
hr { border: none; border-top: 1px solid var(--rule); margin: 1.8em 0; }
code {
  font-family: "DejaVu Sans Mono", "Courier New", monospace;
  font-size: 9pt; background: var(--code-bg); color: #233; padding: .08em .35em;
  border-radius: 3px; border: 1px solid #e5e9f2;
}
pre {
  background: var(--code-bg); border: 1px solid #e1e6f0; border-left: 4px solid var(--accent);
  border-radius: 6px; padding: .7em .9em; overflow: hidden;
  white-space: pre-wrap; word-break: break-word; page-break-inside: avoid; margin: .8em 0;
}
pre code { background: none; border: none; padding: 0; font-size: 8.7pt; line-height: 1.45; }
blockquote {
  background: var(--quote-bg); border-left: 4px solid var(--quote-bar);
  margin: 1em 0; padding: .6em 1em; border-radius: 0 6px 6px 0; color: #223;
}
blockquote p:first-child { margin-top: 0; }
blockquote p:last-child { margin-bottom: 0; }
table {
  border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 9.6pt;
  page-break-inside: avoid; font-family: "Helvetica Neue", Arial, "DejaVu Sans", sans-serif;
}
th, td { border: 1px solid var(--rule); padding: .4em .6em; text-align: left; vertical-align: top; }
th { background: var(--th-bg); color: #1a2744; font-weight: 700; }
tbody tr:nth-child(even) { background: var(--zebra); }
td code, th code { font-size: 8.6pt; }
.mermaid { text-align: center; margin: 1.1em 0; page-break-inside: avoid; }
.mermaid svg { max-width: 100%; height: auto; }
"""

CSS_TXT = r"""
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: #1b2230;
       font-family: "Helvetica Neue", Arial, "DejaVu Sans", sans-serif; }
.titlecard { border-bottom: 3px solid #2f5bdb; margin: 0 0 14pt;
             padding-bottom: 8pt; page-break-after: avoid; }
.titlecard .kicker { font-size: 8.5pt; letter-spacing: .12em; text-transform: uppercase;
             color: #2f5bdb; font-weight: 700; }
.titlecard h1 { font-size: 18pt; margin: 3pt 0 0; color: #16203a; line-height: 1.2; }
.titlecard .file { font-size: 8.5pt; color: #7a8398;
             font-family: "DejaVu Sans Mono", monospace; margin-top: 4pt; }
pre.ascii {
  font-family: "DejaVu Sans Mono", "Courier New", monospace;
  font-size: 9pt; line-height: 1.36; color: #1f2733;
  white-space: pre; margin: 0; tab-size: 4;
}
"""

TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>{title}</title>
<style>
@page {{ size: A4; margin: {margin}; }}
{css}
</style></head>
<body>{body}</body></html>"""


def md_to_html(text):
    blocks = []

    def grab(m):
        # m.group(1) = leading indent (keeps the placeholder inside a list item
        # when the fence was indented); m.group(2) = diagram body, dedented so
        # Mermaid sees it at column 0 regardless of how it was indented.
        indent = m.group(1)
        blocks.append(textwrap.dedent(m.group(2)).rstrip("\n"))
        return indent + (PLACEHOLDER % (len(blocks) - 1))

    text = MERMAID_RE.sub(grab, text)

    code_blocks = []

    def grab_code(m):
        indent, lang = m.group(1), m.group(2)
        code_blocks.append((lang, textwrap.dedent(m.group(3)).rstrip("\n")))
        return indent + (CODEPH % (len(code_blocks) - 1))

    text = CODE_RE.sub(grab_code, text)
    md = markdown.Markdown(extensions=["extra", "sane_lists", "admonition"])
    body = md.convert(text)
    for i, raw in enumerate(blocks):
        pre = '<pre class="mermaid">%s</pre>' % html.escape(raw)
        body = body.replace("<p>%s</p>" % (PLACEHOLDER % i), pre)
        body = body.replace(PLACEHOLDER % i, pre)
    for i, (lang, raw) in enumerate(code_blocks):
        cls = ' class="language-%s"' % lang if lang else ""
        pre = "<pre><code%s>%s</code></pre>" % (cls, html.escape(raw))
        body = body.replace("<p>%s</p>" % (CODEPH % i), pre)
        body = body.replace(CODEPH % i, pre)
    return body


def build_md(fname, title):
    text = (SRC / fname).read_text(encoding="utf-8")
    body = '<div class="doc">%s</div>' % md_to_html(text)
    htmldoc = TEMPLATE.format(title=html.escape(title), margin="16mm 15mm 18mm",
                              css=CSS_MD, body=body)
    out = OUT / (Path(fname).stem + ".html")
    out.write_text(htmldoc, encoding="utf-8")
    return out


def build_txt(fname, title):
    text = (SRC / fname).read_text(encoding="utf-8")
    body = (
        '<div class="titlecard"><div class="kicker">Database Design · Tutoring</div>'
        '<h1>%s</h1><div class="file">%s</div></div>'
        '<pre class="ascii">%s</pre>'
    ) % (html.escape(title), html.escape(fname), html.escape(text))
    htmldoc = TEMPLATE.format(title=html.escape(title), margin="14mm 12mm 16mm",
                              css=CSS_TXT, body=body)
    out = OUT / (Path(fname).stem + ".html")
    out.write_text(htmldoc, encoding="utf-8")
    return out


def main():
    made = []
    for fname, title in MD_FILES:
        made.append(build_md(fname, title))
    for fname, title in TXT_FILES:
        made.append(build_txt(fname, title))
    for p in made:
        print(p.name)


if __name__ == "__main__":
    main()



