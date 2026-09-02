const VALID_STATUSES = new Set(["unknown", "blocked", "partial", "issues", "verified"]);
const VALID_SOURCES = new Set(["none", "superduper", "touchhle", "community"]);

export function statusFromTouchHleRating(rating) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return "unknown";
  if (rating === 1) return "blocked";
  if (rating <= 3) return "partial";
  // External reports can remove an unknown badge, but only a reviewed
  // Super Duper run is allowed to produce the green verified badge.
  return "issues";
}

export function statusFromCommunityEvidence(status) {
  if (status === "launch-failed") return "blocked";
  if (status === "launch-confirmed" || status === "gameplay-blocked") return "partial";
  if (status === "gameplay-confirmed" || status === "gameplay-with-issues") return "issues";
  return "unknown";
}

function dateValue(value) {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function externalRank(status) {
  return { unknown: 0, blocked: 1, partial: 2, issues: 3 }[status] ?? 0;
}

/**
 * Resolve the launcher badge for one exact bundle-id/version pair.
 *
 * Super Duper evidence is authoritative. Otherwise the strongest exact
 * external observation is shown conservatively and can never become green.
 */
export function aggregateCompatibility({ superDuper = [], touchHle = [], community = [] }) {
  const reviewed = superDuper
    .filter((entry) => VALID_STATUSES.has(entry.status) && entry.status !== "unknown")
    .toSorted((left, right) => dateValue(right.updated) - dateValue(left.updated));
  const external = [
    ...touchHle.map((entry) => ({
      status: statusFromTouchHleRating(entry.rating),
      rating: Number.isInteger(entry.rating) ? entry.rating : null,
      updated: entry.reported ?? null,
      source: "touchhle",
    })),
    ...community.map((entry) => ({
      status: statusFromCommunityEvidence(entry.status),
      rating: null,
      updated: entry.reported ?? null,
      source: "community",
    })),
  ].filter((entry) => entry.status !== "unknown");

  if (reviewed.length > 0) {
    const winner = reviewed[0];
    return {
      status: winner.status,
      rating: Number.isInteger(winner.rating) ? winner.rating : null,
      updated: winner.updated ?? null,
      source: "superduper",
      evidenceSources: [...new Set(["superduper", ...external.map((entry) => entry.source)])],
      evidenceCount: superDuper.length + external.length,
    };
  }

  const candidates = external.toSorted((left, right) =>
    externalRank(right.status) - externalRank(left.status) ||
      dateValue(right.updated) - dateValue(left.updated));
  if (candidates.length === 0) {
    return {
      status: "unknown",
      rating: null,
      updated: null,
      source: "none",
      evidenceSources: [],
      evidenceCount: 0,
    };
  }
  const winner = candidates[0];
  return {
    ...winner,
    evidenceSources: [...new Set(candidates.map((entry) => entry.source))],
    evidenceCount: candidates.length,
  };
}

export function validateAndroidIndex(index) {
  if (index?.schemaVersion !== 2) throw new Error("android-index must use schemaVersion 2");
  if (!Array.isArray(index.records)) throw new Error("android-index records must be an array");
  const keys = new Set();
  for (const [position, record] of index.records.entries()) {
    const label = `android-index record ${position}`;
    if (typeof record.bundleId !== "string" || !record.bundleId.trim()) throw new Error(`${label}: missing bundleId`);
    if (typeof record.version !== "string" || !record.version.trim()) throw new Error(`${label}: missing version`);
    if (typeof record.title !== "string" || !record.title.trim()) throw new Error(`${label}: missing title`);
    if (!VALID_STATUSES.has(record.status)) throw new Error(`${label}: invalid status`);
    if (!VALID_SOURCES.has(record.source)) throw new Error(`${label}: invalid source`);
    if (!Array.isArray(record.evidenceSources) || record.evidenceSources.some((source) => !VALID_SOURCES.has(source) || source === "none")) {
      throw new Error(`${label}: invalid evidenceSources`);
    }
    if (!Number.isInteger(record.evidenceCount) || record.evidenceCount < 0) throw new Error(`${label}: invalid evidenceCount`);
    if (record.rating !== null && (!Number.isInteger(record.rating) || record.rating < 1 || record.rating > 5)) {
      throw new Error(`${label}: invalid rating`);
    }
    if (record.status === "verified" && record.source !== "superduper") {
      throw new Error(`${label}: external evidence cannot produce verified`);
    }
    const key = `${record.bundleId.toLowerCase()}\u0000${record.version}`;
    if (keys.has(key)) throw new Error(`${label}: duplicate exact version`);
    keys.add(key);
  }
  return index;
}
