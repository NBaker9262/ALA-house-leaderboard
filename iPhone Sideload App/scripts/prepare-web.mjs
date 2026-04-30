import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const source = resolve(root, "control1.html");
const webDir = resolve(root, "www");
const target = resolve(webDir, "index.html");

if (!existsSync(source)) {
  console.error("Missing source file: control1.html");
  process.exit(1);
}

mkdirSync(webDir, { recursive: true });
copyFileSync(source, target);

console.log("Prepared web asset:");
console.log(`- Source: ${source}`);
console.log(`- Target: ${target}`);
