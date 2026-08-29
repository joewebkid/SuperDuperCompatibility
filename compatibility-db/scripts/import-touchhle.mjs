import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const databaseRoot = path.resolve(directory, "..");
const dataRoot = path.join(databaseRoot, "data");
const sourceRoot = path.join(dataRoot, "source", "touchhle");
const sourceAppsRoot = path.join(sourceRoot, "apps");
const cacheRoot = path.join(databaseRoot, ".cache", "touchhle");
const appDbBaseUrl = "https://appdb.touchhle.org";
const refresh = process.argv.includes("--refresh");
const concurrencyArgument = process.argv.find((argument) => argument.startsWith("--concurrency="));
const concurrency = Math.max(1, Math.min(16, Number(concurrencyArgument?.split("=")[1] ?? 8) || 8));

function decodeHtml(value) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body) => {
      const lower = body.toLowerCase();
      if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
      if (lower.startsWith("#")) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
      return named[lower] ?? entity;
    });
}

function textFromHtml(value) {
  return decodeHtml(value.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function attribute(value, name) {
  const match = value.match(new RegExp(`${name}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? "");
}

function tableAfterHeading(html, heading) {
  const headingPattern = new RegExp(`<h[23][^>]*>\\s*${heading}\\s*<\\/h[23]>`, "i");
  const headingMatch = headingPattern.exec(html);
  if (!headingMatch) return "";
  const tableStart = html.indexOf("<table", headingMatch.index);
  if (tableStart === -1) return "";
  const tableEnd = html.indexOf("</table>", tableStart);
  return tableEnd === -1 ? "" : html.slice(tableStart, tableEnd + 8);
}

function cellsFromRow(row) {
  return [...row.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((match) => ({
    html: match[1],
    text: textFromHtml(match[1]),
  }));
}

function tableRows(table) {
  const header = cellsFromRow(table.match(/<thead[^>]*>[\s\S]*?<tr[^>]*>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i)?.[1] ?? "")
    .map((cell) => cell.text);
  const rows = [...table.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)].map((match) => ({
    attributes: match[1],
    cells: cellsFromRow(match[2]),
  }));
  return { header, rows: header.length > 0 ? rows.slice(1) : rows };
}

function fieldMap(table) {
  const fields = {};
  for (const row of tableRows(table).rows) {
    if (row.cells.length >= 2) fields[row.cells[0].text] = row.cells[1];
  }
  return fields;
}

function rowAsObject(header, row) {
  return Object.fromEntries(header.map((name, index) => [name, row.cells[index] ?? { html: "", text: "" }]));
}

function timeFromCell(cell) {
  return attribute(cell.html, "datetime") || cell.text || null;
}

function reporterFromCell(cell) {
  const href = attribute(cell.html, "href");
  return cell.text ? { name: cell.text, url: href || null } : null;
}

function starsToRating(value) {
  const rating = (value.match(/⭐/g) ?? []).length;
  return rating > 0 ? rating : null;
}

function relativePath(...segments) {
  return path.posix.join(...segments);
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fetchCached(url, cacheName) {
  const cachePath = path.join(cacheRoot, cacheName);
  if (!refresh && await fileExists(cachePath)) return readFile(cachePath, "utf8");

  const response = await fetch(url, {
    headers: { "user-agent": "SuperDuperCompatibility importer (public AppDB attribution preserved)" },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const html = await response.text();
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, html, "utf8");
  return html;
}

async function jsonFiles(root) {
  const { readdir } = await import("node:fs/promises");
  if (!await fileExists(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) return jsonFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".json") ? [entryPath] : [];
  }))).flat();
}

async function ownRecords() {
  const records = [];
  for (const filePath of await jsonFiles(path.join(dataRoot, "games"))) {
    const record = JSON.parse(await readFile(filePath, "utf8"));
    records.push({
      ...record,
      record: relativePath("games", path.relative(path.join(dataRoot, "games"), filePath).split(path.sep).join("/")),
    });
  }
  return records;
}

function parseAppPage(appId, appUrl, html) {
  const appFields = fieldMap(tableAfterHeading(html, "App"));
  const versionsTable = tableRows(tableAfterHeading(html, "Versions"));
  const reportsTable = tableRows(tableAfterHeading(html, "Reports"));

  const versions = versionsTable.rows.map((row) => {
    const item = rowAsObject(versionsTable.header, row);
    return {
      version: item["Version number"]?.text ?? "",
      displayName: item["Display name"]?.text || null,
      bundleId: item["Bundle identifier"]?.text || null,
      minimumIosVersion: item["Minimum iOS version"]?.text || null,
      firstReportedBy: reporterFromCell(item["First reported by"] ?? { html: "", text: "" }),
    };
  });

  const androidReferenceReports = reportsTable.rows
    .map((row) => {
      const item = rowAsObject(reportsTable.header, row);
      const operatingSystem = item["Operating system"]?.text ?? "";
      if (!/^android\b/i.test(operatingSystem)) return null;
      const reportId = attribute(row.attributes, "id").match(/^report-(\d+)$/)?.[1] ?? null;
      const screenshotCell = item.Screenshot ?? { html: "", text: "" };
      const hasSourceScreenshot = Boolean(screenshotCell.text);
      return {
        sourceReportId: reportId,
        version: item["Version number"]?.text ?? "",
        emulatorVersion: item["touchHLE version"]?.text || null,
        operatingSystem,
        gpu: item.GPU?.text || null,
        scaleHack: item["Scale hack supported?"]?.text || null,
        rating: starsToRating(item.Rating?.text ?? ""),
        reported: timeFromCell(item.Reported ?? { html: "", text: "" }),
        reportedBy: reporterFromCell(item["Reported by"] ?? { html: "", text: "" }),
        remarks: item.Remarks?.text || null,
        hasSourceScreenshot,
        sourceScreenshotUrl: hasSourceScreenshot && reportId ? `${appDbBaseUrl}/reports/${reportId}/screenshot` : null,
      };
    })
    .filter(Boolean);

  const versionsWithAndroidSummary = versions.map((version) => {
    const reportsForVersion = androidReferenceReports.filter((report) => report.version === version.version);
    const ratings = reportsForVersion.map((report) => report.rating).filter(Number.isInteger);
    const dates = reportsForVersion.map((report) => report.reported).filter(Boolean).sort();
    return {
      ...version,
      androidReferenceBestRating: ratings.length > 0 ? Math.max(...ratings) : null,
      androidReferenceLastUpdated: dates.at(-1) ?? null,
    };
  });
  const title = appFields["App name"]?.text || `Unknown app ${appId}`;
  return {
    schemaVersion: 1,
    kind: "touchHLE-android-reference",
    source: {
      name: "touchHLE app compatibility database",
      appId: Number(appId),
      appUrl,
      retrieved: new Date().toISOString().slice(0, 10),
      licence: "CC BY 4.0 International",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
      screenshotsMirrored: false,
    },
    app: {
      title,
      releaseYear: appFields["Release year"]?.text || null,
      developerPublisher: appFields["Developer/Publisher"]?.text || null,
      firstReported: timeFromCell(appFields["First reported"] ?? { html: "", text: "" }),
      firstReportedBy: reporterFromCell(appFields["First reported by"] ?? { html: "", text: "" }),
    },
    versions: versionsWithAndroidSummary,
    androidReferenceReports,
  };
}

async function runPool(items, work) {
  let nextIndex = 0;
  const output = new Array(items.length);
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      output[index] = await work(items[index], index);
      process.stdout.write(`\rImported ${index + 1}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  process.stdout.write("\n");
  return output;
}

const homepage = await fetchCached(`${appDbBaseUrl}/`, "index.html");
const links = new Map();
for (const match of homepage.matchAll(/<a\b[^>]*href\s*=\s*(?:"|')?\/apps\/(\d+)(?:"|')?[^>]*>([\s\S]*?)<\/a>/gi)) {
  links.set(match[1], textFromHtml(match[2]));
}
const apps = [...links.entries()].map(([id, listedTitle]) => ({ id, listedTitle }));
if (apps.length === 0) throw new Error("No AppDB app links found on the source homepage.");

await rm(sourceAppsRoot, { recursive: true, force: true });
await mkdir(sourceAppsRoot, { recursive: true });

const importedApps = await runPool(apps, async ({ id, listedTitle }) => {
  const appUrl = `${appDbBaseUrl}/apps/${id}`;
  const html = await fetchCached(appUrl, `apps/${id}.html`);
  const app = parseAppPage(id, appUrl, html);
  if (!app.app.title) app.app.title = listedTitle;
  const record = relativePath("source", "touchhle", "apps", `${id}.json`);
  await writeFile(path.join(dataRoot, record), `${JSON.stringify(app, null, 2)}\n`, "utf8");
  return { id, record, ...app };
});

const superDuperRecords = await ownRecords();
const usedOwnRecords = new Set();
const indexApps = importedApps.map((sourceApp) => {
  const versionBundleIds = new Set(sourceApp.versions.map((version) => version.bundleId).filter(Boolean));
  const own = superDuperRecords.filter((record) => versionBundleIds.has(record.bundleId));
  own.forEach((record) => usedOwnRecords.add(record.record));
  const ratingRecords = own.filter((record) => Number.isInteger(record.androidRating));
  const bestRating = ratingRecords.length > 0 ? Math.max(...ratingRecords.map((record) => record.androidRating)) : null;
  const latest = own.toSorted((left, right) => String(right.updated).localeCompare(String(left.updated)))[0] ?? null;
  const referenceRatingRecords = sourceApp.androidReferenceReports.filter((record) => Number.isInteger(record.rating));
  const referenceBestRating = referenceRatingRecords.length > 0 ? Math.max(...referenceRatingRecords.map((record) => record.rating)) : null;
  const latestReference = sourceApp.androidReferenceReports.toSorted((left, right) => String(right.reported).localeCompare(String(left.reported)))[0] ?? null;
  return {
    id: `touchhle-${sourceApp.id}`,
    title: sourceApp.app.title,
    releaseYear: sourceApp.app.releaseYear,
    developerPublisher: sourceApp.app.developerPublisher,
    source: { appId: sourceApp.source.appId, url: sourceApp.source.appUrl },
    record: sourceApp.record,
    versions: sourceApp.versions.length,
    searchTerms: sourceApp.versions.flatMap((version) => [version.bundleId, version.displayName, version.version].filter(Boolean)),
    reference: {
      androidReports: sourceApp.androidReferenceReports.length,
      bestRating: referenceBestRating,
      lastUpdated: latestReference?.reported ?? null,
    },
    android: {
      overallStatus: latest?.overallStatus ?? "unknown",
      bestRating,
      lastUpdated: latest?.updated ?? null,
      reportCount: own.length,
      records: own.map((record) => record.record),
    },
  };
});

for (const record of superDuperRecords.filter((item) => !usedOwnRecords.has(item.record))) {
  indexApps.push({
    id: `superduper-${record.bundleId}-${record.version}`.replace(/[^a-z0-9-]/gi, "-"),
    title: record.title,
    releaseYear: null,
    developerPublisher: null,
    source: null,
    record: null,
    versions: 1,
    searchTerms: [record.bundleId, record.version],
    reference: { androidReports: 0, bestRating: null, lastUpdated: null },
    android: {
      overallStatus: record.overallStatus,
      bestRating: Number.isInteger(record.androidRating) ? record.androidRating : null,
      lastUpdated: record.updated,
      reportCount: 1,
      records: [record.record],
    },
  });
}

indexApps.sort((left, right) => left.title.localeCompare(right.title, "en"));
const index = {
  schemaVersion: 2,
  project: "Super Duper Android Compatibility Database",
  platform: "Android",
  updated: new Date().toISOString().slice(0, 10),
  attribution: {
    source: "touchHLE app compatibility database",
    sourceUrl: `${appDbBaseUrl}/`,
    licence: "CC BY 4.0 International",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    note: "Imported reports are Android-only touchHLE references, not Super Duper results. Source screenshots are not mirrored.",
  },
  apps: indexApps,
};
await writeFile(path.join(dataRoot, "index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");

console.log(`Imported ${importedApps.length} apps, ${indexApps.reduce((count, app) => count + app.reference.androidReports, 0)} Android reference reports and ${superDuperRecords.length} Super Duper record(s).`);
