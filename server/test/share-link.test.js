import assert from "node:assert/strict";
import test from "node:test";
import { parseShareText, routeFromUrl } from "../src/share-link.js";
import { RouteServiceError } from "../src/route-service.js";

const here = { lat: 34.7025, lng: 135.4959 };
const route = (href) => routeFromUrl(new URL(href));

test("reads origin and destination from a /maps/dir/ path", () => {
  assert.deepEqual(
    route("https://www.google.com/maps/dir/%E5%A4%A7%E9%98%AA%E9%A7%85/%E7%A5%9E%E6%88%B8/@34.7,135.3,11z/data=!4m2"),
    { origin: "大阪駅", destination: "神戸" },
  );
});

test("uses the last place as the destination when waypoints are present", () => {
  assert.deepEqual(route("https://www.google.com/maps/dir/A/B/C/@1,2,3z"), { origin: "A", destination: "C" });
});

test("treats an empty or named current-location origin as missing", () => {
  assert.deepEqual(route("https://www.google.com/maps/dir//%E7%A5%9E%E6%88%B8/@34.7,135.3,11z"), { origin: null, destination: "神戸" });
  assert.deepEqual(route("https://www.google.com/maps/dir/%E7%8F%BE%E5%9C%A8%E5%9C%B0/%E7%A5%9E%E6%88%B8/"), { origin: null, destination: "神戸" });
  assert.deepEqual(route("https://www.google.com/maps/dir/My+Location/Kobe/"), { origin: null, destination: "Kobe" });
});

test("reads the api=1 query form, with or without an origin", () => {
  assert.deepEqual(route("https://www.google.com/maps/dir/?api=1&origin=A&destination=B"), { origin: "A", destination: "B" });
  assert.deepEqual(route("https://www.google.com/maps/dir/?api=1&destination=B"), { origin: null, destination: "B" });
});

test("keeps coordinate origins as they are", () => {
  assert.deepEqual(route("https://www.google.com/maps/dir/34.70,135.49/Kobe/"), { origin: "34.70,135.49", destination: "Kobe" });
});

test("expands a short link hop by hop and fills the current location", async () => {
  const hops = {
    "https://maps.app.goo.gl/abc": "https://www.google.com/maps/dir//%E7%A5%9E%E6%88%B8/@34.7,135.3,11z",
  };
  const fetchImpl = async (href, init) => {
    assert.equal(init.redirect, "manual");
    return { headers: new Headers({ location: hops[href] }) };
  };
  const result = await parseShareText("神戸 への経路 https://maps.app.goo.gl/abc", here, fetchImpl);
  assert.deepEqual(result, { origin: "34.7025,135.4959", destination: "神戸", originIsCurrentLocation: true });
});

test("asks for the current location when the origin is missing", async () => {
  await assert.rejects(
    () => parseShareText("https://www.google.com/maps/dir//Kobe/", null),
    (error) => error instanceof RouteServiceError && error.code === "ORIGIN_REQUIRED",
  );
});

test("rejects text that is not a Google Maps route", async () => {
  for (const text of ["", "hello", "https://example.com/maps/dir/A/B", "https://www.google.com/maps/place/Kobe"]) {
    await assert.rejects(
      () => parseShareText(text, here),
      (error) => error instanceof RouteServiceError && error.code === "MAPS_URL_PARSE_FAILED",
      text,
    );
  }
});

test("refuses a short link that redirects away from Google Maps", async () => {
  const fetchImpl = async () => ({ headers: new Headers({ location: "https://consent.example.com/" }) });
  await assert.rejects(
    () => parseShareText("https://maps.app.goo.gl/abc", here, fetchImpl),
    (error) => error.code === "MAPS_URL_PARSE_FAILED",
  );
});

// 実際の共有 URL(9/25)。目的地が「潤和」だけだと熊本の潤和に解決されるので、data= の座標を使う
const JUNWA = "https://www.google.com/maps/dir/%E5%A4%A7%E9%98%AA%E9%A7%85/%E6%BD%A4%E5%92%8C/@34.7317082,134.9192771,10z/data=!3m1!4b1!4m13!4m12!1m5!1m1!1s0x6000e68d95e3a70b:0x1baec822e859c84a!2m2!1d135.4959506!2d34.7024854!1m5!1m1!1s0x60008028721a5123:0x8e1daf7dcf31bc04!2m2!1d135.0011657!2d34.6662708?entry=ttu";

test("uses the coordinates in data= and keeps the names for display", () => {
  assert.deepEqual(route(JUNWA), {
    origin: "34.7024854,135.4959506",
    destination: "34.6662708,135.0011657",
    originName: "大阪駅",
    destinationName: "潤和",
  });
});

test("reads coordinates when the origin is the current location (!1m0)", async () => {
  const href = "https://www.google.com/maps/dir//%E6%BD%A4%E5%92%8C/@34.66,134.95,14z/data=!4m8!4m7!1m0!1m5!1m1!1s0x60008028721a5123:0x8e1daf7dcf31bc04!2m2!1d135.0011657!2d34.6662708?entry=ttu";
  assert.deepEqual(route(href), { origin: null, destination: "34.6662708,135.0011657", destinationName: "潤和" });
  assert.deepEqual(await parseShareText(href, here), {
    origin: "34.7025,135.4959",
    destination: "34.6662708,135.0011657",
    originIsCurrentLocation: true,
    destinationName: "潤和",
  });
});

test("uses the last place's coordinates when waypoints are present", () => {
  const href = "https://www.google.com/maps/dir/A/B/C/@1,2,3z/data=!4m20!4m19!1m5!1m1!1s0x1:0x1!2m2!1d135.1!2d34.1!1m5!1m1!1s0x2:0x2!2m2!1d135.2!2d34.2!1m5!1m1!1s0x3:0x3!2m2!1d135.3!2d34.3!3e0";
  assert.deepEqual(route(href), { origin: "34.1,135.1", destination: "34.3,135.3", originName: "A", destinationName: "C" });
});

test("falls back to the names when data= does not match the places", () => {
  const href = "https://www.google.com/maps/dir/A/B/@1,2,3z/data=!4m9!4m8!1m0!1m5!1m1!1s0x1:0x1!2m2!1d135.1!2d34.1!1m0";
  assert.deepEqual(route(href), { origin: "A", destination: "B" });
});

test("does not use a coordinate origin as a display name", () => {
  const href = "https://www.google.com/maps/dir/34.70,135.49/Kobe/@1,2,3z/data=!4m9!4m8!1m1!4e1!1m5!1m1!1s0x1:0x1!2m2!1d135.1!2d34.1";
  assert.deepEqual(route(href), { origin: "34.70,135.49", destination: "34.1,135.1", destinationName: "Kobe" });
});
