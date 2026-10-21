---
name: hidevinliu-xhs-storyboard
description: 把文章、笔记、文档做成小红书图文轮播（3:4，1080×1440 PNG）。先出分镜表（每页版式、文字、配图来源、互动动机），确认后写 cards.json，用本机 Chrome 渲染出图，出图前自动检查溢出、缺图、数字出处。Use for 小红书图文 / 小红书轮播 / 图文卡片 / xiaohongshu / RedNote carousel / Instagram-style carousel / storyboard / slides-to-images from an article or notes.
---

# Hidevinliu · 小红书分镜出图

把一份材料做成一组小红书图文。先分镜、再出图；脚本只负责排版和检查，文字由你按下面的规则写。

技能目录记作 `SKILL_DIR`（本文件所在的文件夹）。渲染命令：

```bash
node SKILL_DIR/scripts/render.mjs path/to/cards.json            # 出图到 cards.json 旁边的 out/
node SKILL_DIR/scripts/render.mjs path/to/cards.json --storyboard  # 只把分镜表画成 storyboard.png
```

需要 Node 18+ 和本机 Chrome / Chromium（找不到时按报错用 `--chrome` 或 `CHROME_PATH` 指定）。没有 npm 依赖。

## 工作流程

1. **消化材料**：读用户给的文章或笔记，写下一句「带走点」（读者看完这组图要记住的一句话，≤30 字）。把原文存成 `source.md` 放在 cards.json 旁边，用来核对数字。
2. **出分镜表，停下等确认**：
   - 先选 1–2 个互动动机（见下表），写清读者会怎么参与。
   - 列一张表：页码｜版式｜卡片文字｜配图（`none` / `ready` / `yours`）｜配图说明。
   - 封面写 2–3 个版本，各对应一个动机。
   - 发给用户，**等用户确认或修改后再继续**。用户说「直接出」才跳过这一步。
3. **写 cards.json**：格式见 `references/cards-json.md`，每种版式的写法和字数见 `references/layouts.md`。
4. **渲染**：`node SKILL_DIR/scripts/render.mjs cards.json`。
5. **按报错改，再跑**：脚本打印的每一条「错误」都要改掉（删字、拆页、换版式、补图、改数字），直到退出码为 0。「提醒」逐条看，能改就改。
   - 不要为了过检查去改原文、编数字，也不要用 `--allow-numbers` 放过原文里没有的统计数字（它只给年份、版本号这类不需要出处的数字用）。
6. **交付**：
   - 给出 `out/01.png … NN.png`、封面备选 `cover-a.png / cover-b.png …` 和总览 `overview.png` 的路径，并展示总览图。
   - 列出哪几页用了用户的真实截图、哪几页需要用户补截图。
   - 说明脚本自动调过的配色（终端里「配色」开头的行）。

## 互动动机

| id | 动机 | 封面和结尾怎么写 | 底线 |
|---|---|---|---|
| `correct` | 想纠正你 | 亮出一个明确的判断或方案，结尾问「你会怎么选」 | 只放真实的判断，不故意埋错 |
| `result` | 想看结果 | 封面写做成了什么，正文给过程和成品 | 结果必须来自材料 |
| `fail` | 想看翻车 | 封面写翻在哪，正文写原因和改法 | 翻车必须是材料里真实发生的，不编 |
| `verify` | 想辨真伪 | 封面抛出一个说法，结尾前揭晓 | 必须有一页写明「答案 / 结果 / 实测 / 结论」并给证据 |
| `advise` | 想给你支招 | 讲清卡在哪，结尾请读者出主意 | 卡点要真实 |
| `relate` | 想带入自己 | 写一个读者也会遇到的场景 | 不替读者编经历 |
| `prove` | 想证明自己 | 给一个能自测的小题或清单 | 题目要有标准答案 |

定了动机，最后一张必须是 `ending`，用一个问题收尾（带「？」）。这几条脚本会检查。

## 写卡规则

- 一页只讲一件事。一组 5–9 页，最多 18 页；每页都为那句带走点服务，旁支直接删。
- 版式按「这页讲什么」选，不按好看选，别整组都用同一种。第 1 张用 `cover`，最后一张用 `ending`。
- 字数守 `references/layouts.md` 的上限。超出卡片会报错；脚本会把内容少的结构化卡片自动放大填满。
- **数字只能来自原文**：提供 `source` 时，卡片、标题、副标题、封面上的每个阿拉伯数字都要在原文里出现，否则报错不出图。
- **不画假截图**：`yours` 是只有用户本人能给的真实截图或照片（自己的软件界面、聊天记录、数据后台、实拍）。用户没给，就让页面保持报错，或者换成不需要图的版式；绝不用生成图、示意图、手搓的界面冒充。`window` / `phone` 版式一定要有真图。
- 用平实的说法：
  - 不写「不是……而是……」，不写排比，不用金句结尾，不用「绝了」「封神」这类词；
  - 不用第一人称编造经历，材料里没有的感受和经历不写。
- 外观：`theme` 选 `light`（简约）或 `dark`（极客）；`accent` 给一个主色，整套配色由它推出，文字对比度不足 4.5:1 时脚本会自动调整并打印改了什么。

## 文件

- `references/layouts.md`：15 种版式的用途、写法、上限、示例。
- `references/cards-json.md`：cards.json 字段说明。
- `examples/intro/`：完整示例（source.md、cards.json、out/ 里的成品）。
