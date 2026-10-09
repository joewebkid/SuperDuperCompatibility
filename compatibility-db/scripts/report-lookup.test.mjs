import assert from "node:assert/strict";
import test from "node:test";
import { knownGames, suggestedBundles, suggestedIdentity } from "../site/report-lookup.mjs";

test("only an unambiguous catalogue title fills the report identity", () => {
  const games = knownGames([
    { title: "Game A", bundleId: "com.example.a", version: "1.0" },
    { title: "Game A", bundleId: "com.example.a", version: "2.0" },
    { title: "Game B", bundleId: "com.example.b", version: "3.0" },
    { title: "Game C", bundleId: "com.one.c", version: "1.0" },
    { title: "Game C", bundleId: "com.two.c", version: "1.0" },
    { title: "Bad", bundleId: "1.0.0", version: "1.0" },
  ]);
  assert.deepEqual(suggestedIdentity(games, " game a "), { bundle: "com.example.a", version: "" });
  assert.deepEqual(suggestedIdentity(games, "Game B"), { bundle: "com.example.b", version: "3.0" });
  assert.equal(suggestedIdentity(games, "Game C"), null);
  assert.deepEqual(suggestedBundles(games, "Game C"), ["com.one.c", "com.two.c"]);
  assert.deepEqual(suggestedBundles(games, "Unknown"), []);
  assert.equal(suggestedIdentity(games, "Bad"), null);
});
