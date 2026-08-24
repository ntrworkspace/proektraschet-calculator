import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const data = JSON.parse(await readFile(new URL("../app/data/calculator-data.json", import.meta.url), "utf8"));
const n = value => Number(String(value ?? 0).replace(",", ".")) || 0;

test("normalized catalog has the audited coverage", () => {
  assert.equal(data.objects.length, 248);
  assert.equal(data.intervals.length, 1317);
  assert.equal(new Set(data.objects.map(row => row.category)).size, 16);
  assert.equal(data.intervals.filter(row => row.formula_found !== "True").length, 1);
});

test("baseline formula reproduces the audited reference point", () => {
  const rows = data.intervals.filter(row => row.object_id === "1").sort((a, b) => n(a.threshold) - n(b.threshold));
  const row = rows.filter(item => 2 > n(item.threshold)).at(-1);
  const base = 6.99 * (n(row.a) + n(row.b) * 2);
  assert.equal(base.toFixed(3), "3900.420");
  assert.equal((base * 1.2).toFixed(3), "4680.504");
  assert.equal((base * 1.22).toFixed(3), "4758.512");
});

test("NTS table preserves source range and exposes legacy defect", () => {
  assert.equal(n(data.htc[0].k), 10);
  assert.ok(n(data.htc.at(-1).k) < 0.1);
  assert.equal((1000 * 14 * 10 * 1.1 * 1.2 / 1000).toFixed(2), "184.80");
  assert.ok(10 / n(data.htc.at(-1).k) > 100);
});
