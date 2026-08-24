import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseKpIndices } from "../scripts/kp-parser.mjs";

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

test("quarterly project index is read from the 01.01.2001 project column", () => {
  const html = `<table><tr><td></td><td colspan="5">Индекс изменения стоимости изыскательских работ</td><td colspan="7">Индекс изменения стоимости проектных работ</td></tr><tr><td>II квартал 2026 г.</td><td>80,58</td><td>7,07</td><td>1,54</td><td>1,25</td><td>1,15</td><td>54,34</td><td>7,10</td><td>1,68</td></tr><tr><td>III квартал 2026 г.</td><td>81,95</td><td>7,19</td><td>1,57</td><td>1,27</td><td>1,17</td><td>55,26</td><td>7,22</td><td>1,71</td></tr></table>`;
  assert.deepEqual(parseKpIndices(html).map(item => [item.period, item.value]), [["II квартал 2026 г.", 7.1], ["III квартал 2026 г.", 7.22]]);
});

test("published future index starts on the first day of its quarter", async () => {
  const schedule = JSON.parse(await readFile(new URL("../app/data/kp-index.json", import.meta.url), "utf8")).indices;
  const resolve = day => schedule.filter(item => item.effectiveFrom <= day).at(-1);
  assert.equal(resolve("2026-06-30").value, 7.1);
  assert.equal(resolve("2026-07-01").value, 7.22);
});
