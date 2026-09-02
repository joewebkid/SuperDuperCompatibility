import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateCompatibility, validateAndroidIndex } from "./compatibility-status.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "..");
const dist = path.join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, "site"), dist, { recursive: true });
await cp(path.join(root, "data"), path.join(dist, "data"), { recursive: true });

async function jsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return jsonFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".json") ? [entryPath] : [];
  }))).flat();
}

// Android receives a compact, exact-version projection. Reviewed Super Duper
// results remain authoritative; exact touchHLE and community observations may
// supply only black/red/yellow fallback badges and can never produce green.
const catalogue = JSON.parse(await readFile(path.join(root, "data", "index.json"), "utf8"));
const gameRoot = path.join(root, "data", "games");
const gameEntries = await Promise.all((await jsonFiles(gameRoot)).map(async (gamePath) => {
  const record = JSON.parse(await readFile(gamePath, "utf8"));
  const relative = path.relative(path.join(root, "data"), gamePath).replaceAll("\\", "/");
  return { record, relative };
}));
const communityRoot = path.join(root, "data", "source", "community");
const communityEntries = await Promise.all((await jsonFiles(communityRoot)).map(async (recordPath) => {
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  const relative = path.relative(path.join(root, "data"), recordPath).replaceAll("\\", "/");
  return { record, relative };
}));

// Older imported indexes stored only the number of touchHLE references. Read
// their detailed records here so the public catalogue can show the reference
// rating and its real last-test date without treating it as a Super Duper run.
const touchSourceByCatalogueId = new Map();
for (const app of catalogue.apps) {
  app.reference ??= { androidReports: 0, bestRating: null, lastUpdated: null };
  if (!app.record) continue;
  const source = JSON.parse(await readFile(path.join(root, "data", app.record), "utf8"));
  touchSourceByCatalogueId.set(app.id, source);
  const reports = source.androidReferenceReports ?? [];
  const ratings = reports.filter((report) => Number.isInteger(report.rating)).map((report) => report.rating);
  const latest = reports.toSorted((left, right) => String(right.reported).localeCompare(String(left.reported)))[0] ?? null;
  app.reference.androidReports = reports.length;
  app.reference.bestRating = ratings.length > 0 ? Math.max(...ratings) : null;
  app.reference.lastUpdated = latest?.reported ?? null;
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Merge reviewed records into the published index during the build. This
// keeps contributions to one small versioned JSON file and prevents the huge
// imported source index from becoming a hand-edited second source of truth.
for (const entry of gameEntries) {
  const bundleId = entry.record.bundleId.toLowerCase();
  let app = catalogue.apps.find((candidate) =>
    candidate.android?.records?.includes(entry.relative) ||
    candidate.searchTerms?.some((term) => term.toLowerCase() === bundleId));
  if (!app) {
    app = {
      id: `superduper-${slug(entry.record.bundleId)}`,
      title: entry.record.title,
      releaseYear: entry.record.releaseYear ?? null,
      developerPublisher: entry.record.developerPublisher ?? null,
      genres: entry.record.genres ?? [],
      versions: 0,
      searchTerms: [],
      reference: { androidReports: 0, bestRating: null, lastUpdated: null },
      android: { overallStatus: "unknown", bestRating: null, lastUpdated: null, reportCount: 0, records: [] },
    };
    catalogue.apps.push(app);
  }
  app.searchTerms = [...new Set([...(app.searchTerms ?? []), entry.record.bundleId, entry.record.title, entry.record.version])];
  app.android ??= { overallStatus: "unknown", bestRating: null, lastUpdated: null, reportCount: 0, records: [] };
  app.android.records = [...new Set([...(app.android.records ?? []), entry.relative])];
}

// Community observations are reference-only. Attach their source file to an
// app page only after the report has been resolved to an exact catalogue id;
// incomplete reports stay in the source queue and cannot affect Android status.
for (const entry of communityEntries) {
  for (const report of entry.record.reports ?? []) {
    if (!report.catalogueId) continue;
    const app = catalogue.apps.find((candidate) => candidate.id === report.catalogueId);
    if (!app) throw new Error(`${entry.relative}: unknown catalogueId ${report.catalogueId}`);
    app.reference ??= { androidReports: 0, bestRating: null, lastUpdated: null };
    app.reference.communityRecords = [...new Set([...(app.reference.communityRecords ?? []), entry.relative])];
  }
}

const gameByPath = new Map(gameEntries.map((entry) => [entry.relative, entry.record]));
for (const app of catalogue.apps) {
  const reports = (app.android?.records ?? []).map((record) => gameByPath.get(record)).filter(Boolean);
  if (reports.length === 0) continue;
  const newest = reports.toSorted((left, right) => right.updated.localeCompare(left.updated))[0];
  app.android.overallStatus = newest.overallStatus;
  app.android.bestRating = Math.max(...reports.map((record) => record.androidRating ?? 0)) || null;
  app.android.lastUpdated = newest.updated;
  app.android.reportCount = reports.length;
  app.versions = Math.max(app.versions ?? 0, new Set(reports.map((record) => record.version)).size);
}
catalogue.apps.sort((left, right) => left.title.localeCompare(right.title));
await writeFile(path.join(dist, "data", "index.json"), JSON.stringify(catalogue, null, 2) + "\n", "utf8");

const catalogueIdByRecord = new Map();
for (const app of catalogue.apps ?? []) {
  for (const record of app.android?.records ?? []) catalogueIdByRecord.set(record.replaceAll("\\", "/"), app.id);
}
const exactVersions = new Map();
function exactKey(bundleId, version) {
  return `${bundleId.trim().toLowerCase()}\u0000${version.trim()}`;
}
function exactVersion(bundleId, version, title, catalogueId) {
  if (typeof bundleId !== "string" || !bundleId.trim() || typeof version !== "string" || !version.trim()) return null;
  const key = exactKey(bundleId, version);
  if (!exactVersions.has(key)) {
    exactVersions.set(key, {
      bundleId: bundleId.trim(),
      version: version.trim(),
      title,
      catalogueId,
      superDuper: [],
      touchHle: [],
      community: [],
    });
  }
  const value = exactVersions.get(key);
  value.title ||= title;
  value.catalogueId ||= catalogueId;
  return value;
}

for (const { record, relative } of gameEntries) {
  const target = exactVersion(
    record.bundleId,
    record.version,
    record.title,
    catalogueIdByRecord.get(relative) ?? null,
  );
  target?.superDuper.push({
    status: record.overallStatus,
    rating: record.androidRating ?? null,
    updated: record.updated,
  });
}

for (const app of catalogue.apps) {
  const source = touchSourceByCatalogueId.get(app.id);
  if (!source) continue;
  for (const version of source.versions ?? []) {
    const target = exactVersion(version.bundleId, version.version, app.title, app.id);
    if (!target) continue;
    target.touchHle.push(...(source.androidReferenceReports ?? [])
      .filter((report) => report.version === version.version)
      .map((report) => ({ rating: report.rating, reported: report.reported })));
  }
}

for (const entry of communityEntries) {
  for (const report of entry.record.reports ?? []) {
    if (!report.version) continue;
    let bundleId = report.bundleId;
    if (!bundleId && report.catalogueId) {
      const source = touchSourceByCatalogueId.get(report.catalogueId);
      const matches = [...new Set((source?.versions ?? [])
        .filter((version) => version.version === report.version)
        .map((version) => version.bundleId)
        .filter(Boolean))];
      if (matches.length === 1) bundleId = matches[0];
    }
    const target = exactVersion(bundleId, report.version, report.title, report.catalogueId);
    target?.community.push({
      status: report.status,
      reported: report.reported ?? entry.record.source?.retrieved ?? null,
    });
  }
}

const androidRecords = [...exactVersions.values()].map((record) => {
  const aggregate = aggregateCompatibility(record);
  return {
    bundleId: record.bundleId,
    version: record.version,
    title: record.title,
    status: aggregate.status,
    rating: aggregate.rating,
    updated: aggregate.updated,
    catalogueId: record.catalogueId,
    source: aggregate.source,
    evidenceSources: aggregate.evidenceSources,
    evidenceCount: aggregate.evidenceCount,
  };
});
androidRecords.sort((left, right) => left.bundleId.localeCompare(right.bundleId) || left.version.localeCompare(right.version));
const androidIndex = validateAndroidIndex({
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  records: androidRecords,
});
await writeFile(path.join(dist, "data", "android-index.json"), JSON.stringify(androidIndex, null, 2) + "\n", "utf8");

console.log(`Built static site in ${dist}`);
