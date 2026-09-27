import assert from "node:assert/strict";
import test from "node:test";
import { queriesForGenre } from "../src/google.js";

test("default place queries fit the selected travel mode", () => {
  assert.ok(queriesForGenre(undefined, "DRIVE").includes("道の駅"));
  assert.ok(queriesForGenre(undefined, "BICYCLE").includes("サイクルステーション"));
  assert.ok(queriesForGenre(undefined, "WALK").includes("ベーカリー"));
  assert.ok(!queriesForGenre(undefined, "WALK").includes("道の駅"));
});

test("rest queries avoid service areas for walking and cycling", () => {
  assert.ok(queriesForGenre("rest", "DRIVE").includes("サービスエリア"));
  assert.ok(!queriesForGenre("rest", "WALK").includes("サービスエリア"));
  assert.ok(!queriesForGenre("rest", "BICYCLE").includes("サービスエリア"));
});

test("combined genres search with every selected genre's queries", () => {
  const queries = queriesForGenre("sweets+view", "DRIVE");
  assert.ok(queries.includes("カフェ"));
  assert.ok(queries.includes("展望台"));
  assert.equal(new Set(queries).size, queries.length);
  assert.ok(!queriesForGenre("sweets+rest", "WALK").includes("サービスエリア"));
});
