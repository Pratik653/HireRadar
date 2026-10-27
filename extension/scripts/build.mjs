// Package the Research Companion.
//
//   node scripts/build.mjs           → dist/hireradar-companion-<version>.zip (production)
//   node scripts/build.mjs --dev     → also accepts http://localhost:5173 (local development only)
//   node scripts/build.mjs --check   → verify the manifest's permission boundary, write nothing
//
// No dependencies: files are zipped with Node's zlib.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { deflateRawSync } from "node:zlib";
import { checkManifest } from "./manifest-check.mjs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const dev = process.argv.includes("--dev");
const checkOnly = process.argv.includes("--check");

const problems = checkManifest(manifest);
if (problems.length) {
  console.error("manifest check failed:\n - " + problems.join("\n - "));
  process.exit(1);
}
console.log(`manifest ok: ${manifest.name} ${manifest.version}, permissions ${JSON.stringify(manifest.permissions)}`);
if (checkOnly) process.exit(0);

// ---- collect files ---------------------------------------------------------------------
const out = dev ? { ...manifest, externally_connectable: { matches: [...manifest.externally_connectable.matches, "http://localhost:5173/*"] } } : manifest;
const files = [["manifest.json", Buffer.from(JSON.stringify(out, null, 2) + "\n")]];
for (const dir of ["src", "icons"]) {
  const walk = (d) =>
    readdirSync(d).forEach((name) => {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (!name.endsWith(".d.ts")) files.push([relative(root, p).replaceAll("\\", "/"), readFileSync(p)]);
    });
  walk(join(root, dir));
}
files.push(["README.md", readFileSync(join(root, "README.md"))]);
files.push(["LICENSE", readFileSync(join(root, "..", "LICENSE"))]);

// ---- minimal ZIP writer (deflate) ------------------------------------------------------------
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const DOS_TIME = 0, DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1; // fixed date → reproducible archive

const local = [], central = [];
let offset = 0;
for (const [name, data] of files) {
  const nameBuf = Buffer.from(name);
  const packed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
  head.writeUInt16LE(DOS_TIME, 10); head.writeUInt16LE(DOS_DATE, 12); head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(nameBuf.length, 26);
  local.push(head, nameBuf, packed);
  const dir = Buffer.alloc(46);
  dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0x0800, 8);
  dir.writeUInt16LE(8, 10); dir.writeUInt16LE(DOS_TIME, 12); dir.writeUInt16LE(DOS_DATE, 14); dir.writeUInt32LE(crc, 16);
  dir.writeUInt32LE(packed.length, 20); dir.writeUInt32LE(data.length, 24); dir.writeUInt16LE(nameBuf.length, 28);
  dir.writeUInt32LE(offset, 42);
  central.push(dir, nameBuf);
  offset += head.length + nameBuf.length + packed.length;
}
const centralSize = central.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);

mkdirSync(join(root, "dist"), { recursive: true });
const zipName = `hireradar-companion-${manifest.version}${dev ? "-dev" : ""}.zip`;
writeFileSync(join(root, "dist", zipName), Buffer.concat([...local, ...central, end]));
// Unpacked copy for "Load unpacked".
const unpacked = join(root, "dist", zipName.replace(/\.zip$/, ""));
for (const [name, data] of files) {
  mkdirSync(join(unpacked, name, ".."), { recursive: true });
  writeFileSync(join(unpacked, name), data);
}
console.log(`wrote dist/${zipName} (${files.length} files) and dist/${zipName.replace(/\.zip$/, "")}/`);
