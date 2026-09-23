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

/**
 * Jev で付けるタグの語彙と、その語の「どこにでも付く度合い」(デモのルート40か所での平均)。
 *
 * Jev は文章を作れないので、Gemini が作ったタグから語彙を作り、当てはまるかだけを判定させる。
 * 0.3秒で返るので、Gemini(4〜20秒・無料枠 5回/分)が間に合わないときの代わりに使う。
 * 平均が高い語(都会・デート・写真映え…)は どこにでも付くので、平均との差で並べて
 * その場所ならではの語を上に出す(9/21 に固定15語をやめた理由が「どこも似たタグになる」だったため)。
 */
export const TAG_VOCAB = {
  混雑: 0.41, 並ぶ: 0.36, 静か: 0.51, 賑やか: 0.36, 落ち着く: 0.7, 屋外: 0.52, 屋内: 0.45, 歩く: 0.55,
  坂道: 0.17, 階段あり: 0.44, 広い: 0.41, 狭い: 0.26, 景色: 0.52, 夜景: 0.28, 高所: 0.38, 自然: 0.26,
  季節感: 0.5, 散歩: 0.43, 運動: 0.13, 体験型: 0.45, 観光: 0.67, 歴史: 0.27, レトロ: 0.24, 都会: 0.7,
  路地裏: 0.15, 穴場: 0.41, 隠れ家: 0.32, 写真映え: 0.7, おしゃれ: 0.47, デート: 0.7, 子連れ向き: 0.47,
  カフェ: 0.27, コーヒー: 0.23, 甘いもの: 0.21, 食事: 0.32, 和食: 0.1, ヘルシー: 0.31, 無料: 0.37,
  安い: 0.41, 高い: 0.36, 要予約: 0.11, 駅近: 0.56, 駐車場あり: 0.28, 休憩: 0.54, 長居できる: 0.61,
  短時間: 0.46, 接客注意: 0.16, 暗め: 0.28,
};

/** 当てはまると見なす確率と、平均からどれだけ上ならその場所らしいと見なすか */
const TAG_MIN = 0.6;
const TAG_LIFT = 0.15;

export async function tagWithJev(apiKey, candidate, count = 8) {
  const vocab = Object.keys(TAG_VOCAB);
  const questions = {};
  vocab.forEach((tag, i) => {
    questions[`t${i}`] = {
      type: "noul",
      instructions: `この場所は「${tag}」に当てはまるか?`,
      criteria: { true: `「${tag}」に当てはまる`, false: `「${tag}」には当てはまらない` },
    };
  });

  const res = await fetch(JEV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "jev-latest",
      state: {
        name: candidate.name,
        category: candidate.category,
        rating: candidate.rating,
        priceRange: candidate.priceRange,
        reviews: candidate.reviews,
      },
      questions,
    }),
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const answers = (await res.json()).answers ?? {};
  return pickDistinctTags(vocab.map((tag, i) => [tag, answers[`t${i}`]?.noul ?? 0]), count);
}

/** 当てはまる語のうち、平均より高く出たものを差の大きい順に。足りなければ確率の高い順で埋める */
export function pickDistinctTags(scored, count = 8) {
  const applies = scored.filter(([, v]) => v >= TAG_MIN);
  const lift = ([tag, v]) => v - (TAG_VOCAB[tag] ?? 0.5);
  const distinct = applies.filter((entry) => lift(entry) >= TAG_LIFT).sort((a, b) => lift(b) - lift(a));
  const rest = applies.filter((entry) => !distinct.includes(entry)).sort((a, b) => b[1] - a[1]);
  return [...distinct, ...rest].slice(0, count).map(([tag]) => tag);
}
