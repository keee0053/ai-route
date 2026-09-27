import { computeRoute, findPlace, searchAlongRoute, proxyPhoto, queriesForGenre } from "./google.js";
import { pickNext, tagWithJev } from "./jev.js";
import { generateTags, generateTagsBatch, fallbackTags } from "./gemini.js";
import {
  candidatePool,
  editRoutePlan,
  generateRoutePlan,
  genreForPreferences,
  RouteServiceError,
  validateGenerateRequest,
} from "./route-service.js";
import { parseShareText } from "./share-link.js";
import { clampSize, ORIGIN_MARKER_PNG, staticMapUrl } from "./route-map.js";

// Gemini のタグは応答を待たせずに裏で作る(無料枠 5回/分・1回4〜20秒)。5件ずつまとめて1回で頼む
const TAG_BATCH_SIZE = 5;
// シェアを受け取った直後の /search で先に作っておく件数。条件を選んでいる間(10〜30秒)に終わる
const WARM_ON_SEARCH = 10;
// ルートを作ったあとに裏で作る件数(経由地の作り残し + 差し替えに出そうな候補)
const WARM_AFTER_ROUTE = 10;
// 差し替えに出そうな候補: 経由地の種類ごとにこの件数
const REPLACEMENTS_PER_KIND = 3;

// Bump this when the shape or filtering of cached data changes.
const CACHE_VERSION = "v7";
const GOOGLE_TRAVEL_MODES = {
  driving: "DRIVE",
  walking: "WALK",
  bicycling: "BICYCLE",
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const fail = (message, status = 500) => json({ error: message }, status);
const apiFail = (code, message, status = 500) => json({ error: { code, message } }, status);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      switch (`${request.method} ${url.pathname}`) {
        case "GET /":
          return json({
            name: "ekz-server",
            endpoints: [
              "POST /parse-share",
              "POST /generate-route",
              "POST /edit-route",
              "POST /search",
              "POST /tag",
              "POST /cached-tags",
              "POST /next",
              "GET /photo",
              "GET /route-map",
              "GET /marker/origin.png",
            ],
          });

        case "POST /parse-share":
          return await handleParseShare(request, env);

        case "POST /generate-route":
          return await handleGenerateRoute(request, env, ctx);

        case "POST /edit-route":
          return await handleEditRoute(request, env, ctx);

        case "POST /search":
          return await handleSearch(request, env, ctx);

        case "POST /tag":
          return await handleTag(request, env, ctx);

        case "POST /cached-tags":
          return await handleCachedTags(request);

        case "POST /next":
          return await handleNext(request, env);

        case "GET /photo":
          return await handlePhoto(url, env);

        case "GET /marker/origin.png":
          return new Response(ORIGIN_MARKER_PNG, {
            headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=604800" },
          });

        case "GET /route-map":
          return await handleRouteMap(request, url, env, ctx);

        default:
          return fail("not found", 404);
      }
    } catch (error) {
      if (error instanceof RouteServiceError) {
        return apiFail(error.code, error.message, error.status);
      }
      const message = error?.message ?? String(error);
      if (message.includes("ルートが見つかりませんでした")) {
        return apiFail("ROUTE_NOT_FOUND", message, 404);
      }
      console.error(error);
      return apiFail("UPSTREAM_ERROR", "外部サービスとの通信に失敗しました。", 502);
    }
  },
};

async function handleParseShare(request, env) {
  const body = await readJson(request);
  const current = body.current;
  const hasCurrent = current && Number.isFinite(current.lat) && Number.isFinite(current.lng);
  if (current != null && !hasCurrent) {
    throw new RouteServiceError("INVALID_REQUEST", "currentは{lat,lng}で指定してください。", 400);
  }
  const resolvePlace = (query, near) => findPlace(env.GOOGLE_MAPS_SERVER_KEY, query, near);
  return json(await parseShareText(body.text, hasCurrent ? current : null, fetch, undefined, resolvePlace));
}

async function handleGenerateRoute(request, env, ctx) {
  const body = await readJson(request);
  const untagged = [];
  const deps = routeDependencies(request, env, ctx, untagged);
  const plan = await generateRoutePlan(body, deps);
  // 経由地の作り残しを先に、次に差し替えで出そうな候補。アプリは少し後に /cached-tags で取り直す
  ctx.waitUntil((async () => {
    const replacements = await replacementCandidates(body, plan, deps).catch(() => []);
    await warmTags([...untagged, ...replacements].slice(0, WARM_AFTER_ROUTE), env);
  })());
  return json(plan);
}

async function handleEditRoute(request, env, ctx) {
  const body = await readJson(request);
  const untagged = [];
  const plan = await editRoutePlan(body, routeDependencies(request, env, ctx, untagged));
  ctx.waitUntil(warmTags(untagged, env));
  return json(plan);
}

/** 差し替え(同じ種類から選ぶ)で次に出そうな候補。検索はキャッシュに当たる */
async function replacementCandidates(body, plan, deps) {
  const request = validateGenerateRequest(body);
  const search = await deps.search(request.origin, request.destination, genreForPreferences(request.preferences), request.travelMode);
  const used = new Set(plan.waypoints.map((waypoint) => waypoint.placeId));
  const pool = candidatePool(search.candidates, search.baseMinutes, request.timeConstraint, request.travelMode)
    .filter((candidate) => !used.has(candidate.id));
  const kinds = [...new Set(plan.waypoints.map((waypoint) => waypoint.kind).filter(Boolean))];
  return kinds.flatMap((kind) => pool.filter((candidate) => candidate.kind === kind).slice(0, REPLACEMENTS_PER_KIND));
}

function routeDependencies(request, env, ctx, untagged = []) {
  return {
    search: (origin, destination, genre, travelMode) => getSearchData(origin, destination, genre, travelMode, env, ctx),
    compute: (origin, destination, intermediates, travelMode) =>
      computeRoute(env.GOOGLE_MAPS_SERVER_KEY, origin, destination, {
        intermediates,
        travelMode: googleTravelMode(travelMode),
      }),
    pick: (candidates, requestText, feedback) => selectCandidate(candidates, requestText, env, feedback),
    tags: (candidate) => quickTags(candidate, env, untagged),
    photoUrl: (photoName) => {
      const url = new URL("/photo", request.url);
      url.searchParams.set("name", photoName);
      return url.toString();
    },
  };
}

/**
 * 経由地のタグ。Gemini のタグができていればそれ、無ければ Jev(0.3秒)、それも駄目なら簡易タグ。
 * Gemini を待つと遅い(1件4〜20秒)ので待たない。作っていない場所は untagged に積み、応答のあとでまとめて作る
 */
async function quickTags(candidate, env, untagged) {
  const cached = await cachedTagData(candidate.id ?? candidate.placeId);
  if (cached?.tags?.length) return cached.tags;
  untagged.push(candidate);

  if (env.TYPESAFE_API_KEY) {
    try {
      const judged = await tagWithJev(env.TYPESAFE_API_KEY, candidate);
      if (judged?.length) return judged;
    } catch (error) {
      console.warn("Jev tagging failed", error);
    }
  }
  return fallbackTags(candidate);
}

/**
 * Gemini のタグをまとめて作ってキャッシュに入れる(ctx.waitUntil で応答のあとに走らせる)。
 * 5件ずつ1回で頼み、各回は並べて投げる。失敗した場所は次の機会(経由地になったとき等)に回す
 */
async function warmTags(candidates, env) {
  if (!env.GEMINI_API_KEY || candidates.length === 0) return;
  const unique = [...new Map(candidates.map((candidate) => [String(candidate.id ?? candidate.placeId), candidate])).values()];
  const cached = await Promise.all(unique.map((candidate) => cachedTagData(candidate.id ?? candidate.placeId)));
  const missing = unique.filter((_, i) => !cached[i]);
  const batches = [];
  for (let i = 0; i < missing.length; i += TAG_BATCH_SIZE) batches.push(missing.slice(i, i + TAG_BATCH_SIZE));

  await Promise.all(batches.map(async (batch) => {
    try {
      const tags = await generateTagsBatch(env.GEMINI_API_KEY, batch);
      await Promise.all([...tags].map(([id, list]) => putTagData({ id, tags: list, source: "gemini", reason: null })));
      if (tags.size < batch.length) console.warn(`batch tagging returned ${tags.size}/${batch.length}`);
    } catch (error) {
      console.warn("batch tagging failed", String(error?.message ?? error).slice(0, 300));
    }
  }));
}

const tagCacheKey = (id) => new Request(`https://ekz.cache/tag/${CACHE_VERSION}/${encodeURIComponent(id)}`);

async function cachedTagData(id) {
  if (id === undefined || id === null) return null;
  const hit = await caches.default.match(tagCacheKey(id));
  return hit ? hit.json() : null;
}

async function putTagData(data) {
  const cached = json(data);
  cached.headers.set("Cache-Control", "public, max-age=604800");
  await caches.default.put(tagCacheKey(data.id), cached);
}

/** できあがっている Gemini のタグだけを返す。POST /cached-tags {ids} → {tags: {id: [...]}} */
async function handleCachedTags(request) {
  const body = await readJson(request);
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((id) => typeof id === "string"))].slice(0, 20) : [];
  const found = await Promise.all(ids.map((id) => cachedTagData(id)));
  const tags = {};
  ids.forEach((id, i) => {
    if (found[i]?.tags?.length) tags[id] = found[i].tags;
  });
  return json({ tags });
}

/** Legacy endpoint used by older clients and the route preview. */
async function handleSearch(request, env, ctx) {
  const body = await readJson(request);
  if (!body.origin || !body.destination) return fail("origin と destination が必要です", 400);
  const data = await getSearchData(body.origin, body.destination, body.genre, body.travelMode, env, ctx);
  // アプリはシェアを受け取った直後にここを呼ぶ。条件を選んでいる間に、選ばれそうな候補(評価順)のタグを作っておく
  const likely = candidatePool(data.candidates, data.baseMinutes, { type: "none" }, body.travelMode ?? "driving");
  ctx.waitUntil(warmTags(likely.slice(0, WARM_ON_SEARCH), env));
  return json(data);
}

async function getSearchData(origin, destination, genre, travelMode, env, ctx) {
  const googleMode = googleTravelMode(travelMode);
  const cacheKey = new Request(
    `https://ekz.cache/search/${CACHE_VERSION}?o=${encodeURIComponent(origin)}&d=${encodeURIComponent(destination)}&g=${encodeURIComponent(genre ?? "any")}&m=${googleMode}`,
  );
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit.json();

  const route = await computeRoute(env.GOOGLE_MAPS_SERVER_KEY, origin, destination, { travelMode: googleMode });
  const found = await searchAlongRoute(
    env.GOOGLE_MAPS_SERVER_KEY,
    route.polyline,
    queriesForGenre(genre, googleMode),
    route.baseMinutes,
    googleMode,
  );
  const candidates = [...found.candidates].sort((a, b) => a.detourMinutes - b.detourMinutes);
  const data = {
    baseMinutes: route.baseMinutes,
    durationMinutes: route.durationMinutes,
    distanceKm: route.distanceKm,
    distanceMeters: route.distanceMeters,
    polyline: route.polyline,
    count: candidates.length,
    rawCount: found.rawCount,
    errors: found.errors,
    perQuery: found.perQuery,
    polylineLength: found.polylineLength,
    candidates,
  };
  const cached = json(data);
  cached.headers.set("Cache-Control", "public, max-age=21600");
  ctx.waitUntil(cache.put(cacheKey, cached.clone()));
  return data;
}

async function handleTag(request, env, ctx) {
  const body = await readJson(request);
  const candidate = body.candidate ?? body.candidates?.[0];
  if (!candidate) return fail("candidate が必要です", 400);
  return json(await getTagData(candidate, env, ctx));
}

async function getTagData(candidate, env, ctx) {
  const id = candidate.id ?? candidate.placeId;
  const hit = await cachedTagData(id);
  if (hit) return hit;

  let tags;
  let source = "gemini";
  let reason = null;
  try {
    tags = await generateTags(env.GEMINI_API_KEY, candidate);
  } catch (error) {
    tags = fallbackTags(candidate);
    source = "fallback";
    reason = String(error?.message ?? error).slice(0, 300);
  }

  const data = { id, tags, source, reason };
  if (source === "gemini") ctx.waitUntil(putTagData(data));
  return data;
}

async function handleNext(request, env) {
  const body = await readJson(request);
  if (!Array.isArray(body.candidates)) return fail("candidates が必要です", 400);
  return json(await selectCandidate(body.candidates, body.request ?? "", env, body));
}

async function selectCandidate(candidates, requestText, env, feedback = {}) {
  const reason = buildReason({
    req: requestText,
    badTags: feedback.badTags ?? [],
    goodTags: feedback.goodTags ?? [],
    notes: feedback.notes ?? [],
  });
  if (!env.TYPESAFE_API_KEY) return { id: candidates[0]?.id ?? null, reason };

  try {
    const picked = await pickNext(env.TYPESAFE_API_KEY, candidates, {
      request: requestText,
      badTags: feedback.badTags ?? [],
      goodTags: feedback.goodTags ?? [],
      notes: feedback.notes ?? [],
    });
    return { ...(picked ?? { id: candidates[0]?.id ?? null }), reason };
  } catch (error) {
    console.warn("TypeSafe selection failed; using ranked fallback", error);
    return { id: candidates[0]?.id ?? null, reason };
  }
}

function buildReason({ req, badTags, goodTags, notes }) {
  const parts = [];
  if (req.trim()) parts.push(`「${req.trim()}」に合わせて`);
  if (goodTags.length) parts.push(`「${goodTags.join("・")}」が好みとのことなので`);
  if (badTags.length) parts.push(`「${badTags.join("・")}」を避けて`);
  if (notes.length) parts.push(notes[0]);
  if (parts.length === 0) return "評価が高くて寄り道も少ないので、ここを選びました";
  return parts.slice(0, 2).join("、") + "、ここを選びました";
}

async function handlePhoto(url, env) {
  const name = url.searchParams.get("name");
  if (!name || !name.startsWith("places/")) return fail("name が不正です", 400);
  const width = Math.min(1600, Math.max(200, Number(url.searchParams.get("maxWidthPx")) || 800));
  const upstream = await proxyPhoto(env.GOOGLE_MAPS_SERVER_KEY, name, width);
  if (!upstream.ok) return fail(`photo ${upstream.status}`, upstream.status);
  const response = new Response(upstream.body, upstream);
  response.headers.set("Cache-Control", "public, max-age=86400");
  return response;
}

/**
 * ルートの地図(静止画)。GET /route-map?origin=..&destination=..&waypoints=lat,lng|lat,lng&w=390&h=300
 * 経由地があれば経由地込みの経路を引き直す。画像はURLごとにキャッシュする
 */
async function handleRouteMap(request, url, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), request);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const origin = url.searchParams.get("origin");
  const destination = url.searchParams.get("destination");
  if (!origin || !destination) return fail("origin と destination が必要です", 400);
  const waypoints = (url.searchParams.get("waypoints") ?? "")
    .split("|")
    .map((pair) => pair.split(",").map(Number))
    .filter((pair) => pair.length === 2 && pair.every(Number.isFinite))
    .slice(0, 9);
  const travelMode = url.searchParams.get("travelMode") ?? "driving";

  const route = await computeRoute(env.GOOGLE_MAPS_SERVER_KEY, origin, destination, {
    intermediates: waypoints.map(([lat, lng]) => `${lat},${lng}`),
    travelMode: googleTravelMode(travelMode),
  });
  const image = await fetch(staticMapUrl(env.GOOGLE_MAPS_SERVER_KEY, {
    polyline: route.polyline,
    waypoints,
    width: clampSize(url.searchParams.get("w"), 390),
    height: clampSize(url.searchParams.get("h"), 300),
    // 画像を変えたら v を上げる(Google がアイコンを URL ごとにキャッシュするため)
    originIconUrl: new URL("/marker/origin.png?v=4", url).toString(),
  }));
  if (!image.ok) {
    // Static Maps API が有効になっていないと 403。アプリは飾りの地図に戻す
    return apiFail("UPSTREAM_ERROR", `地図を取得できませんでした (${image.status})`, 502);
  }
  const response = new Response(image.body, {
    headers: {
      "Content-Type": image.headers.get("Content-Type") ?? "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new RouteServiceError("INVALID_REQUEST", "JSON形式のリクエストが必要です。", 400);
  }
}

function googleTravelMode(value) {
  return GOOGLE_TRAVEL_MODES[value] ?? GOOGLE_TRAVEL_MODES.driving;
}
