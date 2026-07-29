import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const databaseRoot = path.resolve(directory, "..");
const dataRoot = path.join(databaseRoot, "data");
const statuses = new Set(["unknown", "partial", "verified", "issues", "blocked"]);

async function jsonFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) return jsonFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".json") ? [entryPath] : [];
  }))).flat();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const index = JSON.parse(await readFile(path.join(dataRoot, "index.json"), "utf8"));
assert(index.schemaVersion === 1, "index.json must use schemaVersion 1");
assert(Array.isArray(index.games), "index.json must contain a games array");

const profileIds = new Set();
const profilePaths = await jsonFiles(path.join(dataRoot, "profiles"));
for (const profilePath of profilePaths) {
  const profile = JSON.parse(await readFile(profilePath, "utf8"));
  assert(profile.schemaVersion === 1, `${profilePath}: unsupported schemaVersion`);
  assert(typeof profile.id === "string" && profile.id.length > 0, `${profilePath}: missing id`);
  assert(!profileIds.has(profile.id), `${profilePath}: duplicate profile id ${profile.id}`);
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
  if (game.recommendedProfile) assert(profileIds.has(game.recommendedProfile), `${label}: unknown profile`);
  const key = `${game.bundleId}@${game.version}`;
  assert(!gameKeys.has(key), `${label}: duplicate game/version ${key}`);
  gameKeys.add(key);
}

for (const game of index.games) {
  assert(typeof game.bundleId === "string", "index entry: missing bundleId");
  assert(typeof game.title === "string", "index entry: missing title");
  assert(statuses.has(game.overallStatus), `index ${game.bundleId}: invalid overallStatus`);
  if (game.recommendedProfile) assert(profileIds.has(game.recommendedProfile), `index ${game.bundleId}: unknown profile`);
}

console.log(`Validated ${gamePaths.length} game record(s) and ${profilePaths.length} profile(s).`);
