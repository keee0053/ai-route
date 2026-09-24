import { decodePolyline, encodePolyline, thinPoints } from "./polyline.js";

const STATIC_MAP_URL = "https://maps.googleapis.com/maps/api/staticmap";
// URL は 16384 文字まで。経路の点を間引いて収める
const MAX_PATH_POINTS = 300;

/**
 * ルートの静止画の地図の URL を作る(キー付き。サーバの中だけで使い、端末には画像だけを返す)。
 * waypoints は [lat, lng] の配列。番号付きのピンを立てる
 */
/**
 * 出発地の印(Google マップと同じ 白いふちの灰色の丸・うっすら影付き・28x28)。
 * Static Maps には丸いマーカーが無いので、この画像を GET /marker/origin.png で配り、icon: で使わせる
 */
export const ORIGIN_MARKER_PNG = Uint8Array.from(atob("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"), (c) => c.charCodeAt(0));

export function staticMapUrl(key, { polyline, origin, destination, waypoints = [], width, height, originIconUrl }) {
  const points = thinPoints(decodePolyline(polyline), MAX_PATH_POINTS);
  const params = new URLSearchParams({
    size: `${width}x${height}`,
    scale: "2",
    language: "ja",
    region: "jp",
    key,
  });
  params.append("path", `weight:6|color:0x0EA5E9ff|enc:${encodePolyline(points)}`);
  const [start, end] = [points[0], points.at(-1)];
  // 出発地は Google マップと同じ灰色の丸(画像が無ければ灰色のピン)、目的地は赤
  const originPoint = origin ?? `${start[0]},${start[1]}`;
  params.append("markers", originIconUrl ? `anchor:center|icon:${originIconUrl}|${originPoint}` : `size:mid|color:0x5F6368|${originPoint}`);
  params.append("markers", `size:mid|color:0xDC2626|${destination ?? `${end[0]},${end[1]}`}`);
  waypoints.forEach(([lat, lng], i) => {
    params.append("markers", `color:0xF97316|label:${i + 1}|${lat},${lng}`);
  });
  // 地図を静かにする(店や施設のアイコンを消し、経路とピンを目立たせる)
  params.append("style", "feature:poi|visibility:off");
  params.append("style", "feature:transit|visibility:simplified");
  return `${STATIC_MAP_URL}?${params.toString()}`;
}

/** 幅・高さは画面に合わせて受け取るが、Static Maps の上限(640)と極端な値を丸める */
export function clampSize(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(640, Math.max(120, Math.round(n)));
}
