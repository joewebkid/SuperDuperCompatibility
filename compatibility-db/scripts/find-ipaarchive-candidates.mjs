import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const databaseRoot = path.resolve(directory, "..");
const cacheRoot = path.join(databaseRoot, ".cache", "ipaarchive");
const indexPath = path.join(databaseRoot, "data", "index.json");
const archiveSearchUrl = "https://archive.org/advancedsearch.php";

function argumentValue(name) {
  const argument = process.argv.find((value) => value.startsWith(`${name}=`));
  return argument?.slice(name.length + 1) ?? null;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const limit = Math.min(100, positiveInteger(argumentValue("--limit"), 12));
const start = Math.max(0, positiveInteger(argumentValue("--start"), 1) - 1);
const titleFilter = argumentValue("--title")?.trim().toLowerCase() ?? "";
const includeTested = process.argv.includes("--include-tested");
const outputPath = argumentValue("--output");

function normalize(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function searchTitle(app) {
  const explicitTitle = app.searchTerms?.find((term) => normalize(term) === normalize(app.title));
  return explicitTitle || app.title;
}

function isBundleIdentifier(value) {
  const parts = value.split(".");
  return parts.length >= 2 && parts.every((part) => /^[a-z][a-z0-9_-]*$/i.test(part));
}

function queryFor(title) {
  // The collection also contains current sideloading tools. Restrict results
  // to software items in the named archive, then ask Archive.org for title
  // matches. The result is still a candidate: only an IPA's Info.plist can
  // prove a bundle identifier and version.
  const escapedTitle = title.replace(/(["\\])/g, "\\$1");
  return `collection:ipaarchive AND mediatype:software AND title:"${escapedTitle}"`;
}

function scoreCandidate(app, candidate) {
  const expected = normalize(searchTitle(app));
  const title = normalize(candidate.title ?? "");
  const identifier = normalize(candidate.identifier ?? "");
  if (!expected || !title) return 0;
  if (title === expected) return 100;
  if (title.includes(expected)) return 85;
  if (expected.includes(title) && title.length >= 6) return 70;

  const tokens = expected.split(" ").filter((token) => token.length >= 3);
  const matchedTokens = tokens.filter((token) => title.includes(token) || identifier.includes(token)).length;
  return tokens.length > 0 ? Math.round((matchedTokens / tokens.length) * 60) : 0;
}

async function searchArchive(app) {
  const params = new URLSearchParams({
    q: queryFor(searchTitle(app)),
    rows: "20",
    page: "1",
    output: "json",
  });
  for (const field of ["identifier", "title", "year", "downloads", "publicdate"]) {
    params.append("fl[]", field);
  }
  const response = await fetch(`${archiveSearchUrl}?${params}`, {
    headers: { "user-agent": "SuperDuperCompatibility candidate matcher (metadata only)" },
  });
  if (!response.ok) throw new Error(`Archive.org returned HTTP ${response.status} for ${app.title}`);
  const result = await response.json();
  const candidates = (result.response?.docs ?? [])
    .map((candidate) => ({
      identifier: candidate.identifier,
      title: candidate.title,
      year: candidate.year ?? null,
      downloads: Number(candidate.downloads ?? 0),
      publicDate: candidate.publicdate ?? null,
      score: scoreCandidate(app, candidate),
      itemUrl: `https://archive.org/details/${encodeURIComponent(candidate.identifier)}`,
    }))
    .filter((candidate) => candidate.identifier && candidate.score >= 30)
    .sort((left, right) => right.score - left.score || right.downloads - left.downloads)
    .slice(0, 5);

  return {
    id: app.id,
    title: app.title,
    bundleIds: (app.searchTerms ?? []).filter(isBundleIdentifier),
    versions: (app.searchTerms ?? []).filter((term) => /^\d+(?:\.\d+)+/.test(term)),
    sourceRecord: app.record ?? null,
    candidates,
  };
}

const catalogue = JSON.parse(await readFile(indexPath, "utf8"));
let apps = catalogue.apps
  .filter((app) => includeTested || (app.android?.records?.length ?? 0) === 0)
  .filter((app) => !titleFilter || normalize(app.title).includes(normalize(titleFilter)));

if (titleFilter && apps.length === 0) {
  throw new Error(`No catalogue app title contains "${titleFilter}".`);
}

apps = apps.slice(start, start + limit);
if (apps.length === 0) {
  throw new Error("No catalogue apps selected. Adjust --start, --limit, --title, or --include-tested.");
}

const matches = [];
for (const [index, app] of apps.entries()) {
  process.stdout.write(`Searching ${index + 1}/${apps.length}: ${app.title}\n`);
  try {
    matches.push(await searchArchive(app));
  } catch (error) {
    matches.push({
      id: app.id,
      title: app.title,
      bundleIds: [],
      versions: [],
      sourceRecord: app.record ?? null,
      candidates: [],
      error: error.message,
    });
  }
}

const result = {
  schemaVersion: 1,
  kind: "ipaarchive-candidate-search",
  generated: new Date().toISOString(),
  collection: {
    identifier: "ipaarchive",
    itemUrl: "https://archive.org/details/ipaarchive",
  },
  disclaimer: "Archive.org search results are metadata candidates only. Verify the IPA Info.plist, legal right to use the copy, bundle identifier and version before testing. Do not commit IPA archives or app assets to this repository.",
  matches,
};

const destination = outputPath
  ? path.resolve(process.cwd(), outputPath)
  : path.join(cacheRoot, "candidates.json");
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(result, null, 2)}\n`, "utf8");

const matchedApps = matches.filter((match) => match.candidates.length > 0);
console.log(`\nFound candidates for ${matchedApps.length}/${matches.length} selected catalogue apps.`);
for (const match of matchedApps) {
  const best = match.candidates[0];
  console.log(`${match.title} -> ${best.title} (score ${best.score}, ${best.itemUrl})`);
}
console.log(`Metadata queue written to ${destination}`);
