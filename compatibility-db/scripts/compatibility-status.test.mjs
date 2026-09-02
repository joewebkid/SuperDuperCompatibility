import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateCompatibility,
  statusFromCommunityEvidence,
  statusFromTouchHleRating,
  validateAndroidIndex,
} from "./compatibility-status.mjs";

test("touchHLE ratings map to conservative non-green badges", () => {
  assert.equal(statusFromTouchHleRating(1), "blocked");
  assert.equal(statusFromTouchHleRating(2), "partial");
  assert.equal(statusFromTouchHleRating(3), "partial");
  assert.equal(statusFromTouchHleRating(4), "issues");
  assert.equal(statusFromTouchHleRating(5), "issues");
});

test("community gameplay confirmation remains yellow", () => {
  assert.equal(statusFromCommunityEvidence("launch-failed"), "blocked");
  assert.equal(statusFromCommunityEvidence("launch-confirmed"), "partial");
  assert.equal(statusFromCommunityEvidence("gameplay-blocked"), "partial");
  assert.equal(statusFromCommunityEvidence("gameplay-confirmed"), "issues");
});

test("reviewed Super Duper result overrides external evidence", () => {
  const result = aggregateCompatibility({
    superDuper: [{ status: "blocked", rating: 1, updated: "2026-09-01" }],
    touchHle: [{ rating: 5, reported: "2026-09-02" }],
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.source, "superduper");
});

test("only Super Duper can produce verified", () => {
  const external = aggregateCompatibility({
    touchHle: [{ rating: 5, reported: "2026-09-02" }],
    community: [{ status: "gameplay-confirmed", reported: "2026-09-01" }],
  });
  assert.equal(external.status, "issues");
  assert.notEqual(external.status, "verified");

  const reviewed = aggregateCompatibility({
    superDuper: [{ status: "verified", rating: 5, updated: "2026-09-02" }],
  });
  assert.equal(reviewed.status, "verified");
  assert.equal(reviewed.source, "superduper");
});

test("android index rejects external green records", () => {
  assert.throws(() => validateAndroidIndex({
    schemaVersion: 2,
    records: [{
      bundleId: "com.example.game",
      version: "1.0",
      title: "Example",
      status: "verified",
      rating: 5,
      updated: "2026-09-02",
      catalogueId: null,
      source: "touchhle",
      evidenceSources: ["touchhle"],
      evidenceCount: 1,
    }],
  }), /cannot produce verified/);
});
