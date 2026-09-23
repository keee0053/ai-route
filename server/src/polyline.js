/**
 * Google のエンコード済みポリラインを座標の配列に戻す。
 * 仕様: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let b;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/** 2点間の距離(km)。ハバーサイン */
function distanceKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * ルート上で一番近い点を探す。
 * km  … そこまでの直線距離(寄り道コストの概算に使う)
 * ratio … ルート全体のどこまで進んだ位置か(0〜1)。経由地までの時間の算出に使う
 */
export function nearestOnRoute(points, lat, lng) {
  let min = Infinity;
  let at = 0;
  // 全点を見ると重いので間引く。ポリラインは十分密なので精度は足りる
  const step = Math.max(1, Math.floor(points.length / 400));
  for (let i = 0; i < points.length; i += step) {
    const d = distanceKm(points[i][0], points[i][1], lat, lng);
    if (d < min) {
      min = d;
      at = i;
    }
  }
  return { km: min, ratio: points.length > 1 ? at / (points.length - 1) : 0 };
}

/**
 * 寄り道でどれだけ時間が増えるかの概算。
 *
 * 正確に出すには候補ごとに Routes API を叩く必要があり、100件では重すぎる。
 * 最終的に選ばれた1件だけ、あとで正確に計算し直す。
 */
export function estimateDetourMinutes(distanceKm, stayMinutes = 15, speedKmh = 40) {
  const driving = ((distanceKm * 2) / speedKmh) * 60;
  return Math.round(driving + stayMinutes);
}

/**
 * カテゴリごとの滞在時間の目安。
 * 全部同じ値にすると候補の「追加でかかる時間」が横並びになって選べない。
 */
const STAY_MINUTES = [
  [/パーキング|サービスエリア|SA|PA/, 15],
  [/道の駅/, 25],
  [/展望|景勝|海岸|浜|ビーチ/, 20],
  [/カフェ|喫茶|スイーツ|菓子|ベーカリー|パン/, 30],
  [/ラーメン|食堂|レストラン|料理|焼肉|寿司/, 40],
  [/公園|庭園/, 30],
  [/博物館|美術館|水族館|動物園|遊園/, 60],
  [/神社|寺|城|史跡|温泉/, 35],
];

export function stayMinutesFor(category) {
  for (const [re, min] of STAY_MINUTES) if (re.test(category)) return min;
  return 25;
}

/** 座標の配列を Google のエンコード済みポリラインにする(decodePolyline の逆) */
export function encodePolyline(points) {
  let lastLat = 0;
  let lastLng = 0;
  let out = "";
  const encodeValue = (value) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let chunk = "";
    while (v >= 0x20) {
      chunk += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    return chunk + String.fromCharCode(v + 63);
  };
  for (const [lat, lng] of points) {
    const iLat = Math.round(lat * 1e5);
    const iLng = Math.round(lng * 1e5);
    out += encodeValue(iLat - lastLat) + encodeValue(iLng - lastLng);
    lastLat = iLat;
    lastLng = iLng;
  }
  return out;
}

/** 点を間引いて最大 max 点にする(始点と終点は残す)。静止画の地図の URL 長の上限対策 */
export function thinPoints(points, max) {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}
