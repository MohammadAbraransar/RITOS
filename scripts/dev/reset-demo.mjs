// `pnpm db:seed`: reset BOTH demo databases together so their ticket numbers stay consistent.
// Deletes ShopFlow store data and RITOS ticket history (RITOS user accounts are kept).
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const win = process.platform === "win32";
const python = join(root, ".venv", win ? "Scripts\\python.exe" : "bin/python");

function run(label, cmd, args, cwd, shell = false) {
  console.log(`\n▶ ${label}`);
  const res = shell
    ? spawnSync([cmd, ...args].join(" "), { cwd, stdio: "inherit", shell: true })
    : spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

run("ShopFlow store: demo data", "npm", ["run", "db:seed"], join(root, "shopflow"), win);
run("RITOS: clear ticket history and reload demo tickets", python, ["-m", "app.reset_demo"], join(root, "backend"));
console.log("\n✔ Both demo databases reset.");
