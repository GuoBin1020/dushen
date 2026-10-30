# 斗地主 第 4 步：赖子模式 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建斗地主时可以勾选「赖子模式」（默认关闭），单机和联机都支持：
- 发完牌后随机翻出一个赖子点数；
- 赖子和普通牌一起出时，可以当成任意点数；
- 炸弹分软炸、硬炸、纯赖子炸三种，倍数各不相同；
- 一手牌有几种理解方式时，让玩家自己选；
- 桌面上标出每张赖子当成了什么；
- 教练和电脑都会用赖子。

**Architecture:** 规则层新增 `ddReadings(ids, laizi)`，列出一手牌的所有合法理解，每种理解都记下赖子当成了哪些点数。`ddClassify` 在赖子模式下取第一种理解。

一手牌的结果 `cls` 新增两个字段：`bk` 记炸弹的种类，`as` 记赖子当成了什么。出牌时把选定的理解（`as`）一起发给房主，房主重新计算所有理解来核对。

`ddMoves`、`ddSplit`、`ddStrength`、`ddCanBeBeaten`、`ddEvalMoves` 都按赖子点数工作，所以教练和电脑自动会用赖子。不开赖子时，所有函数的行为和现在完全一样。

**Tech Stack:** 普通 `<script>`；Node（`vm`）测试；无界面 Chrome 做界面检查和联机检查。

**Spec:** `docs/superpowers/specs/2026-10-30-doudizhu-design.md`（第 5.6 节，对应第 12 节的第 4 步）

## Global Constraints

- 不开赖子模式时，斗地主的规则、倍数、电脑、教练和界面都和第 3 步完全一样。现有测试必须全部继续通过。
- 德州和炸金花完全不变。
- 赖子规则（设计文档 5.6，用户确认过）：
  - **翻赖子**：只有一个赖子点数。发完牌、开始叫地主之前随机翻出，范围是 3 到 2，不包括王，所有人都能看到。
  - **能当什么**：赖子和普通牌一起出时，可以当成 3 到 2 之间的任意点数，但不能当王。
  - **全是赖子时**：单张、对子、三张、四张全部是赖子时，按赖子本来的点数算，不能变成别的点数。
  - **三种炸弹**：
    - 软炸：用了赖子的四张炸弹，×2；
    - 硬炸：没用赖子的四张炸弹，×4；
    - 纯赖子炸：四张赖子，×4；
    - 王炸仍然 ×2。
  - **炸弹大小**：王炸 > 纯赖子炸 > 任何硬炸 > 任何软炸；同一种炸弹之间比点数。
  - **几种理解**：一手牌有几种理解方式时弹出选项让玩家选，只有一种时直接出。
  - **桌面标记**：出牌后在桌面上标出每张赖子当成了哪个点数。
- 不开赖子模式时，炸弹仍然 ×2。四张同点数的牌照旧是 `bomb`，它的 `bk` 记为 `'hard'`，只用来比较大小，不影响倍数。
- 每个人只收到自己的手牌，赖子点数对所有人公开。

## Review Focus

1. **全是赖子的牌被当成别的点数**：比如赖子是 7，单出一张 7 必须是单张 7，三张 7 必须是三个 7。（测试放在 Task 1）
2. **赖子当成了王**：小王 + 赖子不能当成王炸，赖子 + 大王也不能当成一对。（Task 1）
3. **软炸压硬炸**：软炸不管点数多大，都压不过任何硬炸。（Task 1）
4. **联机时客人选的理解被篡改**：房主必须用自己算出的理解核对客人发来的 `as`；对不上时忽略这一手，并且给这个客人重发状态，免得他卡住。（Task 3）
5. **赖子在手里不显眼**：手牌里的赖子要一眼能认出来；如果因为叠放看不到点数，说明标记做错了。（Task 4）

---

## File Structure

| 文件 | 改动 |
|---|---|
| `js/games/doudizhu.js` | `ddReadings`；`ddClassify`、`ddBeats` 支持赖子和炸弹种类；`ddMoves`、`ddSplit`、`ddStrength` 支持赖子；翻赖子、按理解出牌、赖子模式的倍数；`ddMultText` 分软炸、硬炸、纯赖子炸；桌面和手牌的赖子标记；选择理解的按钮；规则面板的赖子部分 |
| `js/games/doudizhu-coach.js` | `ddCanBeBeaten` 算上没出现的赖子；`ddEvalMoves`、`ddAdvise` 传入赖子点数；`ddRecLabel` 显示赖子当成了什么 |
| `js/engine.js` | `normalizeCfg`：`c.laizi=!!c.laizi`（只对斗地主有意义） |
| `js/net.js` | 斗地主的 `act` 消息接受 `as` 参数并做校验 |
| `js/ui.js` | 设置表单里的赖子开关；`readCfg`、`fillForm` 支持它；大厅说明 |
| `index.html` | 斗地主字段里加 `#f-laizi` 复选框（默认不勾） |
| `css/app.css` | 赖子牌的标记、桌面上「赖→K」的标记、理解选项按钮 |
| `tools/ddz-test.js` | 新增测试 |
| `sw.js`、`README.md` | 缓存版本 `dushen-v10` → `dushen-v11`；README 说明赖子模式 |

开工前：从最新的 `main`（已含第 3 步 #12）拉新分支 `feat/ddz-step4`，把本计划作为第一个提交。

---

### Task 1: 一手牌的所有理解，以及炸弹种类

**Files:**
- Modify: `js/games/doudizhu.js`（规则部分）
- Test: `tools/ddz-test.js`

**Interfaces:**
- Produces:
  - `cls` 新增字段：
    - `bk: 'soft'|'hard'|'pure'`：只有 `type==='bomb'` 时有。
    - `as: Array<{id, rank}>`：赖子当成了什么。没有用赖子当别的点数时为 `[]`。
  - `ddReadings(ids, laizi) -> cls[]`：
    - 列出这手牌所有合法的理解，同一种 `type`、`main`、`len` 只保留一个；
    - 按「王炸 > 炸弹 > 四带二 > 飞机 > 三带 > 顺子 / 连对 > 单、对、三」排序；
    - `laizi<0`，或者这手牌里没有赖子时，结果是 `[ddClassify(ids)]`，不合法时是 `[]`。
    - 实现思路：
      - 不要穷举每张赖子当什么点数；按牌型逐个尝试，算出每个点数还缺几张，用赖子补；
      - 全部是赖子时，只有按本来点数的那一种理解；
      - 赖子不能补王，也不能补出顺子、连对、飞机里超过 A 的点数；
      - 当翅膀的赖子按本来的点数算，不记进 `as`。
  - `ddClassify(ids, laizi=-1)`：`laizi≥0` 时返回 `ddReadings(ids, laizi)[0] || null`；`laizi<0` 时行为不变，只是炸弹多一个 `bk:'hard'`。
  - `ddBeats(cls, prev)`：炸弹按 `pure > hard > soft` 比较，同一种按 `main` 比较；王炸压一切。其他规则不变。

- [ ] **Step 1: 写失败的测试**

测试里设赖子为 7，即 `const LZ=ddRank(C('7')[0])`，`ddRank` 的结果是 4。

```js
const R=(s)=>ddReadings(C(s),LZ).map(c=>c.type+':'+DR[c.main]+(c.bk?':'+c.bk:''));
eq(R('7'),['single:7'],'单出赖子是 7');
eq(R('7 7'),['pair:7']);eq(R('7 7 7'),['triple:7']);eq(R('7 7 7 7'),['bomb:7:pure'],'纯赖子炸');
eq(R('9 7'),['pair:9'],'赖子配 9 成对 9');
ok(R('9 9 9 7').includes('bomb:9:soft'),'软炸');ok(R('9 9 9 7').includes('triple1:9'),'也可以当三带一');
eq(R('9 9 9 7')[0],'bomb:9:soft','炸弹排在三带一前面');
ok(R('3 4 7 6 8').includes('straight:3'),'赖子补顺子里的 5');
ok(R('3 4 5 6 7').includes('straight:3'),'赖子按本来点数也能进顺子');
eq(R('小王 7'),[],'赖子不能当王，凑不出王炸，也不是对子');
eq(R('大王 7'),[],'赖子不能和王组成对子');
eq(R('Q K A 7 7'),['straight:10'],'赖子补 10 和 J，不能补出 2');
eq(ddReadings(C('3 4 5 6 8'),LZ),[],'没有赖子时照常不合法');
eq(ddReadings(C('3 4 5 6 9'),-1),[],'不开赖子');
{const c=ddClassify(C('3 4 7 6 8'),LZ);eq(c.as.map(x=>DR[x.rank]),['5'],'记下赖子当了 5');}
{const c=ddClassify(C('9 9 9 9'),LZ);eq(c.bk,'hard');eq(c.as,[]);}
eq(ddClassify(C('9 9 9 9')).bk,'hard','不开赖子时炸弹也标 hard');
// 炸弹大小
const B=s=>ddClassify(C(s),LZ);
ok(ddBeats(B('3 3 3 3'),B('2 2 2 7')),'硬炸 3 压软炸 2');
ok(!ddBeats(B('2 2 2 7'),B('3 3 3 3')),'软炸压不过任何硬炸');
ok(ddBeats(B('7 7 7 7'),B('2 2 2 2')),'纯赖子炸压硬炸');
ok(ddBeats(B('小王 大王'),B('7 7 7 7')),'王炸最大');
ok(ddBeats(B('K K K 7'),B('Q Q Q 7')),'软炸之间比点数');
// 不开赖子的回归：已有的 Task 1 测试全部保持通过
```

- [ ] **Step 2: 运行，确认失败**

Run: `node tools/ddz-test.js`
Expected: 报错 `ddReadings is not defined`

- [ ] **Step 3: 实现 `ddReadings`，修改 `ddClassify` 和 `ddBeats`**

- [ ] **Step 4: 运行，确认通过**

Run: `node tools/ddz-test.js`
Expected: `… passed, 0 failed`，原有测试也全部通过

- [ ] **Step 5: 提交**

```bash
git add js/games/doudizhu.js tools/ddz-test.js
git commit -m "斗地主赖子：一手牌的所有理解，软炸、硬炸、纯赖子炸"
```

---

### Task 2: 出牌枚举、拆牌、强度和「压不住」都算上赖子

**Files:**
- Modify: `js/games/doudizhu.js`（`ddMoves`、`ddSplit`、`ddStrength`）、`js/games/doudizhu-coach.js`（`ddCanBeBeaten`、`ddEvalMoves`、`ddAdvise`、`ddRecLabel`）
- Test: `tools/ddz-test.js`

**Interfaces:**
- Consumes: `ddReadings`、`ddBeats`（Task 1）
- Produces:
  - `ddMoves(hand, prev, laizi)`：在赖子模式下也列出用赖子凑出来的出法。每一项仍然是牌 id 数组。同一组牌可能有几种理解，这里每组牌只列一次；具体怎么理解，交给 `ddPlayReading` 决定。
  - `ddPlayReading(cards, prev, laizi) -> cls | null`：这组牌能压过 `prev` 的理解里排第一的那一种。电脑和教练出牌时用它决定 `as`。
  - `ddSplit(hand, laizi)`：先把赖子按本来的点数拆一次；再逐张尝试把赖子当成别的点数，每次保留手数最少的方案（贪心，最多 4 张 × 13 种点数）。返回的 `groups` 里每组都能用 `ddReadings` 理解。
  - `ddStrength(hand, laizi)`：每张赖子加 1.5 分，其他规则不变。
  - `ddCanBeBeaten(cls, unseen, laizi)`：没出现的赖子可以补任何点数（不能补王）。另外：
    - 凑硬炸要某个点数 4 张都没出现；
    - 凑软炸只要「这个点数没出现的张数 + 没出现的赖子数 ≥ 4」；
    - 比较大小时按 `pure > hard > soft`。
  - `ddEvalMoves(info)`：`info` 新增 `laizi` 字段，原样传给上面这些函数。返回的每一项新增 `cls`，即用 `ddPlayReading` 选出的理解。
  - `ddAdvise(v)`：从 `v.dd.laizi` 取赖子点数（没有时是 -1）。
  - `ddRecLabel(rec)`：`rec.as` 不为空时，牌面里把赖子写成「赖→点数」，并且所有牌按当成的点数从小到大排，例如「顺子（3 4 赖→5 6 8）」。

- [ ] **Step 1: 写失败的测试**

```js
const LZ=ddRank(C('7')[0]);
ok(ddMoves(C('3 4 6 8 7 K'),null,LZ).some(m=>ddPlayReading(m,null,LZ).type==='straight'),'用赖子凑出顺子');
ok(ddMoves(C('9 9 9 7 3'),ddClassify(C('2'),LZ),LZ).some(m=>ddPlayReading(m,ddClassify(C('2'),LZ),LZ).bk==='soft'),'用赖子凑软炸压 2');
eq(ddSplit(C('3 4 6 8 7'),LZ).hands,1,'赖子补成顺子，一手出完');
ok(ddStrength(C('7 7 3 4'),LZ)>ddStrength(C('7 7 3 4'),-1),'赖子加分');
{const u=new Array(15).fill(0);u[9]=3;u[LZ]=1;ok(ddCanBeBeaten(ddClassify(C('5'),LZ),u,LZ),'三张 Q 加一张没出的赖子能凑软炸');}
{const u=new Array(15).fill(0);u[9]=3;ok(!ddCanBeBeaten(ddClassify(C('2 2 2 2'),LZ),u,LZ),'硬炸 2 不怕软炸');}
// 电脑和教练在赖子模式下出的牌都合法
for(let i=0;i<300;i++){const lz=Math.floor(Math.random()*13),h=ddDeck().slice(0,17),pr=ddMoves(ddDeck().slice(0,17),null,lz)[0],pc=ddPlayReading(pr,null,lz);
  const p=ddBotPlay({hand:h,prev:{cls:pc,pid:0},me:1,landlord:0,counts:{0:10,1:17,2:10},arch:DD_ARCH.safe,out:[],laizi:lz});
  if(p&&!ddPlayReading(p,pc,lz)){ok(false,'赖子模式电脑跟牌不合法 '+JSON.stringify([lz,h,pr,p]));break}}
ok(true);
eq(ddRecLabel({type:'play',cards:C('3 4 7 6 8'),as:[{id:C('7')[0],rank:2}]}),'顺子（3 4 赖→5 6 8）');
// 不开赖子的回归：已有的 ddMoves / ddSplit / ddEvalMoves 测试全部保持通过
```

- [ ] **Step 2: 运行，确认失败**

Run: `node tools/ddz-test.js`
Expected: 新增测试失败

- [ ] **Step 3: 实现**

`ddMoves` 在赖子模式下的做法：对每种目标牌型和主牌点数，算出每个点数缺几张，先用自然牌，不够的用赖子补；翅膀取最小的多余牌。用 `ddReadings` 过滤，再按原来的规则排序。

- [ ] **Step 4: 运行，确认通过，并测速度**

Run: `node tools/ddz-test.js`
Expected: `… passed, 0 failed`

在临时脚本里，对 300 手随机 20 张牌（赖子模式，手里 0 到 4 张赖子）跑 `ddEvalMoves`。Expected：平均不超过 30ms，最多不超过 200ms。超过就先优化 `ddSplit`。

- [ ] **Step 5: 提交**

```bash
git add js/games/doudizhu.js js/games/doudizhu-coach.js tools/ddz-test.js
git commit -m "斗地主赖子：出牌枚举、拆牌、强度、压不住判断，电脑和教练会用赖子"
```

---

### Task 3: 牌局流程和联机

**Files:**
- Modify: `js/games/doudizhu.js`（`ddShuffleDeal`、`ddAct`、`ddBotTurn`、`ddPublic`、`ddMultText`）、`js/engine.js`（`normalizeCfg`）、`js/net.js`（斗地主的 `act`）
- Test: `tools/ddz-test.js`

**Interfaces:**
- Consumes: Task 1、Task 2
- Produces:
  - `cfg.laizi: boolean`。
  - `S.dd.laizi: number`：赖子模式下发完牌后随机取 0 到 12，重新发牌时重新翻；不开时为 -1。`ddPublic` 原样带出。
  - `ddAct(p, 'play', arg)`：`arg` 可以是 id 数组（等同于 `{cards: arg}`），也可以是 `{cards, as}`。
    - `as` 是 `{type, main, len}`，房主从 `ddReadings(cards, laizi)` 里找一种这三项都相同、并且能压过上家的理解；
    - 没给 `as` 时用 `ddPlayReading`；
    - 找不到能用的理解时，忽略这一手并 `sync()`。
  - `S.dd.lead` 和 `S.dd.shown[pid]` 里的 `cls` 带着 `as`，桌面用它显示「赖→K」。
  - 倍数：
    - 赖子模式下：软炸 ×2、硬炸 ×4、纯赖子炸 ×4；
    - 不开赖子：炸弹照旧 ×2；
    - 王炸在两种模式下都是 ×2。
    - `S.dd` 新增 `soft`、`hard`、`pure` 三个计数，原来的 `bombs` 仍然是三种之和。
  - `ddMultText(d, names)`：
    - 赖子模式下分开写「软炸 1 个 ×2、硬炸 1 个 ×4、纯赖子炸 1 个 ×4」；
    - 不开赖子时和现在一样。
  - `ddBotTurn`：电脑出牌时用 `ddPlayReading` 选理解，以 `{cards, as}` 发给 `ddAct`；`info.laizi` 取 `S.dd.laizi`。
  - 联机：房主收到斗地主 `act` 时，`as` 可以省略；给了就必须是 `{type: 字符串, main: 整数, len: 整数}`，否则忽略这条消息，并给这个客人重发 `state`。
    - 这条规则顺带修好第 3 步留下的小问题：格式错误的出牌也重发状态。

- [ ] **Step 1: 写失败的测试**

在 flow 上下文里：

```js
startGame({game:'ddz',base:20,ddcap:64,stack:2000,speed:'fast',rebuy:true,auto:false,aiFill:true,laizi:true},[{name:'你',kind:'local',gender:'m'}]);
ok(S.dd.laizi>=0&&S.dd.laizi<=12,'翻出赖子');eq(viewFor(0).dd.laizi,S.dd.laizi,'所有人都看得到赖子');
let bad=0,soft=0,hard=0,pure=0;
for(let h=0;h<300;h++){run();if(S.phase!=='handover'){bad++;break}if(!conserved())bad++;soft+=S.dd.soft;hard+=S.dd.hard;pure+=S.dd.pure;startHand()}
eq(bad,0,'赖子模式 300 局都打完，筹码守恒');ok(soft+hard+pure>0,'打出过炸弹');
// 倍数：在 S.dd 上直接调用 ddAct 打出一个软炸和一个硬炸，检查 S.dd.mult 分别 ×2、×4
// 不开赖子：startGame 不带 laizi，S.dd.laizi===-1，打出硬炸只 ×2
// 理解选择：手工构造地主手里有「9 9 9 赖」、上家是单张，用 ddAct(p,'play',{cards,as:{type:'triple1',main:9,len:1}}) 出成三带一；as 写成炸弹时 S.dd.bombs 加 1；as 写成不存在的理解时，牌局不变
```

在 online 上下文里：客人发 `{t:'act',type:'play',to:[...],as:{type:'bomb',main:'x'}}` 时，房主不抛异常，牌局不变，并且这个客人收到一条新的 `state`。

- [ ] **Step 2: 运行，确认失败**

Run: `node tools/ddz-test.js`
Expected: 新增测试失败

- [ ] **Step 3: 实现**

- [ ] **Step 4: 运行，确认通过**

Run: `node tools/ddz-test.js`
Expected: `… passed, 0 failed`

- [ ] **Step 5: 提交**

```bash
git add js/games/doudizhu.js js/engine.js js/net.js tools/ddz-test.js
git commit -m "斗地主赖子：翻赖子、按理解出牌、赖子倍数，联机校验"
```

---

### Task 4: 界面

**Files:**
- Modify: `index.html`、`js/ui.js`、`js/games/doudizhu.js`（界面部分）、`js/games/doudizhu-coach.js`（界面部分）、`css/app.css`

**Interfaces:**
- Consumes: `V.dd.laizi`、`cls.as`、`ddReadings`、`ddPlayReading`
- Produces: 界面行为如下

- **设置表单**：
  - 斗地主字段里加复选框 `#f-laizi`，文字是「赖子模式（随机翻一个点数当赖子，可以当任意牌）」，默认不勾；
  - `readCfg`、`fillForm` 读写 `laizi`；
  - 房主大厅和客人大厅的说明里写上「赖子模式」。
- **桌面**：
  - 中间区域在底牌旁边显示「赖子 7」，用一张小牌加一个「赖」字标记；
  - 出过的牌里，被当成别的点数的赖子，在牌角显示「→K」。
- **手牌**：
  - 赖子牌的左上角显示一个金色的「赖」字标记，叠放时也能看见；
  - 推荐高亮和选中状态照常工作。
- **出牌**：
  - 选中的牌有多种能压过上家的理解时，「出牌」按钮换成几个按钮，比如「出牌 · 炸弹」「出牌 · 三带一」；
  - 每个按钮以 `{cards, as}` 提交；只有一种理解时只显示一个「出牌」按钮。
  - 客人发送时也带上 `as`。
- **教练**：
  - 推荐出牌带着 `as`；
  - 提示按钮切换到的出法，按 `ddPlayReading` 的理解显示；
  - 记牌器把赖子那一格标成「赖」。
- **规则面板**：`cfg.laizi` 为 true 时，加一节「赖子模式」，内容取自 Global Constraints 里的赖子规则。

- [ ] **Step 1: 实现**

- [ ] **Step 2: 规则测试不回退**

Run: `node tools/ddz-test.js`
Expected: `… passed, 0 failed`

- [ ] **Step 3: 浏览器检查**

在会话临时目录写 CDP 脚本，单机赖子模式打 3 局，由脚本代替真人：
- 能出的牌里，凡是有几种理解的，选第二种按钮出；
- 中间区域显示「赖子」；
- 手牌里赖子牌都有「赖」标记，在 4 种手机尺寸下标记都在可见区域内；
- 出过的赖子牌带「→」标记；
- 结算页倍数说明里能看到「软炸」或「硬炸」（打到为止，最多 30 局）。

再开一个互联网房间（房主 + 客人，赖子模式）打 1 局：客人出的牌被房主接受，双方页面没有报错。

不开赖子的单机斗地主，界面和第 3 步一样：没有「赖子」显示，布局检查结果相同。

Expected：以上全部成立。

- [ ] **Step 4: 提交**

```bash
git add index.html js/ui.js js/games/doudizhu.js js/games/doudizhu-coach.js css/app.css
git commit -m "斗地主赖子：设置开关、赖子标记、选择理解、规则说明"
```

---

### Task 5: 回归和收尾

**Files:**
- Modify: `sw.js`（`dushen-v10` → `dushen-v11`）、`README.md`

- [ ] **Step 1: 更新缓存版本和 README，确认打包成功**

Run: `python3 tools/bundle.py`
Expected: 打包成功

- [ ] **Step 2: 回归**

在 4 种手机尺寸和电脑上跑这几项检查：
- 单机斗地主（开和不开赖子）的布局检查；
- 德州、炸金花的布局检查和聊天检查；
- 斗地主联机端到端（不开赖子）；
- 德州的互联网房间。

Expected：结果和 `main` 一致，没有报错。

- [ ] **Step 3: 提交并推送**

```bash
git add sw.js README.md
git commit -m "斗地主第 4 步：缓存版本、README"
git push -u origin feat/ddz-step4
```
