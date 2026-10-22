// node --test scripts/*.test.mjs — the renderer's helpers, and an end-to-end render when Chrome is installed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { UsageError, fillTemplate, findChrome, inlineImages, overviewHtml, parseArgs, pngSize } from "./render.mjs";

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

test("arguments", () => {
  assert.deepEqual(parseArgs(["a/cards.json", "--out", "o", "--theme", "dark", "--allow-numbers", "2026,3", "--allow-numbers", "08"]), {
    cards: "a/cards.json", out: "o", chrome: "", theme: "dark", allow: ["2026", "3", "8"], storyboard: false, help: false,
  });
  assert.throws(() => parseArgs(["--theme", "neon"]), UsageError);
  assert.throws(() => parseArgs(["--out"]), /--out 后面要跟一个值/);
  assert.throws(() => parseArgs(["--bogus"]), /不认识的选项/);
});

test("finding Chrome: flag, then CHROME_PATH, then the usual places; a clear error otherwise", () => {
  const has = (...paths) => (p) => paths.includes(p);
  assert.equal(findChrome("/x/chrome", {}, "linux", has("/x/chrome")), "/x/chrome");
  assert.throws(() => findChrome("/nope", {}, "linux", has()), /--chrome 指向的 \/nope 不存在/);
  assert.equal(findChrome("", { CHROME_PATH: "/c" }, "linux", has("/c")), "/c");
  assert.equal(findChrome("", { PATH: "/usr/bin:/opt/bin" }, "linux", has("/opt/bin/chromium")), "/opt/bin/chromium");
  assert.equal(findChrome("", {}, "darwin", has("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")), "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  assert.throws(() => findChrome("", { PATH: "/usr/bin" }, "linux", has()), /没有找到 Chrome 或 Chromium[\s\S]*CHROME_PATH/);
});

test("local pictures become data URIs; web addresses and missing files are errors", () => {
  const dir = mkdtempSync(join(tmpdir(), "xhs-test-"));
  try {
    mkdirSync(join(dir, "shots"));
    writeFileSync(join(dir, "shots", "a b.png"), PNG_1x1);
    const ok = inlineImages("![图](shots/a%20b.png)\n说明", dir, "第 2 张");
    assert.deepEqual(ok.errors, []);
    assert.match(ok.text, /^!\[图\]\(data:image\/png;base64,iVBOR/);
    const bad = inlineImages("![](https://x.com/a.png) ![](missing.png) ![](a.bmp)", dir, "第 3 张");
    assert.equal(bad.errors.length, 3);
    assert.match(bad.errors[0], /是网址/);
    assert.match(bad.errors[1], /missing\.png 找不到/);
    assert.match(bad.errors[2], /格式不支持/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the page template keeps `$` in the code and can't be closed by the copy", () => {
  const html = fillTemplate({ title: "</script><script>alert(1)</script>", cards: [] });
  assert.ok(!html.includes("/*CARDS_JS*/") && !html.includes("/*CARDS_CSS*/") && !html.includes("/*DECK_JSON*/"));
  assert.ok(html.includes("\\u003c/script>"));
  assert.ok(html.includes("replace(/(\\d)[,，](?=\\d{3}(?!\\d))/g, \"$1\")"), "replacement patterns in cards.js survive");
});

test("PNG size and the overview sheet", () => {
  assert.deepEqual(pngSize(PNG_1x1), { width: 1, height: 1 });
  assert.throws(() => pngSize(Buffer.from("nope")), /不是 PNG/);
  const html = overviewHtml({ title: "<t>", pages: [{ src: "a", label: "01 · 封面" }], covers: [{ src: "b", label: "A" }, { src: "c", label: "B" }] });
  assert.match(html, /&lt;t&gt; · 1 张/);
  assert.match(html, /封面备选/);
});

let chrome = "";
try { chrome = findChrome(); } catch { /* no Chrome on this machine: the end-to-end tests skip */ }

function render(cwd, ...args) {
  const r = spawnSync(process.execPath, [join(cwd, "scripts/render.mjs"), ...args], { encoding: "utf8", timeout: 180_000, env: { ...process.env, ...(chrome ? { CHROME_PATH: chrome } : {}) } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

test("end to end: a clean copy of the skill renders the example", { skip: !chrome && "Chrome / Chromium not found" }, () => {
  const tmp = mkdtempSync(join(tmpdir(), "xhs-e2e-"));
  try {
    const copy = join(tmp, "xhs-storyboard");
    cpSync(SKILL, copy, { recursive: true, filter: (p) => !p.includes(`${join("examples", "intro", "out")}`) });
    const out = join(tmp, "out");
    const r = render(copy, join(copy, "examples/intro/cards.json"), "--out", out);
    assert.equal(r.code, 0, r.out);
    const files = readdirSync(out).sort();
    assert.deepEqual(files, ["01.png", "02.png", "03.png", "04.png", "05.png", "06.png", "07.png", "08.png", "09.png", "check.json", "cover-a.png", "cover-b.png", "overview.png"]);
    for (const f of files.filter((f) => /^(\d\d|cover-.)\.png$/.test(f))) assert.deepEqual(pngSize(readFileSync(join(out, f))), { width: 1080, height: 1440 }, f);
    const check = JSON.parse(readFileSync(join(out, "check.json"), "utf8"));
    assert.equal(check.ok, true);
    assert.ok(check.pages.every((p) => p.overflow === 0));
    assert.deepEqual(check.issues.filter((i) => i.level === "error"), []);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("end to end: a deck with problems is stopped with the reasons and no pictures", { skip: !chrome && "Chrome / Chromium not found" }, () => {
  const tmp = mkdtempSync(join(tmpdir(), "xhs-e2e-"));
  try {
    writeFileSync(join(tmp, "source.md"), "原文只提到 3 个办法。");
    writeFileSync(join(tmp, "cards.json"), JSON.stringify({
      title: "3 个办法", source: "source.md", motives: ["verify"],
      cards: [
        { layout: "cover", text: "3 个办法" },
        { layout: "window", text: "后台在这", figure: { source: "yours", note: "数据后台截图" } },
        { layout: "metric", text: "42｜次｜重试" },
        { layout: "statement", text: "很长的一段话。".repeat(60) },
        { layout: "chart", text: `对比：99 个差别\n以前｜现在\n${"以前要花很多时间一张一张对齐排版｜现在先出分镜表再统一出图\n".repeat(6)}`, figure: { source: "draw", note: "以前和现在" } },
        { layout: "ending", text: "就这样" },
      ],
    }));
    const r = render(SKILL, join(tmp, "cards.json"));
    assert.equal(r.code, 1, r.out);
    for (const want of ["第 2 张缺你的真实截图：数据后台截图", "第 3 张的数字 42 在原文里找不到", "第 4 张文字超出卡片", "第 5 张的数字 99 在原文里找不到", "第 5 张文字超出卡片", "最后一张要用 ending 版式，并用一个问题收尾", "揭晓答案", "没有出图"]) assert.ok(r.out.includes(want), `missing: ${want}\n${r.out}`);
    const out = join(tmp, "out");
    assert.deepEqual(readdirSync(out), ["check.json"]);
    assert.equal(JSON.parse(readFileSync(join(out, "check.json"), "utf8")).ok, false);
    assert.ok(!existsSync(join(out, "01.png")));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
