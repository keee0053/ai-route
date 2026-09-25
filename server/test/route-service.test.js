import assert from "node:assert/strict";
import test from "node:test";
import { automaticWaypointCount, editRoutePlan, generateRoutePlan, RouteServiceError } from "../src/route-service.js";

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
  timeConstraint: { type: "extra_time", minutes: 20 },
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
      durationMinutes: waypoints.length >= 2 ? 80 : 58,
      distanceMeters: 41000,
    }),
  }));

  assert.equal(result.waypoints.length, 1);
  assert.equal(result.recommendedRoute.durationMinutes, 58);
});

test("automaticWaypointCount grows from two to five with route length", () => {
  assert.equal(automaticWaypointCount(20, { type: "none" }, 10), 2);
  assert.equal(automaticWaypointCount(60, { type: "none" }, 10), 3);
  assert.equal(automaticWaypointCount(120, { type: "none" }, 10), 4);
  assert.equal(automaticWaypointCount(240, { type: "none" }, 10), 5);
  assert.equal(automaticWaypointCount(240, { type: "total_time", minutes: 240 }, 10), 0);
});

test("generateRoutePlan adds waypoints until it uses at least 60 percent of the requested extra time", async () => {
  const available = Array.from({ length: 7 }, (_, index) => ({
    id: `place-${index}`,
    name: `候補${index + 1}`,
    category: "観光名所",
    lat: 34.6 + index * 0.01,
    lng: 135.1 + index * 0.01,
    rating: 4.8 - index * 0.1,
    reviewCount: 300 - index,
    detourMinutes: 10,
    routeRatio: 0.1 + index * 0.1,
  }));
  const result = await generateRoutePlan(
    { ...generateInput, timeConstraint: { type: "extra_time", minutes: 60 } },
    dependencies({
      search: async () => ({ baseMinutes: 44, distanceKm: 38.7, candidates: available }),
      compute: async (_origin, _destination, waypoints) => ({
        durationMinutes: 44 + waypoints.length * 10,
        distanceMeters: 38700 + waypoints.length * 1000,
      }),
    }),
  );

  assert.equal(result.waypoints.length, 4);
  assert.equal(result.recommendedRoute.extraMinutes, 40);
});

test("generateRoutePlan stops adding at seven waypoints when it cannot reach 60 percent", async () => {
  const available = Array.from({ length: 9 }, (_, index) => ({
    id: `place-${index}`,
    name: `候補${index + 1}`,
    category: "公園",
    lat: 34.6 + index * 0.01,
    lng: 135.1 + index * 0.01,
    rating: 4.8 - index * 0.05,
    reviewCount: 300 - index,
    detourMinutes: 4,
    routeRatio: 0.08 + index * 0.09,
  }));
  const result = await generateRoutePlan(
    { ...generateInput, timeConstraint: { type: "extra_time", minutes: 60 } },
    dependencies({
      search: async () => ({ baseMinutes: 44, distanceKm: 38.7, candidates: available }),
      compute: async (_origin, _destination, waypoints) => ({
        durationMinutes: 44 + waypoints.length * 4,
        distanceMeters: 38700 + waypoints.length * 500,
      }),
    }),
  );

  assert.equal(result.waypoints.length, 7);
  assert.equal(result.recommendedRoute.extraMinutes, 28);
});

test("generateRoutePlan can return more than two waypoints for a long route", async () => {
  const many = [
    ...candidates,
    { id: "place-d", name: "道の駅", category: "道の駅", lat: 34.65, lng: 135.1, rating: 4.1, detourMinutes: 12, routeRatio: 0.6 },
    { id: "place-e", name: "展望公園", category: "公園", lat: 34.64, lng: 135.05, rating: 4.0, detourMinutes: 14, routeRatio: 0.9 },
  ];
  const result = await generateRoutePlan(
    { ...generateInput, timeConstraint: { type: "none" } },
    dependencies({
      search: async () => ({ baseMinutes: 240, distanceKm: 210, candidates: many }),
      compute: async (_origin, _destination, waypoints) => ({
        durationMinutes: 240 + waypoints.length * 8,
        distanceMeters: 210000 + waypoints.length * 1000,
      }),
    }),
  );

  assert.equal(result.waypoints.length, 5);
});

test("generateRoutePlan returns the normal route when no waypoint candidate is available", async () => {
  const result = await generateRoutePlan(generateInput, dependencies({
    search: async () => ({ baseMinutes: 44, distanceKm: 38.7, candidates: [] }),
  }));

  assert.deepEqual(result.waypoints, []);
  assert.equal(result.recommendedRoute.durationMinutes, 44);
  assert.equal(result.recommendedRoute.extraMinutes, 0);
  assert.doesNotMatch(result.googleMapsUrl, /waypoints=/);
});

test("generateRoutePlan uses ranked fallback when TypeSafe selection fails", async () => {
  const result = await generateRoutePlan({ ...generateInput, timeConstraint: { type: "extra_time", minutes: 15 } }, dependencies({
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

test("editRoutePlan adds an unused waypoint and recalculates the route", async () => {
  const input = { ...generateInput, timeConstraint: { type: "none" } };
  const available = [
    ...candidates,
    { id: "place-d", name: "道の駅", category: "道の駅", lat: 34.65, lng: 135.1, rating: 4.0, detourMinutes: 12, routeRatio: 0.9 },
  ];
  const deps = dependencies({
    search: async () => ({ baseMinutes: 44, distanceKm: 38.7, candidates: available }),
  });
  const original = await generateRoutePlan(input, deps);
  const result = await editRoutePlan({
    route: original,
    preferences: input.preferences,
    freeText: input.freeText,
    timeConstraint: input.timeConstraint,
    action: { type: "add" },
  }, deps);

  assert.deepEqual(result.waypoints.map((waypoint) => waypoint.placeId), ["place-a", "place-b", "place-c", "place-d"]);
  assert.equal(result.recommendedRoute.durationMinutes, 80);
  assert.match(result.googleMapsUrl, /34\.68%2C135\.2%7C34\.67%2C135\.18%7C34\.69%2C135\.16%7C34\.65%2C135\.1/);
});

test("editRoutePlan refuses to add a waypoint outside the time constraint", async () => {
  const original = await generateRoutePlan(generateInput, dependencies());
  await assert.rejects(
    () => editRoutePlan({
      route: original,
      preferences: generateInput.preferences,
      freeText: generateInput.freeText,
      timeConstraint: generateInput.timeConstraint,
      action: { type: "add" },
    }, dependencies({
      compute: async () => ({ durationMinutes: 90, distanceMeters: 45000 }),
    })),
    (error) => error instanceof RouteServiceError && error.code === "NO_CANDIDATES",
  );
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
  const original = await generateRoutePlan({ ...generateInput, timeConstraint: { type: "extra_time", minutes: 15 } }, deps);
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
  const original = await generateRoutePlan({ ...generateInput, timeConstraint: { type: "extra_time", minutes: 15 } }, deps);
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
  const original = await generateRoutePlan({ ...generateInput, timeConstraint: { type: "extra_time", minutes: 15 } }, dependencies());
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
  const original = await generateRoutePlan({ ...generateInput, timeConstraint: { type: "extra_time", minutes: 15 } }, deps);
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
  const result = await generateRoutePlan({ ...generateInput, timeConstraint: { type: "extra_time", minutes: 15 } }, dependencies({
    compute: async () => ({ durationMinutes: 50, distanceMeters: 40000, legMinutes: [20, 30] }),
  }));

  assert.deepEqual(result.recommendedRoute.legMinutes, [20, 30]);
  assert.equal("stayMinutes" in result.waypoints[0], false);
  assert.ok("priceRange" in result.waypoints[0]);
});
