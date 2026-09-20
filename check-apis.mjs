// 各APIが登録・利用できるかを確認する。
//   node check-apis.mjs
// キーは .env から読む。引数やコマンドラインには絶対に書かない。

import { readFileSync } from "node:fs";

function loadEnv(path = ".env") {
  try {
    return Object.fromEntries(
      readFileSync(path, "utf8")
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.trim().startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        }),
    );
  } catch {
    console.error(".env がありません。cp .env.example .env して値を入れてください");
    process.exit(1);
  }
}

const env = loadEnv();
const results = [];

function ok(name, detail) { results.push(["OK", name, detail]); console.log(`  OK  ${name} — ${detail}`); }
function ng(name, detail) { results.push(["NG", name, detail]); console.log(`  NG  ${name} — ${detail}`); }
function skip(name, detail) { results.push(["--", name, detail]); console.log(`  --  ${name} — ${detail}`); }

// ---------- 1. TypeSafe AI (Jev) ----------
async function checkJev() {
  const name = "TypeSafe AI (Jev)";
  if (!env.TYPESAFE_API_KEY) return skip(name, "TYPESAFE_API_KEY が未設定");

  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.TYPESAFE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "jev-latest",
      // 日本語がどの程度通るかもここで見る
      state: {
        name: "須磨海浜公園",
        category: "公園",
        rating: 4.2,
        reviews: [
          "海沿いで景色がよく、ベンチも多いのでゆっくりできます。",
          "休日は家族連れで賑わっています。駐車場は有料。",
        ],
      },
      questions: {
        is_outdoor: {
          type: "noul",
          instructions: "この場所は屋外か?",
          criteria: { true: "屋外である", false: "屋内である" },
        },
        is_quiet: {
          type: "noul",
          instructions: "この場所は静かか?",
          criteria: { true: "静かで落ち着ける", false: "賑やかである" },
        },
        price: {
          type: "choice",
          instructions: "価格帯はどれか",
          criteria: { free: "無料", cheap: "1000円未満", expensive: "1000円以上" },
        },
      },
    }),
  });

  const text = await res.text();
  if (!res.ok) return ng(name, `HTTP ${res.status} ${text.slice(0, 200)}`);

  const json = JSON.parse(text);
  const a = json.answers ?? {};
  ok(
    name,
    `model=${json.model} 屋外=${a.is_outdoor?.noul?.toFixed(2)} ` +
      `静か=${a.is_quiet?.noul?.toFixed(2)} 価格=${a.price?.choice} ` +
      `(入力${json.usage?.input_tokens}tok)`,
  );
  return json;
}

// ---------- 2. Routes API ----------
async function checkRoutes() {
  const name = "Routes API";
  if (!env.GOOGLE_MAPS_SERVER_KEY) { skip(name, "GOOGLE_MAPS_SERVER_KEY が未設定"); return null; }

  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": env.GOOGLE_MAPS_SERVER_KEY,
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // 京都市内 -> 舞子海上プロムナード (実機で試したのと同じ区間)
      origin: { location: { latLng: { latitude: 35.0048188, longitude: 135.759705 } } },
      destination: { location: { latLng: { latitude: 34.6311072, longitude: 135.0333283 } } },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
    }),
  });

  const text = await res.text();
  if (!res.ok) { ng(name, `HTTP ${res.status} ${text.slice(0, 250)}`); return null; }

  const route = JSON.parse(text).routes?.[0];
  if (!route) { ng(name, "ルートが返りませんでした"); return null; }

  const min = Math.round(parseInt(route.duration) / 60);
  const km = (route.distanceMeters / 1000).toFixed(1);
  ok(name, `${min}分 / ${km}km / ポリライン ${route.polyline.encodedPolyline.length}文字`);
  return route.polyline.encodedPolyline;
}

// ---------- 3. Places API (New) / Search Along Route + 口コミ ----------
async function checkPlaces(polyline) {
  const name = "Places API (Search Along Route + 口コミ)";
  if (!env.GOOGLE_MAPS_SERVER_KEY) return skip(name, "GOOGLE_MAPS_SERVER_KEY が未設定");
  if (!polyline) return skip(name, "Routes API が通っていないのでポリラインが無い");

  // reviews を要求すると Enterprise + Atmosphere ティアになる。ここが通るかが本番
  const fieldMask = [
    "places.id",
    "places.displayName",
    "places.primaryType",
    "places.location",
    "places.rating",
    "places.userRatingCount",
    "places.priceLevel",
    "places.photos",
    "places.reviews",
  ].join(",");

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": env.GOOGLE_MAPS_SERVER_KEY,
      "X-Goog-FieldMask": fieldMask,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      textQuery: "カフェ",
      languageCode: "ja",
      searchAlongRouteParameters: { polyline: { encodedPolyline: polyline } },
    }),
  });

  const text = await res.text();
  if (!res.ok) return ng(name, `HTTP ${res.status} ${text.slice(0, 250)}`);

  const places = JSON.parse(text).places ?? [];
  const withReviews = places.filter((p) => (p.reviews?.length ?? 0) > 0).length;
  const withPhotos = places.filter((p) => (p.photos?.length ?? 0) > 0).length;

  if (places.length === 0) return ng(name, "0件。ルート沿い検索が効いていない可能性");

  ok(
    name,
    `${places.length}件 (口コミ付き ${withReviews} / 写真付き ${withPhotos})  例: ` +
      places.slice(0, 3).map((p) => p.displayName?.text).join(", "),
  );
}

// ---------- 実行 ----------
console.log("APIの確認を始めます\n");
console.log("[1] TypeSafe AI (Jev)");
await checkJev().catch((e) => ng("TypeSafe AI (Jev)", e.message));

console.log("\n[2] Routes API");
const polyline = await checkRoutes().catch((e) => { ng("Routes API", e.message); return null; });

console.log("\n[3] Places API (New)");
await checkPlaces(polyline).catch((e) => ng("Places API", e.message));

console.log("\n[4] Maps SDK for Android");
if (env.GOOGLE_MAPS_ANDROID_KEY) {
  skip("Maps SDK for Android", "curl では確認できない。実機で地図が出るかで判定する");
} else {
  skip("Maps SDK for Android", "GOOGLE_MAPS_ANDROID_KEY が未設定");
}

console.log("\n--- まとめ ---");
for (const [s, n, d] of results) console.log(`${s}  ${n}`);
const failed = results.filter((r) => r[0] === "NG").length;
process.exit(failed > 0 ? 1 : 0);
