// xhs-storyboard card engine · MIT © 2026 Devin Liu
//
// One ES module used in two places:
// - in Node (scripts/render.mjs and the tests): the pure functions — line-format parsers, deck validation, the
//   storyboard rows and the checks. Nothing here touches the DOM at import time.
// - in the page (assets/render.html, which render.mjs fills with this file, cards.css and the deck): start() lays every
//   card out at 1080×1440, grows short structured cards to fill their page and measures what overflows.

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1440;
/** 小红书 takes at most 18 pictures per note. */
export const XHS_IMAGES_MAX = 18;

/** The 16 layouts, in the order the storyboard lists them. */
export const LAYOUTS = [
  { id: "cover", name: "封面" }, { id: "statement", name: "一句话" }, { id: "list", name: "要点" }, { id: "steps", name: "步骤" },
  { id: "compare", name: "对比表" }, { id: "window", name: "窗口截图" }, { id: "phone", name: "手机截图" }, { id: "code", name: "代码" },
  { id: "prompt", name: "提示词" }, { id: "chat", name: "对话" }, { id: "metric", name: "数据" }, { id: "rightwrong", name: "对错" },
  { id: "timeline", name: "时间线" }, { id: "checklist", name: "清单" }, { id: "chart", name: "图表" }, { id: "ending", name: "结尾" },
];
const LAYOUT_IDS = new Set(LAYOUTS.map((l) => l.id));
export const layoutName = (id) => LAYOUTS.find((l) => l.id === id)?.name ?? id;

/** Layouts drawn from the card text's line format instead of from Markdown. */
const STRUCTURED = new Set(["window", "phone", "code", "prompt", "chat", "metric", "rightwrong", "timeline", "checklist", "chart"]);
export const isStructured = (kind) => STRUCTURED.has(kind);
/** Layouts that hold a screenshot. */
export const isShot = (kind) => kind === "window" || kind === "phone";

const SANS = `"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", "Noto Sans SC", system-ui, -apple-system, sans-serif`;
const MONO = `"SFMono-Regular", Menlo, Consolas, "JetBrains Mono", "PingFang SC", "Noto Sans Mono CJK SC", monospace`;

/**
 * The two looks. A theme only fixes the lightness of each role; the hue comes from one accent colour (derivePalette),
 * and every colour on a card is one of these variables (see cards.css).
 */
export const THEMES = {
  light: { id: "light", name: "简约", accent: "#c2410c" },
  dark: { id: "dark", name: "极客", accent: "#4ade80" },
};

/** Audience motives: why someone would comment on this set. The storyboard picks 1–2 and builds the cover and ending on them. */
export const MOTIVES = [
  { id: "correct", name: "想纠正你" }, { id: "result", name: "想看结果" }, { id: "fail", name: "想看翻车" }, { id: "verify", name: "想辨真伪" },
  { id: "advise", name: "想给你支招" }, { id: "relate", name: "想带入自己" }, { id: "prove", name: "想证明自己" },
];
const MOTIVE_IDS = new Set(MOTIVES.map((m) => m.id));
export const motiveName = (id) => MOTIVES.find((m) => m.id === id)?.name ?? id;
/** Words that show a `verify` set reveals its answer. */
export const REVEAL = /答案|结果|实测|结论|揭晓/;
/** Planting a mistake to farm corrections: never, whatever the motive. */
export const PLANTED = /故意写错|埋个错|埋了个错|找找错|找茬/;

// ---------------------------------------------------------------------------------------------------------------
// Colour: one accent → a full palette, with WCAG contrast checked and fixed. OKLab per Björn Ottosson's published
// formulas (public domain math), sRGB per IEC 61966-2-1.

export function parseHex(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
export const toHex = (rgb) => `#${rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0")).join("")}`;
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** sRGB (0–1) → OKLCH [L 0–1, C, H degrees]. */
export function rgbToOklch(rgb) {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}

function oklchToLinear([L, C, H]) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

/** OKLCH → sRGB (0–1); out-of-gamut colours lose chroma (hue and lightness kept) until they fit. */
export function oklchToRgb([L, C, H]) {
  let c = C;
  for (let i = 0; i < 60; i++) {
    const lin = oklchToLinear([L, c, H]);
    if (lin.every((v) => v >= -1e-4 && v <= 1 + 1e-4)) return lin.map((v) => fromLinear(Math.min(1, Math.max(0, v))));
    c *= 0.92;
  }
  return oklchToLinear([L, 0, H]).map((v) => fromLinear(Math.min(1, Math.max(0, v))));
}

/** WCAG 2 relative luminance and contrast ratio of two hex colours. */
export function luminance(hex) {
  const [r, g, b] = parseHex(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Text roles that must reach 4.5:1 against the card background. */
export const TEXT_ROLES = ["ink", "muted", "accent"];
export const MIN_CONTRAST = 4.5;

/**
 * accent + theme → { vars, adjustments }. The background, text, line, panel and code colours share the accent's hue;
 * any text role below 4.5:1 on the background is moved in lightness (darker on light, lighter on dark) until it passes,
 * and each move is listed so the renderer can say what it changed.
 */
export function derivePalette(themeId, accent) {
  const theme = THEMES[themeId] ?? THEMES.light;
  const base = parseHex(accent || theme.accent) ?? parseHex(theme.accent);
  const [aL, aC, H] = rgbToOklch(base);
  const tint = Math.min(aC, 0.2);
  const c = (L, k) => toHex(oklchToRgb([L, tint * k, H]));
  const dark = theme.id === "dark";
  const vars = dark
    ? { bg: c(0.17, 0.12), ink: c(0.95, 0.05), muted: c(0.72, 0.1), accent: toHex(base), line: c(0.3, 0.15), panel: c(0.17, 0.12), code: c(0.22, 0.15), grid: "rgba(255,255,255,.035)" }
    : { bg: c(0.985, 0.04), ink: c(0.23, 0.08), muted: c(0.5, 0.08), accent: toHex(base), line: c(0.91, 0.1), panel: c(0.995, 0.02), code: c(0.955, 0.08), grid: "transparent" };
  const adjustments = [];
  for (const role of TEXT_ROLES) {
    const before = vars[role];
    const start = contrast(before, vars.bg);
    if (start >= MIN_CONTRAST) continue;
    let [L, C] = role === "accent" ? [aL, aC] : rgbToOklch(parseHex(before));
    let hex = before;
    for (let i = 0; i < 100 && contrast(hex, vars.bg) < MIN_CONTRAST; i++) {
      L = Math.min(1, Math.max(0, L + (dark ? 0.01 : -0.01)));
      hex = toHex(oklchToRgb([L, C, H]));
    }
    vars[role] = hex;
    adjustments.push({ role, from: before, to: hex, before: Math.round(start * 100) / 100, after: Math.round(contrast(hex, vars.bg) * 100) / 100 });
  }
  return { vars, adjustments };
}

export const IMAGE = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
export const hasImage = (text) => new RegExp(IMAGE.source).test(text);

const chars = (s) => Array.from(s).length;
const lines = (text) => text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
/** "a｜b｜c" (full- or half-width bar) → parts; a line without a bar is one part. */
const cells = (line) => line.split(/\s*[｜|]\s*/);

// ---------------------------------------------------------------------------------------------------------------
// Line formats

/** 「问：」「答：」 start a bubble (Q: / A: too); other lines continue the one before. */
export function parseChat(text) {
  const out = [];
  for (const line of lines(text)) {
    const m = /^(问|答|Q|A)\s*[:：]\s*/i.exec(line);
    if (m) out.push({ who: /^(问|q)$/i.test(m[1]) ? "q" : "a", text: line.slice(m[0].length) });
    else if (out.length) out[out.length - 1].text += `\n${line}`;
    else out.push({ who: "q", text: line });
  }
  return out;
}

/** 「✓ 」 is the right way, 「✗ 」 the wrong one; an unmarked line is neither. */
export function parseRightWrong(text) {
  return lines(text).map((line) => {
    const m = /^([✓✔√]|[✗✘×])\s*/.exec(line);
    return m ? { ok: /[✓✔√]/.test(m[1]), text: line.slice(m[0].length) } : { ok: null, text: line };
  });
}

/** 「时间｜事件」 per line. */
export function parseTimeline(text) {
  return lines(text).map((line) => {
    const [time = "", ...rest] = cells(line);
    return rest.length ? { time, event: rest.join("｜") } : { time: "", event: line };
  });
}

/** 「[x] 」 done, 「[ ] 」 to do (a leading "- " as in Markdown task lists is fine). */
export function parseChecklist(text) {
  return lines(text).map((line) => {
    const m = /^(?:[-*]\s*)?\[\s*([xX✓]?)\s*\]\s*/.exec(line);
    return m ? { done: !!m[1], text: line.slice(m[0].length) } : { done: false, text: line };
  });
}

/** 「数字｜单位｜说明」 per line, at most three. */
export function parseMetrics(text) {
  return lines(text).slice(0, 3).map((line) => {
    const parts = cells(line);
    if (parts.length >= 3) return { value: parts[0], unit: parts[1], note: parts.slice(2).join("｜") };
    if (parts.length === 2) return { value: parts[0], unit: "", note: parts[1] };
    return { value: "", unit: "", note: line };
  });
}

/** An optional first line 「文件：xxx」 names the file; the rest is the code (Markdown fences dropped). */
export function parseCode(text) {
  const all = text.replace(/^\s*\n/, "").trimEnd().split(/\r?\n/);
  const m = /^\s*文件\s*[:：]\s*(.+)$/.exec(all[0] ?? "");
  const body = m ? all.slice(1) : all;
  const fenced = body.length >= 2 && /^\s*```/.test(body[0]) && /^\s*```\s*$/.test(body[body.length - 1]);
  return { file: m ? m[1].trim() : "", code: (fenced ? body.slice(1, -1) : body).join("\n") };
}

/** A screenshot card: the first Markdown picture in the text, and the rest as its caption. */
export function parseShot(text) {
  const m = new RegExp(IMAGE.source).exec(text);
  const caption = text.replace(new RegExp(IMAGE.source, "g"), "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(" ");
  return { image: m ? { alt: m[1], src: m[2] } : null, caption };
}

/** The 「待补」 note a screenshot card shows when it has no picture yet. */
export const placeholderText = (figure) => `待补：${figure.note.trim() || "截图"}`;

/** A compare card's table; models often drop the `| --- |` row, and without it the pipes show as text. */
export function compareTable(text) {
  const rows = text.trim().split(/\r?\n/);
  const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  if (rows.length < 2 || !rows.every(isRow) || /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(rows[1])) return text;
  const cols = rows[0].trim().slice(1, -1).split("|").length;
  return [rows[0], `| ${Array(cols).fill("---").join(" | ")} |`, ...rows.slice(1)].join("\n");
}

// ---------------------------------------------------------------------------------------------------------------
// A small Markdown subset for the text cards: paragraphs, lists, tables, quotes, code, headings, images, **bold**,
// `code`. Everything is escaped; a picture's address must be a data:image URI or a relative path.

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const safeSrc = (src) => (/^data:image\/[a-z+.-]+;base64,[a-z0-9+/=]+$/i.test(src) || !/^[a-z][a-z0-9+.-]*:/i.test(src) ? src : "");

function inline(s) {
  const codes = [];
  const imgs = [];
  let out = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  out = out.replace(new RegExp(IMAGE.source, "g"), (_, alt, src) => `\u0001${imgs.push({ alt, src }) - 1}\u0001`);
  out = escapeHtml(out).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\u0001(\d+)\u0001/g, (_, i) => `<img src="${escapeHtml(safeSrc(imgs[i].src))}" alt="${escapeHtml(imgs[i].alt)}">`);
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[i])}</code>`);
}

const LIST_ITEM = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEP = /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/;
const FENCE = /^\s*```/;
const HEADING = /^\s*(#{1,4})\s+(.*)$/;
const QUOTE = /^\s*>\s?/;
const RULE = /^\s*(?:-{3,}|\*{3,})\s*$/;
const blockStart = (l) => FENCE.test(l) || HEADING.test(l) || QUOTE.test(l) || TABLE_ROW.test(l) || LIST_ITEM.test(l) || RULE.test(l);
const rowCells = (l) => l.trim().slice(1, -1).split("|").map((c) => c.trim());

export function miniMarkdown(text) {
  const src = String(text).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;
  while (i < src.length) {
    const line = src[i];
    if (!line.trim()) { i++; continue; }
    if (FENCE.test(line)) {
      const body = [];
      i++;
      while (i < src.length && !/^\s*```\s*$/.test(src[i])) body.push(src[i++]);
      i++;
      out.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }
    let m = HEADING.exec(line);
    if (m) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
    if (RULE.test(line)) { out.push("<hr>"); i++; continue; }
    if (QUOTE.test(line)) {
      const body = [];
      while (i < src.length && QUOTE.test(src[i])) body.push(src[i++].replace(QUOTE, ""));
      out.push(`<blockquote><p>${body.filter((l) => l.trim()).map(inline).join("<br>")}</p></blockquote>`);
      continue;
    }
    if (TABLE_ROW.test(line)) {
      const rows = [];
      while (i < src.length && TABLE_ROW.test(src[i])) rows.push(src[i++]);
      if (rows.length >= 2 && TABLE_SEP.test(rows[1])) {
        const head = rowCells(rows[0]).map((c) => `<th>${inline(c)}</th>`).join("");
        const body = rows.slice(2).map((r) => `<tr>${rowCells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("");
        out.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
      } else out.push(`<p>${rows.map(inline).join("<br>")}</p>`);
      continue;
    }
    m = LIST_ITEM.exec(line);
    if (m) {
      const ordered = !!m[2];
      const start = ordered ? Number(m[2]) : 1;
      const items = [];
      while (i < src.length) {
        const item = LIST_ITEM.exec(src[i]);
        if (item && !!item[2] === ordered) { items.push(item[3]); i++; }
        else if (!item && src[i].trim() && !blockStart(src[i]) && items.length) { items[items.length - 1] += `\n${src[i].trim()}`; i++; }
        else break;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}${ordered && start !== 1 ? ` start="${start}"` : ""}>${items.map((t) => `<li>${t.split("\n").map(inline).join("<br>")}</li>`).join("")}</${tag}>`);
      continue;
    }
    const para = [];
    while (i < src.length && src[i].trim() && (para.length === 0 || !blockStart(src[i]))) para.push(src[i++].trim());
    out.push(`<p>${para.map(inline).join("<br>")}</p>`);
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------------------------------------------------
// The deck: validation, storyboard rows, checks

/** What picture a card needs; "draw" is a chart our code draws from the card text (layout "chart"). */
export const FIGURE_SOURCES = ["none", "ready", "yours", "draw"];
export function cardFigure(raw) {
  const f = raw && typeof raw === "object" ? raw : {};
  return f.source === "ready" || f.source === "yours" || f.source === "draw" ? { source: f.source, note: typeof f.note === "string" ? f.note : "" } : { source: "none", note: typeof f.note === "string" ? f.note : "" };
}

/**
 * cards.json → a clean deck plus the problems that stop it from being drawn (each an error naming the card and how to
 * fix it). Unknown fields are ignored.
 */
export function normalizeDeck(raw) {
  const issues = [];
  const err = (page, message) => issues.push({ level: "error", page, message });
  const d = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  if (d !== raw) err(null, "cards.json 的最外层要是一个对象：{ \"title\": …, \"cards\": [ … ] }");
  const title = typeof d.title === "string" ? d.title.trim() : "";
  if (!title) err(null, "缺少 title（这组图的标题，会写在每页页眉，没有封面卡时做封面大字）");
  let theme = "light";
  if (d.theme !== undefined) {
    if (d.theme in THEMES) theme = d.theme;
    else err(null, `theme 只能是 "light"（简约）或 "dark"（极客），现在是 ${JSON.stringify(d.theme)}`);
  }
  let accent = "";
  if (d.accent !== undefined) {
    if (typeof d.accent === "string" && parseHex(d.accent)) accent = toHex(parseHex(d.accent));
    else err(null, `accent 要是一个十六进制颜色，比如 "#2563eb"，现在是 ${JSON.stringify(d.accent)}`);
  }
  const str = (k) => (typeof d[k] === "string" ? d[k].trim() : "");
  const motives = [];
  if (d.motives !== undefined) {
    if (!Array.isArray(d.motives)) err(null, `motives 要是数组，比如 ["result"]，可用：${MOTIVES.map((m) => `${m.id}（${m.name}）`).join(" / ")}`);
    else for (const m of d.motives) {
      if (MOTIVE_IDS.has(m)) { if (!motives.includes(m)) motives.push(m); }
      else err(null, `motives 里的 ${JSON.stringify(m)} 不认识，可用：${MOTIVES.map((x) => `${x.id}（${x.name}）`).join(" / ")}`);
    }
  }
  const covers = [];
  if (d.covers !== undefined) {
    if (!Array.isArray(d.covers)) err(null, "covers 要是数组：[{ \"text\": \"封面大字\", \"motive\": \"result\" }, …]");
    else d.covers.forEach((c, i) => {
      const text = typeof c?.text === "string" ? c.text.trim() : "";
      if (!text) err(null, `covers[${i}] 的 text 是空的`);
      const motive = typeof c?.motive === "string" ? c.motive : "";
      if (motive && !MOTIVE_IDS.has(motive)) err(null, `covers[${i}] 的 motive ${JSON.stringify(motive)} 不认识`);
      if (text) covers.push({ text, motive: MOTIVE_IDS.has(motive) ? motive : "" });
    });
    if (covers.length > 6) err(null, `covers 最多 6 个，现在 ${covers.length} 个`);
  }
  const cards = [];
  if (!Array.isArray(d.cards) || !d.cards.length) err(null, "cards 要是一个非空数组，每项 { \"layout\", \"text\", \"figure\" }");
  else d.cards.forEach((c, i) => {
    const at = `cards[${i}]`;
    const card = c && typeof c === "object" ? c : {};
    const layout = typeof card.layout === "string" ? card.layout.trim() : "";
    if (!LAYOUT_IDS.has(layout)) err(null, `${at} 的 layout ${JSON.stringify(card.layout)} 不认识，可用：${LAYOUTS.map((l) => l.id).join(" / ")}`);
    const text = typeof card.text === "string" ? card.text : "";
    if (!text.trim()) err(null, `${at} 的 text 是空的`);
    if (card.figure !== undefined && (typeof card.figure !== "object" || !FIGURE_SOURCES.includes(card.figure?.source))) {
      err(null, `${at} 的 figure.source 只能是 ${FIGURE_SOURCES.join(" / ")}`);
    }
    cards.push({ layout: LAYOUT_IDS.has(layout) ? layout : "statement", text, figure: cardFigure(card.figure) });
  });
  return {
    deck: { title, theme, accent, motives, covers, subtitle: str("subtitle"), author: str("author"), date: str("date"), source: str("source"), cards },
    issues,
  };
}

/**
 * Card 1 is the cover words when its layout is "cover" (≤24 characters and more cards follow): it becomes the title
 * card's headline. Otherwise the title card shows the deck title. `page` is the number in the finished set.
 */
export function storyboardRows(cards) {
  const all = cards.map((c, index) => ({ index, page: 0, text: c.text.trim(), layout: c.layout, figure: cardFigure(c.figure) })).filter((c) => c.text);
  const first = all[0];
  const cover = first && first.layout === "cover" && chars(first.text) <= 24 && all.length >= 2 ? first : null;
  const body = cover ? all.slice(1) : all;
  if (cover) cover.page = 1;
  body.forEach((row, i) => { row.page = i + 2; });
  return { cover, body };
}

const digits = (s) => s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/[．]/g, ".");
const pageName = (n) => (n === null || n === undefined ? "" : `第 ${n} 张`);

/**
 * Errors that stop the pictures from being written: text cut off by the card's edge, a 「待补」 placeholder left on a
 * card, a picture only the author can give (`yours`) that isn't there, a chart whose line format is wrong. (Every number on
 * a chart is traced to the source by checkNumbers, like every other card.)
 * `overflow` is [{ page, px, label? }] from the page (label names a cover candidate instead of a page number).
 */
export function checkCards({ rows, overflow = [] }) {
  const out = [];
  for (const row of rows) {
    const picture = hasImage(row.text);
    if (row.figure.source === "yours" && !picture) {
      out.push({ level: "error", page: row.page, message: `${pageName(row.page)}缺你的真实截图：${row.figure.note.trim() || "这张需要一张真实截图"}。把图放进 cards.json 旁边，在 text 里写 ![](文件名.png)；没有图就换个版式，不要画假截图` });
    } else if ((isShot(row.layout) && !picture) || row.text.includes("待补")) {
      out.push({ level: "error", page: row.page, message: `${pageName(row.page)}还有「待补」占位：补上图，或换个不需要图的版式` });
    }
    if (row.layout === "chart") {
      for (const problem of parseChart(row.text).problems) out.push({ level: "error", page: row.page, message: `${pageName(row.page)}的图表：${problem}` });
    } else if (row.figure.source === "draw") {
      out.push({ level: "warn", page: row.page, message: `${pageName(row.page)}的 figure 是 draw（代码画），layout 要用 chart 才会画出来` });
    }
  }
  for (const o of overflow) out.push({ level: "error", page: o.page ?? null, message: `${o.label ?? pageName(o.page)}文字超出卡片 ${o.px}px，会被截掉：删减文字、拆成两页或换个版式` });
  return out;
}

/** A number as compared: full-width digits folded, leading zeros and trailing decimal zeros dropped ("08" = "8"). */
const canonical = (n) => String(Number(n));

/**
 * The Arabic numbers in a piece of card copy: pictures, hex colours and ordered-list markers ("1. ") are skipped, full-width digits
 * folded and thousands commas removed, so 「１,２００」 and 「1200」 are the same number; "80%" is 80.
 */
export function numbersIn(text, { code = false } = {}) {
  let t = digits(String(text)).replace(new RegExp(IMAGE.source, "g"), " ").replace(/#[0-9a-f]{3,8}\b/gi, " ");
  if (!code) t = t.replace(/^\s*\d+[.)]\s+/gm, "");
  t = t.replace(/(\d)[,，](?=\d{3}(?!\d))/g, "$1");
  return [...new Set((t.match(/\d+(?:\.\d+)?/g) ?? []).map(canonical))];
}

/** "2026,3" → ["2026", "3"] (canonical). */
export const parseAllow = (s) => String(s ?? "").split(/[,，\s]+/).filter((x) => /^\d+(?:\.\d+)?$/.test(digits(x))).map((x) => canonical(digits(x)));

/**
 * 数字溯源: with a source text, every number on the cards (title, subtitle, cover candidates, every card) must appear
 * in it as a number → error per card listing the missing ones. Without a source, one warning that nothing was checked.
 */
export function checkNumbers({ deck, rows, source = null, allow = [] }) {
  const items = [
    { label: "标题（每页页眉）", page: null, text: deck.title },
    { label: "副标题", page: null, text: deck.subtitle ?? "" },
    ...(deck.covers ?? []).map((c, i) => ({ label: `封面 ${coverLetter(i)}`, page: null, text: c.text })),
    ...rows.map((r) => ({ label: pageName(r.page), page: r.page, text: r.text, code: r.layout === "code" })),
  ];
  const found = items.filter((it) => numbersIn(it.text, it).length);
  if (source === null) {
    return found.length ? [{ level: "warn", page: null, message: `没有提供 source（原文），${found.map((f) => f.label).join("、")}上的数字没有核对出处` }] : [];
  }
  const known = new Set([...numbersIn(source, { code: true }), ...numbersIn(source), ...allow]);
  return found.flatMap((it) => {
    const missing = numbersIn(it.text, it).filter((n) => !known.has(n));
    return missing.length ? [{ level: "error", page: it.page, message: `${it.label}的数字 ${missing.join("、")} 在原文里找不到：改成原文里的数字，或删掉；确实不用溯源的（比如年份）用 --allow-numbers ${missing.join(",")}` }] : [];
  });
}

export const coverLetter = (i) => String.fromCharCode(65 + i);

/**
 * 互动动机的底线: with motives, the last card is an `ending` that asks a question; `verify` must reveal the answer;
 * nobody plants a mistake on purpose.
 */
export function checkMotives({ deck, rows }) {
  const out = [];
  const last = rows[rows.length - 1];
  if (deck.motives?.length) {
    if (deck.motives.length > 2) out.push({ level: "warn", page: null, message: `motives 有 ${deck.motives.length} 个，建议只选 1–2 个，封面和结尾才收得住` });
    if (!last || last.layout !== "ending" || !/[?？]/.test(last.text)) {
      out.push({ level: "error", page: last?.page ?? null, message: `定了互动动机（${deck.motives.map(motiveName).join("、")}），最后一张要用 ending 版式，并用一个问题收尾（带「？」），让人有话可回` });
    }
    if (deck.motives.includes("verify") && !rows.some((r) => REVEAL.test(r.text))) {
      out.push({ level: "error", page: null, message: "动机里有 verify（想辨真伪），结尾前必须揭晓答案并给出证据：加一张写明「答案 / 结果 / 实测 / 结论」的卡" });
    }
  }
  for (const r of rows) if (PLANTED.test(r.text)) out.push({ level: "error", page: r.page, message: `${pageName(r.page)}像是在故意埋错引人纠正：只放真实的判断，不埋错` });
  return out;
}

/** Every check on a deck, sorted by page. `overflow` comes from the page; `source` is the source text or null. */
export function checkDeck(deck, { overflow = [], source = null, allow = [] } = {}) {
  const { cover, body } = storyboardRows(deck.cards);
  const rows = [...(cover ? [cover] : []), ...body];
  const total = body.length + 1;
  return [
    ...checkCards({ rows, overflow }),
    ...checkNumbers({ deck, rows, source, allow }),
    ...checkMotives({ deck, rows: body.length ? body : rows }),
    ...copyWarnings(rows, total, deck),
  ].sort((a, b) => (a.page ?? 0) - (b.page ?? 0) || (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
}

/** Copy limits per layout (the same as references/layouts.md). Breaking one is a warning; overflow is the hard stop. */
export const LIMITS = {
  cover: { chars: 16 }, statement: { chars: 40 }, ending: { chars: 40 },
  list: { lines: [3, 5], line: 18 }, steps: { lines: [3, 5], line: 18 },
  compare: { rows: 4, cell: 10 },
  window: { caption: 30 }, phone: { caption: 30 },
  code: { lines: [1, 12], line: 40 }, prompt: { chars: 120 },
  chat: { lines: [2, 4], line: 40 }, metric: { lines: [1, 3], note: 12 },
  rightwrong: { lines: [2, 4], line: 20 }, timeline: { lines: [3, 5], event: 18 }, checklist: { lines: [3, 5], line: 18 },
};

const stripMarker = (layout, line) => {
  if (layout === "list") return line.replace(/^[-*+]\s+/, "");
  if (layout === "steps") return line.replace(/^\d+[.)]\s+/, "");
  if (layout === "chat") return line.replace(/^(问|答|Q|A)\s*[:：]\s*/i, "");
  if (layout === "rightwrong") return line.replace(/^([✓✔√]|[✗✘×])\s*/, "");
  if (layout === "checklist") return line.replace(/^(?:[-*]\s*)?\[\s*[xX✓]?\s*\]\s*/, "");
  return line;
};

/** Warnings for copy longer than its layout's limit, a cover or ending in the wrong place, and too many pages. */
export function copyWarnings(rows, total, deck = {}) {
  const out = [];
  const warn = (page, message) => out.push({ level: "warn", page, message: `${pageName(page)}${message}` });
  (deck.covers ?? []).forEach((c, i) => {
    if (chars(c.text) > LIMITS.cover.chars) out.push({ level: "warn", page: null, message: `封面 ${coverLetter(i)} 有 ${chars(c.text)} 字，建议不超过 ${LIMITS.cover.chars} 字` });
  });
  if (deck.covers?.length === 1) out.push({ level: "warn", page: null, message: "covers 只有 1 个：写 2–3 个不同角度的封面，才有得挑" });
  rows.forEach((row, i) => {
    const lim = LIMITS[row.layout];
    const name = `「${layoutName(row.layout)}」`;
    if (row.layout === "cover" && row.page !== 1) warn(row.page, `的封面版式只用于第 1 张（不超过 24 字），这里会当一句话排`);
    if (row.layout === "ending" && i !== rows.length - 1) warn(row.page, "的结尾版式只用于最后一张");
    if (!lim) return;
    const text = row.text.replace(new RegExp(IMAGE.source, "g"), "").trim();
    const ls = row.layout === "code" ? parseCode(row.text).code.split("\n") : lines(text);
    if (lim.chars && chars(text) > lim.chars) warn(row.page, `${name}有 ${chars(text)} 字，建议不超过 ${lim.chars} 字`);
    if (lim.caption && chars(lines(text).join("")) > lim.caption) warn(row.page, `${name}的说明有 ${chars(lines(text).join(""))} 字，建议不超过 ${lim.caption} 字`);
    if (lim.lines && (ls.length < lim.lines[0] || ls.length > lim.lines[1])) warn(row.page, `${name}有 ${ls.length} 行，建议 ${lim.lines[0]}–${lim.lines[1]} 行`);
    if (lim.line) {
      const long = ls.map((l) => chars(stripMarker(row.layout, l))).filter((n) => n > lim.line);
      if (long.length) warn(row.page, `${name}有 ${long.length} 行超过 ${lim.line} 字`);
    }
    if (lim.note) {
      const long = parseMetrics(text).filter((m) => chars(m.note) > lim.note);
      if (long.length) warn(row.page, `${name}的说明「${long[0].note}」超过 ${lim.note} 字`);
    }
    if (lim.event) {
      const long = parseTimeline(text).filter((t) => chars(t.event) > lim.event);
      if (long.length) warn(row.page, `${name}有 ${long.length} 件事超过 ${lim.event} 字`);
    }
    if (lim.rows) {
      const table = compareTable(text).split(/\r?\n/).filter((l) => TABLE_ROW.test(l));
      if (table.length < 2) warn(row.page, `${name}要写成两列 Markdown 表格：表头一行、| --- | --- |、再加内容行`);
      else {
        const data = table.slice(2);
        if (data.length > lim.rows) warn(row.page, `${name}有 ${data.length} 行，建议不超过 ${lim.rows} 行`);
        const cellsTooLong = table.filter((_, j) => j !== 1).flatMap(rowCells).filter((c) => chars(c) > lim.cell);
        if (cellsTooLong.length) warn(row.page, `${name}有 ${cellsTooLong.length} 格超过 ${lim.cell} 字`);
      }
    }
  });
  if (total > XHS_IMAGES_MAX) out.push({ level: "error", page: null, message: `一共 ${total} 张，小红书一篇最多 ${XHS_IMAGES_MAX} 张` });
  else if (total > 9 || total < 5) out.push({ level: "warn", page: null, message: `一共 ${total} 张，建议 5–9 张，一页只讲一件事` });
  return out;
}

/** Title size by length, so a long cover still sits in about four lines and a short one fills the card. */
export function titleSize(text) {
  const n = chars(text.trim());
  if (n <= 5) return 168;
  if (n <= 8) return 148;
  if (n <= 12) return 128;
  if (n <= 18) return 108;
  return 88;
}

/** Page 1's headline: the first cover candidate, else the cover card, else the deck title. */
export const headlineOf = (deck, cover) => deck.covers?.[0]?.text || cover?.text || deck.title;

/** The storyboard table as an HTML page (render.mjs --storyboard): page, layout, copy, picture. */
export function storyboardHtml(deck) {
  const { cover, body } = storyboardRows(deck.cards);
  const rows = [{ page: 1, layout: "cover", text: headlineOf(deck, cover), figure: cardFigure(null) }, ...body];
  const motives = deck.motives?.length ? ` · 动机：${deck.motives.map(motiveName).join("、")}` : "";
  const covers = deck.covers?.length > 1 ? ` · 封面备选：${deck.covers.map((c, i) => `${coverLetter(i)}「${c.text}」`).join(" ")}` : "";
  const fig = { none: "不配图", ready: "现成图", yours: "要你给", draw: "代码画" };
  const copy = (t) => escapeHtml(t.replace(new RegExp(IMAGE.source, "g"), (_, alt, src) => `[图 ${alt || src.slice(0, 40)}]`)).replace(/\n/g, "<br>");
  const tr = rows.map((r) => `<tr><td class="n">${r.page}</td><td class="l">${escapeHtml(layoutName(r.layout))}<small>${escapeHtml(r.layout)}</small></td><td class="t"><div>${copy(r.text)}</div></td><td class="f"><b class="${r.figure.source}">${fig[r.figure.source]}</b>${r.figure.note ? `<small>${escapeHtml(r.figure.note)}</small>` : ""}</td></tr>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>分镜表</title><style>
body{margin:0;background:#fbfaf7;color:#1d1c1a;font-family:${SANS};width:1200px}
main{padding:44px 48px 48px}
h1{margin:0 0 6px;font-size:34px}
p.s{margin:0 0 28px;color:#73706a;font-size:20px}
table{width:100%;border-collapse:collapse;font-size:20px;line-height:1.45}
th{text-align:left;color:#73706a;font-weight:600;font-size:17px;letter-spacing:.06em;padding:10px 14px;border-bottom:2px solid #1d1c1a}
td{padding:12px 14px;border-bottom:1px solid #e7e3db;vertical-align:top}
td.n{width:52px;font-weight:700;color:#d9480f;font-size:22px}
td.l{width:130px;font-weight:600}
td.l small,td.f small{display:block;color:#73706a;font-weight:400;font-size:15px;margin-top:2px}
td.t div{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
td.f{width:230px}
td.f b{display:inline-block;padding:1px 10px;border-radius:6px;font-size:16px;font-weight:600;background:#f2efe9}
td.f b.yours{background:#d9480f;color:#fff}
td.f b.ready{background:#1d1c1a;color:#fff}
td.f b.draw{background:#fff;color:#d9480f;box-shadow:inset 0 0 0 2px #d9480f}
</style></head><body><main><h1>分镜表 · ${escapeHtml(deck.title)}</h1><p class="s">${rows.length} 张 · ${escapeHtml(THEMES[deck.theme]?.name ?? deck.theme)}${escapeHtml(motives)}${escapeHtml(covers)}</p>
<table><thead><tr><th>页</th><th>版式</th><th>卡片文字</th><th>配图</th></tr></thead><tbody>${tr}</tbody></table></main></body></html>`;
}

// ---------------------------------------------------------------------------------------------------------------
// Charts (layout "chart", figure "draw"): the card text is a line format whose first line names the chart type. Our own
// deterministic drawing, no chart library and no script from the copy: text stays HTML (it wraps, grows with --sb-k and
// is measured for overflow), the marks are inline SVG, colours are the card variables, values are shown as written.

/** Chart types with the names the first line may use. */
export const CHART_TYPES = [
  { id: "bar", name: "柱状", aliases: ["柱状", "柱状图", "条形", "条形图"] },
  { id: "line", name: "折线", aliases: ["折线", "折线图"] },
  { id: "donut", name: "环形", aliases: ["环形", "环形图", "饼图"] },
  { id: "flow", name: "流程", aliases: ["流程", "流程图"] },
  { id: "compare", name: "对比", aliases: ["对比", "对比图"] },
  { id: "matrix", name: "矩阵", aliases: ["矩阵", "四象限"] },
  { id: "timeline", name: "时间轴", aliases: ["时间轴", "时间线"] },
];
/** Items per type: fewer says nothing, more doesn't fit a 3:4 card. */
export const CHART_LIMITS = { bar: [2, 8], line: [2, 8], donut: [2, 6], flow: [2, 6], compare: [1, 6], timeline: [2, 6] };
const LIST_MARKER = /^\s*\d+(?:[.)]\s+|、\s*)/;

/** The first number in a written value: 「1,234 次」 → 1234, 「-3.5%」 → -3.5; none → null. */
export function numberOf(raw) {
  return magnitude(raw)?.value ?? null;
}

/** Time units in seconds: a duration is drawn by its length, whatever unit it's written in. */
const TIME_UNITS = {
  h: 3600, hr: 3600, 小时: 3600, m: 60, min: 60, 分: 60, 分钟: 60, s: 1, sec: 1, 秒: 1,
  ms: 1e-3, 毫秒: 1e-3, us: 1e-6, "µs": 1e-6, 微秒: 1e-6, ns: 1e-9, 纳秒: 1e-9,
};

/**
 * What a written value measures, for drawing only (the card shows it as written): 「8m30s」 → 510 time, 「0.082s (1.00x)」
 * → 0.082 time, 「45%」 → 45 %, 「1,234 次」 → 1234 次. Several time parts add up; otherwise the first number and its unit.
 */
export function magnitude(raw) {
  const pairs = [...digits(String(raw)).replace(/(\d)[,，](?=\d{3}(?!\d))/g, "$1").matchAll(/(-?\d+(?:\.\d+)?)\s*(小时|分钟|毫秒|微秒|纳秒|[a-zA-Zµ%]+|[一-鿿])?/g)]
    .map((m) => ({ n: Number(m[1]), unit: m[2] ?? "" }));
  if (!pairs.length) return null;
  const time = (u) => TIME_UNITS[u] ?? TIME_UNITS[u.replace(/s$/, "")];
  if (pairs.length > 1 && pairs.every((p) => time(p.unit) !== undefined)) return { value: pairs.reduce((sum, p) => sum + p.n * time(p.unit), 0), unit: "time" };
  const first = pairs[0];
  return time(first.unit) !== undefined ? { value: first.n * time(first.unit), unit: "time" } : { value: first.n, unit: first.unit };
}

/** The type and optional title from the first line: 「柱状」「柱状：冷启动耗时」「折线图｜周活」. */
export function chartHeader(line) {
  const m = /^([^\s:：｜|]+)\s*(?:[:：｜|]\s*(.*))?$/.exec(String(line).trim());
  const type = m && CHART_TYPES.find((t) => t.aliases.includes(m[1]));
  return type ? { type: type.id, title: (m[2] ?? "").trim() } : null;
}

/** Card text → { chart, problems }: an unknown first line gives no chart; otherwise what could be read, plus what's wrong. */
export function parseChart(text) {
  const all = lines(String(text));
  const head = chartHeader(all[0] ?? "");
  if (!head) return { chart: null, problems: [`第一行要写图的类型（${CHART_TYPES.map((t) => t.name).join("、")}），现在是「${all[0] ?? ""}」`] };
  const problems = [];
  const rest = all.slice(1);
  const { type, title } = head;
  const count = (n, what) => {
    const [min, max] = CHART_LIMITS[type];
    if (n < min || n > max) problems.push(`${CHART_TYPES.find((t) => t.id === type).name}图要 ${min}–${max} ${what}，现在 ${n} ${what}`);
  };
  if (type === "bar" || type === "line" || type === "donut") {
    let unit = "";
    const points = [];
    const units = new Map();
    for (const line of rest) {
      const u = /^单位\s*[:：]\s*(.+)$/.exec(line);
      if (u) { unit = u[1].trim(); continue; }
      const parts = cells(line);
      if (parts.length < 2 || !parts[0] || !parts[1]) { problems.push(`「${line}」要写成「名称｜数值」`); continue; }
      const m = magnitude(parts[1]);
      if (!m) { problems.push(`「${parts[0]}」的数值「${parts[1]}」里没有数字`); continue; }
      if (type === "donut" && m.value <= 0) { problems.push(`环形图的数值要大于 0，「${parts[0]}」是 ${parts[1]}`); continue; }
      if (m.unit && !units.has(m.unit)) units.set(m.unit, parts[0]);
      points.push({ name: parts[0], raw: parts.slice(1).join("｜"), value: m.value });
    }
    // 「3 秒」 and 「3 MB」 can't share an axis (times in any unit can).
    if (units.size > 1) problems.push(`数值的单位不一致（${[...units].map(([u, name]) => `「${name}」是 ${u === "time" ? "时间" : u}`).join("，")}）：一张图只放同一种单位，或拆成两张图`);
    count(points.length, "项");
    return { chart: { type, title, unit, points }, problems };
  }
  if (type === "flow") {
    const steps = rest.map((line) => {
      const [step = "", ...note] = line.replace(LIST_MARKER, "").split(/\s*(?:→|->)\s*/);
      return { text: step, note: note.join(" → ") };
    }).filter((s) => s.text);
    count(steps.length, "步");
    return { chart: { type, title, steps }, problems };
  }
  if (type === "compare") {
    const rows = rest.map(cells);
    const bad = rows.find((r) => r.length < 2);
    if (bad) problems.push(`对比图每行写「左｜右」，「${bad.join("")}」只有一边`);
    const [headRow = ["", ""], ...body] = rows.filter((r) => r.length >= 2);
    count(body.length, "行（不算第一行表头）");
    return { chart: { type, title, left: headRow[0] ?? "", right: headRow.slice(1).join("｜"), rows: body.map((r) => [r[0], r.slice(1).join("｜")]) }, problems };
  }
  if (type === "matrix") {
    let x = "", y = "";
    const free = [];
    const quads = [];
    for (const line of rest) {
      const axis = /^(横轴|纵轴|[xXyY]\s*轴)\s*[:：]\s*(.*)$/.exec(line);
      if (axis) { if (/横|x/i.test(axis[1])) x = axis[2].trim(); else y = axis[2].trim(); continue; }
      const parts = cells(line);
      if (parts.length >= 2) quads.push({ name: parts[0], text: parts.slice(1).join("｜") });
      else free.push(line);
    }
    if (!x && free.length) x = free.shift();
    if (!y && free.length) y = free.shift();
    if (!x || !y) problems.push("矩阵图前两行写横轴和纵轴的名字（「横轴：…」「纵轴：…」）");
    if (free.length) problems.push(`矩阵图多出的行要写成「象限名｜内容」：「${free[0]}」`);
    if (quads.length !== 4) problems.push(`矩阵图要正好 4 个象限（左上、右上、左下、右下），现在 ${quads.length} 个`);
    return { chart: { type, title, x, y, quads: quads.slice(0, 4) }, problems };
  }
  const events = rest.map((line) => {
    const [time = "", ...event] = cells(line);
    return event.length ? { time, event: event.join("｜") } : { time: "", event: line };
  });
  const loose = events.find((e) => !e.time);
  if (loose) problems.push(`时间轴每行写「时间｜事件」，「${loose.event}」没有时间`);
  count(events.length, "件事");
  return { chart: { type, title, events }, problems };
}

/** Accent opacity per item: the first item (the one the text puts first) is the full accent. */
export const SHADES = [1, 0.66, 0.46, 0.32, 0.22, 0.15];
const r2 = (n) => Math.round(n * 100) / 100;

/** Bar lengths as shares of the longest (0–1); at or below 0 there's no bar. */
export function barShares(values) {
  const max = Math.max(...values.map(Math.abs), 0);
  return values.map((v) => (max > 0 ? Math.round((Math.max(0, v) / max) * 1000) / 1000 : 0));
}

/** Line points in % of the plot: x at column centres, y from 92% (0, or the lowest value if negative) up to 14% (the highest). No axis numbers: they'd be numbers the source doesn't have. */
export function linePoints(values) {
  const lo = Math.min(0, ...values);
  const hi = Math.max(...values);
  const span = hi > lo ? hi - lo : 1;
  return values.map((v, i) => ({ x: r2(((i + 0.5) / values.length) * 100), y: r2(92 - ((v - lo) / span) * 78) }));
}

/** Width (px at the 36px time font, before --sb-k) for the timeline's time column: CJK at 1em, narrower at 0.62em. */
export function timeWidth(times) {
  const em = (t) => Array.from(t).reduce((w, ch) => w + (/[⺀-￿]/.test(ch) ? 1 : ch === " " ? 0.3 : 0.62), 0);
  return Math.ceil(Math.max(2, ...times.map(em)) * 36) + 8;
}

const RING_R = 78;
const RING_C = 2 * Math.PI * RING_R;
/** Ring segments as stroke dashes on a circle of radius 78, with a small gap between them. */
export function ringSegments(values) {
  const total = values.reduce((a, b) => a + b, 0);
  const gap = values.length > 1 ? 2.4 : 0;
  let at = 0;
  return values.map((v) => {
    const full = total > 0 ? (v / total) * RING_C : 0;
    const seg = { length: r2(Math.max(0, full - gap)), offset: at ? r2(-at) : 0 };
    at += full;
    return seg;
  });
}

const SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(doc, tag, attrs) {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}
const svgBox = (doc, cls, viewBox, stretch = false) => svgEl(doc, "svg", { class: `ch-svg ${cls}`, viewBox, ...(stretch ? { preserveAspectRatio: "none" } : {}), "aria-hidden": "true" });

/** The card body for a chart (text only through textContent; attributes carry numbers computed here). */
export function buildChart(doc, text) {
  const { chart, problems } = parseChart(text);
  const root = el(doc, "div", `sb sb-chart${chart ? ` ch-is-${chart.type}` : ""}`);
  if (!chart) { root.append(el(doc, "div", "sb-todo", `图表格式不对：${problems[0]}`)); return root; }
  if (chart.title || chart.unit) {
    const head = el(doc, "div", "ch-top");
    if (chart.title) head.append(el(doc, "div", "ch-title", chart.title));
    if (chart.unit) head.append(el(doc, "div", "ch-unit", `单位：${chart.unit}`));
    root.append(head);
  }
  if (chart.type === "bar") {
    const box = el(doc, "div", `ch-bars${chart.points.length > 5 ? " is-dense" : ""}`);
    const shares = barShares(chart.points.map((p) => p.value));
    chart.points.forEach((p, i) => {
      const row = el(doc, "div", "ch-bar-row");
      const bar = svgBox(doc, "ch-bar", "0 0 1000 10", true);
      bar.append(svgEl(doc, "rect", { class: "ch-track", x: 0, y: 0, width: 1000, height: 10 }));
      if (shares[i] > 0) bar.append(svgEl(doc, "rect", { class: "ch-fill", x: 0, y: 0, width: Math.round(shares[i] * 1000), height: 10, "fill-opacity": i ? 0.5 : 1 }));
      row.append(el(doc, "div", "ch-name ch-keep", p.name), el(doc, "div", "ch-value", p.raw), bar);
      box.append(row);
    });
    root.append(box);
  } else if (chart.type === "line") {
    const pts = linePoints(chart.points.map((p) => p.value));
    const plot = el(doc, "div", "ch-plot");
    const svg = svgBox(doc, "ch-lines", "0 0 100 100", true);
    for (const y of [14, 53]) svg.append(svgEl(doc, "line", { x1: 0, y1: y, x2: 100, y2: y, class: "ch-grid" }));
    svg.append(svgEl(doc, "line", { x1: 0, y1: 92, x2: 100, y2: 92, class: "ch-base" }));
    const path = pts.map((p) => `${p.x},${p.y}`).join(" ");
    svg.append(svgEl(doc, "polygon", { points: `${pts[0]?.x ?? 0},92 ${path} ${pts[pts.length - 1]?.x ?? 0},92`, class: "ch-area" }), svgEl(doc, "polyline", { points: path, class: "ch-line" }));
    plot.append(svg);
    chart.points.forEach((p, i) => {
      const at = `left:${pts[i].x}%;top:${pts[i].y}%`;
      const dot = el(doc, "span", "ch-dot");
      dot.style.cssText = at;
      const label = el(doc, "span", `ch-pt${i === chart.points.length - 1 ? " is-last" : ""}`, p.raw);
      label.style.cssText = at;
      plot.append(dot, label);
    });
    const xs = el(doc, "div", "ch-xs");
    xs.style.gridTemplateColumns = `repeat(${chart.points.length},minmax(0,1fr))`;
    for (const p of chart.points) xs.append(el(doc, "div", "ch-x ch-keep", p.name));
    root.append(plot, xs);
  } else if (chart.type === "donut") {
    const ring = el(doc, "div", "ch-ring");
    const svg = svgBox(doc, "ch-donut-svg", "0 0 200 200");
    ringSegments(chart.points.map((p) => p.value)).forEach((seg, i) => svg.append(svgEl(doc, "circle", {
      class: "ch-seg", cx: 100, cy: 100, r: RING_R, transform: "rotate(-90 100 100)",
      "stroke-dasharray": `${seg.length} ${r2(RING_C - seg.length)}`, "stroke-dashoffset": seg.offset, "stroke-opacity": SHADES[i] ?? 0.12,
    })));
    ring.append(svg);
    const lead = chart.points[0];
    if (lead && chars(lead.raw) <= 7) {
      const mid = el(doc, "div", "ch-center");
      mid.append(el(doc, "span", "ch-center-value", lead.raw));
      ring.append(mid);
    }
    const legend = el(doc, "div", "ch-legend");
    chart.points.forEach((p, i) => {
      const key = el(doc, "div", "ch-key");
      const swatch = el(doc, "span", "ch-swatch");
      swatch.style.opacity = String(SHADES[i] ?? 0.12);
      key.append(swatch, el(doc, "span", "ch-name ch-keep", p.name), el(doc, "span", "ch-value", p.raw));
      legend.append(key);
    });
    root.append(ring, legend);
  } else if (chart.type === "flow") {
    const box = el(doc, "div", "ch-steps");
    chart.steps.forEach((step, i) => {
      if (i) {
        const arrow = svgBox(doc, "ch-arrow", "0 0 40 56");
        arrow.append(svgEl(doc, "line", { x1: 20, y1: 4, x2: 20, y2: 46, class: "ch-stroke" }), svgEl(doc, "polyline", { points: "8,34 20,48 32,34", class: "ch-stroke" }));
        box.append(arrow);
      }
      const row = el(doc, "div", "ch-step");
      const words = el(doc, "div", "ch-step-words");
      words.append(el(doc, "div", "ch-step-text", step.text));
      if (step.note) words.append(el(doc, "div", "ch-step-note", `→ ${step.note}`));
      row.append(el(doc, "span", "ch-no", String(i + 1)), words);
      box.append(row);
    });
    root.append(box);
  } else if (chart.type === "compare") {
    const grid = el(doc, "div", "ch-table");
    grid.append(el(doc, "div", "ch-cell is-l is-head ch-keep", chart.left), el(doc, "div", "ch-cell is-r is-head ch-keep", chart.right));
    chart.rows.forEach(([l, r], i) => {
      const edge = i === chart.rows.length - 1 ? " is-end" : "";
      grid.append(el(doc, "div", `ch-cell is-l${edge}`, l), el(doc, "div", `ch-cell is-r${edge}`, r));
    });
    root.append(grid);
  } else if (chart.type === "matrix") {
    const head = (dir) => {
      const svg = svgBox(doc, `ch-head-${dir}`, "0 0 24 24");
      svg.append(svgEl(doc, "polygon", { points: dir === "up" ? "12,2 23,22 1,22" : "22,12 2,1 2,23", class: "ch-mark" }));
      return svg;
    };
    const box = el(doc, "div", "ch-matrix");
    const yAxis = el(doc, "div", "ch-yaxis");
    yAxis.append(head("up"), el(doc, "i", "ch-rule"), el(doc, "span", "ch-axis-name", chart.y), el(doc, "i", "ch-rule"));
    const quads = el(doc, "div", "ch-quads");
    for (const q of chart.quads) {
      const cell = el(doc, "div", "ch-quad");
      cell.append(el(doc, "div", "ch-quad-name ch-keep", q.name), el(doc, "div", "ch-quad-text", q.text));
      quads.append(cell);
    }
    const xAxis = el(doc, "div", "ch-xaxis");
    xAxis.append(el(doc, "i", "ch-rule"), el(doc, "span", "ch-axis-name", chart.x), el(doc, "i", "ch-rule"), head("right"));
    box.append(yAxis, quads, el(doc, "span"), xAxis);
    root.append(box);
  } else {
    const box = el(doc, "div", "ch-events");
    box.style.setProperty("--ch-time-w", `calc(${timeWidth(chart.events.map((e) => e.time))}px*var(--sb-k,1))`);
    for (const e of chart.events) {
      const row = el(doc, "div", "ch-ev");
      const axis = el(doc, "div", "ch-axis");
      const dot = svgBox(doc, "ch-node", "0 0 36 36");
      dot.append(svgEl(doc, "circle", { cx: 18, cy: 18, r: 15, class: "ch-node-ring" }), svgEl(doc, "circle", { cx: 18, cy: 18, r: 7, class: "ch-mark" }));
      axis.append(dot);
      row.append(el(doc, "div", "ch-time ch-keep", e.time), axis, el(doc, "div", "ch-event", e.event));
      box.append(row);
    }
    root.append(box);
  }
  return root;
}

// ---------------------------------------------------------------------------------------------------------------
// In the page

function el(doc, tag, cls, text) {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function shot(doc, text, figure, cls) {
  const { image } = parseShot(text);
  const box = el(doc, "div", cls);
  if (image && safeSrc(image.src)) {
    const img = doc.createElement("img");
    img.src = safeSrc(image.src);
    img.alt = image.alt;
    box.append(img);
  } else box.append(el(doc, "div", "sb-todo", placeholderText(figure)));
  return box;
}

/** The card body for a structured layout, built as DOM (text only through textContent). */
export function buildStructured(doc, kind, text, figure) {
  const root = el(doc, "div", `sb sb-${kind}`);
  const dots = () => { const bar = el(doc, "div", "sb-bar"); bar.append(el(doc, "i"), el(doc, "i"), el(doc, "i")); return bar; };
  switch (kind) {
    case "window": {
      const win = el(doc, "div", "sb-frame");
      win.append(dots(), shot(doc, text, figure, "sb-screen"));
      const caption = parseShot(text).caption;
      root.append(win);
      if (caption) root.append(el(doc, "p", "sb-caption", caption));
      break;
    }
    case "phone": {
      const phone = el(doc, "div", "sb-device");
      phone.append(el(doc, "div", "sb-notch"), shot(doc, text, figure, "sb-screen"));
      const caption = parseShot(text).caption;
      root.append(phone);
      if (caption) root.append(el(doc, "p", "sb-caption", caption));
      break;
    }
    case "code": {
      const { file, code } = parseCode(text);
      const bar = dots();
      if (file) bar.append(el(doc, "span", "sb-file", file));
      const body = el(doc, "div", "sb-code");
      code.split("\n").forEach((line, i) => {
        const row = el(doc, "div", "sb-line");
        row.append(el(doc, "span", "sb-no", String(i + 1)), el(doc, "span", "sb-src", line || " "));
        body.append(row);
      });
      const editor = el(doc, "div", "sb-editor");
      editor.append(bar, body);
      root.append(editor);
      break;
    }
    case "prompt": {
      const box = el(doc, "div", "sb-input");
      box.append(el(doc, "div", "sb-label", "提示词"), el(doc, "div", "sb-prompt", text.trim()));
      const send = el(doc, "div", "sb-send");
      send.append(el(doc, "i"));
      box.append(send);
      root.append(box);
      break;
    }
    case "chat":
      for (const line of parseChat(text)) {
        const row = el(doc, "div", `sb-msg is-${line.who}`);
        // One block per written line, so each line is balanced on its own.
        const bubble = el(doc, "div", "sb-bubble");
        for (const part of line.text.split("\n")) bubble.append(el(doc, "span", "sb-ln", part));
        row.append(el(doc, "span", "sb-who", line.who === "q" ? "问" : "答"), bubble);
        root.append(row);
      }
      break;
    case "metric": {
      const items = parseMetrics(text);
      root.classList.add(`n-${items.length}`);
      for (const m of items) {
        const row = el(doc, "div", "sb-metric");
        const num = el(doc, "div", "sb-num");
        num.append(el(doc, "span", "sb-value", m.value));
        if (m.unit) num.append(el(doc, "span", "sb-unit", m.unit));
        row.append(num);
        if (m.note) row.append(el(doc, "div", "sb-note", m.note));
        root.append(row);
      }
      break;
    }
    case "rightwrong":
      for (const line of parseRightWrong(text)) {
        const row = el(doc, "div", `sb-rw ${line.ok === true ? "is-right" : line.ok === false ? "is-wrong" : "is-plain"}`);
        row.append(el(doc, "span", "sb-mark", line.ok === true ? "✓" : line.ok === false ? "✗" : "·"), el(doc, "span", "sb-text", line.text));
        root.append(row);
      }
      break;
    case "timeline":
      for (const line of parseTimeline(text)) {
        const row = el(doc, "div", "sb-event");
        row.append(el(doc, "span", "sb-dot"));
        const words = el(doc, "div", "sb-words");
        if (line.time) words.append(el(doc, "div", "sb-time", line.time));
        words.append(el(doc, "div", "sb-text", line.event));
        row.append(words);
        root.append(row);
      }
      break;
    case "chart":
      return buildChart(doc, text);
    case "checklist":
      for (const line of parseChecklist(text)) {
        const row = el(doc, "div", `sb-check${line.done ? " is-done" : ""}`);
        row.append(el(doc, "span", "sb-box", line.done ? "✓" : ""), el(doc, "span", "sb-text", line.text));
        root.append(row);
      }
      break;
    default:
      root.append(el(doc, "p", undefined, text));
  }
  return root;
}

function cardShell(doc, deck, extra) {
  const theme = THEMES[deck.theme] ?? THEMES.light;
  const card = el(doc, "div", `xs-card theme-${theme.id}${extra ? ` ${extra}` : ""}`);
  for (const [k, v] of Object.entries(derivePalette(theme.id, deck.accent).vars)) card.style.setProperty(`--${k}`, v);
  card.style.setProperty("--font", SANS);
  card.style.setProperty("--mono", MONO);
  return card;
}

function titleCard(doc, deck, headline) {
  const card = cardShell(doc, deck, "xs-cover");
  card.style.setProperty("--title-size", `${titleSize(headline)}px`);
  const box = el(doc, "div", "xs-cover-box");
  box.append(el(doc, "div", "xs-title", headline), el(doc, "div", "xs-bar"));
  if (deck.subtitle) box.append(el(doc, "div", "xs-sub", deck.subtitle));
  card.append(box);
  if (deck.date || deck.author) {
    const meta = el(doc, "div", "xs-meta");
    meta.append(el(doc, "span", undefined, deck.author), el(doc, "span", undefined, deck.date));
    card.append(meta);
  }
  return card;
}

const STATEMENT_MAX = 90;

/**
 * Short copy at body size would leave most of the card blank, so the text layouts get a large set: a statement or
 * ending in big type, a list or steps as big items, a comparison as a big table. Anything that doesn't look like its
 * layout is left as plain Markdown.
 */
function applyLayout(body, content, kind) {
  const blocks = Array.from(content.children);
  const first = blocks[0];
  const text = Array.from(content.textContent.trim());
  if ((kind === "list" || kind === "steps") && blocks.length && blocks.every((b) => /^(UL|OL)$/.test(b.tagName)) && text.length <= 140) return body.classList.add("is-list");
  if (kind === "compare" && first?.tagName === "TABLE" && blocks.length === 1) return body.classList.add("is-compare");
  if (blocks.length !== 1 || first?.tagName !== "P" || first.querySelector("img") || !text.length || text.length > STATEMENT_MAX) return;
  body.classList.add("is-statement");
  if (kind === "ending") body.classList.add("is-ending");
  body.style.setProperty("--statement-size", text.length <= 30 ? "72px" : text.length <= 55 ? "62px" : "54px");
}

function bodyCard(doc, deck, row, total) {
  const card = cardShell(doc, deck, `is-${row.layout}`);
  const head = el(doc, "div", "xs-head");
  head.append(el(doc, "b"), el(doc, "span", undefined, deck.title), el(doc, "i"));
  const body = el(doc, "div", "xs-body");
  const content = el(doc, "div", "xs-content");
  if (isStructured(row.layout)) {
    content.append(buildStructured(doc, row.layout, row.text, row.figure));
    body.classList.add("is-structured");
  } else {
    content.classList.add("xs-md");
    content.innerHTML = miniMarkdown(row.layout === "compare" ? compareTable(row.text) : row.text);
    applyLayout(body, content, row.layout);
  }
  body.append(content);
  const foot = el(doc, "div", "xs-foot");
  foot.append(el(doc, "span", undefined, deck.author), el(doc, "span", undefined, `${String(row.page).padStart(2, "0")} / ${String(total).padStart(2, "0")}`));
  card.append(head, body, foot);
  return card;
}

/** How far a short card (any body page, not the cover) may grow: up to this share of its body box, and at most this font multiplier. */
const FILL = 0.78;
const MAX_SCALE = 1.6;

/**
 * Two chat bubbles at base size leave most of the page empty. Scale the card's fonts (--sb-k) up in steps while the
 * content stays under FILL of the box and nothing overflows; one step back from the first size that doesn't fit.
 */
function grow(card) {
  const body = card.querySelector(".xs-body");
  const content = card.querySelector(".xs-content");
  // Table cells and list items must not gain a line as they grow: 「ChatGPT 账 / 号」 is worse than smaller type.
  const wrapped = Array.from(content.querySelectorAll("th, td, li, .ch-keep"));
  const base = wrapped.map(lineCount);
  const fits = () => content.getBoundingClientRect().height <= body.clientHeight * FILL && content.scrollWidth <= body.clientWidth + 2 &&
    wrapped.every((el, i) => lineCount(el) <= base[i]);
  if (!fits()) return 1;
  let k = 1;
  while (k < MAX_SCALE) {
    const next = Math.round((k + 0.1) * 10) / 10;
    body.style.setProperty("--sb-k", String(next));
    if (!fits()) { body.style.setProperty("--sb-k", String(k)); break; }
    k = next;
  }
  return k;
}

/** Lines an element's text takes: distinct line tops among its text boxes. */
function lineCount(el) {
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  return new Set(Array.from(range.getClientRects(), (r) => Math.round(r.top))).size;
}

/** How many px the card's content runs past its box (0 when it fits). */
function overflowPx(card) {
  if (card.classList.contains("xs-cover")) {
    const box = card.querySelector(".xs-cover-box");
    const inner = Array.from(box.children).reduce((h, c) => h + c.getBoundingClientRect().height, 0) + 120;
    return Math.max(0, Math.ceil(inner - box.clientHeight), box.scrollWidth - box.clientWidth > 2 ? box.scrollWidth - box.clientWidth : 0);
  }
  const body = card.querySelector(".xs-body");
  const content = card.querySelector(".xs-content");
  const tall = Math.ceil(content.getBoundingClientRect().height - body.clientHeight);
  const wide = Math.ceil(content.scrollWidth - body.clientWidth);
  return Math.max(tall > 2 ? tall : 0, wide > 2 ? wide : 0);
}

/**
 * Lays the deck out in `#cards` (or the body), one 1080×1440 card under the other: the pages in order, then one title
 * card per cover candidate. Reports per page its layout, how far it overflows and the font scale a structured card
 * grew to, and per cover candidate its overflow.
 */
export async function start(doc, deck) {
  const host = doc.getElementById("cards") ?? doc.body;
  const { cover, body } = storyboardRows(deck.cards);
  const total = body.length + 1;
  const cards = [titleCard(doc, deck, headlineOf(deck, cover)), ...body.map((row) => bodyCard(doc, deck, row, total))];
  const covers = (deck.covers ?? []).map((c) => titleCard(doc, deck, c.text));
  host.replaceChildren(...cards, ...covers);
  await Promise.all(Array.from(host.querySelectorAll("img")).map((img) => img.decode().catch(() => undefined)));
  if (doc.fonts?.ready) await doc.fonts.ready;
  const rows = [cover ?? { page: 1, layout: "cover" }, ...body];
  return {
    pages: rows.map((row, i) => {
      const card = cards[i];
      const scale = card.querySelector(".xs-body") ? grow(card) : 1;
      return { page: row.page, layout: row.layout, overflow: overflowPx(card), scale };
    }),
    covers: covers.map((card, i) => ({ label: `封面 ${coverLetter(i)}`, overflow: overflowPx(card) })),
  };
}
