import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const databaseRoot = path.resolve(directory, "..");
const dataRoot = path.join(databaseRoot, "data");
const statuses = new Set(["unknown", "partial", "verified", "issues", "blocked"]);

async function jsonFiles(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return (await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) return jsonFiles(entryPath);
      return entry.isFile() && entry.name.endsWith(".json") ? [entryPath] : [];
    }))).flat();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isRating(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

async function requireFile(relativePath) {
  const fullPath = path.join(dataRoot, relativePath);
  try {
    await stat(fullPath);
  } catch {
    throw new Error(`Missing record referenced by index: data/${relativePath}`);
  }
}

const index = JSON.parse(await readFile(path.join(dataRoot, "index.json"), "utf8"));
assert(index.schemaVersion === 2, "index.json must use schemaVersion 2");
assert(index.platform === "Android", "index.json must be Android-only");
assert(Array.isArray(index.apps) && index.apps.length > 0, "index.json must contain apps");
assert(index.attribution?.licence === "CC BY 4.0 International", "index.json must preserve source attribution");

const profileIds = new Set();
const profilePaths = await jsonFiles(path.join(dataRoot, "profiles"));
for (const profilePath of profilePaths) {
  const profile = JSON.parse(await readFile(profilePath, "utf8"));
  assert(profile.schemaVersion === 1, `${profilePath}: unsupported schemaVersion`);
  assert(typeof profile.id === "string" && profile.id.length > 0, `${profilePath}: missing id`);
  assert(!profileIds.has(profile.id), `${profilePath}: duplicate profile id`);
  profileIds.add(profile.id);
}

const gameKeys = new Set();
const gamePaths = await jsonFiles(path.join(dataRoot, "games"));
for (const gamePath of gamePaths) {
  const game = JSON.parse(await readFile(gamePath, "utf8"));
  const label = path.relative(databaseRoot, gamePath);
  assert(game.schemaVersion === 1, `${label}: unsupported schemaVersion`);
  assert(typeof game.bundleId === "string" && game.bundleId.length >= 3, `${label}: missing bundleId`);
  assert(typeof game.title === "string" && game.title.length > 0, `${label}: missing title`);
  assert(typeof game.version === "string" && game.version.length > 0, `${label}: missing version`);
  assert(statuses.has(game.overallStatus), `${label}: invalid overallStatus`);
  assert(game.milestones && typeof game.milestones === "object", `${label}: missing milestones`);
  for (const [milestone, status] of Object.entries(game.milestones)) {
    assert(statuses.has(status), `${label}: invalid ${milestone} status`);
  }
  if (game.androidRating !== undefined) assert(isRating(game.androidRating), `${label}: invalid androidRating`);
  if (game.screenshots !== undefined) {
    assert(Array.isArray(game.screenshots), `${label}: screenshots must be an array`);
    for (const screenshot of game.screenshots) {
      assert(typeof screenshot.url === "string" && /^https:\/\//.test(screenshot.url), `${label}: screenshot must use an HTTPS URL`);
    }
  }
  if (game.recommendedProfile) assert(profileIds.has(game.recommendedProfile), `${label}: unknown profile`);
  const key = `${game.bundleId}@${game.version}`;
  assert(!gameKeys.has(key), `${label}: duplicate game/version ${key}`);
  gameKeys.add(key);
}

const sourcePaths = await jsonFiles(path.join(dataRoot, "source", "touchhle", "apps"));
assert(sourcePaths.length > 0, "No imported touchHLE source records found. Run import-touchhle.mjs.");
for (const sourcePath of sourcePaths) {
  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  const label = path.relative(databaseRoot, sourcePath);
  assert(source.schemaVersion === 1 && source.kind === "touchHLE-android-reference", `${label}: invalid source record`);
  assert(typeof source.source?.appUrl === "string" && source.source.appUrl.startsWith("https://appdb.touchhle.org/apps/"), `${label}: missing source URL`);
  assert(source.source?.licence === "CC BY 4.0 International", `${label}: source licence must be retained`);
  assert(source.source?.screenshotsMirrored === false, `${label}: source screenshots must not be mirrored`);
  assert(typeof source.app?.title === "string" && source.app.title.length > 0, `${label}: missing app title`);
  assert(Array.isArray(source.versions), `${label}: versions must be an array`);
  assert(Array.isArray(source.androidReferenceReports), `${label}: Android reference reports must be an array`);
  for (const report of source.androidReferenceReports) {
    assert(/^android\b/i.test(report.operatingSystem), `${label}: non-Android report imported`);
    assert(report.rating === null || isRating(report.rating), `${label}: invalid reference rating`);
    assert(report.hasSourceScreenshot === false || /^https:\/\/appdb\.touchhle\.org\/reports\/\d+\/screenshot$/.test(report.sourceScreenshotUrl), `${label}: invalid source screenshot URL`);
  }
}

const indexIds = new Set();
for (const app of index.apps) {
  assert(typeof app.id === "string" && app.id.length > 0, "index app: missing id");
  assert(!indexIds.has(app.id), `index app: duplicate id ${app.id}`);
  indexIds.add(app.id);
  assert(typeof app.title === "string" && app.title.length > 0, `index ${app.id}: missing title`);
  assert(Array.isArray(app.searchTerms), `index ${app.id}: missing search terms`);
  assert(statuses.has(app.android?.overallStatus), `index ${app.id}: invalid Android status`);
  assert(app.android.bestRating === null || isRating(app.android.bestRating), `index ${app.id}: invalid Android rating`);
  assert(Array.isArray(app.android.records), `index ${app.id}: missing Android records`);
  for (const record of app.android.records) await requireFile(record);
  if (app.record) await requireFile(app.record);
}

console.log(`Validated ${index.apps.length} catalogue app(s), ${sourcePaths.length} imported source record(s), ${gamePaths.length} Super Duper Android record(s), and ${profilePaths.length} profile(s).`);
