#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VERSION_FILE = path.join(__dirname, "..", "src", "version.ts");

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

function readMinor() {
  const src = fs.readFileSync(VERSION_FILE, "utf8");
  const m = src.match(/APP_VERSION\s*=\s*"1\.(\d+)"/);
  if (!m) throw new Error("Cannot parse APP_VERSION from src/version.ts (expected 1.x)");
  return parseInt(m[1], 10);
}

function writeMinor(minor) {
  const ver = `1.${minor}`;
  let src = fs.readFileSync(VERSION_FILE, "utf8");
  src = src.replace(/APP_VERSION\s*=\s*".+?"/, `APP_VERSION = "${ver}"`);
  fs.writeFileSync(VERSION_FILE, src);
  return ver;
}

try {
  // 1) bump 1.x
  const currentMinor = readMinor();
  const nextMinor = currentMinor + 1;
  const newVer = writeMinor(nextMinor);
  const tag = `v${newVer}`;

  // 2) commit version bump
  run(`git add ${VERSION_FILE}`);
  run(`git commit -m "chore: release ${tag}"`);

  // 3) deploy (your deploy already builds)
  try {
    run(`npm run -s deploy:upload`);
  } catch {
    run(`npm run -s deploy`);
  }

  // 4) tag + push
  run(`git tag -a ${tag} -m "release ${tag}"`);
  run(`git push`);
  run(`git push --follow-tags`);

  console.log(`\n✅ Released ${tag}`);
} catch (e) {
  console.error(e);
  process.exit(1);
}
