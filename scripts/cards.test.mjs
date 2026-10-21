// node --test scripts/*.test.mjs — the pure functions in assets/cards.js.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  LAYOUTS, MOTIVES, checkCards, checkDeck, checkMotives, checkNumbers, compareTable, contrast, copyWarnings, derivePalette,
  escapeHtml, miniMarkdown, normalizeDeck, numbersIn, oklchToRgb, parseAllow, parseChat, parseChecklist, parseCode,
  parseHex, parseMetrics, parseRightWrong, parseShot, parseTimeline, rgbToOklch, storyboardHtml, storyboardRows, titleSize, toHex,
} from "../assets/cards.js";

const deckOf = (raw) => {
  const { deck, issues } = normalizeDeck(raw);
  assert.deepEqual(issues, []);
  return deck;
};
const card = (layout, text, figure) => ({ layout, text, ...(figure ? { figure } : {}) });

test("15 layouts and 7 motives", () => {
  assert.equal(LAYOUTS.length, 15);
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
