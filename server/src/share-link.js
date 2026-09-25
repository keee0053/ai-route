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
/**
 * @param {(query:string, near:{lat:number,lng:number}) => Promise<{lat:number,lng:number}|null>} [resolvePlace]
 *   地点の共有で名前しか分からないとき、現在地の近くで名前を座標にする(同名の遠い場所を避ける)
 */
export async function parseShareText(text, current, fetchImpl = fetch, sleep = defaultSleep, resolvePlace = null) {
  const url = await expandUrl(extractUrl(text), fetchImpl, sleep);
  const route = routeFromUrl(url);
  if (route.isPlace && current && resolvePlace && !isCoordinateText(route.destination)) {
    const found = await resolvePlace(route.destination, current);
    if (found) {
      route.destinationName = route.destination;
      route.destination = `${found.lat},${found.lng}`;
    }
  }

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

/**
 * 作ったばかりの短縮 URL は数秒間 404 を返すことがある(経路を出した直後に共有すると失敗していた)。
 * 転送先が無いときは間を空けて読み直す。合計で約10秒(アプリの待ち時間 20 秒に収まる)
 */
const SHORT_LINK_RETRY_MS = [1000, 2000, 3000, 4000];

/** 短縮 URL をリダイレクトを 1 段ずつ追って展開する(同意ページなどへ勝手に飛ばないように) */
export async function expandUrl(url, fetchImpl = fetch, sleep = defaultSleep) {
  let current = url;
  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    if (!isShortHost(current.hostname)) return current;
    const location = await redirectTarget(current, fetchImpl, sleep);
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
  const place = placeFromUrl(url);
  if (place) return place;
  const route = routeNamesFromUrl(url);
  const result = { origin: route.origin, destination: route.destination };
  const coordinates = url.searchParams.has("daddr") ? geocodeCoordinates(url) : placeCoordinates(url.pathname);
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
 * 経路ではなく地点が共有されたとき。出発地は現在地(origin: null)にして、その地点へのルートにする。
 *   /maps/place/<名前>/@..../data=...!8m2!3d<緯度>!4d<経度>  (/maps/search/<名前> も同じ)
 *   ?q=<名前か座標>・/maps/search/?api=1&query=<名前か座標>
 * 座標が書かれていなければ名前だけを返す(isPlace を見て、呼び出し側が現在地の近くで座標にする)
 */
function placeFromUrl(url) {
  if (url.searchParams.has("daddr") || url.searchParams.has("destination")) return null;
  const segments = url.pathname.split("/");
  if (segments.includes("dir")) return null;

  const at = segments.findIndex((segment) => segment === "place" || segment === "search");
  const pathName = at >= 0 ? segments[at + 1] ?? "" : "";
  const nameInPath = pathName && !pathName.startsWith("@") && !pathName.startsWith("data=") ? cleanPlace(pathName) : "";
  const name = nameInPath || (url.searchParams.get("q") ?? url.searchParams.get("query") ?? "").trim();
  const coordinates = dataPointCoordinates(url.pathname) ?? (isCoordinateText(name) ? name.replace(/\s/g, "") : null);
  if (!name && !coordinates) return null;
  if (!coordinates) return { origin: null, destination: name, isPlace: true };
  return {
    origin: null,
    destination: coordinates,
    ...(name && !isCoordinateText(name) ? { destinationName: name } : {}),
    isPlace: true,
  };
}

/** 地点の data= の !8m2!3d<緯度>!4d<経度>(最後のもの) */
function dataPointCoordinates(pathname) {
  const data = pathname.split("/").find((segment) => segment.startsWith("data="));
  const matches = [...(data ?? "").matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)];
  const last = matches.at(-1);
  return last ? `${Number(last[1])},${Number(last[2])}` : null;
}

/**
 * data=!4m..!4m..!1m..!1m.. から地点ごとの座標を取る(座標が無い地点は null)。
 * !<番号><型><値> の並びで、型 m の値はその下に続く要素の数。地点の書き方は2通りある:
 *   ブラウザ:       !1m5!1m1!1s<id>!2m2!1d<経度>!2d<緯度>   現在地は !1m0
 *   スマホのアプリ: !1m5!1m4!1s<id>!8m2!3d<緯度>!4d<経度>   現在地は !1m1!4e1
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
      // スマホの形にも !2m1!11b1 のような座標でない 2m が付くので、座標が読めた方を使う
      const browser = place.children.filter((node) => node.key === "2m").map((node) => latLng(node, "2d", "1d"));
      const app = place.children
        .filter((node) => node.key === "1m")
        .flatMap((node) => node.children.filter((child) => child.key === "8m"))
        .map((node) => latLng(node, "3d", "4d"));
      return [...browser, ...app].find(Boolean) ?? null;
    });
}

function latLng(point, latKey, lngKey) {
  const lat = Number(point.children.find((node) => node.key === latKey)?.value);
  const lng = Number(point.children.find((node) => node.key === lngKey)?.value);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/**
 * iOS の Google マップが共有する URL(maps.google.com/?saddr=..&daddr=..&geocode=..)の地点ごとの座標。
 * geocode は地点ごとに ; で区切った base64 の protobuf で、フィールド2・3 が緯度・経度 ×10^6(fixed32)
 */
function geocodeCoordinates(url) {
  const geocode = url.searchParams.get("geocode");
  if (!geocode) return [];
  return geocode.split(";").map(decodeGeocodePoint);
}

function decodeGeocodePoint(text) {
  let bytes;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
  const view = new DataView(bytes.buffer);
  const fields = {};
  let index = 0;
  const varint = () => {
    let value = 0;
    let shift = 0;
    while (index < bytes.length) {
      const byte = bytes[index++];
      value += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) return value;
      shift += 7;
    }
    return null;
  };
  while (index < bytes.length) {
    const key = varint();
    if (key === null) return null;
    const field = Math.floor(key / 8);
    const wire = key % 8;
    if (wire === 5) {
      if (index + 4 > bytes.length) return null;
      fields[field] = view.getInt32(index, true);
      index += 4;
    } else if (wire === 1) {
      index += 8;
    } else if (wire === 0) {
      if (varint() === null) return null;
    } else if (wire === 2) {
      const length = varint();
      if (length === null) return null;
      index += length;
    } else {
      return null;
    }
  }
  const lat = fields[2] / 1e6;
  const lng = fields[3] / 1e6;
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
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
  // iOS: maps.google.com/?saddr=<出発地>&daddr=<目的地>(経由地があれば "A to:B")
  const daddr = url.searchParams.get("daddr");
  if (daddr) {
    const stops = cleanPlace(daddr).split(/\s+to:/).map((place) => place.trim());
    const destination = stops.at(-1);
    if (!destination) throw parseFailed("目的地を読み取れませんでした。");
    const saddr = url.searchParams.get("saddr") ?? "";
    return { origin: placeOrNull(saddr), destination, places: [saddr, ...stops] };
  }

  const queryDestination = url.searchParams.get("destination");
  if (queryDestination) {
    const origin = placeOrNull(url.searchParams.get("origin"));
    return { origin, destination: cleanPlace(queryDestination) };
  }

  // /maps/dir/<出発地>/<経由地...>/<目的地>/@lat,lng,zoom/data=...
  // 出発地が現在地のときは <出発地> が空になる(/maps/dir//目的地/...)
  const segments = url.pathname.split("/");
  const dirIndex = segments.indexOf("dir");
  if (dirIndex < 0) {
    console.warn("unrecognized maps url", url.toString());
    throw parseFailed("ルートや場所の URL として読めませんでした。Google マップで経路か場所を出してから共有してください。");
  }
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

async function redirectTarget(url, fetchImpl, sleep) {
  const statuses = [];
  for (let attempt = 0; attempt <= SHORT_LINK_RETRY_MS.length; attempt += 1) {
    if (attempt > 0) await sleep(SHORT_LINK_RETRY_MS[attempt - 1]);
    const response = await fetchImpl(url.toString(), { redirect: "manual" });
    const location = response.headers.get("location");
    if (location) return location;
    statuses.push(response.status);
  }
  console.warn("short link did not redirect", url.toString(), statuses.join(","));
  throw parseFailed("短縮 URL を展開できませんでした。少し待ってからもう一度共有してください。");
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
