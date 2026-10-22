// node --test scripts/*.test.mjs — the pure functions in assets/cards.js.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  LAYOUTS, MOTIVES, barShares, buildChart, chartHeader, checkCards, checkDeck, checkMotives, checkNumbers, compareTable, contrast, copyWarnings, derivePalette,
  escapeHtml, miniMarkdown, normalizeDeck, numbersIn, oklchToRgb, parseAllow, parseChat, parseChecklist, parseCode,
  linePoints, magnitude, numberOf, parseChart, parseHex, parseMetrics, parseRightWrong, parseShot, parseTimeline, rgbToOklch, ringSegments, timeWidth, storyboardHtml, storyboardRows, titleSize, toHex,
} from "../assets/cards.js";

const deckOf = (raw) => {
  const { deck, issues } = normalizeDeck(raw);
  assert.deepEqual(issues, []);
  return deck;
};
const card = (layout, text, figure) => ({ layout, text, ...(figure ? { figure } : {}) });

test("16 layouts and 7 motives", () => {
  assert.equal(LAYOUTS.length, 16);
  assert.equal(LAYOUTS.find((l) => l.id === "chart").name, "图表");
  assert.deepEqual(MOTIVES.map((m) => m.id), ["correct", "result", "fail", "verify", "advise", "relate", "prove"]);
});

test("line formats", () => {
  assert.deepEqual(parseChat("问：能直接用吗？\n答: 能\n先装好依赖\nQ：然后呢"), [
    { who: "q", text: "能直接用吗？" }, { who: "a", text: "能\n先装好依赖" }, { who: "q", text: "然后呢" },
  ]);
  assert.deepEqual(parseChat("没有前缀"), [{ who: "q", text: "没有前缀" }]);
  assert.deepEqual(parseRightWrong("✓ 先写测试\n✗ 直接改\n随便一行"), [{ ok: true, text: "先写测试" }, { ok: false, text: "直接改" }, { ok: null, text: "随便一行" }]);
  assert.deepEqual(parseTimeline("2024｜发布 1.0\n2025 | 开源\n没有时间"), [{ time: "2024", event: "发布 1.0" }, { time: "2025", event: "开源" }, { time: "", event: "没有时间" }]);
  assert.deepEqual(parseChecklist("[x] 装好\n- [ ] 跑测试\n[ ]写文档\n普通一行"), [{ done: true, text: "装好" }, { done: false, text: "跑测试" }, { done: false, text: "写文档" }, { done: false, text: "普通一行" }]);
  assert.deepEqual(parseMetrics("3｜小时｜省下的时间\n80%｜准确率\n只有说明\n4｜个｜第四个不要"), [
    { value: "3", unit: "小时", note: "省下的时间" }, { value: "80%", unit: "", note: "准确率" }, { value: "", unit: "", note: "只有说明" },
  ]);
  assert.deepEqual(parseCode("文件：deploy.sh\nnpm run build\nnpm start"), { file: "deploy.sh", code: "npm run build\nnpm start" });
  assert.deepEqual(parseCode("```bash\necho hi\n```"), { file: "", code: "echo hi" });
  assert.deepEqual(parseShot("![设置页](shots/a.png)\n打开设置就能看到"), { image: { alt: "设置页", src: "shots/a.png" }, caption: "打开设置就能看到" });
  assert.equal(parseShot("只有说明").image, null);
});

test("compare tables get the separator row a model often leaves out", () => {
  assert.equal(compareTable("| 元素 | 上限 |\n| 大标题 | 每行8字 |"), "| 元素 | 上限 |\n| --- | --- |\n| 大标题 | 每行8字 |");
  const ok = "| A | B |\n|---|:---:|\n| 1 | 2 |";
  assert.equal(compareTable(ok), ok);
  assert.equal(compareTable("不是表格"), "不是表格");
});

test("Markdown subset escapes everything and only keeps safe picture addresses", () => {
  assert.equal(escapeHtml(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  const html = miniMarkdown("- a **b**\n- c `x<y>`\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n3. three\n4. four\n\nhello\nworld ![p](a.png)");
  assert.match(html, /<ul><li>a <strong>b<\/strong><\/li><li>c <code>x&lt;y&gt;<\/code><\/li><\/ul>/);
  assert.match(html, /<table><thead><tr><th>A<\/th><th>B<\/th><\/tr><\/thead><tbody><tr><td>1<\/td><td>2<\/td><\/tr><\/tbody><\/table>/);
  assert.match(html, /<ol start="3"><li>three<\/li><li>four<\/li><\/ol>/);
  assert.match(html, /<p>hello<br>world <img src="a.png" alt="p"><\/p>/);
  assert.doesNotMatch(miniMarkdown("<script>alert(1)</script>"), /<script/);
  assert.match(miniMarkdown("![x](javascript:alert(1))"), /src=""/);
  assert.match(miniMarkdown("![x](data:image/png;base64,AAAA)"), /src="data:image\/png;base64,AAAA"/);
});

test("cards.json validation names what to fix", () => {
  const { issues } = normalizeDeck({ theme: "neon", accent: "red;}", motives: ["viral"], covers: [{ text: "" }], cards: [{ layout: "hero", text: "" }, { layout: "list", text: "- a", figure: { source: "mine" } }] });
  const text = issues.map((i) => i.message).join("\n");
  for (const want of ["缺少 title", "theme 只能是", "accent 要是一个十六进制颜色", "\"viral\" 不认识", "covers[0] 的 text 是空的", "cards[0] 的 layout \"hero\" 不认识", "cards[0] 的 text 是空的", "cards[1] 的 figure.source"]) {
    assert.ok(text.includes(want), `missing: ${want}\n${text}`);
  }
  assert.ok(issues.every((i) => i.level === "error"));
  const deck = deckOf({ title: "t", accent: "#ABC", cards: [card("statement", "x")] });
  assert.equal(deck.theme, "light");
  assert.equal(deck.accent, "#aabbcc");
  assert.deepEqual(deck.cards[0].figure, { source: "none", note: "" });
});

test("storyboard rows: a short cover card becomes page 1", () => {
  const { cover, body } = storyboardRows([card("cover", "封面字"), card("statement", "一句话"), card("list", "- 一\n- 二")]);
  assert.equal(cover.page, 1);
  assert.deepEqual(body.map((r) => [r.index, r.page, r.layout]), [[1, 2, "statement"], [2, 3, "list"]]);
  assert.equal(storyboardRows([card("cover", "一句很长很长很长很长很长很长很长很长很长很长的观点"), card("statement", "二")]).cover, null);
  assert.equal(storyboardRows([card("statement", "x"), card("ending", "y")]).body[0].page, 2);
});

test("blocking checks: missing real screenshot, 待补 left over, overflow", () => {
  const rows = storyboardRows([card("cover", "封面"), card("window", "设置页在这", { source: "yours", note: "设置页截图" }), card("phone", "图在这", { source: "ready", note: "" }), card("statement", "待补：数据")]).body;
  const issues = checkCards({ rows, overflow: [{ page: 5, px: 40 }, { page: null, label: "封面 B", px: 12 }] });
  assert.deepEqual(issues.map((i) => [i.level, i.page]), [["error", 2], ["error", 3], ["error", 4], ["error", 5], ["error", null]]);
  assert.match(issues[0].message, /第 2 张缺你的真实截图：设置页截图/);
  assert.match(issues[0].message, /不要画假截图/);
  assert.match(issues[1].message, /待补/);
  assert.match(issues[3].message, /第 5 张文字超出卡片 40px/);
  assert.match(issues[4].message, /^封面 B文字超出卡片 12px/);
  const done = storyboardRows([card("cover", "封面"), card("window", "![a](a.png)\n设置页在这", { source: "yours", note: "x" })]).body;
  assert.deepEqual(checkCards({ rows: done }), []);
});

test("数字溯源: every number on a card must be in the source", () => {
  assert.deepEqual(numbersIn("1. 第一步 １,２００ 人 80% 用了 08 天 v0.3.2 ![](a1.png) #d6336c"), ["1200", "80", "8", "0.3", "2"]);
  assert.deepEqual(numbersIn("1. a\n2. b", { code: true }), ["1", "2"]);
  assert.deepEqual(parseAllow("2026, 3，x"), ["2026", "3"]);
  const deck = deckOf({ title: "3 个办法", covers: [{ text: "省下 5 小时" }, { text: "B" }], cards: [card("cover", "封面"), card("metric", "3｜小时｜省下\n８０%｜准确率\n12｜次｜重试"), card("steps", "1. 装好\n2. 跑 2 次"), card("ending", "你呢？")] });
  const { cover, body } = storyboardRows(deck.cards);
  const rows = [cover, ...body];
  const source = "一共 3 个办法，省下 3 小时，准确率 80%，跑 2 次。";
  const issues = checkNumbers({ deck, rows, source });
  assert.deepEqual(issues.map((i) => [i.level, i.page]), [["error", null], ["error", 2]]);
  assert.match(issues[0].message, /封面 A的数字 5 在原文里找不到/);
  assert.match(issues[1].message, /第 2 张的数字 12 在原文里找不到/);
  assert.match(issues[1].message, /--allow-numbers 12/);
  assert.deepEqual(checkNumbers({ deck, rows, source, allow: ["5", "12"] }), []);
  const unchecked = checkNumbers({ deck, rows, source: null });
  assert.equal(unchecked.length, 1);
  assert.equal(unchecked[0].level, "warn");
  assert.match(unchecked[0].message, /没有提供 source/);
});

test("互动动机: ending question, verify reveals, no planted mistakes", () => {
  const rows = (cards) => storyboardRows(cards).body;
  const base = [card("cover", "封面"), card("statement", "一个观点")];
  assert.deepEqual(checkMotives({ deck: { motives: [] }, rows: rows([...base, card("ending", "就这样")]) }), []);
  const noQuestion = checkMotives({ deck: { motives: ["result"] }, rows: rows([...base, card("ending", "就这样")]) });
  assert.equal(noQuestion.length, 1);
  assert.match(noQuestion[0].message, /最后一张要用 ending 版式，并用一个问题收尾/);
  assert.equal(checkMotives({ deck: { motives: ["result"] }, rows: rows([...base, card("statement", "你呢？")]) }).length, 1);
  assert.deepEqual(checkMotives({ deck: { motives: ["result"] }, rows: rows([...base, card("ending", "你会怎么选?")]) }), []);
  const verify = checkMotives({ deck: { motives: ["verify"] }, rows: rows([...base, card("ending", "你信吗？")]) });
  assert.equal(verify.length, 1);
  assert.match(verify[0].message, /揭晓答案/);
  assert.deepEqual(checkMotives({ deck: { motives: ["verify"] }, rows: rows([...base, card("statement", "实测：能跑"), card("ending", "你信吗？")]) }), []);
  const planted = checkMotives({ deck: { motives: ["correct"] }, rows: rows([...base, card("statement", "这页我故意写错了一处"), card("ending", "找到了吗？")]) });
  assert.equal(planted.length, 1);
  assert.match(planted[0].message, /不埋错/);
  assert.equal(checkMotives({ deck: { motives: ["result", "fail", "relate"] }, rows: rows([...base, card("ending", "你呢？")]) })[0].level, "warn");
});

test("copy limits are warnings; more than 18 pictures is an error", () => {
  const { cover, body } = storyboardRows([card("cover", "封面"), card("list", "- 一\n- 这一条写得实在是太长太长了超过了十八个字"), card("compare", "| A | B |\n| 很长很长很长很长很长的格子 | b |"), card("metric", "3｜小时｜一个特别长特别长的说明文字"), card("ending", "结尾"), card("statement", "x")]);
  const warns = copyWarnings([cover, ...body], 6, { covers: [{ text: "这是一个超过十六个字的封面标题文字啊" }] });
  const text = warns.map((w) => w.message).join("\n");
  assert.ok(warns.every((w) => w.level === "warn"));
  for (const want of ["封面 A 有 18 字", "「要点」有 2 行", "「要点」有 1 行超过 18 字", "「对比表」有 1 格超过 10 字", "「数据」的说明", "结尾版式只用于最后一张", "covers 只有 1 个"]) assert.ok(text.includes(want), `missing: ${want}\n${text}`);
  assert.equal(copyWarnings([], 19).at(-1).level, "error");
  assert.equal(copyWarnings([], 7).length, 0);
});

test("checkDeck puts it together, sorted by page", () => {
  const deck = deckOf({ title: "t", motives: ["result"], cards: [card("cover", "封面"), card("chat", "问：a\n答：b"), card("ending", "完")] });
  const issues = checkDeck(deck, { source: "原文" });
  assert.deepEqual(issues.map((i) => [i.level, i.page]), [["warn", null], ["error", 3]]);
  assert.match(issues[0].message, /一共 3 张，建议 5–9 张/);
});

test("contrast follows WCAG 2", () => {
  assert.equal(contrast("#000000", "#ffffff"), 21);
  assert.equal(Math.round(contrast("#777777", "#ffffff") * 100) / 100, 4.48);
  assert.equal(contrast("#123456", "#123456"), 1);
  assert.equal(parseHex("zzz"), null);
  assert.equal(toHex(parseHex("#0af")), "#00aaff");
  for (const hex of ["#d6336c", "#2563eb", "#4ade80", "#777777"]) {
    assert.equal(toHex(oklchToRgb(rgbToOklch(parseHex(hex)))), hex, `round trip ${hex}`);
  }
});

test("one accent → a full palette whose text passes 4.5:1, with every fix listed", () => {
  for (const theme of ["light", "dark"]) {
    for (const accent of ["", "#d6336c", "#4ade80", "#1e3a8a", "#ffff00", "#000000", "#ffffff"]) {
      const { vars, adjustments } = derivePalette(theme, accent);
      for (const role of ["ink", "muted", "accent"]) assert.ok(contrast(vars[role], vars.bg) >= 4.5, `${theme} ${accent} ${role} ${vars[role]} on ${vars.bg}`);
      for (const a of adjustments) {
        assert.ok(a.before < 4.5 && a.after >= 4.5);
        assert.equal(vars[a.role], a.to);
      }
      for (const v of ["bg", "line", "panel", "code"]) assert.match(vars[v], /^#[0-9a-f]{6}$/);
    }
  }
  assert.deepEqual(derivePalette("light", "#4ade80").adjustments.map((a) => a.role), ["accent"]);
  assert.deepEqual(derivePalette("light").adjustments, []);
  assert.deepEqual(derivePalette("dark").adjustments, []);
  const light = derivePalette("light", "#2563eb").vars;
  assert.ok(Math.abs(rgbToOklch(parseHex(light.code))[2] - rgbToOklch(parseHex("#2563eb"))[2]) < 6, "tints keep the accent's hue");
});

test("title size steps down with length", () => {
  assert.ok(titleSize("五个字啊啊") > titleSize("这是一个十二个字的标题啊"));
  assert.ok(titleSize("这是一个超过十八个字的特别长特别长的封面") >= 80);
});

test("storyboard table escapes the copy", () => {
  const html = storyboardHtml(deckOf({ title: "<t>", motives: ["verify"], cards: [card("cover", "封面"), card("statement", "<b>x</b>"), card("window", "![图](a.png)\n说明", { source: "yours", note: "终端" })] }));
  assert.doesNotMatch(html, /<b>x<\/b>|<t>/);
  assert.match(html, /\[图 图\]/);
  assert.match(html, /要你给/);
  assert.match(html, /想辨真伪/);
});

test("the structured layouts only use the card variables and nothing under 28px", () => {
  const css = readFileSync(new URL("../assets/cards.css", import.meta.url), "utf8");
  const part = css.slice(css.indexOf("/* structured layouts"), css.indexOf("/* end structured layouts"));
  assert.ok(part.length > 1000);
  assert.doesNotMatch(part, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  const sizes = [...css.matchAll(/font-size:(?:calc\()?(\d+)px/g)].map((m) => Number(m[1]));
  assert.ok(Math.min(...sizes) >= 26, `smallest font ${Math.min(...sizes)}px`);
  assert.equal([...part.matchAll(/font-size:(\d+)px/g)].length, 0, "every structured size scales with --sb-k");
});

test("Markdown pages (statement, list, steps, compare) scale with --sb-k too, so a short page fills instead of floating small", () => {
  const css = readFileSync(new URL("../assets/cards.css", import.meta.url), "utf8");
  const part = css.slice(css.indexOf("/* Markdown cards"), css.indexOf("/* structured layouts"));
  assert.ok(part.includes(".is-list li") && part.includes(".is-compare table"));
  assert.equal([...part.matchAll(/font-size:(\d+)px/g)].length, 0, "every Markdown-page size scales with --sb-k");
  assert.match(part, /font-size:calc\(var\(--statement-size\)\*var\(--sb-k,1\)\)/);
});

// ---------------------------------------------------------------------------------------------------------------
// Charts (layout "chart", figure "draw")

test("chart line formats: the first line is the type, then one item per line", () => {
  assert.deepEqual(chartHeader("柱状：冷启动耗时"), { type: "bar", title: "冷启动耗时" });
  assert.deepEqual(chartHeader("时间线"), { type: "timeline", title: "" });
  assert.equal(chartHeader("饼状"), null);
  assert.match(parseChart("饼状\na｜1").problems[0], /柱状、折线、环形、流程、对比、矩阵、时间轴/);
  assert.deepEqual(parseChart("柱状\n单位：秒\nuv｜0.06\npip｜1,234.5 s"), { chart: { type: "bar", title: "", unit: "秒", points: [
    { name: "uv", raw: "0.06", value: 0.06 }, { name: "pip", raw: "1,234.5 s", value: 1234.5 },
  ] }, problems: [] });
  assert.equal(numberOf("约 ３x"), 3);
  assert.equal(numberOf("很快"), null);
  assert.deepEqual(parseChart("折线\nv1｜10\nv2｜很快").problems, ["「v2」的数值「很快」里没有数字", "折线图要 2–8 项，现在 1 项"]);
  assert.match(parseChart("环形\n甲｜0\n乙｜3").problems[0], /大于 0/);
  assert.deepEqual(parseChart("流程\n1. 读材料\n出分镜 → 等确认").chart.steps, [{ text: "读材料", note: "" }, { text: "出分镜", note: "等确认" }]);
  assert.deepEqual(parseChart("对比\n以前｜现在\n手写｜AI 写").chart, { type: "compare", title: "", left: "以前", right: "现在", rows: [["手写", "AI 写"]] });
  assert.match(parseChart("对比\n以前｜现在\n只有左边").problems[0], /只有一边/);
  const matrix = parseChart("矩阵\n横轴：投入\n纵轴：收益\n先做｜a\n规划｜b\n顺手｜c\n不做｜d");
  assert.deepEqual([matrix.chart.x, matrix.chart.y, matrix.chart.quads.length, matrix.problems], ["投入", "收益", 4, []]);
  assert.deepEqual(parseChart("矩阵\n投入\n收益\na｜1").problems, ["矩阵图要正好 4 个象限（左上、右上、左下、右下），现在 1 个"]);
  assert.deepEqual(parseChart("时间轴\n2024｜发布\n2025｜开源").chart.events, [{ time: "2024", event: "发布" }, { time: "2025", event: "开源" }]);
  assert.match(parseChart("时间轴\n2024｜发布\n没时间").problems[0], /没有时间/);
});

test("durations are drawn by their length in any time unit; units that can't share an axis block", () => {
  assert.deepEqual(magnitude("8m30s"), { value: 510, unit: "time" });
  assert.deepEqual(magnitude("0.082s (1.00x)"), { value: 0.082, unit: "time" });
  assert.deepEqual(magnitude("5M"), { value: 5, unit: "M" });
  const { chart, problems } = parseChart("柱状\nripgrep｜15.569s\nGNU grep｜32.409s\nGNU grep Unicode｜8m30s");
  assert.deepEqual(problems, []);
  assert.deepEqual(barShares(chart.points.map((p) => p.value)), [0.031, 0.064, 1]);
  assert.deepEqual(parseChart("柱状\n大小｜3 MB\n耗时｜2 秒").problems, ["数值的单位不一致（「大小」是 MB，「耗时」是 时间）：一张图只放同一种单位，或拆成两张图"]);
});

test("chart geometry is deterministic", () => {
  assert.deepEqual(barShares([4, 2, 1]), [1, 0.5, 0.25]);
  assert.deepEqual(linePoints([0, 10]), [{ x: 25, y: 92 }, { x: 75, y: 14 }]);
  const segs = ringSegments([1, 1]);
  assert.equal(segs[0].offset, 0);
  assert.ok(Math.abs(segs[1].offset + 245.04) < 0.05);
  assert.ok(timeWidth(["2024 年"]) < timeWidth(["2024 年 10 月"]));
});

/** Just enough DOM for buildChart in Node: elements, SVG elements, attributes, classes, text and inline style. */
function fakeDocument() {
  const make = (tag, ns = "html") => ({
    tagName: tag, ns, children: [], attributes: {}, className: "", textContent: "",
    style: { cssText: "", props: {}, setProperty(k, v) { this.props[k] = v; } },
    setAttribute(k, v) { this.attributes[k] = String(v); if (k === "class") this.className = String(v); },
    append(...kids) { this.children.push(...kids); },
    all() { return this.children.flatMap((c) => [c, ...c.all()]); },
    find(pred) { return this.all().filter(pred); },
  });
  return { createElement: (tag) => make(tag), createElementNS: (_, tag) => make(tag, "svg") };
}
const hasClass = (cls) => (n) => n.className.split(/\s+/).includes(cls);

test("charts draw SVG marks and HTML text, values exactly as written, the copy never in markup", () => {
  const doc = fakeDocument();
  const bar = buildChart(doc, "柱状：耗时\nuv｜0.06 秒\npip｜4.6 秒");
  assert.ok(hasClass("ch-is-bar")(bar));
  assert.deepEqual(bar.find(hasClass("ch-value")).map((n) => n.textContent), ["0.06 秒", "4.6 秒"]);
  assert.deepEqual(bar.find(hasClass("ch-fill")).map((n) => [n.ns, n.tagName, n.attributes.width]), [["svg", "rect", "13"], ["svg", "rect", "1000"]]);
  const line = buildChart(doc, "折线\nv1｜30\nv2｜20\nv3｜10");
  assert.equal(line.find(hasClass("ch-line"))[0].attributes.points, "16.67,14 50,40 83.33,66");
  assert.equal(line.find(hasClass("ch-dot")).length, 3);
  const donut = buildChart(doc, "环形\n文档｜45%\n代码｜30%\n测试｜25%");
  assert.equal(donut.find(hasClass("ch-seg")).length, 3);
  assert.equal(donut.find(hasClass("ch-center-value"))[0].textContent, "45%");
  assert.equal(buildChart(doc, "流程\na\nb\nc").find((n) => n.tagName === "svg").length, 2);
  assert.equal(buildChart(doc, "对比\n以前｜现在\na｜b\nc｜d").find(hasClass("ch-cell")).length, 6);
  assert.equal(buildChart(doc, "矩阵\n横轴：x\n纵轴：y\na｜1\nb｜2\nc｜3\nd｜4").find(hasClass("ch-quad")).length, 4);
  assert.equal(buildChart(doc, "时间轴\n2024｜a\n2025｜b").find(hasClass("ch-node")).length, 2);
  assert.match(buildChart(doc, "随便写写").find(hasClass("sb-todo"))[0].textContent, /图表格式不对/);
  const evil = buildChart(doc, "柱状：<img src=x onerror=alert(1)>\n<script>｜1\n\" onload=\"x｜2");
  assert.equal(evil.find((n) => n.tagName === "img" || n.tagName === "script").length, 0);
  for (const n of evil.all()) for (const v of Object.values(n.attributes)) assert.doesNotMatch(v, /alert|onload|script/);
});

test("a chart blocks on a wrong line format; its numbers are traced to the source like every card", () => {
  const deck = deckOf({ title: "t", source: "source.md", cards: [card("cover", "封面"), card("chart", "柱状：3 个工具\nuv｜0.06 秒\npip｜4.6 秒\npoetry｜12 秒", { source: "draw", note: "耗时" }), card("chart", "矩阵\n横轴：a\n纵轴：b\n甲｜x", { source: "draw", note: "" }), card("statement", "一句话", { source: "draw", note: "" }), card("ending", "你呢？")] });
  assert.deepEqual(deck.cards[1].figure, { source: "draw", note: "耗时" });
  const issues = checkDeck(deck, { source: "uv 装依赖 0.06 秒，pip 要 4.6 秒。" });
  const byPage = (p) => issues.filter((i) => i.page === p).map((i) => `${i.level} ${i.message}`);
  assert.ok(byPage(2).some((m) => m.startsWith("error 第 2 张的数字 3、12 在原文里找不到")), byPage(2).join("\n"));
  assert.ok(byPage(3).some((m) => m.startsWith("error 第 3 张的图表：矩阵图要正好 4 个象限")), byPage(3).join("\n"));
  assert.ok(byPage(4).some((m) => m.startsWith("warn 第 4 张的 figure 是 draw")), byPage(4).join("\n"));
  assert.match(storyboardHtml(deck), /代码画/);
});
