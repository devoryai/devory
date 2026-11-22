#!/usr/bin/env node
/**
 * scripts/legal/license-check.mjs — factory-507 dependency-license report and CI check.
 *
 * Reads npm lockfiles (offline; no network, no dependencies). The lockfile's
 * per-package `license` field is used first, then the installed package's
 * package.json, then a LICENSE-file sniff. Every package is classified:
 *
 *   permissive           MIT, ISC, BSD-*, Apache-2.0, 0BSD, Unlicense, CC0, …
 *   weak-copyleft        LGPL, MPL, EPL, CDDL — usable with notice / unmodified
 *   strong-copyleft      GPL, AGPL, SSPL, EUPL, OSL — incompatible with MIT distribution
 *   non-redistributable  UNLICENSED, proprietary, BUSL, CC-BY-NC, Commercial
 *   unknown              no license found, or a custom "SEE LICENSE IN …"
 *
 * SPDX expressions: "A OR B" takes the most permissive branch; "A AND B" the
 * most restrictive. Every flagged *production* (distributed) package must have
 * an entry in the resolutions file, or --check fails. Dev-only packages are
 * reported but only strong-copyleft / non-redistributable ones are flagged.
 *
 * Usage:
 *   node scripts/legal/license-check.mjs --check [--repo <dir>] [--resolutions <file>]
 *   node scripts/legal/license-check.mjs --report <out.json> --repo <name>=<dir> [--repo …]
 */

import fs from "node:fs";
import path from "node:path";

const PERMISSIVE = new Set([
  "MIT", "MIT-0", "ISC", "BSD-2-Clause", "BSD-3-Clause", "BSD-3-Clause-Clear", "0BSD", "Apache-2.0",
  "Unlicense", "CC0-1.0", "CC-BY-3.0", "CC-BY-4.0", "BlueOak-1.0.0", "Python-2.0", "Zlib", "WTFPL",
  "PSF-2.0", "Artistic-2.0", "X11", "Unicode-DFS-2016", "Unicode-3.0", "W3C", "AFL-2.1", "BSL-1.0",
]);
const WEAK = /^(LGPL|MPL|EPL|CDDL|CPL)/i;
const STRONG = /^(GPL|AGPL|SSPL|EUPL|OSL|CC-BY-SA)/i;
const NONREDIST = /^(UNLICENSED|BUSL|CC-BY-NC|Commercial|Proprietary|Elastic|PolyForm)/i;
const RANK = { permissive: 0, "weak-copyleft": 1, unknown: 2, "strong-copyleft": 3, "non-redistributable": 4 };

function classifyId(id) {
  const t = id.replace(/[()]/g, "").trim().replace(/\+$/, "").replace(/-(only|or-later)$/, "");
  if (!t) return "unknown";
  if (PERMISSIVE.has(t) || PERMISSIVE.has(t.replace(/\+$/, ""))) return "permissive";
  if (NONREDIST.test(t)) return "non-redistributable";
  if (STRONG.test(t)) return "strong-copyleft";
  if (WEAK.test(t)) return "weak-copyleft";
  return "unknown";
}

/** Classify an SPDX-ish expression. OR → most permissive branch; AND → most restrictive part. */
export function classifyLicense(expr) {
  if (!expr) return "unknown";
  const e = String(expr).trim();
  if (/^SEE LICENSE IN/i.test(e)) return "unknown";
  const ors = e.replace(/^\((.*)\)$/, "$1").split(/\s+OR\s+|\s*\/\s*/i);
  let best = null;
  for (const branch of ors) {
    const ands = branch.split(/\s+AND\s+/i).map(classifyId);
    const worst = ands.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "permissive");
    if (best === null || RANK[worst] < RANK[best]) best = worst;
  }
  return best ?? "unknown";
}

function licenseFromPackageJson(pj) {
  if (!pj) return null;
  if (typeof pj.license === "string") return pj.license;
  if (pj.license && typeof pj.license.type === "string") return pj.license.type;
  if (Array.isArray(pj.licenses)) return pj.licenses.map((l) => (typeof l === "string" ? l : l.type)).filter(Boolean).join(" OR ") || null;
  return null;
}

function sniffLicenseFile(dir) {
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => /^(licen[cs]e|copying)/i.test(n));
  } catch {
    return null;
  }
  for (const n of names) {
    const text = fs.readFileSync(path.join(dir, n), "utf-8").slice(0, 4000);
    if (/Permission is hereby granted, free of charge/i.test(text)) return "MIT (from LICENSE file)";
    if (/Apache License,?\s+Version 2\.0/i.test(text)) return "Apache-2.0 (from LICENSE file)";
    if (/Permission to use, copy, modify, and\/or distribute/i.test(text)) return "ISC (from LICENSE file)";
    if (/Redistribution and use in source and binary forms/i.test(text)) return "BSD (from LICENSE file)";
    if (/GNU LESSER GENERAL PUBLIC LICENSE/i.test(text)) return "LGPL (from LICENSE file)";
    if (/GNU GENERAL PUBLIC LICENSE/i.test(text)) return "GPL (from LICENSE file)";
  }
  return null;
}

function nameFromLockPath(p) {
  const i = p.lastIndexOf("node_modules/");
  return p.slice(i + "node_modules/".length);
}

/** Every third-party package in a repo's package-lock.json, with license and dev/prod. */
export function readRepoPackages(repoDir) {
  const lockPath = path.join(repoDir, "package-lock.json");
  if (!fs.existsSync(lockPath)) return null;
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
  const out = new Map();
  for (const [p, v] of Object.entries(lock.packages ?? {})) {
    if (!p.includes("node_modules/") || v.link) continue;
    const name = v.name ?? nameFromLockPath(p);
    const key = `${name}@${v.version ?? "?"}`;
    let license = licenseFromPackageJson(v);
    let source = "lockfile";
    if (!license) {
      const installed = path.join(repoDir, p, "package.json");
      if (fs.existsSync(installed)) {
        try {
          license = licenseFromPackageJson(JSON.parse(fs.readFileSync(installed, "utf-8")));
          source = "package.json";
        } catch {}
      }
      if (!license) {
        license = sniffLicenseFile(path.join(repoDir, p));
        source = license ? "LICENSE file" : "none";
      }
    }
    const prev = out.get(key);
    const dev = v.dev === true || v.devOptional === true;
    // The same name@version can appear at several paths; it is production if any copy is.
    if (prev) {
      prev.dev = prev.dev && dev;
      continue;
    }
    out.set(key, { name, version: v.version ?? "?", license: license ?? null, license_source: source, dev, category: classifyLicense(license) });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function isFlagged(pkg) {
  if (pkg.dev) return pkg.category === "strong-copyleft" || pkg.category === "non-redistributable";
  return pkg.category !== "permissive";
}

function loadResolutions(file) {
  if (!file || !fs.existsSync(file)) return [];
  const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
  return Array.isArray(raw.resolutions) ? raw.resolutions : [];
}

/** A resolution matches by exact name, or by a trailing-* prefix (e.g. "@img/sharp-libvips-*"). */
export function findResolution(pkg, resolutions) {
  return resolutions.find((r) => (r.package.endsWith("*") ? pkg.name.startsWith(r.package.slice(0, -1)) : r.package === pkg.name)) ?? null;
}

function main(argv) {
  const args = { repos: [], check: false, report: null, resolutions: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") args.check = true;
    else if (a === "--report") args.report = argv[++i];
    else if (a === "--resolutions") args.resolutions = argv[++i];
    else if (a === "--repo") args.repos.push(argv[++i]);
    else throw new Error(`unknown argument ${a}`);
  }
  if (args.repos.length === 0) args.repos.push(`${path.basename(process.cwd())}=${process.cwd()}`);
  const resolutionsFile = args.resolutions ?? path.join(process.cwd(), "docs", "legal", "license-resolutions.json");
  const resolutions = loadResolutions(resolutionsFile);

  const report = { generated_at: new Date().toISOString(), resolutions_file: path.relative(process.cwd(), resolutionsFile), repos: [] };
  let unresolved = 0;
  for (const spec of args.repos) {
    const [name, dir] = spec.includes("=") ? spec.split("=") : [path.basename(spec), spec];
    const pkgs = readRepoPackages(path.resolve(dir));
    if (!pkgs) {
      report.repos.push({ name, packages: null, note: "no package-lock.json" });
      continue;
    }
    const flagged = pkgs.filter(isFlagged).map((p) => ({ ...p, resolution: findResolution(p, resolutions) }));
    unresolved += flagged.filter((f) => !f.resolution).length;
    const counts = {};
    for (const p of pkgs) {
      const k = `${p.dev ? "dev" : "prod"}:${p.category}`;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    const byLicense = {};
    for (const p of pkgs) byLicense[p.license ?? "(none)"] = (byLicense[p.license ?? "(none)"] ?? 0) + 1;
    report.repos.push({ name, total: pkgs.length, prod: pkgs.filter((p) => !p.dev).length, counts, by_license: byLicense, flagged, packages: pkgs });

    if (args.check) {
      for (const f of flagged) {
        const tag = f.resolution ? `ok (${f.resolution.resolution})` : "UNRESOLVED";
        console.log(`${name}: ${f.dev ? "dev " : "prod"} ${f.name}@${f.version} — ${f.license ?? "(none)"} [${f.category}] → ${tag}`);
      }
    }
  }
  if (args.report) fs.writeFileSync(args.report, JSON.stringify(report, null, 2) + "\n");
  if (args.check) {
    if (unresolved > 0) {
      console.error(`license-check: ${unresolved} flagged package(s) have no resolution in ${report.resolutions_file}. Add one (acceptable-with-notice | replace | escalate) after review, or remove the dependency.`);
      process.exit(1);
    }
    console.log("license-check: every flagged package has a recorded resolution");
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("license-check.mjs")) {
  main(process.argv.slice(2));
}
