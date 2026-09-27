import assert from "node:assert/strict";
import test from "node:test";
import {
  automaticWaypointCount,
  buildGoogleMapsUrl,
  candidatePool,
  editRoutePlan,
  fitsKindLimits,
  kindLimits,
  generateRoutePlan,
  maximumGeneratedWaypointCount,
  RouteServiceError,
} from "../src/route-service.js";

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

test("generateRoutePlan tries candidates outside the initial AI selection before returning no detour", async () => {
  const available = Array.from({ length: 4 }, (_, index) => ({
    id: `candidate-${index}`,
    name: `候補${index + 1}`,
    category: "公園",
    lat: 34.6 + index * 0.01,
    lng: 135.1 + index * 0.01,
    rating: 4.9 - index * 0.1,
    reviewCount: 400 - index,
    detourMinutes: 10,
    routeRatio: 0.2 + index * 0.15,
    offRouteKm: 1,
  }));
  const result = await generateRoutePlan(
    { ...generateInput, timeConstraint: { type: "extra_time", minutes: 15 } },
    dependencies({
      search: async () => ({ baseMinutes: 44, distanceKm: 38.7, candidates: available }),
      compute: async (_origin, _destination, waypoints) => ({
        durationMinutes: waypoints.length === 1 && waypoints[0].id === "candidate-3" ? 54 : 80,
        distanceMeters: 41000,
      }),
    }),
  );

  assert.deepEqual(result.waypoints.map((waypoint) => waypoint.placeId), ["candidate-3"]);
  assert.equal(result.recommendedRoute.extraMinutes, 10);
});

test("generateRoutePlan returns no detour only after every candidate exceeds the time constraint", async () => {
  const attemptedSingles = new Set();
  const available = Array.from({ length: 4 }, (_, index) => ({
    id: `too-long-${index}`,
    name: `遠い候補${index + 1}`,
    category: "観光名所",
    lat: 34.6 + index * 0.01,
    lng: 135.1 + index * 0.01,
    rating: 4.9 - index * 0.1,
    reviewCount: 400 - index,
    detourMinutes: 10,
    routeRatio: 0.2 + index * 0.15,
    offRouteKm: 1,
  }));
  const result = await generateRoutePlan(
    { ...generateInput, timeConstraint: { type: "extra_time", minutes: 15 } },
    dependencies({
      search: async () => ({ baseMinutes: 44, distanceKm: 38.7, candidates: available }),
      compute: async (_origin, _destination, waypoints) => {
        if (waypoints.length === 1) attemptedSingles.add(waypoints[0].id);
        return { durationMinutes: 80, distanceMeters: 41000 };
      },
    }),
  );

  assert.deepEqual([...attemptedSingles].sort(), available.map((candidate) => candidate.id).sort());
  assert.deepEqual(result.waypoints, []);
  assert.equal(result.recommendedRoute.extraMinutes, 0);
});

test("automaticWaypointCount grows from two to five with route length", () => {
  assert.equal(automaticWaypointCount(20, { type: "none" }, 10), 2);
  assert.equal(automaticWaypointCount(60, { type: "none" }, 10), 3);
  assert.equal(automaticWaypointCount(120, { type: "none" }, 10), 4);
  assert.equal(automaticWaypointCount(240, { type: "none" }, 10), 5);
  assert.equal(automaticWaypointCount(240, { type: "total_time", minutes: 240 }, 10), 0);
});

test("maximumGeneratedWaypointCount follows the requested extra-time bands", () => {
  assert.equal(maximumGeneratedWaypointCount(60, { type: "extra_time", minutes: 15 }), 3);
  assert.equal(maximumGeneratedWaypointCount(60, { type: "extra_time", minutes: 16 }), 5);
  assert.equal(maximumGeneratedWaypointCount(60, { type: "extra_time", minutes: 30 }), 5);
  assert.equal(maximumGeneratedWaypointCount(60, { type: "extra_time", minutes: 31 }), 7);
  assert.equal(maximumGeneratedWaypointCount(60, { type: "extra_time", minutes: 60 }), 7);
  assert.equal(maximumGeneratedWaypointCount(60, { type: "extra_time", minutes: 61 }), 9);
  assert.equal(maximumGeneratedWaypointCount(60, { type: "total_time", minutes: 180 }), 9);
  assert.equal(maximumGeneratedWaypointCount(60, { type: "none" }), 5);
});

test("walking and bicycling use smaller waypoint targets than driving", () => {
  assert.equal(automaticWaypointCount(60, { type: "none" }, 10, "driving"), 3);
  assert.equal(automaticWaypointCount(60, { type: "none" }, 10, "bicycling"), 2);
  assert.equal(automaticWaypointCount(60, { type: "none" }, 10, "walking"), 2);
  assert.equal(maximumGeneratedWaypointCount(60, { type: "extra_time", minutes: 15 }, "walking"), 1);
  assert.equal(maximumGeneratedWaypointCount(60, { type: "extra_time", minutes: 30 }, "bicycling"), 3);
  assert.equal(maximumGeneratedWaypointCount(60, { type: "extra_time", minutes: 90 }, "walking"), 5);
});

test("candidate distance limits depend on travel mode", () => {
  const nearby = candidates.map((candidate, index) => ({
    ...candidate,
    id: `distance-${index}`,
    offRouteKm: [0.5, 1.5, 4][index],
    detourMinutes: 5,
  }));

  assert.equal(candidatePool(nearby, 60, { type: "none" }, "walking").length, 1);
  assert.equal(candidatePool(nearby, 60, { type: "none" }, "bicycling").length, 2);
  assert.equal(candidatePool(nearby, 60, { type: "none" }, "driving").length, 3);
});

test("generated route keeps the selected travel mode", async () => {
  const calls = [];
  const result = await generateRoutePlan(
    { ...generateInput, travelMode: "walking" },
    dependencies({
      search: async (...args) => {
        calls.push(["search", args.at(-1)]);
        return {
          baseMinutes: 60,
          distanceKm: 4.8,
          candidates: candidates.map((candidate) => ({ ...candidate, offRouteKm: 0.5, detourMinutes: 8 })),
        };
      },
      compute: async (_origin, _destination, waypoints, travelMode) => {
        calls.push(["compute", travelMode]);
        return { durationMinutes: 60 + waypoints.length * 8, distanceMeters: 4800 };
      },
    }),
  );

  assert.equal(result.travelMode, "walking");
  assert.match(result.googleMapsUrl, /travelmode=walking/);
  assert.deepEqual(calls, [["search", "walking"], ["compute", "walking"]]);
  assert.match(buildGoogleMapsUrl("A", "B", [], "bicycling"), /travelmode=bicycling/);
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

test("generateRoutePlan retries with smaller detours when one expensive stop blocks the time target", async () => {
  const available = [
    {
      id: "expensive",
      name: "遠い人気スポット",
      category: "観光名所",
      lat: 34.61,
      lng: 135.11,
      rating: 4.9,
      reviewCount: 500,
      detourMinutes: 30,
      routeRatio: 0.2,
      offRouteKm: 2,
    },
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `quick-${index}`,
      name: `近い候補${index + 1}`,
      category: "公園",
      lat: 34.62 + index * 0.01,
      lng: 135.12 + index * 0.01,
      rating: 4.5 - index * 0.05,
      reviewCount: 300 - index,
      detourMinutes: 10,
      routeRatio: 0.3 + index * 0.1,
      offRouteKm: 0.5,
    })),
  ];
  const result = await generateRoutePlan(
    {
      ...generateInput,
      timeConstraint: { type: "extra_time", minutes: 60 },
    },
    dependencies({
      search: async () => ({ baseMinutes: 60, distanceKm: 50, candidates: available }),
      compute: async (_origin, _destination, waypoints) => ({
        durationMinutes: 60 + (waypoints.some((waypoint) => waypoint.id === "expensive")
          ? 30 + Math.max(0, waypoints.length - 1) * 35
          : waypoints.length * 10),
        distanceMeters: 50000,
      }),
    }),
  );

  assert.equal(result.waypoints.length, 4);
  assert.equal(result.recommendedRoute.extraMinutes, 40);
  assert.ok(result.waypoints.every((waypoint) => waypoint.placeId.startsWith("quick-")));
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

test("generateRoutePlan puts at most one meal and one cafe on a short route", async () => {
  // 近場で時間に余裕があると、寄り道の短い飲食店ばかりが並んでいた
  const eateries = [
    ...["m1", "m2", "m3"].map((id, i) => ({ id, name: `食堂${i}`, category: "レストラン", kind: "meal", rating: 4.9 - i * 0.01 })),
    ...["s1", "s2"].map((id, i) => ({ id, name: `喫茶${i}`, category: "カフェ", kind: "sweets", rating: 4.8 - i * 0.01 })),
    ...["p1", "p2"].map((id, i) => ({ id, name: `公園${i}`, category: "公園", kind: "spot", rating: 4.0 - i * 0.01 })),
  ].map((c, i) => ({ ...c, lat: 34.7, lng: 135.5 + i * 0.001, reviewCount: 100, detourMinutes: 3, routeRatio: 0.2 + i * 0.1, offRouteKm: 0.3 }));
  const result = await generateRoutePlan(
    { ...generateInput, preferences: [], freeText: "", timeConstraint: { type: "extra_time", minutes: 30 } },
    dependencies({
      search: async () => ({ baseMinutes: 8, distanceKm: 3, candidates: eateries }),
      compute: async (_o, _d, waypoints) => ({ durationMinutes: 8 + waypoints.length * 3, distanceMeters: 3000 }),
    }),
  );
  const kinds = result.waypoints.map((waypoint) => waypoint.kind);
  assert.equal(kinds.filter((kind) => kind === "meal").length, 1);
  assert.equal(kinds.filter((kind) => kind === "sweets").length, 1);
  assert.ok(kinds.includes("spot"));
});

test("kindLimits allows a second meal only on long routes", () => {
  assert.deepEqual(kindLimits(60), { meal: 1, sweets: 1 });
  assert.equal(kindLimits(180).meal, 2);
  assert.equal(fitsKindLimits([{ kind: "meal" }], { kind: "meal" }, kindLimits(60)), false);
  assert.equal(fitsKindLimits([{ kind: "meal" }], { kind: "spot" }, kindLimits(60)), true);
  assert.equal(fitsKindLimits([{ kind: "meal" }], { kind: null }, kindLimits(60)), true);
});
