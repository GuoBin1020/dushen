# 红中麻将 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增第四个游戏「红中麻将」：4 人、红中赖子、吃上家、随意碰、默认只能自摸，单机和联机都能玩，沿用现有牌桌、限时、托管、教练和结算。

**Architecture:**
- 规则、牌局流程、电脑玩家放在新文件 `js/games/hongzhong.js`，教练放在 `js/games/hongzhong-coach.js`，写法仿照斗地主（`js/games/doudizhu.js`）。
- 在引擎和界面里所有 `isD(...)` 分支旁边加 `isM(...)` 分支。联机沿用统一入口 `act(p,type,to)`：客人发 `{t:'act',type,to}`，`act` 按游戏分派到 `hzAct`，所以预计不用改加密联机核心。
- 牌面图片用现有的 `tools/make-assets.mjs` 生成。

**Tech Stack:**
- 纯 HTML/CSS/JS，没有构建步骤，所有 `<script>` 共用全局作用域。
- 测试：Node `vm` 单元测试；`tools/layout-check.mjs` 无头 Chrome 布局检查。

**Spec:** `docs/superpowers/specs/2026-11-01-hongzhong-design.md`（规则以第 3 节和第 10 节为准）

## Global Constraints

**代码规范**
- 每个文件以 `'use strict';` 开头，写法和现有文件一致：紧凑写法，注释用英文，界面文字用中文。
- 不改德州、炸金花、斗地主的规则和电脑出牌逻辑，不改卡密逻辑。
- 加密联机核心 `js/net-online.enc.js` 原则上不改；如果必须改，按 `~/.claude/projects/-Users-stguo-Downloads/memory/dushen-sealed-online.md` 的流程处理。
- 不提交 `.superpowers/` 和私有仓库的任何文件。
- 每次改动要发布的文件时，`sw.js` 的 CACHE 加 1，新文件加进缓存列表和 `index.html`。

**规则**
- 共 112 张：万、条、筒 1–9 各 4 张，加 4 张红中。4 人，每人 13 张，庄家 14 张。
- 出牌逆时针，和斗地主一样，用 `slotOf` 让下家坐在右边。
- 红中是赖子：不能打出（唯一例外是手里只剩红中），不能参与吃、碰、任何杠。4 张红中也不能杠。
- 吃只能吃上家；碰不限；有明杠、暗杠、补杠；杠完从牌堆尾补摸；牌堆空了不能杠。
- 胡：
  - 平胡：4 组加 1 对，任何对子都能做将；
  - 七对：4 张一样的算两对，不能有吃、碰、杠；
  - 四红中：起手摸到，轮到他第一次行动时可以胡，按自摸算。
- 开局选项和默认值：
  - 「允许点炮」：默认不勾；
  - 「手里有红中只能自摸」：默认勾；
  - 「抢杠胡」：默认勾，独立于点炮；
  - 「无红中加倍」：默认不勾；
  - 「抓鸟」：0 / 2 / 4 / 6 张，默认 2；
  - 「底分」：沿用斗地主的选项。
- 胡牌分 = 2 × 翻倍（七对 ×2、无红中 ×2，可以叠加）。鸟分在翻倍之后加，不跟着翻倍。
  - 自摸：其他 3 家每家付「胡牌分 + 中鸟数」；
  - 点炮、抢杠胡：一个人付「(胡牌分 + 中鸟数) × 3」。
  - 中鸟：翻到 1、5、9 或红中。鸟牌从牌堆顶依次翻，不够就有几张翻几张。
- 杠分在杠的当时就结算：明杠由打出那张牌的人付 3 分；暗杠每家付 2 分；补杠每家付 1 分。被抢的补杠不算杠分；暗杠不能被抢。
- 优先级：胡 > 杠、碰 > 吃。多人都能胡时，只算按出牌顺序离打牌人最近的一家。
- 流局：牌堆摸完，胡牌不算分，杠分照算。庄家：谁胡谁坐庄，流局时连庄。
- 「无红中」：胡牌时手里（包括胡的那张）没有任何一张红中。

**素材**
- 麻将牌：FluffyStuff/riichi-mahjong-tiles，CC0，源文件在 `/private/tmp/claude-502/-Users-stguo-Downloads/f4f45863-7e3f-4b44-9637-c1a4f08ebadb/scratchpad/dl/mj/`（Front.svg 是牌面底板，Man/Sou/Pin1–9、Chun 是叠在上面的符号，另有 Back.svg、LICENSE.md）。
- 只用这些文件。牌背加一层花纹。不用 T-STUDIO 的音效。

**速度（用户要求）**
- 迭代时只跑相关场景：`LC_ONLY=<场景> node tools/layout-check.mjs`。
- 提交前完整跑一次布局检查，加上全部 Node 测试。不重复跑。

## Review Focus

1. **手里有红中、勾了「只能自摸」时，别人点炮和抢杠都不能胡**：不能弹出「胡」按钮。由 Task 3 的 `hz-claim-red` 用例覆盖。
2. **最后几张牌时杠**：牌堆剩 0 张时不能杠；剩 1 张时杠完补摸、然后流局，牌局不卡死。由 Task 3 的 `hz-last-tile` 用例覆盖。
3. **四家都过、或者有人掉线时的询问**：所有可吃碰杠胡的人都选了，或者超时（超时算过，但能胡时自动胡）之后，牌局继续往下走。由 Task 3 的 `hz-claim-timeout` 用例覆盖。
4. **客人视角不泄露**：`viewFor(客人)` 里只能看到别人手牌的张数，看不到牌堆，也看不到别人的牌面。由 Task 3 的 `hz-view` 用例覆盖。
5. **竖屏 14 张手牌加 4 组副露也放得下**：不出现横向滚动，按钮不遮挡。由 Task 5 的 `hz-hand-full` 布局场景覆盖。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `js/games/hongzhong.js`（新建） | 牌、胡牌判断、向听数、吃碰杠合法性、算分、牌局流程、电脑玩家、`hzPublic`、界面绘制 |
| `js/games/hongzhong-coach.js`（新建） | 教练建议、听牌提示、记牌器 |
| `tools/hz-test.js`（新建） | 规则、算分、流程、200 局模拟、视角测试 |
| `tools/make-assets.mjs`、`js/assets.js`、`assets/mj/*.webp`、`assets/CREDITS.txt` | 麻将牌素材 |
| `js/engine.js`、`js/ui.js`、`js/games/holdem.js`（`act` 分派）、`index.html`、`css/app.css`、`sw.js`、`README.md` | 接入 |
| `tools/layout-check.mjs` | 新增麻将场景 |

## 编码约定（各任务共用）

- **牌编码**：0–107 是普通牌，`id>>2` 得到 0–26 的种类：0–8 万一到九、9–17 条、18–26 筒；108–111 是红中。
- 其他常量和函数：
  - `HZ_RED=27`（红中的种类号）；
  - `hzKind(id)`：返回 0–27 的种类号；
  - `hzName(kind)`：返回中文名，例如「三万」「七条」「红中」。

---

### Task 1: 麻将牌素材

**Files:**
- Modify: `tools/make-assets.mjs`、`js/assets.js`、`assets/CREDITS.txt`、`tools/assets-test.js`、`sw.js`、`README.md`
- Create: `assets/mj/*.webp`

**Interfaces:**
- Produces（`js/assets.js`）：
  - `mjFile(kind:0..27) -> string`：例如 `'mj/m1.webp'`、`'mj/s9.webp'`、`'mj/p5.webp'`、`'mj/hz.webp'`；
  - `MJ_BACK='mj/back.webp'`。

- [ ] **Step 1: 失败测试**

  在 `tools/assets-test.js` 加断言：
  - 28 个 `mjFile(k)` 加上 `MJ_BACK` 都存在，并且每个都大于 1KB；
  - `mjFile(27)==='mj/hz.webp'`；
  - `CREDITS.txt` 里包含 `riichi-mahjong-tiles` 和 `CC0`；
  - `assets/` 总大小不超过 1.9MB。

- [ ] **Step 2: 运行确认失败**

  Run: `node tools/assets-test.js`
  Expected: FAIL

- [ ] **Step 3: 实现**

  - 在 `make-assets.mjs` 里把 Front.svg 和符号叠在一起，用无头 Chrome 渲染成 WebP：宽 120px，质量 82，透明背景。
  - 牌背：Back.svg 叠一层和扑克牌背风格接近的细斜纹。
  - `mjFile` 放在 `js/assets.js`。
  - `CREDITS.txt` 写上作者、仓库地址、CC0，以及本项目做的改动（叠加渲染、牌背花纹）。

- [ ] **Step 4: 生成并测试**

  Run: `node tools/make-assets.mjs /private/tmp/claude-502/-Users-stguo-Downloads/f4f45863-7e3f-4b44-9637-c1a4f08ebadb/scratchpad assets && node tools/assets-test.js`
  Expected: 0 failed

  再打开几张牌看一眼：一万、九条、五筒、红中、牌背。

- [ ] **Step 5: 提交**

  提交信息：`feat: 红中麻将牌面素材`

### Task 2: 规则核心（胡牌、向听数、吃碰杠合法性）

**Files:**
- Create: `js/games/hongzhong.js`（这个任务只写纯规则部分）、`tools/hz-test.js`

**Interfaces:**
- Produces：
  - `isM(st) -> boolean`：`st.cfg.game==='hz'`。
  - `hzKind(id)`、`hzName(kind)`、`hzDeck() -> number[]`（112 张，已洗牌）、`hzSort(ids) -> ids`。
  - `hzWin(hand:id[], melds:Meld[]) -> null | {type:'ping'|'qidui'|'sihz', red:number}`：
    - `hand` 包含胡的那张；
    - `red` 是手里红中的张数；
    - `Meld` 是 `{t:'chi'|'peng'|'mgang'|'agang'|'bgang', ids:number[], from:pid|null}`。
  - `hzShanten(hand, melds) -> number`：已经胡了返回 -1，听牌返回 0。
  - `hzWaits(hand13, melds) -> kind[]`：能胡哪些种类。
  - `hzChiOpts(hand, tile) -> id[][]`：可以吃的组合，不使用红中。
  - `hzCanPeng(hand, tile)`、`hzCanMGang(hand, tile)`、`hzAGangKinds(hand)`、`hzBGangKinds(hand, melds) -> kind[]`：都不算红中，红中本身也不能杠。

- [ ] **Step 1: 写失败测试 `tools/hz-test.js`**

  写法仿照 `tools/ddz-test.js`：用 vm 加载 `js/common.js` 和 `js/games/hongzhong.js`；用一个辅助函数 `H('1m 2m 3m … hz')` 把字符串转成牌的 id。断言如下：
  - **平胡**：
    - `hzWin(H('1m2m3m 4m5m6m 7s8s9s 2p2p2p 5p5p'),[]).type==='ping'`；
    - 不是 2、5、8 的对子也能做将：`H('… 9p9p')` 也是 `ping`。
  - **红中当赖子**：`H('1m2m hz 4s5s6s 7p7p7p 1s1s1s 3m3m')` 是 `ping`。
  - **七对**：
    - `H('1m1m 2m2m 3s3s 4s4s 5p5p 6p6p 7p7p')` 是 `qidui`；
    - 4 张一样算两对：`H('1m1m1m1m 2m2m …')` 是 `qidui`；
    - 红中补对：`H('1m hz …')` 是 `qidui`；
    - 有副露时不能算七对。
  - **四红中**：手里 4 张红中加任意 10 张，结果是 `sihz`；四红中同时又是七对时，取分高的那种。
  - **不能胡**：`H('1m2m4m …')` 返回 `null`。
  - **向听数**：听牌的手牌返回 0；`hzWaits` 返回正确的种类，比如两面听 4m7m 返回 `[3,6]`。
  - **吃碰杠合法性**：
    - `hzChiOpts` 不使用红中；没有能吃的组合时返回 `[]`；
    - 手里有 2 张红中、打出的是红中时，`hzCanPeng` 为 `false`；
    - 3 张五万加 1 张红中，`hzAGangKinds` 里没有五万；
    - 4 张红中，`hzAGangKinds` 里没有红中。

  最后打印 `hz: N passed, M failed`，有失败时退出码为 1。

- [ ] **Step 2: 运行确认失败**

  Run: `node tools/hz-test.js`
  Expected: FAIL（`hzWin` 未定义）

- [ ] **Step 3: 实现**

  - 胡牌判断：把手牌按种类计数，回溯拆成顺子、刻子和一对，红中可以补任意缺口；七对另外判断。
  - 向听数：用同样的计数做回溯搜索，种类最多 28 种，手牌最多 14 张，性能足够。

- [ ] **Step 4: 运行确认通过**

  Run: `node tools/hz-test.js`
  Expected: 0 failed

- [ ] **Step 5: 提交**

  提交信息：`feat: 红中麻将胡牌判断、向听数、吃碰杠规则`

### Task 3: 牌局流程、算分、电脑玩家

**Files:**
- Modify: `js/games/hongzhong.js`、`js/engine.js`、`js/games/holdem.js`（在 `act` 开头加 `if(isM(S))return hzAct(p,type,to);`）、`tools/hz-test.js`

**Interfaces:**
- Consumes：Task 2 的全部函数。
- Produces：
  - 状态 `S.hz={wall:id[], dealer, turn, drawn, discards:{pid:id[]}, melds:{pid:Meld[]}, claim:null|{tile,from,opts:{pid:string[]},answers:{}}, birds:id[], over}`。
  - `hzDeal(live)`：发牌。`startHand` 在 `isM(S)` 时调用它；需要 4 个人，不够时进入 `waiting`，提示文案「红中麻将需要 4 个人」。
  - `hzAct(p, type, arg)`，`type` 可以是：
    - `'discard'`，`arg` 是牌的 id；
    - `'hu'`；
    - `'agang'` / `'bgang'`，`arg` 是种类；
    - `'chi'`，`arg` 是 id 数组；
    - `'peng'`、`'mgang'`、`'pass'`。
  - `hzPayout({win, from, kind, birds, base, stacks}) -> {pid: delta}`：只算胡牌分和鸟分。杠分在杠的当时用 `hzGangPay` 结算。
  - `hzPublic(hz, seat)`：给每个座位的视角数据。别人的手牌只给张数，不给牌堆，只给牌堆剩余张数；由 `viewFor` 里的 `hz:` 字段带出去。
  - `hzAutoMove(p, coach)`：接进 `autoMove`。
  - `hzBotTurn(p)`。

- [ ] **Step 1: 失败测试（加进 `tools/hz-test.js`）**

  - **算分**：底分 1 时：
    - 自摸平胡中 2 只鸟：三家各付 4 分；
    - 点炮七对中 1 只鸟：点炮人一个人付 (4+1)×3 = 15 分；
    - 七对加无红中：胡牌分 8 分；
    - 抢杠胡：被抢的人付 (2+鸟)×3，被抢的那次补杠不算杠分；
    - 明杠：打出那张牌的人付 3 分；暗杠：每家付 2 分；补杠：每家付 1 分；
    - 流局：只有杠分；
    - 每一局结束后，所有人积分变化的总和为 0。
  - **优先级**（`hz-claim`）：同一张牌有人能胡、有人能碰时，胡优先；两家都能胡时，离打牌人最近的那家胡；碰和吃同时有人要时，碰优先。
  - **`hz-claim-red`**：勾选「只能自摸」时，手里有红中的人既不出现点炮的胡，也不能抢杠胡；不勾「允许点炮」但勾了「抢杠胡」时，可以抢杠。
  - **`hz-last-tile`**：牌堆剩 0 张时不能杠；剩 1 张时可以杠，补摸后流局。
  - **`hz-claim-timeout`**：询问超时算过；能胡的人超时，自动胡。
  - **`hz-view`**：`viewFor(1)` 里看不到座位 0 的手牌牌面，没有 `wall` 数组，有 `wallLeft`。
  - **庄家**：谁胡谁坐庄；流局时连庄。
  - **四红中**：庄家起手可以宣布胡。
  - **只剩红中**：允许打出红中，牌局不卡住。
  - **模拟**：4 个电脑玩家自动打 200 局，过程中不抛异常，每局都能结束（胡牌或流局），每局积分总和为 0。

- [ ] **Step 2: 运行确认失败**

  Run: `node tools/hz-test.js`
  Expected: FAIL

- [ ] **Step 3: 实现**

  - 流程、询问、优先级、抢杠、流局、庄家轮换，照上面的接口实现。
  - 在 `engine.js` 所有 `isD(S)` 的地方加上对应的 `isM(S)` 分支：发牌、`autoMove`、离座处理。麻将和斗地主一样必须满员，离桌的人由电脑托管、不离座。
  - 电脑玩家：
    - 打出让向听数最小的那张，打法相同时优先打孤张和边张，红中留着；
    - 能胡就胡；
    - 吃、碰、杠只在能让向听数更小时才要；
    - 思考时间沿用 `delay()`。
  - 出牌限时沿用 `turnTimer`。询问阶段的超时，也用同一个限时。

- [ ] **Step 4: 运行确认通过**

  Run: `node tools/hz-test.js && node tools/turn-test.js && node tools/ddz-test.js`
  Expected: 全部 0 failed

- [ ] **Step 5: 提交**

  提交信息：`feat: 红中麻将牌局流程、算分和电脑玩家`

### Task 4: 开局设置和规则说明

**Files:**
- Modify: `index.html`（`#f-game` 加「红中麻将」按钮 `data-game="hz"`；新增麻将选项行，设 `data-games="hz"`）、`js/ui.js`（`readCfg`、`normalizeCfg`、人数固定为 4、规则面板）、`sw.js`、`index.html`（引入 `js/games/hongzhong.js`）

**Interfaces:**
- Produces：`cfg` 新增字段：
  - `hzDianpao:boolean`（默认 false）
  - `hzRedSelf:boolean`（默认 true）
  - `hzQiangGang:boolean`（默认 true）
  - `hzNoRed:boolean`（默认 false）
  - `hzBirds:0|2|4|6`（默认 2）
  - `base`：沿用斗地主的底分

- [ ] **Step 1: 失败的布局场景**

  在 `tools/layout-check.mjs` 加 `hz-setup`：
  - 选中「红中麻将」后显示麻将选项，人数固定为 4；
  - 点「开始」能进入牌桌，并且 `V.cfg.game==='hz'`；
  - 选项默认值和 Global Constraints 一致。

- [ ] **Step 2: 运行确认失败**

  Run: `LC_ONLY=hz-setup node tools/layout-check.mjs`
  Expected: FAIL

- [ ] **Step 3: 实现**

  - 开局表单和配置读取。
  - 规则面板：写清 3.1–3.7 和第 10 节里玩家需要知道的部分。

- [ ] **Step 4: 运行确认通过，并提交**

  Run: `LC_ONLY=hz-setup node tools/layout-check.mjs && node tools/hz-test.js`

  提交信息：`feat: 红中麻将开局设置和规则说明`

### Task 5: 牌桌界面和操作

**Files:**
- Modify: `js/games/hongzhong.js`（新增 `hzRenderTable()`、`hzRenderActions(el,m)`、`hzTileHTML(id,o)`）、`js/ui.js`（在 `renderTable`、`renderActions`、`seatTag`、`renderMeta` 加 `isM` 分支；手牌的点击事件）、`css/app.css`、`js/table-layout.js`（如果需要，加 4 人麻将的打牌区 `hzDiscardXY(slot,o)`）、`tools/layout-check.mjs`、`sw.js`

**Interfaces:**
- Consumes：Task 3 的 `V.hz`（即 `hzPublic` 的内容）和 `hzAct` 的各种 `type`。
- Produces：
  - 我的手牌在 `#hz-hand`，按万、条、筒、红中排序；摸到的牌单独放在最右；红中有「赖」标记。
  - 点一张牌选中，再点一次就打出。
  - 按钮的 `data-act` 用 `hzdiscard`、`hzhu`、`hzchi`（`data-i` 指定第几种吃法）、`hzpeng`、`hzgang`、`hzpass`，客人通过 `humanAct` 发给房主。

- [ ] **Step 1: 失败的布局场景**

  在 `tools/layout-check.mjs` 加以下场景，尺寸用 9 种全尺寸：
  - `hz-4`：4 个座位都可见，下家在右边，各家打出的牌都在桌面上，不遮挡座位、按钮和手牌。
  - `hz-hand-full`：手里 14 张加 4 组副露，一行放得下，每张牌露出至少 20px，页面不横向滚动。
  - `hz-claim`：弹出吃、碰、杠、胡、过的面板时，面板在屏幕内，点「过」之后面板消失。
  - `hz-turn`：自己的回合显示倒计时圆环，并且出现「出牌」提示。

- [ ] **Step 2: 运行确认失败**

  Run: `LC_ONLY=hz-4 node tools/layout-check.mjs`
  Expected: FAIL

- [ ] **Step 3: 实现**

  - 摆放规则：
    - 各家打出的牌放在座位面前的桌面上，每行 6 张，跟着 `--tilt` 倾斜，最新一张高亮；
    - 副露亮在座位旁边，暗杠显示 2 张背面加 2 张正面；
    - 桌子中间显示「剩 N 张」和庄家标记。
  - 竖屏第一次打开时提示「横屏体验更好」，复用 `ddLandTip` 的做法。
  - 音效映射：摸牌用 `SFX.flip`，打牌用 `SFX.chips(1)`，吃碰杠用 `SFX.check`，胡牌用 `SFX.win`。
  - 报牌：用 `say('碰'|'杠'|'吃'|'胡了'|'自摸', gender)`。

- [ ] **Step 4: 运行确认通过，并提交**

  Run: `for s in hz-4 hz-hand-full hz-claim hz-turn; do LC_ONLY=$s node tools/layout-check.mjs; done`

  提交信息：`feat: 红中麻将牌桌和操作`

### Task 6: 教练、记牌器、托管

**Files:**
- Create: `js/games/hongzhong-coach.js`
- Modify: `index.html`、`js/ui.js`（教练面板和记牌器开关的 `isM` 分支）、`js/games/hongzhong.js`（让 `hzAutoMove` 用上教练）、`tools/hz-test.js`、`tools/layout-check.mjs`、`sw.js`

**Interfaces:**
- Produces：
  - `hzAdvise(v) -> {discard:id, why:string, waits:kind[], left:{kind:n}} | {claim:'hu'|'peng'|'chi'|'gang'|'pass', why}`：只用公开信息，即 `v` 里我自己的手牌，加上所有打出和亮出的牌。
  - `hzCounterHTML(v)`：28 种牌各剩几张没出现过，位置和斗地主的记牌器一样，放在顶部栏下方。

- [ ] **Step 1: 失败测试**

  - `hz-test`：
    - 一手向听数为 1 的牌，教练推荐打出后向听数仍为 1 的那张；
    - 听牌时 `waits` 正确，`left` 扣掉了已经可见的牌；
    - `hzAdvise` 不读取别人的手牌：把别人的牌换成 null，结果不变。
  - 超时自动操作：
    - 勾选「采用教练方案」时，按教练推荐打；
    - 不勾选时，打出刚摸到的牌，摸到的是红中就打最右边的非红中牌；
    - 询问阶段超时算过，能胡就胡。
  - `layout-check` 加 `hz-counter` 场景：记牌器可见，竖屏两行、横屏一行，不遮挡。

- [ ] **Step 2: 运行确认失败**

  Run: `node tools/hz-test.js`
  Expected: FAIL

- [ ] **Step 3: 实现**

  按上面的接口实现，托管遮罩复用 `trustVeil`。

- [ ] **Step 4: 运行确认通过，并提交**

  Run: `node tools/hz-test.js && LC_ONLY=hz-counter node tools/layout-check.mjs`

  提交信息：`feat: 红中麻将教练、记牌器和托管`

### Task 7: 联机、单文件版、完整回归

**Files:**
- Modify: 联机需要调整的地方，例如大厅显示「红中麻将」，人数满 4 人才能开始，电脑补位用 `ddLobbyHumans` 的同类函数；`tools/bundle.py`（如果需要）；`README.md`；`sw.js`

- [ ] **Step 1: 联机检查**

  克隆私有仓库，只读查看 `net-online.js`，确认客人的 `{t:'act'}` 消息会原样交给 `act`，大厅和补位对新游戏也通用。克隆地址用 `https://GuoBin1020@github.com/GuoBin1020/dushen-private.git`，遵守 Global Constraints 里的安全规则，用完删掉克隆。

- [ ] **Step 2: 两个标签页实测**

  用无头 Chrome 开两个标签页，一个建房、一个加入，选红中麻将，电脑补满 4 人，打完一局：两边都能操作，控制台没有报错。

  然后在私有仓库里运行 `online-test.js`，期望 76 项全部通过。

- [ ] **Step 3: 完整回归**

  每样只跑一次：

  Run: `node tools/hz-test.js && node tools/ddz-test.js && node tools/card-test.js && node tools/assets-test.js && node tools/sfx-test.js && node tools/layout-test.js && node tools/turn-test.js && node tools/zjh-view-test.js && node tools/layout-check.mjs 2>&1 >/dev/null | tail -3 && node tools/voice-check.mjs && node tools/bundle-test.mjs`
  Expected: 全部通过

- [ ] **Step 4: 提交**

  提交信息：`feat: 红中麻将联机和单文件版`

  确认私有仓库的克隆已经删除。
