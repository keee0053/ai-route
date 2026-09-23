// デモで使うルートの結果をサーバのキャッシュに載せておく。
//   node warm-cache.mjs
//   ONLY=サイボウズ node warm-cache.mjs   (1ルートだけ)
//
// 当日 Places や Gemini がレート制限・障害を起こしても、
// 温めておいたルートは キャッシュから返るので影響を受けない。

const BASE = "https://ekz-server.prizmprograms.workers.dev";

/** デモで使うルート。増やしたらここに足す */
const ROUTES = [
  // 9/27 デモデイ: 発表会場(サイボウズ大阪)の現在地 → キックオフ会場(ストライク・京都 烏丸四条)
  { name: "サイボウズ大阪 → ストライク京都", origin: "大阪府大阪市北区角田町8-1 大阪梅田ツインタワーズ・ノース", destination: "35.0048188,135.759705", tagsPerGenre: { any: 30 } },
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

// ONLY=サイボウズ のように名前の一部を渡すと、そのルートだけ温める
const only = process.env.ONLY;
for (const route of ROUTES.filter((r) => !only || r.name.includes(only))) {
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

    const tagCount = route.tagsPerGenre?.[genre ?? "any"] ?? TAGS_PER_GENRE;
    for (const c of search.candidates.slice(0, tagCount)) {
      const startedAt = Date.now();
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
      // 無料枠に配慮して間隔を空ける。すぐ返った(キャッシュ済み)ときは待たない
      if (Date.now() - startedAt > 1500) await sleep(12000);
    }
  }
}

console.log(`\n生成 ${generated} 件 / 失敗 ${failed} 件`);
console.log("もう一度実行して、すべて即座に返れば温まっている");
