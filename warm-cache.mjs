// デモで使うルートの結果をサーバのキャッシュに載せておく。
//   node warm-cache.mjs
//
// 当日 Places や Gemini がレート制限・障害を起こしても、
// 温めておいたルートは キャッシュから返るので影響を受けない。

const BASE = "https://ekz-server.prizmprograms.workers.dev";

/** デモで使うルート。増やしたらここに足す */
const ROUTES = [
  { name: "京都 → 舞子海上プロムナード", origin: "35.0048188,135.759705", destination: "34.6311072,135.0333283" },
];

const GENRES = [null, "meal", "sweets", "view", "sightseeing", "rest"];

/** 1ジャンルあたり、上から何件分のタグを作っておくか */
const TAGS_PER_GENRE = 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
  return res.json();
}

let generated = 0;
let cached = 0;
let failed = 0;

for (const route of ROUTES) {
  console.log(`\n=== ${route.name} ===`);

  for (const genre of GENRES) {
    const label = genre ?? "おまかせ";
    let search;
    try {
      search = await post("/search", { origin: route.origin, destination: route.destination, genre });
    } catch (e) {
      console.log(`  ${label.padEnd(12)} 検索に失敗: ${e.message}`);
      failed++;
      continue;
    }
    console.log(`  ${label.padEnd(12)} 候補 ${search.count} 件 (基準 ${search.baseMinutes}分)`);

    for (const c of search.candidates.slice(0, TAGS_PER_GENRE)) {
      try {
        const r = await post("/tag", { candidate: c });
        if (r.source === "gemini") {
          generated++;
          console.log(`      生成   ${c.name}  [${r.tags.slice(0, 5).join(" / ")}]`);
        } else {
          failed++;
          console.log(`      失敗   ${c.name}  (${(r.reason ?? "").slice(0, 60)})`);
        }
      } catch (e) {
        failed++;
        console.log(`      失敗   ${c.name}  ${e.message}`);
      }
      // 無料枠に配慮して間隔を空ける
      await sleep(4000);
    }
  }
}

console.log(`\n生成 ${generated} 件 / 失敗 ${failed} 件`);
console.log("もう一度実行して、すべて即座に返れば温まっている");
