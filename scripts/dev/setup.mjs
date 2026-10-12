// `pnpm bootstrap`: one-time (and safe to repeat) setup for RITOS + ShopFlow.
//   1. Python virtualenv + backend packages     4. RITOS database migrations (Alembic) + dev users
//   2. Desk portal and ShopFlow npm packages    5. ShopFlow migrations (Prisma) + demo data if the store is empty
//   3. .env files from the examples
// Flags: --skip-install (only env files + databases)
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const win = process.platform === "win32";
const skipInstall = process.argv.includes("--skip-install");
const venvPython = join(root, ".venv", win ? "Scripts\\python.exe" : "bin/python");

function step(title) {
  console.log(`\n\x1b[1m\x1b[36m▶ ${title}\x1b[0m`);
}

// npm/npx/py are .cmd shims on Windows and need a shell; real executables (node, python.exe) must not get one.
const needsShell = (cmd) => win && !/\.exe$/i.test(cmd);

function run(cmd, args, cwd = root, { allowFail = false } = {}) {
  const res = needsShell(cmd)
    ? spawnSync([cmd, ...args].join(" "), { cwd, stdio: "inherit", shell: true })
    : spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (res.status !== 0 && !allowFail) {
    console.error(`\n\x1b[31m✖ Failed: ${cmd} ${args.join(" ")} (in ${cwd})\x1b[0m`);
    process.exit(res.status ?? 1);
  }
  return res.status === 0;
}

function capture(cmd, args, cwd = root) {
  const res = needsShell(cmd)
    ? spawnSync([cmd, ...args].join(" "), { cwd, encoding: "utf8", shell: true })
    : spawnSync(cmd, args, { cwd, encoding: "utf8" });
  return res.status === 0 ? res.stdout.trim() : null;
}

function findPython() {
  for (const [cmd, args] of win ? [["py", ["-3"]], ["python", []]] : [["python3", []], ["python", []]]) {
    const v = capture(cmd, [...args, "--version"]);
    if (v && /Python 3\.(1[1-9]|[2-9]\d)/.test(v)) return [cmd, args];
  }
  console.error("Python 3.11+ is required. Install it from python.org and re-run `pnpm bootstrap`.");
  process.exit(1);
}

const readEnvValue = (file, key) => {
  if (!existsSync(file)) return null;
  const m = readFileSync(file, "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
  return m && !m[1].includes("__GENERATE__") ? m[1].trim() : null;
};

// RITOS and ShopFlow authenticate each other with the same key: reuse one if either .env already has it.
const sharedApiKey =
  readEnvValue(join(root, "backend", ".env"), "RITOS_API_KEY") ||
  readEnvValue(join(root, "shopflow", ".env"), "RITOS_API_KEY") ||
  randomBytes(32).toString("base64url");

// Copy .env.example to .env, replacing each __GENERATE__ with a fresh random secret.
function copyEnv(dir) {
  const example = join(root, dir, ".env.example");
  const target = join(root, dir, ".env");
  if (existsSync(target)) {
    console.log(`  ${dir}/.env already exists (kept)`);
    return;
  }
  if (!existsSync(example)) return;
  const content = readFileSync(example, "utf8")
    .replace(/^RITOS_API_KEY=__GENERATE__$/m, `RITOS_API_KEY=${sharedApiKey}`)
    .replace(/__GENERATE__/g, () => randomBytes(32).toString("base64url"));
  writeFileSync(target, content);
  console.log(`  created ${dir}/.env from .env.example (secrets generated)`);
}

// True while the database URL still contains a value someone has to fill in, e.g. <db-password>.
function needsInput(dir) {
  const envFile = join(root, dir, ".env");
  if (!existsSync(envFile)) return true;
  const url = (readFileSync(envFile, "utf8").match(/^DATABASE_URL=(.*)$/m) || [])[1] || "";
  return !url || /<[a-z-]+>/.test(url);
}

if (!skipInstall) {
  step("1/5 Python virtualenv and backend packages");
  if (!existsSync(venvPython)) {
    const [py, pyArgs] = findPython();
    run(py, [...pyArgs, "-m", "venv", ".venv"]);
  }
  run(venvPython, ["-m", "pip", "install", "--upgrade", "pip", "--quiet"]);
  run(venvPython, ["-m", "pip", "install", "-r", join("backend", "requirements.txt"), "--quiet"]);

  step("2/5 Desk portal and ShopFlow packages");
  run("npm", ["install", "--no-audit", "--no-fund"], join(root, "frontend"));
  run("npm", ["install", "--no-audit", "--no-fund"], join(root, "shopflow"));
}

step("3/5 Environment files");
for (const dir of ["backend", "frontend", "shopflow"]) copyEnv(dir);

step("4/5 RITOS database (Alembic migrations + development users)");
if (needsInput("backend")) {
  console.log("\x1b[33m  backend/.env: replace <db-password> in DATABASE_URL (write @ as %40), then run `pnpm db:migrate`.\x1b[0m");
} else {
  run(venvPython, ["-m", "alembic", "upgrade", "head"], join(root, "backend"));
  run(venvPython, ["-m", "app.seed"], join(root, "backend"));
}

step("5/5 ShopFlow database (Prisma migrations + demo data)");
if (needsInput("shopflow")) {
  console.log("\x1b[33m  shopflow/.env: replace <db-password> in DATABASE_URL and DIRECT_URL (write @ as %40), then run `pnpm db:migrate`.\x1b[0m");
} else {
  const shop = join(root, "shopflow");
  run("npx", ["prisma", "migrate", "deploy"], shop);
  run("npx", ["prisma", "generate"], shop);
  const products = capture(process.execPath, ["-e",
    "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.product.count().then(n=>{console.log(n);return p.$disconnect()})"], shop);
  if (products === "0") {
    run("npm", ["run", "db:seed"], shop);
  } else {
    console.log(`  store already has ${products ?? "?"} products: demo data not reloaded (use \`pnpm db:seed\` to reset it)`);
  }
}

if (needsInput("backend") || needsInput("shopflow")) {
  console.log("\n\x1b[33m⚠ Almost done: add the database password to the .env files listed above, then run `pnpm db:migrate`.\x1b[0m\n");
} else {
  console.log("\n\x1b[32m✔ Setup complete. Start everything with: pnpm dev\x1b[0m\n");
}
