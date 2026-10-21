#!/usr/bin/env node
// xhs-storyboard renderer · MIT © 2026 Devin Liu
//
//   node scripts/render.mjs path/to/cards.json [--out dir] [--chrome path] [--theme light|dark]
//                                              [--allow-numbers 2026,3] [--storyboard]
//
// Zero npm dependencies. Drives the local Chrome / Chromium in headless mode over the DevTools protocol on a pipe
// (--remote-debugging-pipe): one browser launch for the whole set, no network port, works on Node 18+.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { delimiter, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CARD_HEIGHT, CARD_WIDTH, IMAGE, THEMES, checkDeck, coverLetter, derivePalette, escapeHtml, layoutName, motiveName,
  normalizeDeck, parseAllow, storyboardHtml, storyboardRows,
} from "../assets/cards.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const USAGE = `用法：node scripts/render.mjs path/to/cards.json [选项]

  --out <目录>            输出目录，默认 cards.json 旁边的 out/
  --chrome <路径>         Chrome / Chromium 可执行文件（也可以设环境变量 CHROME_PATH）
  --theme light|dark      临时换外观，不改 cards.json
  --allow-numbers 2026,3  这些数字不要求在原文里出现（年份、版本号之类）
  --storyboard            只把分镜表画成 storyboard.png，不出卡片
`;

export class UsageError extends Error {}

export function parseArgs(argv) {
  const out = { cards: "", out: "", chrome: "", theme: "", allow: [], storyboard: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new UsageError(`${a} 后面要跟一个值`);
      return v;
    };
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--out") out.out = value();
    else if (a === "--chrome") out.chrome = value();
    else if (a === "--theme") out.theme = value();
    else if (a === "--allow-numbers") out.allow.push(...parseAllow(value()));
    else if (a === "--storyboard") out.storyboard = true;
    else if (a.startsWith("--")) throw new UsageError(`不认识的选项 ${a}`);
    else if (!out.cards) out.cards = a;
    else throw new UsageError(`多了一个参数 ${a}：一次只渲染一个 cards.json`);
  }
  if (out.theme && !(out.theme in THEMES)) throw new UsageError(`--theme 只能是 light 或 dark`);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Finding Chrome

export function chromeCandidates(env = process.env, platform = process.platform) {
  const list = [];
  if (platform === "darwin") {
    for (const base of ["/Applications", join(homedir(), "Applications")]) {
      list.push(`${base}/Google Chrome.app/Contents/MacOS/Google Chrome`, `${base}/Chromium.app/Contents/MacOS/Chromium`,
        `${base}/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary`, `${base}/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`);
    }
  } else if (platform === "win32") {
    for (const base of [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(Boolean)) {
      list.push(join(base, "Google/Chrome/Application/chrome.exe"), join(base, "Chromium/Application/chrome.exe"), join(base, "Microsoft/Edge/Application/msedge.exe"));
    }
  } else {
    for (const dir of (env.PATH ?? "").split(delimiter).filter(Boolean)) {
      for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"]) list.push(join(dir, name));
    }
  }
  return list;
}

/** --chrome, then CHROME_PATH, then the usual install places. Throws with what to do when nothing is found. */
export function findChrome(flag = "", env = process.env, platform = process.platform, exists = existsSync) {
  for (const [name, p] of [["--chrome", flag], ["CHROME_PATH", env.CHROME_PATH]]) {
    if (!p) continue;
    if (exists(p)) return p;
    throw new UsageError(`${name} 指向的 ${p} 不存在。改成 Chrome 可执行文件的完整路径，例如 macOS 上是 "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`);
  }
  const found = chromeCandidates(env, platform).find((p) => exists(p));
  if (found) return found;
  throw new UsageError("没有找到 Chrome 或 Chromium。装一个 Chrome（https://www.google.com/chrome/），或用 --chrome <路径> / 环境变量 CHROME_PATH 指定可执行文件，例如 Linux 上 --chrome /usr/bin/chromium");
}

// ---------------------------------------------------------------------------------------------------------------
// Chrome over the DevTools protocol on a pipe (messages are JSON separated by NUL bytes)

class Cdp {
  constructor(proc) {
    this.proc = proc;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Set();
    this.exceptions = [];
    let parts = [];
    proc.stdio[4].on("data", (chunk) => {
      let from = 0;
      let end;
      while ((end = chunk.indexOf(0, from)) !== -1) {
        parts.push(chunk.subarray(from, end));
        this.dispatch(Buffer.concat(parts).toString("utf8"));
        parts = [];
        from = end + 1;
      }
      parts.push(chunk.subarray(from));
    });
    proc.on("exit", (code) => {
      for (const { reject } of this.pending.values()) reject(new Error(`Chrome 意外退出（退出码 ${code}）`));
      this.pending.clear();
    });
  }

  dispatch(text) {
    let msg;
    try { msg = JSON.parse(text); } catch (err) { console.error(`[render] Chrome 发来一条读不懂的消息，已忽略：${err.message}`); return; }
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve: ok, reject, method, timer } = this.pending.get(msg.id);
      clearTimeout(timer);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(`${method}：${msg.error.message}`));
      else ok(msg.result);
      return;
    }
    if (msg.method === "Runtime.exceptionThrown") this.exceptions.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text ?? "未知错误");
    for (const l of this.listeners) l(msg);
  }

  send(method, params = {}, sessionId, timeout = 60_000) {
    const id = ++this.id;
    return new Promise((ok, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} 等了 ${timeout / 1000} 秒没有回应`)); }, timeout);
      this.pending.set(id, { resolve: ok, reject, method, timer });
      this.proc.stdio[3].write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
    });
  }

  waitFor(method, sessionId, timeout = 60_000) {
    return new Promise((ok, reject) => {
      const timer = setTimeout(() => { this.listeners.delete(l); reject(new Error(`等 ${method} 超时`)); }, timeout);
      const l = (msg) => { if (msg.method === method && msg.sessionId === sessionId) { clearTimeout(timer); this.listeners.delete(l); ok(msg.params); } };
      this.listeners.add(l);
    });
  }
}

async function launch(chromePath) {
  const profile = mkdtempSync(join(tmpdir(), "xhs-storyboard-chrome-"));
  const proc = spawn(chromePath, [
    "--headless=new", "--remote-debugging-pipe", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--disable-background-networking", "--disable-sync", "--mute-audio", "--hide-scrollbars",
    "--force-device-scale-factor=1", "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d) => { stderr = (stderr + d).slice(-4000); });
  await new Promise((ok, reject) => {
    proc.once("spawn", ok);
    proc.once("error", (err) => reject(new Error(`启动 Chrome 失败（${chromePath}）：${err.message}`)));
  });
  const cdp = new Cdp(proc);
  try {
    await cdp.send("Browser.getVersion", {}, undefined, 30_000);
  } catch (err) {
    proc.kill("SIGKILL");
    throw new Error(`Chrome 没有响应：${err.message}\n${stderr.trim()}`);
  }
  const close = async () => {
    await cdp.send("Browser.close", {}, undefined, 5_000).catch(() => proc.kill("SIGKILL"));
    await new Promise((ok) => (proc.exitCode !== null ? ok() : proc.once("exit", ok)));
    for (let i = 0; i < 5; i++) {
      try { rmSync(profile, { recursive: true, force: true }); break; } catch { await new Promise((ok) => setTimeout(ok, 200)); }
    }
  };
  return { cdp, close };
}

async function openPage(cdp, width, height) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  const page = {
    async size(w, h) { await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false }, sessionId); },
    async goto(url) {
      const loaded = cdp.waitFor("Page.loadEventFired", sessionId);
      const nav = await cdp.send("Page.navigate", { url }, sessionId);
      if (nav.errorText) throw new Error(`打不开 ${url}：${nav.errorText}`);
      await loaded;
    },
    async evaluate(expression) {
      const r = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId, 120_000);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    async shot(clip) {
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 }, captureBeyondViewport: true }, sessionId, 120_000);
      return Buffer.from(data, "base64");
    },
  };
  await page.size(width, height);
  return page;
}

// ---------------------------------------------------------------------------------------------------------------
// Files

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml" };

/** `![](relative.png)` → a data: URI, resolved against cards.json's folder. Returns the new text and any problems. */
export function inlineImages(text, baseDir, page) {
  const errors = [];
  const out = text.replace(new RegExp(IMAGE.source, "g"), (whole, alt, src) => {
    if (src.startsWith("data:")) return whole;
    if (/^[a-z][a-z0-9+.-]*:/i.test(src)) {
      errors.push(`${page}的图片 ${src} 是网址：先下载到 cards.json 旁边，再写相对路径`);
      return whole;
    }
    const file = resolve(baseDir, decodeURI(src));
    const mime = MIME[extname(file).toLowerCase()];
    if (!mime) { errors.push(`${page}的图片 ${src} 格式不支持，用 png / jpg / gif / webp / svg`); return whole; }
    if (!existsSync(file) || !statSync(file).isFile()) { errors.push(`${page}的图片 ${src} 找不到（找的是 ${file}）`); return whole; }
    return `![${alt}](data:${mime};base64,${readFileSync(file).toString("base64")})`;
  });
  return { text: out, errors };
}

/** Fills assets/render.html with the CSS, the engine and the deck. Function replacers: the code contains `$`. */
export function fillTemplate(deck) {
  const html = readFileSync(join(ROOT, "assets/render.html"), "utf8");
  const js = readFileSync(join(ROOT, "assets/cards.js"), "utf8");
  const css = readFileSync(join(ROOT, "assets/cards.css"), "utf8");
  const json = JSON.stringify(deck).replace(/</g, "\\u003c");
  return html.replace("/*CARDS_CSS*/", () => css).replace("/*DECK_JSON*/", () => json).replace("/*CARDS_JS*/", () => js);
}

/** Width and height from a PNG's IHDR chunk. */
export function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(12) !== 0x49484452) throw new Error("不是 PNG 文件");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const pageFile = (n) => `${String(n).padStart(2, "0")}.png`;
const coverFile = (i) => `cover-${coverLetter(i).toLowerCase()}.png`;

/** The overview sheet: every page small, then the cover candidates in their own row. */
export function overviewHtml({ title, pages, covers }) {
  const cols = pages.length <= 4 ? pages.length : pages.length <= 9 ? 3 : 4;
  const fig = (src, label) => `<figure><img src="${src}" alt=""><figcaption>${escapeHtml(label)}</figcaption></figure>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
body{margin:0;background:#e8e5df;font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif;color:#2a2826}
main{display:inline-block;padding:36px 40px 40px}
h1{margin:0 0 22px;font-size:28px;font-weight:700}
h2{margin:34px 0 16px;font-size:22px;font-weight:700}
.grid{display:grid;grid-template-columns:repeat(${cols},300px);gap:22px}
.covers{grid-template-columns:repeat(${Math.max(1, covers.length)},300px)}
figure{margin:0}
img{display:block;width:300px;height:400px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.12)}
figcaption{margin-top:8px;font-size:17px;color:#5d5a55}
</style></head><body><main><h1>${escapeHtml(title)} · ${pages.length} 张</h1>
<section class="grid">${pages.map((p) => fig(p.src, p.label)).join("")}</section>
${covers.length ? `<h2>封面备选（挑一张换成 01）</h2><section class="grid covers">${covers.map((c) => fig(c.src, c.label)).join("")}</section>` : ""}
</main></body></html>`;
}

// ---------------------------------------------------------------------------------------------------------------

function printIssues(issues, log) {
  for (const i of issues) log(`${i.level === "error" ? "错误" : "提醒"}  ${i.message}`);
}

/** Runs the renderer; returns the exit code (0 ok, 1 the cards need fixing, 2 setup problem). */
export async function run(argv, { log = console.log, env = process.env } = {}) {
  let args;
  try { args = parseArgs(argv); } catch (err) { log(`${err.message}\n\n${USAGE}`); return 2; }
  if (args.help || !args.cards) { log(USAGE); return args.help ? 0 : 2; }
  const cardsPath = resolve(args.cards);
  if (!existsSync(cardsPath)) { log(`找不到 ${cardsPath}`); return 2; }
  const baseDir = dirname(cardsPath);
  const outDir = resolve(args.out || join(baseDir, "out"));

  let raw;
  try { raw = JSON.parse(readFileSync(cardsPath, "utf8")); } catch (err) { log(`错误  cards.json 不是合法的 JSON：${err.message}`); return 1; }
  const { deck, issues: schema } = normalizeDeck(raw);
  if (args.theme) deck.theme = args.theme;
  if (schema.length) { printIssues(schema, log); log(`\n未通过：cards.json 有 ${schema.length} 处要改，改完再运行。`); return 1; }

  let chromePath;
  try { chromePath = findChrome(args.chrome, env); } catch (err) { log(err.message); return 2; }
  mkdirSync(outDir, { recursive: true });

  if (args.storyboard) {
    const { cdp, close } = await launch(chromePath);
    try {
      const page = await openPage(cdp, 1200, 800);
      const file = join(mkdtempSync(join(tmpdir(), "xhs-storyboard-")), "storyboard.html");
      writeFileSync(file, storyboardHtml(deck));
      await page.goto(pathToFileURL(file).href);
      const height = await page.evaluate("Math.ceil(document.documentElement.scrollHeight)");
      writeFileSync(join(outDir, "storyboard.png"), await page.shot({ x: 0, y: 0, width: 1200, height }));
      rmSync(dirname(file), { recursive: true, force: true });
    } finally { await close(); }
    log(`分镜表 → ${join(outDir, "storyboard.png")}`);
    return 0;
  }

  const blocking = [];
  const { cover, body } = storyboardRows(deck.cards);
  for (const row of [...(cover ? [cover] : []), ...body]) {
    const { text, errors } = inlineImages(deck.cards[row.index].text, baseDir, `第 ${row.page} 张`);
    deck.cards[row.index].text = text;
    blocking.push(...errors.map((message) => ({ level: "error", page: row.page, message })));
  }
  let source = null;
  if (deck.source) {
    const file = resolve(baseDir, deck.source);
    if (existsSync(file)) source = readFileSync(file, "utf8");
    else blocking.push({ level: "error", page: null, message: `source 指向的 ${file} 不存在` });
  }

  const palette = derivePalette(deck.theme, deck.accent);
  log(`xhs-storyboard · ${deck.title} · ${THEMES[deck.theme].name}（${deck.theme}）· 主色 ${palette.vars.accent}${deck.motives.length ? ` · 动机 ${deck.motives.map(motiveName).join("、")}` : ""}`);
  for (const a of palette.adjustments) log(`配色  ${a.role} ${a.from} 在底色上对比度 ${a.before}，不到 4.5，已调成 ${a.to}（${a.after}）`);

  const work = mkdtempSync(join(tmpdir(), "xhs-storyboard-"));
  const { cdp, close } = await launch(chromePath);
  let report;
  try {
    const page = await openPage(cdp, CARD_WIDTH, CARD_HEIGHT);
    const htmlFile = join(work, "cards.html");
    writeFileSync(htmlFile, fillTemplate(deck));
    await page.goto(pathToFileURL(htmlFile).href);
    const layout = await page.evaluate("window.__xhs");
    if (!layout) throw new Error(`排版脚本没有跑完：${cdp.exceptions.join("；") || "页面里没有 window.__xhs"}`);
    const overflow = [
      ...layout.pages.filter((p) => p.overflow > 0).map((p) => ({ page: p.page, px: p.overflow })),
      ...layout.covers.filter((c) => c.overflow > 0).map((c) => ({ page: null, label: c.label, px: c.overflow })),
    ];
    const issues = [...blocking, ...checkDeck(deck, { overflow, source, allow: args.allow })];
    const errors = issues.filter((i) => i.level === "error");
    report = {
      ok: errors.length === 0, title: deck.title, theme: deck.theme, motives: deck.motives, palette,
      pages: layout.pages.map((p) => ({ ...p, name: layoutName(p.layout), file: pageFile(p.page) })),
      covers: deck.covers.map((c, i) => ({ text: c.text, motive: c.motive, file: coverFile(i), overflow: layout.covers[i].overflow })),
      issues,
    };
    printIssues(issues, log);
    if (errors.length) {
      writeFileSync(join(outDir, "check.json"), `${JSON.stringify(report, null, 2)}\n`);
      log(`\n未通过：${errors.length} 个错误，没有出图。按上面的提示改 cards.json，再运行一次。`);
      return 1;
    }
    for (const f of readdirSync(outDir)) if (/^(\d{2}|cover-[a-z])\.png$/.test(f) || f === "overview.png") unlinkSync(join(outDir, f));
    const shots = [];
    for (const [i, p] of layout.pages.entries()) {
      const png = await page.shot({ x: 0, y: i * CARD_HEIGHT, width: CARD_WIDTH, height: CARD_HEIGHT });
      writeFileSync(join(outDir, pageFile(p.page)), png);
      shots.push({ src: `data:image/png;base64,${png.toString("base64")}`, label: `${String(p.page).padStart(2, "0")} · ${layoutName(p.layout)}` });
    }
    const coverShots = [];
    for (const [i, c] of deck.covers.entries()) {
      const png = await page.shot({ x: 0, y: (layout.pages.length + i) * CARD_HEIGHT, width: CARD_WIDTH, height: CARD_HEIGHT });
      writeFileSync(join(outDir, coverFile(i)), png);
      coverShots.push({ src: `data:image/png;base64,${png.toString("base64")}`, label: `${coverLetter(i)}${c.motive ? ` · ${motiveName(c.motive)}` : ""}${i === 0 ? " · 已用作 01" : ""}` });
    }
    const overview = join(work, "overview.html");
    writeFileSync(overview, overviewHtml({ title: deck.title, pages: shots, covers: coverShots }));
    await page.size(1400, 900);
    await page.goto(pathToFileURL(overview).href);
    const box = await page.evaluate("(async()=>{await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));const r=document.querySelector('main').getBoundingClientRect();return {width:Math.ceil(r.width),height:Math.ceil(r.height)}})()");
    writeFileSync(join(outDir, "overview.png"), await page.shot({ x: 0, y: 0, width: box.width, height: box.height }));
    writeFileSync(join(outDir, "check.json"), `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await close();
    rmSync(work, { recursive: true, force: true });
  }
  const yours = deck.cards.flatMap((c, i) => (c.figure.source === "yours" ? [i] : []));
  log(`\n完成：${report.pages.length} 张${report.covers.length ? ` + ${report.covers.length} 张封面备选` : ""} + overview.png → ${outDir}`);
  if (yours.length) log(`其中 ${yours.length} 张用了你提供的真实截图，发布前再核对一遍。`);
  return 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  run(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => {
    console.error(`渲染失败：${err.message}`);
    process.exitCode = 2;
  });
}
