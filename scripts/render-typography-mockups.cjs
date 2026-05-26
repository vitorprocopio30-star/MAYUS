const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "docs", "design", "typography-mockups", "mayus-typography-mockups.html");
const outputDir = path.join(root, "docs", "design", "typography-mockups", "output");

async function waitForFonts(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(1200);
}

async function screenshotElement(page, selector, filename) {
  const element = page.locator(selector).first();
  await element.scrollIntoViewIfNeeded();
  await element.screenshot({
    path: path.join(outputDir, filename),
    animations: "disabled",
  });
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 2600, height: 1800 },
    deviceScaleFactor: 1,
  });

  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
  await waitForFonts(page);

  await screenshotElement(page, "#comparison-board", "mayus-font-comparison-board.png");
  await screenshotElement(page, "#mockup-01", "01-instrument-sans-newsreader.png");
  await screenshotElement(page, "#mockup-02", "02-manrope-source-serif-4.png");
  await screenshotElement(page, "#mockup-03", "03-instrument-sans-libre-baskerville.png");
  await screenshotElement(page, "#mockup-04", "04-manrope-fraunces.png");

  const loadedFonts = await page.evaluate(() =>
    Array.from(document.fonts)
      .filter((font) => font.status === "loaded")
      .map((font) => font.family)
  );

  await browser.close();
  console.log(JSON.stringify({ outputDir, loadedFonts: Array.from(new Set(loadedFonts)).sort() }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
