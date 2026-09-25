import {
  decodePolyline,
  nearestOnRoute,
  estimateDetourMinutes,
} from "./polyline.js";

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";

/**
 * ジャンルごとに投げるクエリ。
 * 1クエリでは7〜20件しか返らないので、ジャンルあたり3〜4本投げて件数を確保する。
 * 実測(京都->舞子): どのジャンルも合格20件以上。
 */
export const GENRE_QUERIES = {
  meal: ["ランチ", "ラーメン", "定食", "食堂"],
  sweets: ["カフェ", "スイーツ", "ベーカリー"],
  view: ["展望台", "海岸", "公園"],
  sightseeing: ["観光スポット", "神社", "城"],
  rest: ["道の駅", "サービスエリア", "お土産"],
};

/** おまかせ。各ジャンルから1本ずつ */
export const DEFAULT_QUERIES = ["ランチ", "カフェ", "展望台", "観光スポット", "道の駅"];

/**
 * 場所の種類。経由地を差し替えるとき、飲食店が公園になったりしないように同じ種類から選ぶのに使う。
 *   meal: 食事の店 / sweets: カフェ・甘いもの / spot: それ以外(公園・展望台・神社・道の駅など)
 * 主な種類(primaryType)で決める。types の "food" は、レストランが入っている展望台(神戸ポートタワー)や
 * 道の駅にも付くので使わない
 */
const EATERY = /restaurant|cafe|coffee|tea_house|bistro|brewpub|(^|_)pub$|diner|izakaya|meal_takeaway|meal_delivery|food_court|bakery|deli$|dessert|cake|pastry|confectionery|ice_cream|acai|donut|chocolate|juice|candy|sandwich|bagel|(^|_)bar$|bar_and_grill|brewery|winery|steak_house|sushi|ramen|buffet/;
const SWEETS = /cafe|coffee|tea_house|dessert|cake|pastry|confectionery|bakery|ice_cream|acai|donut|chocolate|juice|candy/;

export function placeKind(primaryType) {
  const type = primaryType ?? "";
  if (!EATERY.test(type)) return "spot";
  return SWEETS.test(type) ? "sweets" : "meal";
}

export function queriesForGenre(genre) {
  if (!genre) return DEFAULT_QUERIES;
  return GENRE_QUERIES[genre] ?? DEFAULT_QUERIES;
}

/** 金額の幅が無いときだけ使う大まかな価格帯 */
const PRICE_LABEL = {
  PRICE_LEVEL_FREE: "無料",
  PRICE_LEVEL_INEXPENSIVE: "安い",
  PRICE_LEVEL_MODERATE: "ふつう",
  PRICE_LEVEL_EXPENSIVE: "高い",
  PRICE_LEVEL_VERY_EXPENSIVE: "とても高い",
};

const yen = (money) => {
  const units = Number(money?.units);
  if (!Number.isFinite(units) || money.currencyCode !== "JPY") return null;
  return `¥${units.toLocaleString("en-US")}`;
};

/**
 * 価格相場の表示。Places API の priceRange(例 1000〜2000円)を「¥1,000〜2,000」にする。
 * 上限が無ければ「¥10,000〜」。金額が無い・円でないときは priceLevel の大まかな表現に戻す
 */
export function formatPriceRange(priceRange, priceLevel) {
  const start = yen(priceRange?.startPrice);
  const end = yen(priceRange?.endPrice);
  if (start && end) return `${start}〜${end.slice(1)}`;
  if (start) return `${start}〜`;
  if (end) return `〜${end}`;
  return PRICE_LABEL[priceLevel] ?? null;
}

/** 出発地・目的地・経由地からルートと所要時間を取る */
export async function computeRoute(key, origin, destination, options = {}) {
  const travelMode = typeof options === "string" ? options : options.travelMode ?? "DRIVE";
  const intermediates = typeof options === "string" ? [] : options.intermediates ?? [];
  const res = await fetch(ROUTES_URL, {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      origin: toWaypoint(origin),
      destination: toWaypoint(destination),
      intermediates: intermediates.map(toWaypoint),
      travelMode,
      routingPreference: travelMode === "DRIVE" ? "TRAFFIC_AWARE" : undefined,
      languageCode: "ja",
    }),
  });

  if (!res.ok) throw new Error(`Routes API ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const route = (await res.json()).routes?.[0];
  if (!route) throw new Error("ルートが見つかりませんでした");

  const durationMinutes = Math.round(parseInt(route.duration, 10) / 60);
  const distanceMeters = Math.round(route.distanceMeters);
  return {
    durationMinutes,
    distanceMeters,
    // 区間ごとの所要時間(出発→経由地1→…→目的地)。アプリの到着時刻の表示に使う
    legMinutes: (route.legs ?? []).map((leg) => Math.round(parseInt(leg.duration, 10) / 60)),
    // Legacy names used by POST /search and the Kotlin client.
    baseMinutes: durationMinutes,
    distanceKm: +(distanceMeters / 1000).toFixed(1),
    polyline: route.polyline.encodedPolyline,
  };
}

/** "lat,lng" なら座標、そうでなければ住所や場所名として扱う */
function toWaypoint(value) {
  if (value && typeof value === "object") {
    const lat = Number(value.lat ?? value.latitude);
    const lng = Number(value.lng ?? value.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { location: { latLng: { latitude: lat, longitude: lng } } };
    }
  }
  const parts = String(value).split(",");
  if (parts.length === 2) {
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { location: { latLng: { latitude: lat, longitude: lng } } };
    }
  }
  return { address: String(value) };
}

/** ルート沿いの候補を集める。クエリごとに1リクエスト */
/**
 * 住宅街の小さな公園のようなノイズを落とす。
 * これが無いと「正利の尾公園」のような誰も寄らない場所が上位に来る。
 */
function isWorthStopping(c) {
  if (c.reviewCount == null || c.rating == null) return false;
  return c.reviewCount >= 30 && c.rating >= 3.8;
}

export async function searchAlongRoute(key, polyline, queries = DEFAULT_QUERIES, baseMinutes = 0) {
  const fieldMask = [
    "places.id",
    "places.displayName",
    "places.primaryType",
    "places.primaryTypeDisplayName",
    "places.location",
    "places.rating",
    "places.userRatingCount",
    "places.priceLevel",
    "places.priceRange",
    "places.photos",
    "places.reviews",
  ].join(",");

  const responses = await Promise.all(
    queries.map((q) =>
      fetch(PLACES_URL, {
        method: "POST",
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": fieldMask,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          textQuery: q,
          languageCode: "ja",
          pageSize: 20,
          searchAlongRouteParameters: { polyline: { encodedPolyline: polyline } },
        }),
      }).then(async (r) => (r.ok ? r.json() : { places: [], error: await r.text() })),
    ),
  );

  const points = decodePolyline(polyline);
  const byId = new Map();

  for (const body of responses) {
    for (const p of body.places ?? []) {
      if (byId.has(p.id)) continue;
      byId.set(p.id, toCandidate(p, points, baseMinutes));
    }
  }

  const perQuery = responses.map((b, i) => `${queries[i]}:${(b.places ?? []).length}`);
  const errors = responses
    .map((b, i) => (b.error ? `${queries[i]}: ${String(b.error).slice(0, 150)}` : null))
    .filter(Boolean);
  const all = [...byId.values()];
  return {
    candidates: all.filter(isWorthStopping),
    rawCount: all.length,
    perQuery,
    polylineLength: polyline.length,
    errors,
  };
}

function toCandidate(p, routePoints, baseMinutes) {
  const lat = p.location?.latitude;
  const lng = p.location?.longitude;
  const near = lat != null ? nearestOnRoute(routePoints, lat, lng) : { km: 0, ratio: 0 };
  const off = near.km;

  // その経由地に着くまでの時間。ルート上の到達位置 + ルートから外れる分
  const minutesToArrive = Math.round(baseMinutes * near.ratio + (off / 40) * 60);

  return {
    id: p.id,
    name: p.displayName?.text ?? "名称不明",
    category: p.primaryTypeDisplayName?.text ?? "",
    kind: placeKind(p.primaryType),
    lat,
    lng,
    rating: p.rating ?? null,
    reviewCount: p.userRatingCount ?? null,
    priceRange: formatPriceRange(p.priceRange, p.priceLevel),
    photoName: p.photos?.[0]?.name ?? null,
    reviews: (p.reviews ?? []).map((r) => r.text?.text).filter(Boolean).slice(0, 3),
    detourMinutes: estimateDetourMinutes(off),
    minutesToArrive,
    // ルート全体のどこにある候補か(0〜1)。現在地からの時間をアプリ側で出すのに使う
    routeRatio: +near.ratio.toFixed(4),
    offRouteKm: +off.toFixed(2),
  };
}

/** 写真を中継する。APIキーを端末に出さないため */
export async function proxyPhoto(key, photoName, maxWidthPx = 800) {
  const url =
    `https://places.googleapis.com/v1/${photoName}/media` +
    `?key=${encodeURIComponent(key)}&maxWidthPx=${maxWidthPx}`;
  return fetch(url);
}
