import { decodePolyline, encodePolyline, thinPoints } from "./polyline.js";

const STATIC_MAP_URL = "https://maps.googleapis.com/maps/api/staticmap";
// URL は 16384 文字まで。経路の点を間引いて収める
const MAX_PATH_POINTS = 300;

/**
 * ルートの静止画の地図の URL を作る(キー付き。サーバの中だけで使い、端末には画像だけを返す)。
 * waypoints は [lat, lng] の配列。番号付きのピンを立てる
 */
/**
 * 出発地の印(Google マップと同じ 白いふちの灰色の丸・うっすら影付き)。
 * Static Maps には丸いマーカーが無いので、この画像を GET /marker/origin.png で配り、icon: で使わせる。
 *
 * 画像は 28x76 で、上の 28x28 に丸があり下は透明。基準点(anchor)を丸の中心から ORIGIN_ANCHOR_DROP だけ下に置く。
 * Static Maps は指定の順ではなく「南にあるマーカーほど手前」に描くので、丸の位置のままだと
 * すぐ南の経由地のピンに隠れる。基準点を下げると、丸に重なるピンより南の扱いになって手前に出る
 */
export const ORIGIN_MARKER_PNG = Uint8Array.from(atob("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"), (c) => c.charCodeAt(0));
const ORIGIN_DOT_CENTER = 14;
/** 経由地のピン(高さ約31px)と丸の半径より大きく */
const ORIGIN_ANCHOR_DROP = 48;
/** 地図の端とマーカーの間。ピンは上に伸び、番号も付くので上を広く */
const PAD = { top: 40, bottom: 16, side: 20 };
const MAX_ZOOM = 18;

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
  if (originIconUrl && !origin) {
    // 丸を経由地のピンより手前に出すため、基準点を下げる。下げる量を緯度に直すには縮尺が要るので、中心とズームをこちらで決める
    const view = fitView([...points, ...waypoints], start, width, height);
    params.set("center", `${round6(view.center[0])},${round6(view.center[1])}`);
    params.set("zoom", String(view.zoom));
    const anchor = view.dropSouth(start, ORIGIN_ANCHOR_DROP);
    params.append("markers", `anchor:${ORIGIN_DOT_CENTER},${ORIGIN_DOT_CENTER + ORIGIN_ANCHOR_DROP}|icon:${originIconUrl}|${round6(anchor[0])},${round6(anchor[1])}`);
  } else {
    params.append("markers", originIconUrl ? `anchor:center|icon:${originIconUrl}|${originPoint}` : `size:mid|color:0x5F6368|${originPoint}`);
  }
  params.append("markers", `size:mid|color:0xDC2626|${destination ?? `${end[0]},${end[1]}`}`);
  waypoints.forEach(([lat, lng], i) => {
    params.append("markers", `color:0xF97316|label:${i + 1}|${lat},${lng}`);
  });
  // 地図を静かにする(店や施設のアイコンを消し、経路とピンを目立たせる)
  params.append("style", "feature:poi|visibility:off");
  params.append("style", "feature:transit|visibility:simplified");
  return `${STATIC_MAP_URL}?${params.toString()}`;
}

const TILE = 256;
const worldX = (lng) => ((lng + 180) / 360) * TILE;
const worldY = (lat) => {
  const sin = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * TILE;
};
const lngOf = (x) => (x / TILE) * 360 - 180;
const latOf = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / TILE))) * 180) / Math.PI;
const round6 = (n) => Math.round(n * 1e6) / 1e6;

/**
 * 点(と出発地の丸の下に下げた基準点)が余白込みで収まる、いちばん大きいズームと中心(メルカトル図法)。
 * dropSouth(点, px) は、その点から画面で px だけ下の地点
 */
export function fitView(points, origin, width, height) {
  for (let zoom = MAX_ZOOM; zoom >= 0; zoom--) {
    const k = 2 ** zoom;
    let [left, right, top, bottom] = [Infinity, -Infinity, Infinity, -Infinity];
    const add = ([lat, lng], below) => {
      const x = worldX(lng) * k;
      const y = worldY(lat) * k;
      left = Math.min(left, x - PAD.side);
      right = Math.max(right, x + PAD.side);
      top = Math.min(top, y - PAD.top);
      bottom = Math.max(bottom, y + below);
    };
    points.forEach((point) => add(point, PAD.bottom));
    // 基準点が画像の外に出ると印ごと描かれないことがあるので、下げたぶんも収める
    add(origin, ORIGIN_ANCHOR_DROP + PAD.bottom);
    if (right - left > width && zoom > 0) continue;
    if (bottom - top > height && zoom > 0) continue;
    const center = [latOf((top + bottom) / 2 / k), lngOf((left + right) / 2 / k)];
    const dropSouth = ([lat, lng], px) => [latOf(worldY(lat) + px / k), lng];
    return { zoom, center, dropSouth };
  }
}

/** 幅・高さは画面に合わせて受け取るが、Static Maps の上限(640)と極端な値を丸める */
export function clampSize(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(640, Math.max(120, Math.round(n)));
}
