# cards.json

一个 JSON 对象。图片路径、`source` 都相对 cards.json 所在的文件夹。

```json
{
  "title": "小红书图文，先分镜再出图",
  "subtitle": "15 种版式，出图前自动检查",
  "author": "署名（可选）",
  "date": "2026.10.21（可选）",
  "theme": "light",
  "accent": "#d6336c",
  "source": "source.md",
  "motives": ["result", "relate"],
  "covers": [
    { "text": "先出分镜，再出图", "motive": "result" },
    { "text": "笔记做成图，先别急着排版", "motive": "relate" }
  ],
  "cards": [
    { "layout": "cover", "text": "先出分镜，再出图", "figure": { "source": "none", "note": "" } },
    { "layout": "window", "text": "![分镜表](shots/storyboard.png)\n分镜表：确认后才出图", "figure": { "source": "ready", "note": "分镜表截图" } },
    { "layout": "ending", "text": "你手上哪篇笔记，最想先做成图？" }
  ]
}
```

## 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `title` | 是 | 这组图的标题。写在每页页眉；没有封面卡、也没有 `covers` 时做封面大字。 |
| `subtitle` | 否 | 封面大字下面的一句话。 |
| `author`、`date` | 否 | 封面底部和每页页脚的署名、日期。 |
| `theme` | 否 | `"light"`（简约，默认）或 `"dark"`（极客）。也可以用 `--theme` 临时换。 |
| `accent` | 否 | 主色，十六进制（`#rgb` 或 `#rrggbb`）。底色、正文、辅助文字、分隔线、代码底色都由它推出（同一色相）；正文、辅助文字、主色在底色上的对比度低于 4.5:1 时会自动调深或调浅，终端里打印「配色 …」说明改了什么。不写就用外观自带的主色。 |
| `source` | 建议 | 原文文件（如 `source.md`）。提供后，卡片、标题、副标题、封面上的每个阿拉伯数字都必须在原文里出现，否则报错不出图；不提供只给一条提醒。 |
| `motives` | 否 | 1–2 个互动动机：`correct` `result` `fail` `verify` `advise` `relate` `prove`（含义见 SKILL.md）。写了就要求最后一张是带问号的 `ending`；含 `verify` 时要有一张写明「答案 / 结果 / 实测 / 结论 / 揭晓」。 |
| `covers` | 否 | 2–3 个封面备选 `{ "text", "motive"? }`。每个单独出一张 `cover-a.png`、`cover-b.png` …；`01.png` 用第一个。 |
| `cards` | 是 | 卡片数组，见下。 |

### cards[i]

| 字段 | 说明 |
|---|---|
| `layout` | 15 种之一：`cover` `statement` `list` `steps` `compare` `window` `phone` `code` `prompt` `chat` `metric` `rightwrong` `timeline` `checklist` `ending`。写法见 `layouts.md`。 |
| `text` | 卡片文字。图片写成 Markdown `![说明](相对路径.png)`，支持 png / jpg / gif / webp / svg；网址图片要先下载到本地。 |
| `figure` | `{ "source": "none" | "ready" | "yours", "note": "要什么图" }`，不写等于 `none`。 |

第 1 张是 `cover` 且不超过 24 字时，它做封面大字（页码 1），后面的卡片从第 2 页排起；否则封面用 `title`，所有卡片从第 2 页排起。写了 `covers` 时，封面大字一律用 `covers[0]`，第 1 张 cover 卡只占位（文字建议和 `covers[0]` 一致）。

## 输出

`out/`（或 `--out` 指定的目录）里：

- `01.png … NN.png`：每页 1080×1440。
- `cover-a.png`、`cover-b.png` …：封面备选（写了 `covers` 才有）。
- `overview.png`：总览，所有页加封面备选。
- `check.json`：`ok`、每页的版式、溢出像素、放大倍数、最终配色和调整记录、全部检查结果。

有错误时只写 `check.json`，不出图，退出码 1。参数或环境问题（找不到文件、找不到 Chrome）退出码 2。

## 命令行

```
node scripts/render.mjs cards.json [--out 目录] [--chrome 路径] [--theme light|dark]
                                   [--allow-numbers 2026,3] [--storyboard]
```

- `--allow-numbers`：这些数字不要求在原文里出现。只给年份、版本号这类不需要出处的数字用，不要拿来放过统计数字。
- `--storyboard`：只把分镜表画成 `storyboard.png`，方便发给别人确认；不检查、不出卡片。
