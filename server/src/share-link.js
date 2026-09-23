import { RouteServiceError } from "./route-service.js";

// Google マップの共有テキストから出発地と目的地を取り出す。
// 形式は非公式なので、読めないときは推測せずエラーにする。

const MAX_REDIRECTS = 5;

/** 出発地が「現在地」を指す書き方。共有元の言語設定で変わる */
const CURRENT_LOCATION_NAMES = new Set([
  "現在地",
  "自分の位置",
  "my location",
  "your location",
]);

/**
 * @param {string} text 共有されたテキスト(URL 単体か、説明文 + URL)
 * @param {{lat:number,lng:number}|null} current 端末の現在地。出発地が現在地のときに使う
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<{origin:string,destination:string,originIsCurrentLocation:boolean}>}
 */
export async function parseShareText(text, current, fetchImpl = fetch) {
  const url = await expandUrl(extractUrl(text), fetchImpl);
  const route = routeFromUrl(url);

  if (route.origin !== null) {
    return { origin: route.origin, destination: route.destination, originIsCurrentLocation: false };
  }
  if (!current) {
    throw new RouteServiceError(
      "ORIGIN_REQUIRED",
      "出発地が現在地のルートです。現在地を送ってください。",
      400,
    );
  }
  return {
    origin: `${current.lat},${current.lng}`,
    destination: route.destination,
    originIsCurrentLocation: true,
  };
}

export function extractUrl(text) {
  if (typeof text !== "string" || text.trim() === "") throw parseFailed("共有テキストが空です。");
  const found = text.match(/https?:\/\/\S+/)?.[0];
  if (!found) throw parseFailed("共有テキストに URL がありません。");
  let url;
  try {
    url = new URL(found);
  } catch {
    throw parseFailed("共有された URL を読み取れませんでした。");
  }
  if (!isGoogleMapsHost(url.hostname)) throw parseFailed("Google マップの URL ではありません。");
  return url;
}

/** 短縮 URL をリダイレクトを 1 段ずつ追って展開する(同意ページなどへ勝手に飛ばないように) */
export async function expandUrl(url, fetchImpl = fetch) {
  let current = url;
  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    if (!isShortHost(current.hostname)) return current;
    const response = await fetchImpl(current.toString(), { redirect: "manual" });
    const location = response.headers.get("location");
    if (!location) throw parseFailed("短縮 URL を展開できませんでした。");
    current = new URL(location, current);
    if (!isGoogleMapsHost(current.hostname)) throw parseFailed("短縮 URL の展開先が Google マップではありません。");
  }
  throw parseFailed("短縮 URL のリダイレクトが多すぎます。");
}

/** origin が null = 現在地(URL に出発地が書かれていない) */
export function routeFromUrl(url) {
  const queryDestination = url.searchParams.get("destination");
  if (queryDestination) {
    const origin = placeOrNull(url.searchParams.get("origin"));
    return { origin, destination: cleanPlace(queryDestination) };
  }

  // /maps/dir/<出発地>/<経由地...>/<目的地>/@lat,lng,zoom/data=...
  // 出発地が現在地のときは <出発地> が空になる(/maps/dir//目的地/...)
  const segments = url.pathname.split("/");
  const dirIndex = segments.indexOf("dir");
  if (dirIndex < 0) throw parseFailed("ルートの URL ではありません。Google マップで経路を出してから共有してください。");
  const places = [];
  for (const segment of segments.slice(dirIndex + 1)) {
    if (segment.startsWith("@") || segment.startsWith("data=")) break;
    places.push(segment);
  }
  while (places.length > 0 && places.at(-1) === "") places.pop();
  if (places.length < 2) {
    if (places.length === 1 && places[0] !== "") return { origin: null, destination: cleanPlace(places[0]) };
    throw parseFailed("出発地と目的地を読み取れませんでした。");
  }
  const destination = cleanPlace(places.at(-1));
  if (!destination) throw parseFailed("目的地を読み取れませんでした。");
  return { origin: placeOrNull(places[0]), destination };
}

function placeOrNull(value) {
  if (value === null || value === undefined) return null;
  const place = cleanPlace(value);
  if (place === "" || CURRENT_LOCATION_NAMES.has(place.toLowerCase())) return null;
  return place;
}

function cleanPlace(value) {
  const spaced = value.replace(/\+/g, " ");
  try {
    return decodeURIComponent(spaced).trim();
  } catch {
    return spaced.trim();
  }
}

function isShortHost(hostname) {
  return hostname === "maps.app.goo.gl" || hostname === "goo.gl";
}

function isGoogleMapsHost(hostname) {
  return isShortHost(hostname)
    || hostname === "google.com"
    || hostname.endsWith(".google.com")
    || hostname === "google.co.jp"
    || hostname.endsWith(".google.co.jp");
}

function parseFailed(message) {
  return new RouteServiceError("MAPS_URL_PARSE_FAILED", message, 400);
}
