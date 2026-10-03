// Render each HTML file to PDF with system Chrome, waiting for mermaid diagrams.
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const DIR = __dirname;
const SRC = path.resolve(DIR, '..');
const CHROME = '/usr/bin/google-chrome-stable';
const MERMAID = fs.readFileSync(path.join(DIR, 'mermaid.min.js'), 'utf8');

// stem -> whether it contains mermaid (md files do)
const JOBS = [
  { stem: 'database-design-primer', mermaid: false },
  { stem: 'database-design-revised-lesson', mermaid: true },
  { stem: 'database-design-revised-samples', mermaid: true },
  { stem: 'database-design-companion-lesson', mermaid: false },
  { stem: 'database-design-practice-lesson', mermaid: false },
  { stem: 'database-design-AI-pieces-review', mermaid: false },
  { stem: 'database-design-quick-reference', mermaid: false },
];

const footer = `<div style="width:100%;font-size:7pt;color:#9aa3b4;
  font-family:Arial,sans-serif;padding:0 12mm;text-align:center;">
  <span class="pageNumber"></span> / <span class="totalPages"></span></div>`;
const emptyHeader = `<div></div>`;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
  });
  for (const job of JOBS) {
    const htmlPath = path.join(DIR, job.stem + '.html');
    const pdfPath = path.join(SRC, job.stem + '.pdf');
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });

    if (job.mermaid) {
      await page.addScriptTag({ content: MERMAID });
      const count = await page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        mermaid.initialize({
          startOnLoad: false, theme: 'neutral', securityLevel: 'loose',
          flowchart: { useMaxWidth: true }, er: { useMaxWidth: true },
          themeVariables: { fontFamily: 'Helvetica Neue, Arial, sans-serif' },
        });
        const nodes = document.querySelectorAll('pre.mermaid');
        // eslint-disable-next-line no-undef
        await mermaid.run({ nodes });
        return nodes.length;
      });
      await page.waitForFunction(
        (n) => document.querySelectorAll('pre.mermaid svg, .mermaid svg').length >= n,
        { timeout: 60000 }, count
      );
      if (errors.length) console.log(`  [${job.stem}] page warnings: ${errors.length}`);
    }

    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: emptyHeader,
      footerTemplate: footer,
      preferCSSPageSize: true,
    });
    await page.close();
    const kb = (fs.statSync(pdfPath).size / 1024).toFixed(0);
    console.log(`OK  ${job.stem}.pdf  (${kb} KB)`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
