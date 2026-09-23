import { computeRoute, searchAlongRoute, proxyPhoto, queriesForGenre } from "./google.js";
import { pickNext } from "./jev.js";
import { generateTags, fallbackTags } from "./gemini.js";
import { editRoutePlan, generateRoutePlan, RouteServiceError } from "./route-service.js";
import { parseShareText } from "./share-link.js";

// 経由地のタグ(Gemini)をこれ以上待たない。間に合わなければ簡易タグで返し、生成は裏で続けてキャッシュする
const TAG_WAIT_MS = 4000;

// Bump this when the shape or filtering of cached data changes.
const CACHE_VERSION = "v4";

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
              "POST /next",
              "GET /photo",
            ],
          });

        case "POST /parse-share":
          return await handleParseShare(request);

        case "POST /generate-route":
          return await handleGenerateRoute(request, env, ctx);

        case "POST /edit-route":
          return await handleEditRoute(request, env, ctx);

        case "POST /search":
          return await handleSearch(request, env, ctx);

        case "POST /tag":
          return await handleTag(request, env, ctx);

        case "POST /next":
          return await handleNext(request, env);

        case "GET /photo":
          return await handlePhoto(url, env);

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

async function handleParseShare(request) {
  const body = await readJson(request);
  const current = body.current;
  const hasCurrent = current && Number.isFinite(current.lat) && Number.isFinite(current.lng);
  if (current != null && !hasCurrent) {
    throw new RouteServiceError("INVALID_REQUEST", "currentは{lat,lng}で指定してください。", 400);
  }
  return json(await parseShareText(body.text, hasCurrent ? current : null));
}

async function handleGenerateRoute(request, env, ctx) {
  const body = await readJson(request);
  return json(await generateRoutePlan(body, routeDependencies(request, env, ctx)));
}

async function handleEditRoute(request, env, ctx) {
  const body = await readJson(request);
  return json(await editRoutePlan(body, routeDependencies(request, env, ctx)));
}

function routeDependencies(request, env, ctx) {
  return {
    search: (origin, destination, genre) => getSearchData(origin, destination, genre, env, ctx),
    compute: (origin, destination, intermediates) =>
      computeRoute(env.GOOGLE_MAPS_SERVER_KEY, origin, destination, { intermediates }),
    pick: (candidates, requestText, feedback) => selectCandidate(candidates, requestText, env, feedback),
    tags: async (candidate) => {
      const pending = getTagData(candidate, env, ctx);
      ctx.waitUntil(pending.catch(() => {}));
      const timeout = new Promise((resolve) => setTimeout(() => resolve(null), TAG_WAIT_MS));
      const data = await Promise.race([pending, timeout]);
      return data ? data.tags : fallbackTags(candidate);
    },
    photoUrl: (photoName) => {
      const url = new URL("/photo", request.url);
      url.searchParams.set("name", photoName);
      return url.toString();
    },
  };
}

/** Legacy endpoint used by older clients and the route preview. */
async function handleSearch(request, env, ctx) {
  const body = await readJson(request);
  if (!body.origin || !body.destination) return fail("origin と destination が必要です", 400);
  return json(await getSearchData(body.origin, body.destination, body.genre, env, ctx));
}

async function getSearchData(origin, destination, genre, env, ctx) {
  const cacheKey = new Request(
    `https://ekz.cache/search/${CACHE_VERSION}?o=${encodeURIComponent(origin)}&d=${encodeURIComponent(destination)}&g=${encodeURIComponent(genre ?? "any")}`,
  );
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit.json();

  const route = await computeRoute(env.GOOGLE_MAPS_SERVER_KEY, origin, destination);
  const found = await searchAlongRoute(
    env.GOOGLE_MAPS_SERVER_KEY,
    route.polyline,
    queriesForGenre(genre),
    route.baseMinutes,
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
  const cacheKey = new Request(`https://ekz.cache/tag/${CACHE_VERSION}/${encodeURIComponent(id)}`);
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit.json();

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
  if (source === "gemini") {
    const cached = json(data);
    cached.headers.set("Cache-Control", "public, max-age=604800");
    ctx.waitUntil(cache.put(cacheKey, cached.clone()));
  }
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

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new RouteServiceError("INVALID_REQUEST", "JSON形式のリクエストが必要です。", 400);
  }
}
