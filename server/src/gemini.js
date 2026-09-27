const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
// 3.8-flash は無料枠が 1日20回しかない。lite は枠が広く、速く(4秒)、品質も十分
const MODEL = "gemini-3.1-flash-lite";

/**
 * その場所の特徴を表すタグを、口コミから都度作る。
 *
 * 固定リストから選ばせると、どの場所も似たタグになって選ぶ手がかりにならない。
 * Jev は判定専用でテキストを作れないので、ここだけ生成モデルを使う。
 */
export async function generateTags(apiKey, candidate, count = 10) {
  const instruction = [
    "ドライブ中の寄り道先を選ぶアプリで使う、この場所の特徴タグを作ってください。",
    `${count}個。日本語。1個は2〜5文字の短い語。`,
    ...TAG_RULES,
    "",
    describe(candidate),
  ].join("\n");

  const body = await callGemini(apiKey, instruction, {
    type: "object",
    properties: { tags: { type: "array", items: { type: "string" } } },
    required: ["tags"],
  }, 15000);
  const tags = findTags(body);
  if (!tags) throw new Error("Gemini の返答からタグを取り出せませんでした");
  return cleanTags(tags, count);
}

/**
 * 複数の場所のタグを1回の呼び出しでまとめて作る。返り値は 場所ID → タグ の Map(取れなかった場所は入らない)。
 * 無料枠は 5回/分なので、1件ずつ呼ぶとすぐ詰まる。5件まとめて約6.5秒(9/23 実測、1件ずつなら各4秒〜)
 */
export async function generateTagsBatch(apiKey, candidates, count = 10) {
  const byId = new Map(candidates.map((candidate) => [candidateId(candidate), candidate]));
  const instruction = [
    "ドライブ中の寄り道先を選ぶアプリで使う、各場所の特徴タグを作ってください。",
    `場所ごとに${count}個。日本語。1個は2〜5文字の短い語。id は下に書いたものをそのまま返す。`,
    ...TAG_RULES,
    "",
    ...[...byId].flatMap(([id, candidate]) => [`### id: ${id}`, describe(candidate), ""]),
  ].join("\n");

  const body = await callGemini(apiKey, instruction, {
    type: "object",
    properties: {
      places: {
        type: "array",
        items: {
          type: "object",
          properties: { id: { type: "string" }, tags: { type: "array", items: { type: "string" } } },
          required: ["id", "tags"],
        },
      },
    },
    required: ["places"],
  }, 25000);
  const places = findPlaces(body);
  if (!places) throw new Error("Gemini の返答から places を取り出せませんでした");

  const result = new Map();
  for (const place of places) {
    // 知らない id(書き換えられた id)は捨てる
    if (!byId.has(place?.id) || !Array.isArray(place.tags)) continue;
    const tags = cleanTags(place.tags, count);
    if (tags.length > 0) result.set(place.id, tags);
  }
  return result;
}

const TAG_RULES = [
  "",
  "大事な条件:",
  "- **大雑把なジャンル・性質のレベルにする。** 例: 和食, 魚, 甘いもの, 景色, 静か, 子連れ向き, 安い, 屋外",
  "- 細かすぎる特徴は入れない。",
  "  悪い例: 自家焙煎珈琲, 英語対応可, エレベーター完備, 常連客多め, 海上約47メートル",
  "  良い例: カフェ, 甘いもの, 落ち着く, 景色, 屋内",
  "- 店名・地名・施設名はタグにしない",
  "- どこにでも当てはまる語(おすすめ, 人気, 良い)は入れない",
  "- 良い点だけでなく、人によっては避けたくなる性質も入れる(例: 混む, 狭い, 高い, 歩く)",
  "- 同じ意味のタグを重複させない",
  "",
  "この粒度で、利用者が『これは好き』『これは嫌』と一目で判断できる語にしてください。",
];

const candidateId = (candidate) => String(candidate.id ?? candidate.placeId);

function describe(candidate) {
  return [
    `名前: ${candidate.name}`,
    `種別: ${candidate.category}`,
    candidate.rating ? `評価: ${candidate.rating} (${candidate.reviewCount ?? 0}件)` : null,
    candidate.priceRange ? `価格帯: ${candidate.priceRange}` : null,
    `寄り道: +${candidate.detourMinutes}分`,
    "",
    "口コミ:",
    ...(candidate.reviews ?? []).map((r, i) => `${i + 1}. ${r}`),
  ]
    .filter((l) => l !== null)
    .join("\n");
}

async function callGemini(apiKey, input, schema, timeoutMs) {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      input,
      // タグ付けは難しい仕事ではない。思考を減らして待ち時間を削る
      generation_config: { thinking_level: "low" },
      response_format: { type: "text", mime_type: "application/json", schema },
    }),
    // 無料枠は詰まりやすい。待たされるくらいならフォールバックに落とす
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** 念のため重複と長すぎるものを落とす */
function cleanTags(tags, count) {
  return [...new Set(tags.map((t) => String(t).trim()))]
    .filter((t) => t.length > 0 && t.length <= 12)
    .slice(0, count);
}

/** findTags と同じ考え方で、places の配列を探す */
export function findPlaces(node) {
  if (typeof node === "string") {
    if (!node.includes("places")) return null;
    try {
      const parsed = JSON.parse(node);
      return Array.isArray(parsed?.places) ? parsed.places : null;
    } catch {
      return null;
    }
  }
  if (Array.isArray(node)) {
    for (const v of node) {
      const found = findPlaces(v);
      if (found) return found;
    }
    return null;
  }
  if (node && typeof node === "object") {
    if (Array.isArray(node.places) && node.places.every((p) => p && typeof p === "object")) return node.places;
    for (const k of Object.keys(node)) {
      if (k === "usage" || k === "signature") continue;
      const found = findPlaces(node[k]);
      if (found) return found;
    }
  }
  return null;
}

/**
 * レスポンスの形が公開ドキュメントと食い違っていて、しかもバージョンで揺れる。
 * パスを決め打ちせず、JSON として tags を含む文字列を再帰的に探す。
 */
function findTags(node) {
  if (typeof node === "string") {
    if (!node.includes("tags")) return null;
    try {
      const parsed = JSON.parse(node);
      return Array.isArray(parsed?.tags) ? parsed.tags : null;
    } catch {
      return null;
    }
  }
  if (Array.isArray(node)) {
    for (const v of node) {
      const found = findTags(v);
      if (found) return found;
    }
    return null;
  }
  if (node && typeof node === "object") {
    if (Array.isArray(node.tags) && node.tags.every((t) => typeof t === "string")) {
      return node.tags;
    }
    for (const k of Object.keys(node)) {
      if (k === "usage" || k === "signature") continue;
      const found = findTags(node[k]);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Gemini が使えないときの保険。
 *
 * 無料枠は 5リクエスト/分で、混雑時には 503 も返る。
 * デモの最中にタグが空になるほうが問題なので、
 * 取れた情報だけから素朴なタグを作って必ず何かを返す。
 */
export function fallbackTags(candidate) {
  const tags = [];
  const cat = candidate.category ?? "";
  const text = (candidate.reviews ?? []).join(" ");

  if (cat) tags.push(cat);
  if (candidate.priceRange) tags.push(candidate.priceRange);
  if ((candidate.rating ?? 0) >= 4.3) tags.push("評価が高い");
  if ((candidate.reviewCount ?? 0) >= 1000) tags.push("有名");
  if (candidate.detourMinutes <= 20) tags.push("寄りやすい");

  const hints = [
    ["景色", "景色がいい"], ["眺め", "眺めがいい"], ["夜景", "夜景"],
    ["静か", "静か"], ["混", "混む"], ["並", "並ぶ"],
    ["駐車", "駐車場あり"], ["広い", "広い"], ["狭い", "狭い"],
    ["階段", "階段がある"], ["子ども", "子連れ向き"], ["子供", "子連れ向き"],
    ["安い", "安い"], ["美味", "おいしい"], ["おいし", "おいしい"],
  ];
  for (const [needle, tag] of hints) {
    if (text.includes(needle) && !tags.includes(tag)) tags.push(tag);
  }

  return tags.slice(0, 10);
}
