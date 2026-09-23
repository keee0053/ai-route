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
