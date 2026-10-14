// Starts the RITOS FastAPI backend with the project's virtualenv Python (Windows, macOS, Linux).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ports } from "./ports.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const python = process.platform === "win32"
  ? join(root, ".venv", "Scripts", "python.exe")
  : join(root, ".venv", "bin", "python");

if (!existsSync(python)) {
  console.error(`Python virtualenv not found at ${python}. Run "pnpm bootstrap" first.`);
  process.exit(1);
}

// Host/port/reload come from the environment. Auto-reload is opt-in (API_RELOAD=true): on Windows a reload can
// leave the API stopped mid-demo, so the default is a plain, stable server (restart it after backend changes).
const host = process.env.API_HOST || "0.0.0.0";
const port = String(ports.api);
const args = ["-m", "uvicorn", "app.main:app", "--host", host, "--port", port];
if ((process.env.API_RELOAD || "").toLowerCase() === "true") args.push("--reload", "--reload-dir", "app");

const child = spawn(python, args, {
  cwd: join(root, "backend"),
  stdio: "inherit",
  env: { ...process.env, PYTHONUNBUFFERED: "1" },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
