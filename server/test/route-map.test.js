import assert from "node:assert/strict";
import test from "node:test";
import { decodePolyline, encodePolyline, thinPoints } from "../src/polyline.js";
import { clampSize, staticMapUrl } from "../src/route-map.js";

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
