const JEV_URL = "https://api.typesafe.ai/v1/systemone";

/**
 * 残りの候補から次に見せる1件を選ばせる。
 *
 * Jev はテキストを作れないが「選ぶ」のは得意で速い(0.3秒)。
 * タグの生成は Gemini、次の1件の選択は Jev、と役割を分けている。
 *
 * choice は最大255択。候補が多いときは先に絞ってから渡す。
 */
export async function pickNext(apiKey, candidates, opts = {}) {
  const { request = "", badTags = [], goodTags = [], notes = [] } = opts;

  const pool = candidates.slice(0, 40);
  if (pool.length === 0) return null;
  if (pool.length === 1) return { id: pool[0].id, confidence: 1 };

  const criteria = {};
  for (const c of pool) {
    criteria[c.id] = [
      c.name,
      c.category,
      c.rating ? `評価${c.rating}` : "",
      c.priceRange ?? "",
      `寄り道+${c.detourMinutes}分`,
      (c.reviews?.[0] ?? "").slice(0, 60),
    ]
      .filter(Boolean)
      .join(" / ");
  }

  const res = await fetch(JEV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "jev-latest",
      state: {
        userRequest: request || "特に希望なし",
        wants: goodTags,
        avoid: badTags,
        notes,
      },
      questions: {
        next: {
          type: "choice",
          instructions:
            "ユーザーが良いと言った特徴に近く、避けたい特徴や条件に当てはまらない寄り道先はどれか",
          criteria,
        },
      },
    }),
  });

  if (!res.ok) throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const a = (await res.json()).answers?.next;
  return { id: a?.choice, confidence: a?.confidence ?? null, probabilities: a?.probabilities };
}
