import { decodePolyline, encodePolyline, thinPoints } from "./polyline.js";

const STATIC_MAP_URL = "https://maps.googleapis.com/maps/api/staticmap";
// URL は 16384 文字まで。経路の点を間引いて収める
const MAX_PATH_POINTS = 300;

/**
 * ルートの静止画の地図の URL を作る(キー付き。サーバの中だけで使い、端末には画像だけを返す)。
 * waypoints は [lat, lng] の配列。番号付きのピンを立てる
 */
export function staticMapUrl(key, { polyline, origin, destination, waypoints = [], width, height }) {
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
  // 出発地は青、目的地は赤
  params.append("markers", `size:mid|color:0x0284C7|${origin ?? `${start[0]},${start[1]}`}`);
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
