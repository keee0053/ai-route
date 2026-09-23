import assert from "node:assert/strict";
import test from "node:test";
import { pickDistinctTags } from "../src/jev.js";

test("pickDistinctTags prefers tags that stand out from their usual score", () => {
  // 都会・デートは どこでも0.7前後なので、0.8でも目立たない。和食(平均0.1)の0.9は目立つ
  const tags = pickDistinctTags([["都会", 0.8], ["デート", 0.75], ["和食", 0.9], ["要予約", 0.7], ["静か", 0.3]], 3);
  assert.deepEqual(tags, ["和食", "要予約", "都会"]);
});

test("pickDistinctTags drops tags below the threshold", () => {
  assert.deepEqual(pickDistinctTags([["夜景", 0.59], ["静か", 0.2]]), []);
});
