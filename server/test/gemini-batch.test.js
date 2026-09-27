import assert from "node:assert/strict";
import test from "node:test";
import { findPlaces, generateTagsBatch } from "../src/gemini.js";

test("generateTagsBatch sends every place in one call and keeps only known ids", async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    const text = JSON.stringify({ places: [
      { id: "a", tags: ["カフェ", "静か", "カフェ", "とても長すぎるタグの名前です"] },
      { id: "b", tags: ["景色"] },
      { id: "zzz", tags: ["知らない"] },
    ] });
    return new Response(JSON.stringify({ steps: [{ type: "model_output", content: [{ type: "text", text }] }] }));
  };
  try {
    const result = await generateTagsBatch("KEY", [
      { id: "a", name: "喫茶", category: "カフェ", detourMinutes: 3 },
      { id: "b", name: "展望台", category: "展望台", detourMinutes: 5 },
    ]);
    assert.equal(calls.length, 1);
    assert.match(calls[0].input, /### id: a[\s\S]*### id: b/);
    assert.deepEqual(result.get("a"), ["カフェ", "静か"]);
    assert.deepEqual(result.get("b"), ["景色"]);
    assert.equal(result.has("zzz"), false);
  } finally {
    globalThis.fetch = original;
  }
});

test("findPlaces finds the places array inside a JSON string", () => {
  assert.deepEqual(findPlaces({ outputs: [{ text: '{"places":[{"id":"x","tags":[]}]}' }] }), [{ id: "x", tags: [] }]);
  assert.equal(findPlaces({ text: "no json" }), null);
});
