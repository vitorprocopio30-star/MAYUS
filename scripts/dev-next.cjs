const path = require("node:path");
const { spawn } = require("node:child_process");

const fontMockPath = path.join(__dirname, "next-font-google-mock.cjs");
process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES =
  process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES || fontMockPath;

const nextBin = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], {
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code || 0);
});
