const fs = require("node:fs");

function resolveFontFile(candidates) {
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

const normalFontPath = resolveFontFile([
  "/Windows/Fonts/arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
]);

const italicFontPath = resolveFontFile([
  "/Windows/Fonts/ariali.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
  "/System/Library/Fonts/Supplemental/Arial Italic.ttf",
]) || normalFontPath;

function fontFaceSource(fontPath, fallbackName) {
  if (!fontPath) return `url(${fallbackName}.woff2) format('woff2')`;
  const format = fontPath.endsWith(".ttf") ? "truetype" : "opentype";
  return `url(${fontPath}) format('${format}')`;
}

module.exports = new Proxy(Object.create(null), {
  get(_target, property) {
    if (typeof property !== "string") return undefined;

    let family = "Mocked Google Font";
    try {
      const url = new URL(property);
      family = (url.searchParams.get("family") || family).split(":")[0].replace(/\+/g, " ");
    } catch {
      family = "Mocked Google Font";
    }

    const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "font";

    return `
@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: ${fontFaceSource(normalFontPath, `${slug}-normal`)};
}
@font-face {
  font-family: '${family}';
  font-style: italic;
  font-weight: 100 900;
  font-display: swap;
  src: ${fontFaceSource(italicFontPath, `${slug}-italic`)};
}
`;
  },
});
