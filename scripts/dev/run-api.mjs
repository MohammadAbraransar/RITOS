// Starts the RITOS FastAPI backend with the project's virtualenv Python (Windows, macOS, Linux).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const python = process.platform === "win32"
  ? join(root, ".venv", "Scripts", "python.exe")
  : join(root, ".venv", "bin", "python");

if (!existsSync(python)) {
  console.error(`Python virtualenv not found at ${python}. Run "pnpm bootstrap" first.`);
  process.exit(1);
}

const child = spawn(python, ["-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"], {
  cwd: join(root, "backend"),
  stdio: "inherit",
  env: { ...process.env, PYTHONUNBUFFERED: "1" },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
