#!/usr/bin/env node
"use strict";

// Compares files marked "Shared with yappable-for-lovable" against the sibling
// checkout (../yappable-for-lovable) when it exists. The marker line itself is
// ignored. Exit 1 on divergence; exit 0 (with a note) if the sibling is absent.

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sibling = path.resolve(root, "..", "yappable-for-lovable");
const MARKER = /^\/\/ Shared with yappable-for-lovable[^\n]*\n/;

function body(file) {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").replace(MARKER, "");
}

function sharedFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sharedFiles(full));
    else if (entry.name.endsWith(".js") && MARKER.test(fs.readFileSync(full, "utf8").replace(/\r\n/g, "\n"))) out.push(full);
  }
  return out;
}

if (!fs.existsSync(sibling)) {
  console.log("check-shared: ../yappable-for-lovable not found, skipping.");
  process.exit(0);
}

let diverged = 0;
const files = sharedFiles(path.join(root, "src"));
for (const file of files) {
  const rel = path.relative(root, file);
  const other = path.join(sibling, rel);
  if (!fs.existsSync(other)) {
    console.error(`DIVERGED (missing in lovable): ${rel}`);
    diverged++;
  } else if (body(file) !== body(other)) {
    console.error(`DIVERGED: ${rel}`);
    diverged++;
  }
}
console.log(`check-shared: ${files.length} shared file(s), ${diverged} diverged.`);
process.exit(diverged ? 1 : 0);
