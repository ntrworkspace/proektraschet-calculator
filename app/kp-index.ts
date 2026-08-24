import data from "./data/kp-index.json";

export type KpIndex = {
  year: number;
  quarter: number;
  period: string;
  effectiveFrom: string;
  value: number;
};

export const kpSource = data.source;
export const kpIndices = data.indices as KpIndex[];

export function moscowDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function resolveKpIndex(date = new Date()): KpIndex {
  const day = moscowDate(date);
  const published = [...kpIndices]
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
    .filter(item => item.effectiveFrom <= day);

  return published.at(-1) ?? [...kpIndices].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
}
