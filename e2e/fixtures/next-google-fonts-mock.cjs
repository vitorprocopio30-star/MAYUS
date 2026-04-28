function fontFamilyFromUrl(url) {
  try {
    const parsed = new URL(url);
    const family = parsed.searchParams.get("family") || "Inter";
    return family.split(":")[0].replace(/\+/g, " ");
  } catch {
    return "Inter";
  }
}

function mockedCss(url) {
  const family = fontFamilyFromUrl(url);
  return `
@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/mayuse2e/v1/mock-normal.woff2) format('woff2');
}
@font-face {
  font-family: '${family}';
  font-style: italic;
  font-weight: 100 900;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/mayuse2e/v1/mock-italic.woff2) format('woff2');
}
`;
}

module.exports = new Proxy(
  {},
  {
    get(_target, prop) {
      if (typeof prop !== "string") {
        return undefined;
      }

      return mockedCss(prop);
    },
  },
);
