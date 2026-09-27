import assert from "node:assert/strict";
import test from "node:test";
import { decodePolyline, encodePolyline, thinPoints } from "../src/polyline.js";
import { clampSize, fitView, ORIGIN_MARKER_PNG, staticMapUrl } from "../src/route-map.js";

test("encodePolyline is the inverse of decodePolyline", () => {
  const points = [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]];
  assert.equal(encodePolyline(points), "_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  assert.deepEqual(decodePolyline(encodePolyline(points)), points);
});

test("thinPoints keeps both ends and caps the count", () => {
  const points = Array.from({ length: 1000 }, (_, i) => [i, i]);
  const thinned = thinPoints(points, 300);
  assert.equal(thinned.length, 300);
  assert.deepEqual(thinned[0], [0, 0]);
  assert.deepEqual(thinned.at(-1), [999, 999]);
});

test("staticMapUrl draws the path and numbered waypoint pins within the URL limit", () => {
  const long = encodePolyline(Array.from({ length: 5000 }, (_, i) => [34.7 + i * 1e-4, 135.5 + i * 1e-4]));
  const url = staticMapUrl("KEY", { polyline: long, waypoints: [[34.8, 135.6], [34.9, 135.7]], width: 390, height: 300 });
  assert.ok(url.length < 16384, `url length ${url.length}`);
  assert.match(url, /size=390x300/);
  assert.match(url, /label%3A1%7C34\.8%2C135\.6/);
  assert.match(url, /label%3A2%7C34\.9%2C135\.7/);
});

test("clampSize keeps sizes within what Static Maps accepts", () => {
  assert.equal(clampSize("2000", 390), 640);
  assert.equal(clampSize("abc", 390), 390);
  assert.equal(clampSize("10", 390), 120);
});

test("staticMapUrl uses the grey circle icon for the origin when given", () => {
  const polyline = encodePolyline([[34.7, 135.5], [35.0, 135.7]]);
  const url = decodeURIComponent(staticMapUrl("KEY", { polyline, width: 390, height: 300, originIconUrl: "https://example.com/marker/origin.png" }));
  assert.match(url, /markers=anchor:14,62\|icon:https:\/\/example\.com\/marker\/origin\.png\|34\.5\d+,135\.5&/);
  assert.match(url, /markers=size:mid\|color:0xDC2626\|35,135\.7/);
});

test("ORIGIN_MARKER_PNG is a PNG", () => {
  assert.deepEqual([...ORIGIN_MARKER_PNG.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});

test("staticMapUrl lowers the origin anchor so the grey circle is drawn above waypoint pins", () => {
  const polyline = encodePolyline([[34.7, 135.5], [35.0, 135.7]]);
  const url = decodeURIComponent(staticMapUrl("KEY", { polyline, waypoints: [[34.699, 135.5]], width: 390, height: 300, originIconUrl: "https://example.com/o.png" }));
  const [, zoom] = url.match(/zoom=(\d+)/);
  const [, lat, lng] = url.match(/markers=anchor:14,62\|icon:https:\/\/example\.com\/o\.png\|([\d.]+),([\d.]+)/);
  // 基準点は出発地のすぐ南(ズームに応じて 48px ぶん)で、経度はそのまま
  assert.ok(Number(lat) < 34.7 && Number(lat) > 34.5, lat);
  assert.equal(Number(lng), 135.5);
  const view = fitView([[34.7, 135.5], [35.0, 135.7]], [34.7, 135.5], 390, 300);
  assert.equal(Number(zoom), view.zoom);
});

test("fitView keeps every point and the lowered origin anchor inside the image", () => {
  const points = [[34.7, 135.5], [35.0, 135.7], [34.85, 135.4]];
  const { zoom, center, dropSouth } = fitView(points, points[0], 390, 300);
  const k = 2 ** zoom * 256;
  const px = ([lat, lng]) => {
    const sin = Math.sin((lat * Math.PI) / 180);
    return [((lng + 180) / 360) * k, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * k];
  };
  const [cx, cy] = px(center);
  for (const point of [...points, dropSouth(points[0], 48)]) {
    const [x, y] = px(point);
    assert.ok(Math.abs(x - cx) <= 195 && Math.abs(y - cy) <= 150, `${point} at zoom ${zoom}`);
  }
  // 1段ズームを上げると収まらない(いちばん大きいズームを選んでいる)
  assert.ok(zoom < 18);
});
