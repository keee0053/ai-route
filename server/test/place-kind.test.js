import assert from "node:assert/strict";
import test from "node:test";
import { placeKind } from "../src/google.js";

// 実際の Places の primaryType(9/25 明石・神戸周辺で取得)
test("classifies eateries, sweets and spots by the primary type", () => {
  for (const type of ["ramen_restaurant", "japanese_izakaya_restaurant", "restaurant", "bistro", "brewpub", "meal_takeaway", "bar", "hookah_bar"]) {
    assert.equal(placeKind(type), "meal", type);
  }
  for (const type of ["cafe", "coffee_shop", "coffee_roastery", "cake_shop", "dessert_restaurant", "dessert_shop", "confectionery", "pastry_shop", "ice_cream_shop", "acai_shop"]) {
    assert.equal(placeKind(type), "sweets", type);
  }
  // レストランが入っている展望台(神戸ポートタワー)や道の駅も、寄る目的は食事ではない
  for (const type of ["observation_deck", "park", "city_park", "shinto_shrine", "castle", "museum", "rest_stop", "tourist_attraction", "farmers_market", "gift_shop", "barber_shop", undefined]) {
    assert.equal(placeKind(type), "spot", String(type));
  }
});
