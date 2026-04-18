const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const tokenPath = path.join(process.cwd(), ".vercel-api-key");
const token = fs.existsSync(tokenPath) ? fs.readFileSync(tokenPath, "utf8").trim() : "";

if (!token) {
  console.error("Missing Vercel API key in .vercel-api-key");
  process.exit(1);
}

const child = spawn("npx", ["-y", "vercel-mcp", `VERCEL_API_KEY=${token}`], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 1));
