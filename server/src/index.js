import { computeRoute, searchAlongRoute, proxyPhoto, DEFAULT_QUERIES } from "./google.js";
import { tagCandidate, pickNext, TAGS } from "./jev.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const fail = (message, status = 500) => json({ error: message }, status);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      switch (`${request.method} ${url.pathname}`) {
        case "GET /":
          return json({
            name: "ekz-server",
            endpoints: ["POST /search", "POST /tag", "POST /next", "GET /photo"],
            tags: TAGS.map((t) => t.label),
          });

        case "POST /search":
          return await handleSearch(request, env, ctx);

        case "POST /tag":
          return await handleTag(request, env);

        case "POST /next":
          return await handleNext(request, env);

        case "GET /photo":
          return await handlePhoto(url, env);

        default:
          return fail("not found", 404);
      }
    } catch (e) {
      return fail(e.message ?? String(e));
    }
  },
};

/**
 * POST /search
 *   { origin: "35.0,135.7" | "京都駅", destination: "...", queries?: [...] }
 * ルートを引いて、沿線の候補をまとめて返す。
 *
 * 同じルートは何度も試すので、Cloudflare のキャッシュに入れておく。
 * これをやらないと Places の無料枠(1,000/月)をすぐ使い切る。
 */
async function handleSearch(request, env, ctx) {
  const body = await request.json();
  const { origin, destination, queries } = body;
  if (!origin || !destination) return fail("origin と destination が必要です", 400);

  const cacheKey = new Request(
    `https://ekz.cache/search?o=${encodeURIComponent(origin)}&d=${encodeURIComponent(destination)}&q=${encodeURIComponent((queries ?? DEFAULT_QUERIES).join("|"))}`,
  );
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const route = await computeRoute(env.GOOGLE_MAPS_SERVER_KEY, origin, destination);
  const found = await searchAlongRoute(
    env.GOOGLE_MAPS_SERVER_KEY,
    route.polyline,
    queries ?? DEFAULT_QUERIES,
  );
  const candidates = found.candidates;

  candidates.sort((a, b) => a.detourMinutes - b.detourMinutes);

  const res = json({
    baseMinutes: route.baseMinutes,
    distanceKm: route.distanceKm,
    count: candidates.length,
    rawCount: found.rawCount,
    errors: found.errors,
    perQuery: found.perQuery,
    polylineLength: found.polylineLength,
    candidates,
  });
  // 6時間キャッシュ
  const cached = new Response(res.body, res);
  cached.headers.set("Cache-Control", "public, max-age=21600");
  ctx.waitUntil(cache.put(cacheKey, cached.clone()));
  return cached;
}

/**
 * POST /tag
 *   { candidate: {...} }  または  { candidates: [ {...}, ... ] }
 * Jev で15タグを判定する。
 */
async function handleTag(request, env) {
  const body = await request.json();
  const list = body.candidates ?? (body.candidate ? [body.candidate] : []);
  if (list.length === 0) return fail("candidate が必要です", 400);
  if (list.length > 10) return fail("一度に渡せるのは10件までです", 400);

  const results = await Promise.all(list.map((c) => tagCandidate(env.TYPESAFE_API_KEY, c)));
  return json({ results });
}

/**
 * POST /next
 *   { candidates: [...], request?: "甘いものが食べたい", badTags?: ["並ぶ"] }
 * 次に見せる1件を Jev に選ばせる。
 */
async function handleNext(request, env) {
  const body = await request.json();
  if (!Array.isArray(body.candidates)) return fail("candidates が必要です", 400);

  const picked = await pickNext(env.TYPESAFE_API_KEY, body.candidates, {
    request: body.request ?? "",
    badTags: body.badTags ?? [],
  });
  return json(picked ?? { id: null });
}

/**
 * GET /photo?name=places/xxx/photos/yyy
 * Places の写真を中継する。APIキーを端末に出さないため。
 */
async function handlePhoto(url, env) {
  const name = url.searchParams.get("name");
  if (!name || !name.startsWith("places/")) return fail("name が不正です", 400);

  const upstream = await proxyPhoto(env.GOOGLE_MAPS_SERVER_KEY, name);
  if (!upstream.ok) return fail(`photo ${upstream.status}`, upstream.status);

  const res = new Response(upstream.body, upstream);
  res.headers.set("Cache-Control", "public, max-age=86400");
  return res;
}
