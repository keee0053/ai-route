const JEV_URL = "https://api.typesafe.ai/v1/systemone";

/**
 * 固定15タグ。Android 側の Tag enum と同じ並び。ここを変えたら両方直す。
 */
export const TAGS = [
  { id: "quiet", label: "静か", yes: "静かで落ち着ける", no: "騒がしい" },
  { id: "lively", label: "賑やか", yes: "活気があり人が多い", no: "閑散としている" },
  { id: "queue", label: "並ぶ", yes: "行列や待ち時間がある", no: "待たずに入れる" },
  { id: "no_wait", label: "すぐ入れる", yes: "待たずに利用できる", no: "待つことがある" },
  { id: "meal", label: "食事", yes: "食事ができる", no: "食事はできない" },
  { id: "sweets", label: "甘いもの", yes: "スイーツや甘い物がある", no: "甘い物は無い" },
  { id: "snack", label: "軽食", yes: "軽く食べられる", no: "軽食は無い" },
  { id: "outdoor", label: "屋外", yes: "屋外である", no: "屋内である" },
  { id: "indoor", label: "屋内", yes: "屋内である", no: "屋外である" },
  { id: "view", label: "景色がいい", yes: "景色や眺めが良い", no: "景色は特筆すべきでない" },
  { id: "photogenic", label: "映える", yes: "写真映えする", no: "写真映えはしない" },
  { id: "expensive", label: "高い", yes: "価格が高め", no: "価格は高くない" },
  { id: "cheap", label: "安い", yes: "安く利用できる", no: "安くはない" },
  { id: "short", label: "短時間", yes: "短時間で済ませられる", no: "時間がかかる" },
  { id: "long_stay", label: "長居できる", yes: "長くいられる", no: "長居には向かない" },
];

/** 判定をタグとして採用するしきい値 */
const THRESHOLD = 0.6;

/**
 * 候補1件に15個のタグを付ける。
 * Jev は同じ state に対して質問を並列・独立に評価するので、1リクエストで済む。
 */
export async function tagCandidate(apiKey, candidate) {
  const questions = {};
  for (const t of TAGS) {
    questions[t.id] = {
      type: "noul",
      instructions: `この場所は「${t.label}」に当てはまるか?`,
      criteria: { true: t.yes, false: t.no },
    };
  }

  const res = await fetch(JEV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "jev-latest",
      state: {
        name: candidate.name,
        category: candidate.category,
        rating: candidate.rating,
        reviewCount: candidate.reviewCount,
        priceRange: candidate.priceRange,
        detourMinutes: candidate.detourMinutes,
        reviews: candidate.reviews,
      },
      questions,
    }),
  });

  if (!res.ok) throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const body = await res.json();
  const tags = [];
  const scores = {};
  for (const t of TAGS) {
    const v = body.answers?.[t.id]?.noul ?? 0;
    scores[t.id] = +v.toFixed(3);
    if (v >= THRESHOLD) tags.push(t.label);
  }

  return { id: candidate.id, tags, scores, usage: body.usage };
}

/**
 * 残りの候補から次に見せる1件を選ばせる。
 * choice は最大255択なので、候補が多いときは評価順に絞ってから渡す。
 */
export async function pickNext(apiKey, candidates, { request = "", badTags = [] } = {}) {
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
        avoid: badTags,
      },
      questions: {
        next: {
          type: "choice",
          instructions:
            "ユーザーの希望に一番合い、避けたい条件に当てはまらない寄り道先はどれか",
          criteria,
        },
      },
    }),
  });

  if (!res.ok) throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const a = (await res.json()).answers?.next;
  return { id: a?.choice, confidence: a?.confidence ?? null, probabilities: a?.probabilities };
}
