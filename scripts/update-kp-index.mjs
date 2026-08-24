import { readFile, writeFile } from "node:fs/promises";
import { parseKpIndices } from "./kp-parser.mjs";

const sourceUrl = "https://www.consultant.ru/document/cons_doc_LAW_39473/";
const target = new URL("../app/data/kp-index.json", import.meta.url);
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30_000);

try {
  const response = await fetch(sourceUrl, {
    signal: controller.signal,
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; ProjectCalcIndexUpdater/1.0; +https://github.com/ntrworkspace/proektraschet-calculator)",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) throw new Error(`Источник вернул HTTP ${response.status}`);

  const parsed = parseKpIndices(await response.text());
  if (!parsed.length) throw new Error("В таблице не найдены квартальные индексы проектных работ");

  const current = JSON.parse(await readFile(target, "utf8"));
  const merged = new Map(current.indices.map(item => [`${item.year}-${item.quarter}`, item]));
  for (const item of parsed) merged.set(`${item.year}-${item.quarter}`, item);

  const next = {
    source: current.source,
    indices: [...merged.values()].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)),
  };
  const before = `${JSON.stringify(current, null, 2)}\n`;
  const after = `${JSON.stringify(next, null, 2)}\n`;

  if (before === after) {
    console.log("Квартальные коэффициенты не изменились.");
  } else {
    await writeFile(target, after, "utf8");
    console.log(`Обновлено записей: ${parsed.length}. Последний период: ${parsed.at(-1).period}, KP=${parsed.at(-1).value}`);
  }
} finally {
  clearTimeout(timeout);
}
