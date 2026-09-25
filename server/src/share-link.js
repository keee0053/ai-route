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
 * @returns {Promise<{origin:string,destination:string,originIsCurrentLocation:boolean,originName?:string,destinationName?:string}>}
 */
export async function parseShareText(text, current, fetchImpl = fetch) {
  const url = await expandUrl(extractUrl(text), fetchImpl);
  const route = routeFromUrl(url);

  const names = {
    ...(route.originName ? { originName: route.originName } : {}),
    ...(route.destinationName ? { destinationName: route.destinationName } : {}),
  };
  if (route.origin !== null) {
    return { origin: route.origin, destination: route.destination, originIsCurrentLocation: false, ...names };
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
    ...names,
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

/**
 * origin が null = 現在地(URL に出発地が書かれていない)。
 * パスの地名は短い名前(例「潤和」)のことがあり、名前で引くと同名の別の場所(熊本の潤和)になる。
 * data= に地点の座標があればそちらを使い、地名は originName / destinationName で返す。
 */
export function routeFromUrl(url) {
  const route = routeNamesFromUrl(url);
  const result = { origin: route.origin, destination: route.destination };
  const coordinates = placeCoordinates(url.pathname);
  // 地点の数が合わないときは対応が分からないので、名前のまま使う
  if (!route.places || coordinates.length !== route.places.length) return result;

  const first = coordinates[0];
  if (route.origin !== null && first) {
    result.origin = `${first.lat},${first.lng}`;
    if (!isCoordinateText(route.origin)) result.originName = route.origin;
  }
  const last = coordinates.at(-1);
  if (last) {
    result.destination = `${last.lat},${last.lng}`;
    if (!isCoordinateText(route.destination)) result.destinationName = route.destination;
  }
  return result;
}

/**
 * data=!4m..!4m..!1m5!1m1!1s<id>!2m2!1d<lng>!2d<lat>!1m0... から地点ごとの座標を取る(座標が無い地点は null)。
 * !<番号><型><値> の並びで、型 m の値はその下に続く要素の数。現在地は !1m0。
 */
function placeCoordinates(pathname) {
  const data = pathname.split("/").find((segment) => segment.startsWith("data="));
  if (!data) return [];
  const nodes = parseDataTokens(data.slice("data=".length).split("!").filter(Boolean));
  const list = nodes.find((node) => node.key === "4m")?.children.find((node) => node.key === "4m");
  if (!list) return [];
  return list.children
    .filter((node) => node.key === "1m")
    .map((place) => {
      const point = place.children.find((node) => node.key === "2m");
      if (!point) return null;
      const lng = Number(point.children.find((node) => node.key === "1d")?.value);
      const lat = Number(point.children.find((node) => node.key === "2d")?.value);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    });
}

function parseDataTokens(tokens) {
  const nodes = [];
  let index = 0;
  while (index < tokens.length) {
    const match = tokens[index].match(/^(\d+)([a-zA-Z])(.*)$/);
    index += 1;
    if (!match) continue;
    const [, field, type, value] = match;
    const node = { key: field + type, value, children: [] };
    if (type === "m") {
      const count = Number(value);
      node.children = parseDataTokens(tokens.slice(index, index + count));
      index += count;
    }
    nodes.push(node);
  }
  return nodes;
}

function isCoordinateText(value) {
  const parts = value.split(",");
  return parts.length === 2 && parts.every((part) => part.trim() !== "" && Number.isFinite(Number(part)));
}

function routeNamesFromUrl(url) {
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
    if (places.length === 1 && places[0] !== "") return { origin: null, destination: cleanPlace(places[0]), places };
    throw parseFailed("出発地と目的地を読み取れませんでした。");
  }
  const destination = cleanPlace(places.at(-1));
  if (!destination) throw parseFailed("目的地を読み取れませんでした。");
  return { origin: placeOrNull(places[0]), destination, places };
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
