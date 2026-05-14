#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const cwd = process.cwd();
const roots = process.argv.slice(2);
if (roots.length === 0) roots.push("src");

const matches = [];
const visit = (dir) => {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      visit(full);
    } else if (name.endsWith(".test.ts") || name.endsWith(".spec.ts")) {
      matches.push(full);
    }
  }
};
for (const r of roots) visit(join(cwd, r));

if (matches.length === 0) process.exit(0);

const child = spawn(
  process.execPath,
  ["--import", "tsx", "--test", ...matches],
  { stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 1));
