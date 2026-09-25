import assert from "node:assert/strict";
import test from "node:test";
import { editRoutePlan, generateRoutePlan, RouteServiceError } from "../src/route-service.js";

const candidates = [
  {
    id: "place-a",
    name: "海辺の公園",
    category: "公園",
    lat: 34.68,
    lng: 135.2,
    rating: 4.6,
    reviewCount: 400,
    detourMinutes: 12,
    routeRatio: 0.4,
    offRouteKm: 1.2,
  },
  {
    id: "place-b",
    name: "港のカフェ",
    category: "カフェ",
    lat: 34.67,
    lng: 135.18,
    rating: 4.4,
    reviewCount: 240,
    detourMinutes: 15,
    routeRatio: 0.7,
    offRouteKm: 1.5,
  },
  {
    id: "place-c",
    name: "展望台",
    category: "観光名所",
    lat: 34.69,
    lng: 135.16,
    rating: 4.2,
    reviewCount: 180,
    detourMinutes: 20,
    routeRatio: 0.8,
    offRouteKm: 2,
  },
];

const generateInput = {
  origin: "大阪駅",
  destination: "神戸ハーバーランド",
  preferences: ["ocean", "cafe"],
  freeText: "海沿いのカフェ",
  timeConstraint: { type: "extra_time", minutes: 30 },
  waypointCount: 2,
};

function dependencies(overrides = {}) {
  return {
    search: async () => ({ baseMinutes: 44, distanceKm: 38.7, candidates }),
    compute: async (_origin, _destination, waypoints) => ({
      durationMinutes: 44 + waypoints.length * 9,
      distanceMeters: 38700 + waypoints.length * 1700,
    }),
    pick: async (pool) => ({ id: pool[0].id, reason: "希望に合う場所です。" }),
    tags: async (candidate) => [candidate.category],
    photoUrl: () => null,
    ...overrides,
  };
}

test("generateRoutePlan returns an exact route containing selected waypoints", async () => {
  const result = await generateRoutePlan(generateInput, dependencies());

  assert.equal(result.normalRoute.durationMinutes, 44);
  assert.equal(result.recommendedRoute.durationMinutes, 62);
  assert.equal(result.recommendedRoute.distanceMeters, 42100);
  assert.equal(result.recommendedRoute.extraMinutes, 18);
  assert.deepEqual(result.waypoints.map((waypoint) => waypoint.placeId), ["place-a", "place-b"]);
  assert.match(result.googleMapsUrl, /waypoints=34\.68%2C135\.2%7C34\.67%2C135\.18/);
});

test("generateRoutePlan drops to one waypoint when two exceed the time constraint", async () => {
  const result = await generateRoutePlan(generateInput, dependencies({
    compute: async (_origin, _destination, waypoints) => ({
      durationMinutes: waypoints.length === 2 ? 80 : 58,
      distanceMeters: 41000,
    }),
  }));

  assert.equal(result.waypoints.length, 1);
  assert.equal(result.recommendedRoute.durationMinutes, 58);
});

test("generateRoutePlan uses ranked fallback when TypeSafe selection fails", async () => {
  const result = await generateRoutePlan({ ...generateInput, waypointCount: 1 }, dependencies({
    pick: async () => { throw new Error("service unavailable"); },
  }));

  assert.equal(result.waypoints[0].placeId, "place-a");
});

test("editRoutePlan deletes a waypoint and recalculates the route", async () => {
  const original = await generateRoutePlan(generateInput, dependencies());
  const result = await editRoutePlan({
    route: original,
    preferences: generateInput.preferences,
    freeText: generateInput.freeText,
    timeConstraint: generateInput.timeConstraint,
    action: { type: "delete", waypointIndex: 0 },
  }, dependencies());

  assert.deepEqual(result.waypoints.map((waypoint) => waypoint.placeId), ["place-b"]);
  assert.equal(result.recommendedRoute.durationMinutes, 53);
  assert.match(result.reason, /海辺の公園を外し/);
});

test("editRoutePlan replaces a waypoint and excludes already shown candidates", async () => {
  const original = await generateRoutePlan(generateInput, dependencies());
  const result = await editRoutePlan({
    route: original,
    preferences: generateInput.preferences,
    freeText: generateInput.freeText,
    timeConstraint: generateInput.timeConstraint,
    action: { type: "replace", waypointIndex: 0, excludedPlaceIds: [] },
  }, dependencies());

  assert.equal(result.waypoints[0].placeId, "place-c");
  assert.equal(result.waypoints[1].placeId, "place-b");
});

test("generateRoutePlan rejects invalid input with a structured error", async () => {
  await assert.rejects(
    () => generateRoutePlan({ ...generateInput, preferences: ["unknown"] }, dependencies()),
    (error) => error instanceof RouteServiceError && error.code === "INVALID_REQUEST" && error.status === 400,
  );
});

test("generateRoutePlan accepts empty preferences", async () => {
  const result = await generateRoutePlan({ ...generateInput, preferences: [], freeText: "" }, dependencies());

  assert.ok(result.waypoints.length > 0);
});

test("generateRoutePlan requires preferences to be an array", async () => {
  await assert.rejects(
    () => generateRoutePlan({ ...generateInput, preferences: undefined }, dependencies()),
    (error) => error instanceof RouteServiceError && error.code === "INVALID_REQUEST",
  );
});

test("editRoutePlan eliminates candidates similar to the rejected tags", async () => {
  const more = [
    ...candidates,
    { id: "place-d", name: "港のカフェ2号店", category: "カフェ", lat: 34.66, lng: 135.17, rating: 4.8, detourMinutes: 10, routeRatio: 0.5 },
    { id: "place-e", name: "山の温泉", category: "温泉", lat: 34.7, lng: 135.1, rating: 4.0, detourMinutes: 25, routeRatio: 0.6 },
  ];
  let feedbackSeen = null;
  const deps = dependencies({
    search: async () => ({ baseMinutes: 44, distanceKm: 38.7, candidates: more }),
    pick: async (pool, _text, feedback) => {
      feedbackSeen = feedback;
      return { id: pool[0].id, reason: null };
    },
  });
  const original = await generateRoutePlan({ ...generateInput, waypointCount: 1 }, deps);
  const result = await editRoutePlan({
    route: original,
    preferences: [],
    freeText: "",
    timeConstraint: { type: "none" },
    action: { type: "replace", waypointIndex: 0, excludedPlaceIds: [], badTags: ["カフェ", "展望台", "公園"] },
  }, deps);

  // 元の経由地を除いた4件のうち、温泉以外の3件が消える
  assert.equal(original.waypoints.length, 1);
  assert.deepEqual(feedbackSeen, { badTags: ["カフェ", "展望台", "公園"], goodTags: [] });
  assert.equal(result.waypoints[0].placeId, "place-e");
  assert.equal(result.eliminatedCount, 3);
});

test("editRoutePlan keeps candidates when every one matches the rejected tags", async () => {
  const cafes = candidates.map((candidate) => ({ ...candidate, category: "カフェ" }));
  const deps = dependencies({ search: async () => ({ baseMinutes: 44, distanceKm: 38.7, candidates: cafes }) });
  const original = await generateRoutePlan({ ...generateInput, waypointCount: 1 }, deps);
  const result = await editRoutePlan({
    route: original,
    preferences: [],
    freeText: "",
    timeConstraint: { type: "none" },
    action: { type: "replace", waypointIndex: 0, excludedPlaceIds: [], badTags: ["カフェ"] },
  }, deps);

  assert.equal(result.eliminatedCount, 0);
  assert.ok(result.waypoints[0].placeId);
});

test("editRoutePlan rejects badTags that are not strings", async () => {
  const original = await generateRoutePlan({ ...generateInput, waypointCount: 1 }, dependencies());
  await assert.rejects(
    () => editRoutePlan({
      route: original,
      preferences: [],
      freeText: "",
      timeConstraint: { type: "none" },
      action: { type: "replace", waypointIndex: 0, badTags: [1] },
    }, dependencies()),
    (error) => error instanceof RouteServiceError && error.code === "INVALID_REQUEST",
  );
});

test("editRoutePlan passes liked tags to the picker without eliminating anything", async () => {
  let feedbackSeen = null;
  const deps = dependencies({
    pick: async (pool, _text, feedback) => {
      feedbackSeen = feedback;
      return { id: pool[0].id, reason: null };
    },
  });
  const original = await generateRoutePlan({ ...generateInput, waypointCount: 1 }, deps);
  const result = await editRoutePlan({
    route: original,
    preferences: [],
    freeText: "",
    timeConstraint: { type: "none" },
    action: { type: "replace", waypointIndex: 0, excludedPlaceIds: [], goodTags: ["景色"] },
  }, deps);

  assert.deepEqual(feedbackSeen, { badTags: [], goodTags: ["景色"] });
  assert.equal(result.eliminatedCount, 0);
});

test("route responses keep leg minutes and waypoint arrival details", async () => {
  const result = await generateRoutePlan({ ...generateInput, waypointCount: 1 }, dependencies({
    compute: async () => ({ durationMinutes: 50, distanceMeters: 40000, legMinutes: [20, 30] }),
  }));

  assert.deepEqual(result.recommendedRoute.legMinutes, [20, 30]);
  assert.equal("stayMinutes" in result.waypoints[0], false);
  assert.ok("priceRange" in result.waypoints[0]);
});

// 差し替えは同じ種類から。食事の店を替えて公園になっていた(9/25)
const kindCandidates = [
  { id: "meal-1", name: "海鮮食堂", category: "和食店", kind: "meal", lat: 34.68, lng: 135.2, rating: 4.5, detourMinutes: 10, routeRatio: 0.4 },
  { id: "park-1", name: "海辺の公園", category: "公園", kind: "spot", lat: 34.68, lng: 135.19, rating: 4.9, detourMinutes: 8, routeRatio: 0.5 },
  { id: "meal-2", name: "ラーメン屋", category: "ラーメン屋", kind: "meal", lat: 34.67, lng: 135.18, rating: 4.1, detourMinutes: 12, routeRatio: 0.6 },
  { id: "cafe-1", name: "港のカフェ", category: "カフェ", kind: "sweets", lat: 34.66, lng: 135.17, rating: 4.7, detourMinutes: 9, routeRatio: 0.7 },
];

async function replaceFirst(pool, waypoint) {
  const deps = dependencies({ search: async () => ({ baseMinutes: 44, distanceKm: 38.7, candidates: pool }) });
  const original = await generateRoutePlan({ ...generateInput, waypointCount: 1 }, deps);
  const route = { ...original, waypoints: [waypoint(original.waypoints[0])] };
  return editRoutePlan({
    route,
    preferences: [],
    freeText: "",
    timeConstraint: { type: "none" },
    action: { type: "replace", waypointIndex: 0, excludedPlaceIds: [] },
  }, deps);
}

test("editRoutePlan replaces a restaurant with a restaurant, not a higher-rated park", async () => {
  const result = await replaceFirst(kindCandidates, () => ({ ...kindCandidates[0] , placeId: "meal-1" }));
  assert.equal(result.waypoints[0].placeId, "meal-2");
  assert.equal(result.waypoints[0].kind, "meal");
});

test("editRoutePlan looks up the kind from the search when the waypoint has none", async () => {
  const result = await replaceFirst(kindCandidates, () => ({ placeId: "meal-1", name: "海鮮食堂", lat: 34.68, lng: 135.2 }));
  assert.equal(result.waypoints[0].placeId, "meal-2");
});

test("editRoutePlan falls back to another eatery but never to a spot", async () => {
  const noOtherMeal = kindCandidates.filter((candidate) => candidate.id !== "meal-2");
  const result = await replaceFirst(noOtherMeal, () => ({ placeId: "meal-1", kind: "meal" }));
  assert.equal(result.waypoints[0].placeId, "cafe-1");

  const onlySpots = kindCandidates.filter((candidate) => candidate.kind === "spot" || candidate.id === "meal-1");
  await assert.rejects(
    () => replaceFirst(onlySpots, () => ({ placeId: "meal-1", kind: "meal" })),
    (error) => error instanceof RouteServiceError && error.code === "NO_CANDIDATES",
  );
});
