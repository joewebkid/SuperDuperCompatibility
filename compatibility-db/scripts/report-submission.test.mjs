import assert from "node:assert/strict";
import test from "node:test";
import { acceptedReport } from "../site/report-submission.mjs";

const url = "https://github.com/joewebkid/SuperDuperCompatibility/pull/42";

test("accepted new and repeated reports both return the same PR URL", () => {
  assert.deepEqual(acceptedReport(true, { pullRequestUrl: url, duplicate: false }), { url, duplicate: false });
  assert.deepEqual(acceptedReport(true, { pullRequestUrl: url, duplicate: true }), { url, duplicate: true });
});

test("HTTP failures and incomplete responses keep the form in retry state", () => {
  assert.throws(() => acceptedReport(false, { detail: "Попробуйте позже" }), /Попробуйте позже/);
  assert.throws(() => acceptedReport(true, {}), /не подтвердил/);
  assert.throws(() => acceptedReport(true, { pullRequestUrl: "https://example.com/pull/42" }), /не подтвердил/);
});
