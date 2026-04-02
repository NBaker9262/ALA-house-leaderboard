#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const NAME_RISK = /(adminsdk|service-account|credentials|private[_-]?key|\.pem$|\.p12$)/i;
const CONTENT_RISK = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /"type"\s*:\s*"service_account"/,
  /"private_key"\s*:\s*"/
];

function gitList(command) {
  return execSync(command, { encoding: "utf8" })
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
}

function isTextLike(filePath) {
  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) return false;
    if (stats.size > 1_500_000) return false;
    return true;
  } catch {
    return false;
  }
}

const trackedFiles = gitList("git ls-files");
const riskyTrackedByName = trackedFiles.filter(path => NAME_RISK.test(path));
const riskyTrackedByContent = [];

for (const filePath of trackedFiles) {
  if (!isTextLike(filePath)) continue;
  let content = "";
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    continue;
  }
  if (CONTENT_RISK.some(pattern => pattern.test(content))) {
    riskyTrackedByContent.push(filePath);
  }
}

const untrackedFiles = gitList("git ls-files --others --exclude-standard");
const riskyUntracked = untrackedFiles.filter(path => NAME_RISK.test(path));

if (!riskyTrackedByName.length && !riskyTrackedByContent.length) {
  console.log("Safety check passed: no tracked secret files detected.");
} else {
  console.error("Safety check failed: risky tracked files were found.");
  if (riskyTrackedByName.length) {
    console.error("\nTracked files with risky names:");
    riskyTrackedByName.forEach(file => console.error(`- ${file}`));
  }
  if (riskyTrackedByContent.length) {
    console.error("\nTracked files with risky secret content:");
    riskyTrackedByContent.forEach(file => console.error(`- ${file}`));
  }
  process.exitCode = 1;
}

if (riskyUntracked.length) {
  console.warn("\nWarning: local secret-like files exist (untracked):");
  riskyUntracked.forEach(file => console.warn(`- ${file}`));
  console.warn("These are not tracked now, but keep them out of commits.");
}
