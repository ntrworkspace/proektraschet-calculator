const romanQuarter = { I: 1, II: 2, III: 3, IV: 4 };

function cleanHtml(value) {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseKpIndices(html) {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const found = [];
  let project2001Column = 7;

  for (const rowMatch of rows) {
    const rawCells = [...rowMatch[1].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)];
    const texts = rawCells.map(match => cleanHtml(match[2]));
    const surveyIndex = texts.findIndex(text => /Индекс изменения стоимости изыскательских работ/i.test(text));
    const projectIndex = texts.findIndex(text => /Индекс изменения стоимости проектных работ/i.test(text));
    if (surveyIndex < 0 || projectIndex < 0) continue;

    const surveySpan = Number(rawCells[surveyIndex][1].match(/colspan=["']?(\d+)/i)?.[1] ?? 1);
    project2001Column = 1 + surveySpan + 1;
    break;
  }

  for (const rowMatch of rows) {
    const cells = [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(match => cleanHtml(match[1]));
    const periodMatch = cells[0]?.match(/^(I{1,3}|IV)\s+квартал\s+(\d{4})\s*г?\.?/i);
    if (!periodMatch || cells.length <= project2001Column) continue;

    const quarter = romanQuarter[periodMatch[1].toUpperCase()];
    const year = Number(periodMatch[2]);
    const value = Number(cells[project2001Column].replace(",", "."));
    if (!quarter || year < 2026 || !Number.isFinite(value) || value < 1 || value > 20) continue;

    found.push({
      year,
      quarter,
      period: `${periodMatch[1].toUpperCase()} квартал ${year} г.`,
      effectiveFrom: `${year}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}-01`,
      value,
    });
  }

  return [...new Map(found.map(item => [`${item.year}-${item.quarter}`, item])).values()]
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}
