import assert from "node:assert/strict";
import test from "node:test";
import { formatPriceRange } from "../src/google.js";

const jpy = (units) => ({ currencyCode: "JPY", units: String(units) });

test("shows the yen range from priceRange", () => {
  assert.equal(formatPriceRange({ startPrice: jpy(1000), endPrice: jpy(2000) }, "PRICE_LEVEL_MODERATE"), "¥1,000〜2,000");
});

test("shows an open-ended range when one side is missing", () => {
  assert.equal(formatPriceRange({ startPrice: jpy(10000) }, "PRICE_LEVEL_VERY_EXPENSIVE"), "¥10,000〜");
  assert.equal(formatPriceRange({ endPrice: jpy(1000) }, "PRICE_LEVEL_INEXPENSIVE"), "〜¥1,000");
});

test("falls back to the rough label without a yen amount", () => {
  assert.equal(formatPriceRange(undefined, "PRICE_LEVEL_MODERATE"), "ふつう");
  assert.equal(formatPriceRange({ startPrice: { currencyCode: "USD", units: "10" } }, "PRICE_LEVEL_INEXPENSIVE"), "安い");
  assert.equal(formatPriceRange(undefined, undefined), null);
});
