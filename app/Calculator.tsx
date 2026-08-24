"use client";

import { useEffect, useMemo, useState } from "react";
import data from "./data/calculator-data.json";
import { kpSource, resolveKpIndex } from "./kp-index";

type Mode = "norm" | "compat";
type Tab = "design" | "htc";
type Stage = "P" | "RP" | "R";
type Row = Record<string, string>;

const sectionKeys = ["AR", "GP", "KR", "TX", "OV", "VK", "EO", "SS", "AVT", "VT", "Kond", "Holod", "POS", "Smet"] as const;
const sectionLabels: Record<string, string> = {
  AR: "Архитектурные решения", GP: "Генеральный план", KR: "Конструктивные решения",
  TX: "Технология", OV: "Отопление и вентиляция", VK: "Водоснабжение и канализация",
  EO: "Электрооборудование", SS: "Сети связи", AVT: "Автоматизация", VT: "Вертикальный транспорт",
  Kond: "Кондиционирование", Holod: "Холодоснабжение", POS: "Организация строительства", Smet: "Сметная документация",
};

const fmt = (value: number, digits = 3) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
const num = (v: string | number | undefined) => Number(String(v ?? 0).replace(",", ".")) || 0;
function stageFactor(stage: Stage) { return stage === "P" ? .4 : stage === "R" ? .6 : 1; }
function stageName(stage: Stage) { return stage === "P" ? "П" : stage === "R" ? "Р" : "П + Р"; }

export default function Calculator() {
  const objects = data.objects as unknown as Row[];
  const intervals = data.intervals as unknown as Row[];
  const sections = data.sections as unknown as Row[];
  const times = data.times as unknown as Row[];
  const htc = data.htc as unknown as Row[];
  const categories = useMemo(() => [...new Set(objects.map(o => o.category))], [objects]);
  const [tab, setTab] = useState<Tab>("design");
  const [mode, setMode] = useState<Mode>("norm");
  const [category, setCategory] = useState(categories[0]);
  const categoryObjects = useMemo(() => objects.filter(o => o.category === category), [objects, category]);
  const [objectId, setObjectId] = useState(categoryObjects[0]?.object_id ?? "1");
  const selectedObject = objects.find(o => o.category === category && o.object_id === objectId) ?? categoryObjects[0];
  const objectRows = useMemo(() => intervals.filter(r => r.category === category && r.object_id === selectedObject?.object_id && r.object === selectedObject?.object), [intervals, category, selectedObject]);
  const currentKp = resolveKpIndex();
  const [n, setN] = useState(2); const [kp, setKp] = useState(currentKp.value); const [kpAutomatic, setKpAutomatic] = useState(true); const [stage, setStage] = useState<Stage>("RP");
  const [pp, setPp] = useState(false); const [vat, setVat] = useState(true); const [reuse, setReuse] = useState("1");
  const [unique, setUnique] = useState(false); const [reconstruction, setReconstruction] = useState(false); const [soils, setSoils] = useState(false);
  const [seismic, setSeismic] = useState("1"); const [shortening, setShortening] = useState("1"); const [general, setGeneral] = useState(false);
  const [capRepair, setCapRepair] = useState(false); const [imported, setImported] = useState(false);
  const [selectedSections, setSelectedSections] = useState<string[]>([...sectionKeys]);

  useEffect(() => {
    if (!kpAutomatic) return;
    const applyPublishedIndex = () => setKp(resolveKpIndex().value);
    applyPublishedIndex();
    const timer = window.setInterval(applyPublishedIndex, 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [kpAutomatic]);

  const chooseInterval = (targetMode: Mode) => {
    const sorted = [...objectRows].sort((a, b) => num(a.threshold) - num(b.threshold));
    return sorted.filter(r => targetMode === "norm" ? n >= num(r.threshold) : n > num(r.threshold)).at(-1);
  };
  const calculate = (targetMode: Mode) => {
    const row = chooseInterval(targetMode);
    if (!row || row.formula_found !== "True") return null;
    const base = kp * (num(row.a) + num(row.b) * n);
    const st = num(row.section_profile); const stageLabel = stage === "RP" ? "РП" : stage === "P" ? "П" : "Р";
    let profile: Row | undefined;
    if (targetMode === "compat") {
      const legacyIndex = st * 3 + (stage === "P" ? 0 : stage === "RP" ? 1 : 2);
      profile = sections.find(r => num(r.array_index) === legacyIndex);
    } else {
      const group = sections.filter(r => { const id = num(r.record_id); return id >= st * 3 + 1 && id <= st * 3 + 3; });
      profile = group.find(r => r.stage === stageLabel) ?? group[stage === "P" ? 0 : stage === "RP" ? 1 : 2];
    }
    const percentages = sectionKeys.map(k => num(profile?.[k]));
    const profileTotal = percentages.reduce((a, b) => a + b, 0);
    const selectedTotal = sectionKeys.reduce((sum, key, i) => sum + (selectedSections.includes(key) ? percentages[i] : 0), 0);
    const sectionRatio = targetMode === "norm" ? (profileTotal ? selectedTotal / profileTotal : 1) : 1 - (profileTotal - selectedTotal) / 100;
    const regularProduct = num(reuse) * (unique ? 1.5 : 1) * (soils ? 1.15 : 1) * num(seismic) * (general ? 1.02 : 1) * (capRepair ? .5 : 1) * (imported ? 1.3 : 1);
    const cappedProduct = targetMode === "norm" ? Math.min(regularProduct, 2) : regularProduct;
    const separateProduct = (reconstruction ? 1.5 : 1) * num(shortening);
    const vatFactor = vat ? (targetMode === "norm" ? 1.22 : 1.2) : 1;
    const core = base * stageFactor(stage) * sectionRatio * cappedProduct * separateProduct;
    const ppCost = pp ? .075 * base : 0;
    const total = targetMode === "norm" ? (core + ppCost) * vatFactor : core * vatFactor + ppCost;
    const timeRow = times.find(r => num(r.array_index) === num(row.time_profile));
    const rawTime = timeRow?.[stage === "R" ? "value_3" : stage === "RP" ? "value_4" : "value_5"] || "не нормируется";
    const timeText = targetMode === "norm" && num(shortening) > 1 ? shortenTime(rawTime, num(shortening)) : rawTime;
    return { row, base, ppCost, total, vatFactor, regularProduct, cappedProduct, sectionRatio, profile, timeText };
  };
  const norm = calculate("norm"); const compat = calculate("compat"); const result = mode === "norm" ? norm : compat;
  const mismatch = norm && compat ? norm.total - compat.total : 0;
  const handleCategory = (value: string) => { setCategory(value); setObjectId(objects.find(o => o.category === value)?.object_id ?? ""); };

  return <main>
    <header className="topbar"><div className="brand"><span className="brandMark">ПР</span><span>ПроектРасчёт<small>локальная экспертная модель</small></span></div><div className="sourceBadge"><span className="dot"/> Справочник загружен · 24.08.2026</div></header>
    <section className="hero"><div><p className="eyebrow">Калькулятор проектных работ</p><h1>Расчёт, который можно проверить</h1><p>Два алгоритма на одних исходных данных: исправленная модель и точка сравнения с исходным веб-калькулятором.</p></div><div className="modeSwitch" role="group" aria-label="Режим расчёта"><button className={mode === "norm" ? "active" : ""} onClick={() => setMode("norm")}><b>Нормативный</b><small>исправленная логика</small></button><button className={mode === "compat" ? "active compat" : ""} onClick={() => setMode("compat")}><b>Совместимость</b><small>поведение источника</small></button></div></section>
    <nav className="tabs"><button className={tab === "design" ? "active" : ""} onClick={() => setTab("design")}>Проектные работы</button><button className={tab === "htc" ? "active" : ""} onClick={() => setTab("htc")}>НТС конструкций</button><span className="tabMeta">248 типов объектов · 1 317 интервалов</span></nav>
    {tab === "design" ? <div className="workspace">
      <section className="panel formPanel">
        <div className="panelTitle"><span>01</span><div><h2>Исходные данные</h2><p>Выберите объект и параметры проектирования</p></div></div>
        <label>Раздел справочника<select value={category} onChange={e => handleCategory(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
        <label>Объект<select value={selectedObject?.object_id ?? ""} onChange={e => setObjectId(e.target.value)}>{categoryObjects.map((o, i) => <option value={o.object_id} key={`${o.object_id}-${i}`}>{o.object}</option>)}</select></label>
        {selectedObject?.status !== "ok" && <div className="alert">⚠ Строка источника имеет статус «{selectedObject?.status}». Расчёт доступен только при найденной формуле.</div>}
        <div className="fieldGrid"><label>Натуральный показатель<div className="inputUnit"><input type="number" min="0" step="any" value={n} onChange={e => setN(num(e.target.value))}/><span>{objectRows[0]?.unit || "ед."}</span></div></label><label>Коэффициент пересчёта KP<input type="number" step="0.01" value={kp} onChange={e => { setKp(num(e.target.value)); setKpAutomatic(false); }}/><span className="kpMeta"><b>{kpAutomatic ? `Авто · ${currentKp.period}` : "Введён вручную"}</b><a href={kpSource.url} target="_blank" rel="noreferrer">Источник</a>{!kpAutomatic && <button type="button" onClick={() => { const published = resolveKpIndex(); setKp(published.value); setKpAutomatic(true); }}>Вернуть авто</button>}</span></label></div>
        <div className="divider"/><div className="sectionHead"><h3>Стадии и состав</h3><span>02</span></div>
        <div className="segmented">{(["P","RP","R"] as Stage[]).map(s => <button className={stage === s ? "active" : ""} onClick={() => setStage(s)} key={s}>{stageName(s)}<small>{s === "P" ? "40%" : s === "R" ? "60%" : "100%"}</small></button>)}</div>
        <Toggle checked={pp} onChange={setPp} label="Предпроектные работы" value="7,5%"/>
        <div className="sectionsHead"><span>Разделы документации</span><button onClick={() => setSelectedSections(selectedSections.length === sectionKeys.length ? [] : [...sectionKeys])}>{selectedSections.length === sectionKeys.length ? "Снять все" : "Выбрать все"}</button></div>
        <div className="checkGrid">{sectionKeys.map(key => <label className="check" key={key}><input type="checkbox" checked={selectedSections.includes(key)} onChange={() => setSelectedSections(s => s.includes(key) ? s.filter(x => x !== key) : [...s, key])}/><span>{sectionLabels[key]}</span><em>{num(result?.profile?.[key]).toFixed(1)}%</em></label>)}</div>
        <div className="divider"/><div className="sectionHead"><h3>Коэффициенты</h3><span>03</span></div>
        <div className="fieldGrid"><label>Повторное применение<select value={reuse} onChange={e => setReuse(e.target.value)}><option value="1">Не применяется</option><option value="0.35">Первичная привязка · 0,35</option><option value="0.2">Последующая · 0,20</option></select></label><label>Сейсмичность<select value={seismic} onChange={e => setSeismic(e.target.value)}><option value="1">До 6 баллов</option><option value="1.15">7 баллов · 1,15</option><option value="1.2">8 баллов · 1,20</option><option value="1.3">9 баллов · 1,30</option></select></label><label>Сокращение сроков<select value={shortening} onChange={e => setShortening(e.target.value)}><option value="1">Не применяется</option><option value="1.1">В 1,2 раза · 1,10</option><option value="1.3">В 1,4 раза · 1,30</option><option value="1.4">В 2 раза · 1,40</option></select></label></div>
        <div className="toggleGrid"><Toggle checked={unique} onChange={setUnique} label="Уникальный объект" value="1,50"/><Toggle checked={reconstruction} onChange={setReconstruction} label="Реконструкция" value="1,50"/><Toggle checked={soils} onChange={setSoils} label="Сложные грунты" value="1,15"/><Toggle checked={general} onChange={setGeneral} label="Генпроектировщик" value="1,02"/><Toggle checked={capRepair} onChange={setCapRepair} label="Капремонт" value="0,50"/><Toggle checked={imported} onChange={setImported} label="Импортное оборудование" value="1,30"/></div>
        <Toggle checked={vat} onChange={setVat} label={mode === "norm" ? "НДС 22%" : "НДС (как в источнике — 20%)"} value={mode === "norm" ? "1,22" : "1,20"}/>
      </section>
      <aside className="panel resultPanel"><div className="resultTop"><span className={mode === "norm" ? "status norm" : "status legacy"}>{mode === "norm" ? "Нормативный режим" : "Режим совместимости"}</span><span className="formulaCode">{result ? `a ${result.row.a} · b ${result.row.b}` : "нет формулы"}</span></div><p className="resultLabel">Стоимость проектных работ</p><div className="total">{result ? fmt(result.total) : "—"}<span>тыс. ₽</span></div><div className="time"><span>Расчётный срок</span><b>{result?.timeText ?? "—"} мес.</b></div>
        {!result && <div className="alert">Для выбранного значения исходная таблица не содержит применимой формулы.</div>}{result && <><div className="breakdown"><h3>Раскладка расчёта</h3><Line label="Базовая стоимость B" value={`${fmt(result.base)} тыс. ₽`}/><Line label={kpAutomatic ? `Индекс ${currentKp.period}` : "KP (введён вручную)"} value={`× ${kp.toFixed(2)}`}/><Line label={`Стадия ${stageName(stage)}`} value={`× ${stageFactor(stage).toFixed(2)}`}/><Line label="Выбранные разделы" value={`${(result.sectionRatio*100).toFixed(1)}%`}/><Line label="Проектные коэффициенты" value={`× ${result.cappedProduct.toFixed(3)}`}/>{mode === "norm" && result.regularProduct > 2 && <p className="capNote">Произведение {result.regularProduct.toFixed(3)} ограничено значением 2,0.</p>}<Line label="Предпроектные работы" value={`${fmt(result.ppCost)} тыс. ₽`}/><Line label="НДС" value={`× ${result.vatFactor.toFixed(2)}`}/></div><div className="formula"><span>Формула</span><code>B = KP × (a + b × n)</code></div></>}
        <div className="compare"><div><span>Разница с другим режимом</span><b>{norm && compat ? `${mismatch >= 0 ? "+" : ""}${fmt(mismatch)} тыс. ₽` : "—"}</b></div><p>{mode === "norm" ? "Исправлены НДС, профили разделов, границы интервалов, срок и ограничение коэффициентов." : "Историческая логика исходного калькулятора, включая известные особенности."}</p></div><details><summary>О качестве исходных данных</summary><p>225 объектов связаны корректно; 23 требуют проверки идентификаторов. Нормативный режим устраняет алгоритмические дефекты, но не заменяет построчную сверку таблиц с официальным МРР.</p></details>
      </aside>
    </div> : <HtcCalculator mode={mode} vat={vat} setVat={setVat} rows={htc}/>} 
    <footer><span>Локальный расчёт · данные не передаются в сеть</span><span>Версия модели 0.1 · аудит 24.08.2026</span></footer>
  </main>;
}

function Toggle({checked, onChange, label, value}:{checked:boolean;onChange:(v:boolean)=>void;label:string;value:string}) { return <label className="toggle"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}/><i/><span>{label}</span><em>{value}</em></label>; }
function Line({label,value}:{label:string;value:string}) { return <div className="line"><span>{label}</span><b>{value}</b></div>; }
function shortenTime(value: string, costFactor: number) { const divider = costFactor === 1.1 ? 1.2 : costFactor === 1.3 ? 1.4 : 2; return value.replace(/\d+(?:[,.]\d+)?/g, m => (num(m) / divider).toFixed(1).replace(".", ",")); }

function HtcCalculator({mode, vat, setVat, rows}:{mode:Mode;vat:boolean;setVat:(v:boolean)=>void;rows:Row[]}) {
  const [kind,setKind] = useState("KЖ"); const [volume,setVolume] = useState(1000); const [supports,setSupports] = useState(1); const [seismic,setSeismic] = useState("1"); const [equipment,setEquipment] = useState(false); const [piles,setPiles] = useState(false); const [soil,setSoil] = useState(false); const [without,setWithout] = useState(false);
  const kvRow = rows.find(r => volume >= num(r.min) && volume <= num(r.max)) ?? rows.at(-1); const kv = mode === "compat" && volume >= 650000 ? 10 : num(kvRow?.k); const rate = kind === "KЖ" ? 14 : kind === "KM" ? 15.6 : 52;
  const coeff = num(seismic)*(equipment?1.1:1)*(piles?1.1:1)*(soil?1.1:1)*(without ? .9 : 1)*(vat?(mode === "norm"?1.22:1.2):1); const total = ((volume*rate + (kind === "EST" ? supports*35000 : 0))*kv*coeff)/1000;
  return <div className="workspace htc"><section className="panel formPanel"><div className="panelTitle"><span>НТС</span><div><h2>Научно-техническое сопровождение</h2><p>Конструкции КЖ, КМ и эстакады</p></div></div><div className="segmented"><button className={kind==="KЖ"?"active":""} onClick={()=>setKind("KЖ")}>КЖ<small>14 ₽/м³</small></button><button className={kind==="KM"?"active":""} onClick={()=>setKind("KM")}>КМ<small>15,6 ₽/м³</small></button><button className={kind==="EST"?"active":""} onClick={()=>setKind("EST")}>Эстакады<small>52 ₽/м</small></button></div><div className="fieldGrid"><label>{kind === "EST" ? "Протяжённость, м" : "Объём, м³"}<input type="number" value={volume} onChange={e=>setVolume(num(e.target.value))}/></label>{kind==="EST"&&<label>Типы опор<input type="number" value={supports} onChange={e=>setSupports(num(e.target.value))}/></label>}<label>Сейсмичность<select value={seismic} onChange={e=>setSeismic(e.target.value)}><option value="0.9">6 баллов · 0,90</option><option value="1">7 баллов · 1,00</option><option value="1.05">8 баллов · 1,05</option><option value="1.3">9 баллов · 1,30</option><option value="2">Более 9 · 2,00</option></select></label></div><div className="toggleGrid"><Toggle checked={equipment} onChange={setEquipment} label="Динамическое оборудование" value="1,10"/><Toggle checked={piles} onChange={setPiles} label="Свайные фундаменты" value="1,10"/><Toggle checked={soil} onChange={setSoil} label="Специальные грунты" value="1,10"/><Toggle checked={without} onChange={setWithout} label="Без фундаментов" value="0,90"/></div><Toggle checked={vat} onChange={setVat} label={mode === "norm" ? "НДС 22%" : "НДС (как в источнике — 20%)"} value={mode === "norm" ? "1,22" : "1,20"}/></section><aside className="panel resultPanel"><div className="resultTop"><span className={mode==="norm"?"status norm":"status legacy"}>{mode==="norm"?"Нормативный режим":"Совместимость"}</span><span className="formulaCode">kᵥ {kv.toFixed(5)}</span></div><p className="resultLabel">Стоимость сопровождения</p><div className="total">{fmt(total,2)}<span>тыс. ₽</span></div><div className="breakdown"><h3>Раскладка расчёта</h3><Line label="Базовая ставка" value={`${rate.toFixed(1)} ₽`}/><Line label="Коэффициент объёма" value={`× ${kv.toFixed(5)}`}/><Line label="Совокупные условия" value={`× ${coeff.toFixed(3)}`}/></div>{mode==="compat"&&volume>=650000&&<div className="alert">Воспроизведена ошибка источника: для объёма ≥ 650 000 применяется kᵥ = 10.</div>}<div className="formula"><span>Формула</span><code>V × ставка × kᵥ × K</code></div></aside></div>;
}
