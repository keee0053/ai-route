const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MODEL = "gemini-3.8-flash";

/**
 * その場所の特徴を表すタグを、口コミから都度作る。
 *
 * 固定リストから選ばせると、どの場所も似たタグになって選ぶ手がかりにならない。
 * Jev は判定専用でテキストを作れないので、ここだけ生成モデルを使う。
 */
export async function generateTags(apiKey, candidate, count = 10) {
  const state = [
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

  const instruction = [
    "ドライブ中の寄り道先を選ぶアプリで使う、この場所の特徴タグを作ってください。",
    `${count}個。日本語。1個は2〜7文字程度の短い語句。`,
    "",
    "条件:",
    "- 口コミから読み取れる具体的な特徴を優先する(例: 夜景がきれい, 駐車場が広い, 席が多い)",
    "- どこにでも当てはまる語(例: おすすめ, 人気, 良い)は入れない",
    "- 店名や地名はタグにしない",
    "- 良い点だけでなく、利用者が避けたくなる特徴も入れる(例: 階段が多い, 狭い, 混む)",
    "- 同じ意味のタグを重複させない",
    "",
    state,
  ].join("\n");

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      input: instruction,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: {
          type: "object",
          properties: { tags: { type: "array", items: { type: "string" } } },
          required: ["tags"],
        },
      },
    }),
  });

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const body = await res.json();
  const text = extractText(body);
  if (!text) throw new Error("Gemini が空を返しました");

  const tags = JSON.parse(text).tags ?? [];
  // 念のため重複と長すぎるものを落とす
  return [...new Set(tags.map((t) => String(t).trim()))]
    .filter((t) => t.length > 0 && t.length <= 12)
    .slice(0, count);
}

/** レスポンスの形がバージョンで揺れるので、いくつかの置き場所を見る */
function extractText(body) {
  return (
    body.output_text ??
    body.output?.[0]?.content?.[0]?.text ??
    body.candidates?.[0]?.content?.parts?.[0]?.text ??
    null
  );
}
