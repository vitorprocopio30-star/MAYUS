const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "docs", "design", "typography-mockups", "mayus-cormorant-instrument-slide.html");
const outputDir = path.join(root, "docs", "design", "typography-mockups", "output");
const outputPath = path.join(outputDir, "mayus-cormorant-instrument-slide.png");

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });

  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(1000);
  await page.locator("#slide").screenshot({ path: outputPath, animations: "disabled" });

  const loadedFonts = await page.evaluate(() =>
    Array.from(new Set(Array.from(document.fonts).filter((font) => font.status === "loaded").map((font) => font.family))).sort()
  );

  await browser.close();
  console.log(JSON.stringify({ outputPath, loadedFonts }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
