# 斗地主 第 1 步：规则引擎 + 单机对电脑 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 单机模式下可以选「斗地主」，和两个电脑完整打完抢地主、加倍、出牌、结算，计入现有筹码和最终结算。

**Architecture:** 新文件 `js/games/doudizhu.js`，写法照着 `js/games/zjh.js`：上半部分是不碰 DOM 的纯规则函数（牌型、比较、出牌枚举、拆牌、抢地主状态机、结算算账、电脑决策），可以在 Node 里直接测试；下半部分是房主端的牌局流程（发牌、叫抢、加倍、出牌、结束），以及牌桌、手牌、操作区的界面部件。`engine.js`、`holdem.js`、`ui.js` 只在入口处加 `isD()` 分支，转到新文件。

**Tech Stack:** 普通 `<script>`，共用全局作用域，不用构建工具；Node（`vm` 模块）跑规则测试；无界面 Chrome（CDP）做自动对打和布局检查。

**Spec:** `docs/superpowers/specs/2026-10-30-doudizhu-design.md`（本计划只覆盖其中第 12 节的第 1 步）

## Global Constraints

- 德州和炸金花的行为完全不变：设置、牌局、联机、教练、结算都一样（设计文档第 4 节）。
- 电脑只用自己的手牌和公开信息（已出的牌、底牌、各家剩余张数）做决定。
- 不用构建工具；直接打开 `index.html` 也能运行；新文件要在 `index.html`、`sw.js` 缓存清单里登记，缓存版本号 +1；`python3 tools/bundle.py` 要能打包成功。
- 不改德州和炸金花使用的牌编码（0–51，`点数<<2|花色`，点数 0 代表 2）。
- 斗地主固定 3 个座位。第 1 步只开放单机：「斗地主」按钮在互联网房间和局域网里先不显示（第 3 步再开放）。
- 倍数：每次抢地主、每个炸弹、王炸、春天或反春，各 ×2。每个农民的输赢 = 底分 × 总倍数 × 农民加倍（2 或 1）× 地主加倍（2 或 1），最多 `封顶倍数 × 底分`（默认 64）。输赢不超过筹码；地主输了又付不起时，按两个农民应得的比例分掉地主的全部筹码。
- 赖子模式不在第 1 步实现，但规则函数的签名要预留 `laizi` 参数（第 4 步用），第 1 步一律传 `-1`。
- 第 1 步没有教练、提示按钮和记牌器（第 2 步做）。教练面板在斗地主里只显示一句说明，不能报错。

## Review Focus

1. **一手牌有多种理解**：比如 `3334` 是三带一不是别的，`33334444` 是两个炸弹的组合，不是合法的一手（除非按四带两对，4444 带 33 33）。`ddClassify` 遇到多种理解时，按「王炸 > 炸弹 > 四带二 > 飞机 > 三带 > 其他」选一个，并有测试覆盖。（测试放在 Task 1）
2. **顺子、连对、飞机里出现 2 或王**：`34567` 合法，`JQKA2` 不合法，`QQKKAA22` 不合法。（Task 1）
3. **筹码不够付**：农民筹码 100、应付 320 时只付 100；地主筹码 300、应付 960 时按 1:2 分给两个农民（100 和 200），筹码总量守恒。（Task 2）
4. **连续没人叫地主**：前 3 次都重新发牌，第 4 次发牌直接让第一家当地主，并且局数只算 1 局。（Task 3）
5. **出牌按钮误点**：选的牌不合法、或者压不过上家时，「出牌」按钮不可点并显示原因；轮到别人时手牌可以选但不能出。（Task 5）

---

## File Structure

| 文件 | 改动 |
|---|---|
| `js/games/doudizhu.js` | **新建**：规则（纯函数）、电脑、房主端牌局流程、牌桌 / 手牌 / 操作区 / 规则面板 |
| `tools/ddz-test.js` | **新建**：Node 规则测试，`node tools/ddz-test.js` |
| `js/engine.js` | `normalizeCfg` 支持 `game:'ddz'`；`startHand` 转到 `ddDeal`；座位补位；`viewFor` 加 `dd` 字段；`hostSettle` 带上离桌的电脑 |
| `js/games/holdem.js` | `proceed()`、`act()` 开头加 `isD` 分支 |
| `js/ui.js` | 设置表单、`renderTable` / `renderActions` / `renderMeta` / `seatTag` / `renderCoach` / `renderProfiles` / `renderSession` / `renderSettle` / `rulesHTML` / `fxDiff` / `humanAct` / 点击事件里的 `isD` 分支；手牌选择状态 |
| `index.html` | 游戏选择加「斗地主」（只在单机显示）；底分、封顶倍数设置；不适用的设置加 `data-games`；加载新脚本 |
| `css/app.css` | `.table.ddz`、手牌区、出牌区、炸弹特效、手机横竖屏 |
| `sw.js` | 缓存清单加新文件，`dushen-v7` → `dushen-v8` |
| `README.md` | 目录说明加 `js/games/doudizhu.js` 和 `tools/ddz-test.js` |

开工前：从最新的 `main` 拉一个新分支 `feat/ddz-step1`。如果 `feat/chat-bubble` 还没合并进 `main`，先问用户：等它合并，还是基于它开分支。把设计文档和本计划作为第一个提交。

---

### Task 1: 斗地主的牌和牌型识别

**Files:**
- Create: `js/games/doudizhu.js`（规则部分）
- Create: `tools/ddz-test.js`

**Interfaces:**
- Produces:
  - 牌编码：`id = 点数 * 4 + 花色`，点数 `0..12` 依次是 `3 4 5 6 7 8 9 10 J Q K A 2`，`52` 是小王，`53` 是大王。
  - `const DR=['3','4','5','6','7','8','9','10','J','Q','K','A','2','小王','大王']`
  - `ddRank(id) -> 0..14`：`id<52 ? id>>2 : id-39`（小王 13，大王 14）
  - `ddDeck() -> number[54]`：洗好的牌
  - `ddSort(ids) -> number[]`：按点数从大到小（同点数按花色），不改动原数组
  - `const isD=st=>!!(st&&st.cfg&&st.cfg.game==='ddz')`
  - `ddClassify(ids, laizi=-1) -> {type, main, len, n} | null`
    - `type` ∈ `'single' 'pair' 'triple' 'triple1' 'triple2' 'straight' 'pairs' 'plane' 'plane1' 'plane2' 'four2' 'four22' 'bomb' 'rocket'`
    - `main`：比较用的点数。顺子、连对、飞机取最小一组的点数；带牌的牌型取主体的点数。
    - `len`：顺子张数、连对对数、飞机组数；其他牌型为 1
    - `n`：总张数
  - `ddBeats(cls, prev) -> boolean`：`prev` 为 `null` 时总是 `true`；王炸压一切；炸弹压非炸弹，炸弹之间比 `main`；其余必须 `type`、`len`、`n` 都相同，并且 `main` 更大
  - `ddTypeName(cls) -> string`：中文牌型名，例如「顺子」「飞机带翅膀」「王炸」

- [ ] **Step 1: 写测试工具和失败的测试**

`tools/ddz-test.js` 用 Node 的 `vm` 新建一个上下文，依次运行 `js/common.js`、`js/games/doudizhu.js`，再在同一个上下文里运行测试代码。测试用 `ok(cond,msg)`、`eq(a,b,msg)` 两个小函数，失败时打印并记数，最后打印 `N passed, M failed`，有失败时退出码为 1。造牌的辅助函数 `C('3 3 3 4')` 把点数文字转成 id，花色依次分配；`'小王'`、`'大王'` 对应 52、53。

```js
eq(ddClassify(C('5')).type,'single');
eq(ddClassify(C('小王 大王')).type,'rocket');
eq(ddClassify(C('3 3 3 4')).type,'triple1');
eq(ddClassify(C('3 3 3 4 4')).type,'triple2');
eq(ddClassify(C('3 3 3 4 5')),null);
eq(ddClassify(C('3 4 5 6 7')).type,'straight');
eq(ddClassify(C('3 4 5 6 7')).len,5);
eq(ddClassify(C('10 J Q K A')).type,'straight');
eq(ddClassify(C('J Q K A 2')),null);            // 2 不能进顺子
eq(ddClassify(C('3 4 5 6')),null);              // 顺子至少 5 张
eq(ddClassify(C('3 3 4 4 5 5')).type,'pairs');
eq(ddClassify(C('Q Q K K A A 2 2')),null);
eq(ddClassify(C('3 3 3 4 4 4')).type,'plane');
eq(ddClassify(C('3 3 3 4 4 4 7 9')).type,'plane1');
eq(ddClassify(C('3 3 3 4 4 4 7 7 9 9')).type,'plane2');
eq(ddClassify(C('6 6 6 6 3 8')).type,'four2');
eq(ddClassify(C('6 6 6 6 3 3 8 8')).type,'four22');
eq(ddClassify(C('6 6 6 6')).type,'bomb');
eq(ddClassify(C('3 3 3 3 4 4 4 4')).type,'four22');   // 多种理解时取四带两对，主体是 4444
eq(ddClassify(C('3 3 3 3 4 4 4 4')).main,ddRank(C('4')[0]));
eq(ddClassify(C('5 5 5 6 6 6 7 7 7 8 8 8')).type,'plane');   // 12 张优先当 4 组飞机
ok(ddBeats(ddClassify(C('6')),ddClassify(C('5'))));
ok(!ddBeats(ddClassify(C('5 5')),ddClassify(C('6'))));        // 类型不同
ok(ddBeats(ddClassify(C('3 3 3 3')),ddClassify(C('A A A K'))));
ok(ddBeats(ddClassify(C('小王 大王')),ddClassify(C('2 2 2 2'))));
ok(!ddBeats(ddClassify(C('4 5 6 7 8')),ddClassify(C('3 4 5 6 7 8'))));   // 张数不同
ok(ddBeats(ddClassify(C('2')),ddClassify(C('A'))));
ok(ddBeats(ddClassify(C('大王')),ddClassify(C('小王'))));
eq(ddRank(52),13);eq(ddRank(53),14);
eq(ddDeck().length,54);eq(new Set(ddDeck()).size,54);
```

- [ ] **Step 2: 运行，确认失败**

Run: `node tools/ddz-test.js`
Expected: 报错 `ddClassify is not defined`，或者全部失败

- [ ] **Step 3: 在 `js/games/doudizhu.js` 实现上面列出的函数**

文件头注释照 `zjh.js` 的格式。`ddClassify` 先按点数统计张数，再按「王炸 → 炸弹 → 四带二 → 飞机（含带翅膀）→ 三带 → 顺子 / 连对 → 单、对、三」的顺序尝试，返回第一个匹配的结果。这个顺序就是 Review Focus 第 1 条要求的优先级。本步 `laizi` 参数只要存在，不用实现赖子逻辑。

- [ ] **Step 4: 运行，确认通过**

Run: `node tools/ddz-test.js`
Expected: `… passed, 0 failed`

- [ ] **Step 5: 提交**

```bash
git add js/games/doudizhu.js tools/ddz-test.js
git commit -m "斗地主：牌编码、牌型识别和大小比较，附 Node 规则测试"
```

---

### Task 2: 出牌枚举、拆牌、抢地主流程、结算算账

**Files:**
- Modify: `js/games/doudizhu.js`（规则部分）
- Test: `tools/ddz-test.js`

**Interfaces:**
- Consumes: Task 1 的 `ddRank`、`ddClassify`、`ddBeats`
- Produces:
  - `ddMoves(hand, prev, laizi=-1) -> number[][]`：所有能压过 `prev` 的出法；`prev` 为 `null` 时是所有能首出的出法。带牌只取最小的可用单张或对子，生成一种组合，不枚举所有带法。结果按「非炸弹在前，同类按 `main` 从小到大，炸弹在后，王炸最后」排序。
  - `ddSplit(hand, laizi=-1) -> {groups: number[][], hands: number}`：把手牌拆成尽量少的手数，炸弹和王炸单独成组。用启发式算法即可，具体算法由实现者决定，但要通过下面的测试。
  - `ddBidNew(order:number[3], forced:boolean) -> bid`：`order` 是从第一家开始的座位号。`forced` 为 true 时，直接让 `order[0]` 当地主，不再叫抢。
  - `ddBidAsk(bid) -> {pid, kind:'call'|'rob'} | null`：下一个要表态的人；`null` 表示叫抢结束
  - `ddBidStep(bid, pid, yes:boolean) -> bid`：返回新对象，不改动原对象
  - `ddBidResult(bid) -> {landlord:number|-1, robs:number, redeal:boolean}`
  - `ddSpring(played:{[pid]:出牌手数}, landlord, winner) -> ''|'spring'|'anti'`：地主赢且两个农民都是 0 手为 `'spring'`；农民赢且地主只出过 1 手为 `'anti'`
  - `ddPayout({base, mult, cap, landlordWon, landlord, farmers:[a,b], dbl:{[pid]:boolean}, stacks:{[pid]:number}}) -> {[pid]: delta}`：三个人的 delta 之和为 0

叫抢规则（设计文档 5.2）：
- 叫地主阶段按 `order` 依次问「叫 / 不叫」，三个人都不叫就 `redeal:true`。
- 有人叫了以后，排在他后面、还没表态的人依次问「抢 / 不抢」。说过「不叫」的人不能再抢。
- 只要有人抢过，最先叫地主的人最后还有一次「抢 / 不抢」。
- 最后一个叫或抢的人当地主，`robs` 是「抢」的次数。

- [ ] **Step 1: 写失败的测试**

```js
// ddMoves
eq(ddMoves(C('5 K'),ddClassify(C('4'))).map(m=>m.length),[1,1]);
eq(ddRank(ddMoves(C('5 K'),ddClassify(C('4')))[0][0]),ddRank(C('5')[0]));      // 小的在前
ok(ddMoves(C('3 3 3 3 5'),ddClassify(C('A'))).some(m=>m.length===4));           // 炸弹能压单张
eq(ddMoves(C('3 4'),ddClassify(C('5 5'))).length,0);
ok(ddMoves(C('3 4 5 6 7 9'),null).some(m=>ddClassify(m).type==='straight'));
// ddSplit
eq(ddSplit(C('3 4 5 6 7 8 K K')).hands,2);
eq(ddSplit(C('3 3 3 3 5')).hands,2);
eq(ddSplit(C('小王 大王 7')).hands,2);
// 叫抢
let b=ddBidNew([0,1,2],false);
b=ddBidStep(b,0,false);b=ddBidStep(b,1,true);b=ddBidStep(b,2,false);
eq(ddBidAsk(b),null);eq(ddBidResult(b),{landlord:1,robs:0,redeal:false});
b=ddBidNew([0,1,2],false);
b=ddBidStep(b,0,true);eq(ddBidAsk(b),{pid:1,kind:'rob'});
b=ddBidStep(b,1,true);b=ddBidStep(b,2,false);eq(ddBidAsk(b),{pid:0,kind:'rob'});
b=ddBidStep(b,0,true);eq(ddBidResult(b),{landlord:0,robs:2,redeal:false});
b=ddBidNew([0,1,2],false);b=ddBidStep(b,0,true);b=ddBidStep(b,1,true);b=ddBidStep(b,2,true);b=ddBidStep(b,0,false);
eq(ddBidResult(b),{landlord:2,robs:2,redeal:false});
b=ddBidNew([0,1,2],false);b=ddBidStep(b,0,true);b=ddBidStep(b,1,false);b=ddBidStep(b,2,false);
eq(ddBidAsk(b),null);eq(ddBidResult(b).landlord,0);                            // 没人抢，最先叫的人不再被问
b=ddBidNew([2,0,1],false);b=ddBidStep(b,2,false);b=ddBidStep(b,0,false);b=ddBidStep(b,1,false);
eq(ddBidResult(b),{landlord:-1,robs:0,redeal:true});
eq(ddBidResult(ddBidNew([1,2,0],true)),{landlord:1,robs:0,redeal:false});
// 春天
eq(ddSpring({0:5,1:0,2:0},0,0),'spring');eq(ddSpring({0:5,1:1,2:0},0,0),'');
eq(ddSpring({0:1,1:6,2:3},0,1),'anti');eq(ddSpring({0:2,1:6,2:3},0,1),'');
// 结算
const S3={0:2000,1:2000,2:2000};
eq(ddPayout({base:20,mult:4,cap:64,landlordWon:true,landlord:0,farmers:[1,2],dbl:{},stacks:S3}),{0:160,1:-80,2:-80});
eq(ddPayout({base:20,mult:8,cap:64,landlordWon:false,landlord:0,farmers:[1,2],dbl:{1:true,0:true},stacks:S3}),{0:-960,1:640,2:320});
eq(ddPayout({base:20,mult:128,cap:64,landlordWon:true,landlord:0,farmers:[1,2],dbl:{},stacks:S3}),{0:2560,1:-1280,2:-1280});
eq(ddPayout({base:20,mult:16,cap:64,landlordWon:true,landlord:0,farmers:[1,2],dbl:{},stacks:{0:2000,1:100,2:2000}}),{0:420,1:-100,2:-320});
eq(ddPayout({base:20,mult:8,cap:64,landlordWon:false,landlord:0,farmers:[1,2],dbl:{2:true,0:true},stacks:{0:300,1:2000,2:2000}}),{0:-300,1:100,2:200});
```

- [ ] **Step 2: 运行，确认新测试失败**

Run: `node tools/ddz-test.js`
Expected: 新增的测试失败，Task 1 的测试仍然通过

- [ ] **Step 3: 实现上面列出的函数**

`ddPayout` 先按公式算出每个农民应得或应付的数，再按封顶截断，最后按筹码截断。地主付不起时按比例分配，用 `Math.floor` 取整，余数给应得较多的农民，保证总和为 0。

- [ ] **Step 4: 运行，确认全部通过**

Run: `node tools/ddz-test.js`
Expected: `… passed, 0 failed`

- [ ] **Step 5: 提交**

```bash
git add js/games/doudizhu.js tools/ddz-test.js
git commit -m "斗地主：出牌枚举、拆牌、抢地主流程和结算算账"
```

---

### Task 3: 电脑决策（纯函数）

**Files:**
- Modify: `js/games/doudizhu.js`
- Test: `tools/ddz-test.js`

**Interfaces:**
- Consumes: `ddSplit`、`ddMoves`、`ddClassify`
- Produces:
  - `const DD_ARCH={aggro:{…}, safe:{…}, team:{…}}`：三种电脑性格。中文名分别是「激进」「保守」「配合」。参数至少包含 `bid`（叫地主的门槛）、`bomb`（多愿意出炸弹，0 到 1）、`team`（多愿意让队友的牌，0 到 1）。具体数值由实现者决定。
  - `ddPickArch() -> key`：随机选一个性格
  - `ddStrength(hand) -> number`：手牌强度。大王、小王、2、炸弹加分，手数多扣分，具体权重由实现者决定。
  - `ddBotBid(hand, kind:'call'|'rob', arch) -> boolean`
  - `ddBotDouble(hand, isLandlord, arch) -> boolean`
  - `ddBotPlay(info) -> number[] | null`（`null` 表示不要）。`info = {hand, prev: {cls, pid} | null, me, landlord, counts: {[pid]: 剩余张数}, arch}`，只包含公开信息和自己的手牌。

出牌策略（实现者可以调整细节，但必须通过下面的测试）：
- 一次能出完就直接出完。
- 首出：在拆牌结果里选主牌点数最小的一组，优先出顺子、连对、飞机这类张数多的组，炸弹和王炸留着。下家是对手并且只剩 1 张时，不出单张，除非出的是手里最大的单张。
- 跟牌：上家是队友时一般不要；只有能一次出完，或者队友打出的是很小的单张而下家地主只剩 1 张时才压。上家是对手时，选「出完以后剩余手数增加最少」的那一手，一样多就出点数最小的。
- 炸弹：只在这些情况下出：对手剩余不超过 4 张；炸完以后自己剩不超过 2 手；或者按性格的 `bomb` 参数随机决定。

- [ ] **Step 1: 写失败的测试**

```js
const A=DD_ARCH.safe;
ok(ddBotBid(C('小王 大王 2 2 2 A A K 9 9 8 7 6 5 4 3 3'),'call',A));
ok(!ddBotBid(C('3 4 5 7 8 9 10 J 3 4 6 8 9 J Q 5 6'),'call',A));
const info=(hand,prev,o={})=>({hand,prev,me:1,landlord:0,counts:{0:10,1:hand.length,2:10},arch:A,...o});
eq(ddBotPlay(info(C('5 K'),{cls:ddClassify(C('4')),pid:0})).map(ddRank),[ddRank(C('5')[0])]);
eq(ddBotPlay(info(C('3 4 5 6 7'),{cls:ddClassify(C('8')),pid:2})),null);                 // 队友出的牌，不压
eq(ddBotPlay(info(C('9 9'),null)).length,2);                                             // 能一次出完
ok(ddBotPlay(info(C('3 3 3 3 5 9'),{cls:ddClassify(C('A')),pid:0},{counts:{0:2,1:6,2:10}})).length===4);   // 地主只剩 2 张，用炸弹
eq(ddBotPlay(info(C('3 3 3 3 5 9'),{cls:ddClassify(C('6')),pid:0},{counts:{0:15,1:6,2:10}})).map(ddRank),[ddRank(C('9')[0])]);  // 不浪费炸弹
const lead=ddBotPlay(info(C('3 4 5 6 7 K K 2'),null));ok(ddClassify(lead).type==='straight');
```

- [ ] **Step 2: 运行，确认失败**

Run: `node tools/ddz-test.js`
Expected: 新增测试失败

- [ ] **Step 3: 实现上面列出的函数**

- [ ] **Step 4: 运行，确认通过**

Run: `node tools/ddz-test.js`
Expected: `… passed, 0 failed`

- [ ] **Step 5: 提交**

```bash
git add js/games/doudizhu.js tools/ddz-test.js
git commit -m "斗地主：电脑叫地主、加倍和出牌，三种性格"
```

---

### Task 4: 房主端牌局流程，接入引擎

**Files:**
- Modify: `js/games/doudizhu.js`（新增「房主端牌局」部分）
- Modify: `js/engine.js:36-50`（`normalizeCfg`）、`js/engine.js:62-79`（`startHand`）、`js/engine.js:139-148`（`hostSettle`）、`js/engine.js:151-166`（`viewFor`）
- Modify: `js/games/holdem.js:361-362`（`proceed`）、`js/games/holdem.js:398-399`（`act`）
- Modify: `index.html`（在 `zjh.js` 之后加载 `js/games/doudizhu.js`）

**Interfaces:**
- Consumes: Task 1–3 的全部规则函数
- Produces:
  - `cfg` 新字段：`game:'ddz'`，`base`（底分，默认 20，允许 5、10、20、50、100），`ddcap`（封顶倍数，默认 64，允许 16、32、64、128）。`game==='ddz'` 时，`normalizeCfg` 强制 `players=3`、`sb=bb=ante=base`、筹码默认 `100*base`、最少 `20*base`。
  - `S.dd`：
    ```
    {stage:'bid'|'double'|'play', order:[3 个座位号], bid, landlord:-1, bottom:[3 张],
     mult:1, robs:0, bombs:0, rockets:0, dbl:{[pid]:boolean}, dblAsk:[待表态的座位号],
     lead:{pid, cls, cards} | null, passes:0, shown:{[pid]: {cards, cls} | 'pass'},
     played:{[pid]: 出牌手数}, redeals:0, spring:''}
    ```
  - `ddDeal(live)`：发牌（每人 17 张，留 3 张底牌），重置 `S.dd`，进入叫抢阶段。`S.dealer` 是第一个叫地主的人：第一局随机，之后每局是上一局第一家的下家；重新发牌时保持不变。重新发牌不增加 `S.handNo`。连续 3 次重新发牌后，第 4 次调用 `ddBidNew(order,true)`。
  - `ddProceed()`：照 `zProceed` 的写法，轮到电脑就延时调用 `ddBotTurn(p)`。
  - `ddAct(p, type, arg)`：`type` 是 `'bid'`（`arg` 为 1 或 0）、`'double'`（1 或 0）、`'play'`（`arg` 是 id 数组）、`'pass'`。不合法的操作直接忽略并 `sync()`，不能抛异常。每次成功的操作都设置 `S.ev = {seq, pid, type, cls?, yes?}`，供界面播放音效。
  - `ddEnd(winnerPid)`：用 `ddSpring` 判断春天或反春，是就把倍数 ×2，再调用 `ddPayout`，把正数写进 `p.won`、负数的绝对值写进 `p.total`，再把 `p.stack` 加上 delta。所有人 `shown=true`，写好 `S.msg` 和日志，最后调用现有的 `endHand()`。
  - `viewFor(seat).dd`：`S.dd` 的公开副本。`bottom` 在定出地主以后才给真牌，之前是 `[null,null,null]`；`bid` 换成 `{ask: ddBidAsk(bid), log: [{pid, kind, yes}]}`。
  - 座位补位（设计文档 5.5）：斗地主的 `startHand` 里，筹码为 0 的电脑如果没开补码，就换成一个新电脑。新电脑取新名字，用新性格和起始筹码，座位号不变。被换下的电脑放进 `S.gone`（数组，默认 `[]`），`hostSettle` 的 `standings` 里带上它们（`out:true`）。真人输光仍然走现有的 `busted` 流程。

- [ ] **Step 1: 写失败的测试，牌局流程在 Node 里跑**

`tools/ddz-test.js` 再加载 `js/engine.js`、`js/games/holdem.js`、`js/games/zjh.js`，并在上下文里打桩：`sync=()=>{}`、`hostSave=()=>{}`、`applyView=()=>{}`、`voiceClear=()=>{}`、`resetT=()=>{}`、`NET={role:'solo',conns:new Map()}`、`setTimeout` 换成立即执行的队列。然后跑 200 局纯电脑对局：

```js
startGame({game:'ddz',base:20,ddcap:64,stack:2000,speed:'fast',rebuy:true,auto:false,aiFill:true,coach:true},[{name:'A',kind:'ai'}]);   // kind:'ai' 让 3 家都由电脑打
for(let h=0;h<200;h++){ runTimers(); eq(S.phase,'handover'); const tot=S.players.reduce((a,p)=>a+p.stack,0)-2000*S.players.reduce((a,p)=>a+1+p.rebuys,0); eq(tot,0,'筹码守恒'); ok(S.players.every(p=>p.cards.length<=20)); startHand(); }
ok(S.handNo>=200);
// 强制地主：连续 3 次没人叫
// 用打桩的 ddBotBid 一直返回 false，调用 startHand，跑完计时器后断言：S.dd.redeals===3 且 S.dd.landlord===S.dealer 且 S.handNo 只加了 1
// 德州 / 炸金花不受影响：normalizeCfg({game:'holdem'}).game==='holdem'，normalizeCfg({game:'zjh'}).players 保持传入值
```

`kind:'ai'` 的玩家要有 `style` 和 `ai`。测试里在 `startGame` 之后给 `S.players[0]` 补上 `ddArch`，或者让 `mkPlayer` 的调用方处理；具体由实现者在测试里打桩。

- [ ] **Step 2: 运行，确认失败**

Run: `node tools/ddz-test.js`
Expected: 牌局流程的测试失败，比如 `ddDeal is not defined`

- [ ] **Step 3: 实现 `ddDeal`、`ddProceed`、`ddAct`、`ddBotTurn`、`ddEnd`，并接入引擎**

- `normalizeCfg`：`c.game` 允许 `'ddz'`。
- `startHand`：在 `live` 计算之前处理斗地主的补位；在 `if(isZ(S))` 旁边加 `if(isD(S))return ddDeal(live)`。斗地主要求 `live.length===3`，不足 3 人时沿用 `waiting` 提示。
- `proceed`、`act`：开头加 `isD` 分支，转到 `ddProceed`、`ddAct`。
- `viewFor`：加 `dd` 字段。
- `hostSettle`：拼上 `S.gone`。
- 电脑的性格存在 `p.ddArch`，在创建电脑时用 `ddPickArch()` 分配。
- 电脑偶尔说话：炸弹、王炸、报单（自己只剩 1 张）、报双（自己只剩 2 张）时，用现有的 `botChat`，概率由实现者决定。

- [ ] **Step 4: 运行，确认通过**

Run: `node tools/ddz-test.js`
Expected: `… passed, 0 failed`，200 局全部结束，筹码守恒

- [ ] **Step 5: 提交**

```bash
git add js/games/doudizhu.js js/engine.js js/games/holdem.js index.html tools/ddz-test.js
git commit -m "斗地主：房主端牌局流程接入引擎，电脑补位，200 局自动对打守恒"
```

---

### Task 5: 设置表单、牌桌、手牌和操作区

**Files:**
- Modify: `index.html`（设置表单）
- Modify: `js/ui.js`（下表列出的函数）
- Modify: `js/games/doudizhu.js`（新增「界面部件」部分）
- Modify: `css/app.css`

**Interfaces:**
- Consumes: `V.dd`（Task 4）、`ddClassify`、`ddBeats`、`ddTypeName`
- Produces（都在 `doudizhu.js` 的界面部分）：
  - `ddCardHTML(id, o={sel, small})`：沿用 `.card` 的样式；王的点数位置显示「小王」或「大王」，大王红色，小王黑色
  - `ddRenderTable()`：生成 `#table` 的 HTML，给 `#table` 加 `ddz` 类
  - `ddRenderHand()`：生成 `#dd-hand` 的 HTML
  - `ddRenderActions(el, m)`：生成操作区
  - `ddRulesHTML()`：斗地主规则面板，内容取自设计文档 5.1–5.5
  - 本机选牌状态：`let DSEL=new Set()`（选中的牌 id）。换了一手新牌、出牌成功，或者点「重选」时清空。

界面要求：
- **设置表单**：
  - `#f-game` 加 `<button type="button" data-game="ddz" data-modes="solo">斗地主</button>`，第 3 步再去掉 `data-modes`。
  - 新增一个 `data-games="ddz"` 字段：底分 `#f-ddbase`（5、10、20、50、100，默认 20），封顶 `#f-ddcap`（16、32、64、128 倍，默认 64）。
  - 座位数、电脑对手风格、「每手结束后亮出所有人的底牌」、「我弃牌后快进」这几个字段加 `data-games="holdem zjh"`。
  - `setGame`、`readCfg`、`fillForm`、`updateBB`、`playersHint`、`LEADS.solo` 都要支持 `ddz`。`updateBB` 显示「= N 倍底分」。
- **牌桌**：
  - 沿用 `seatPoint` 的三人环形布局，你在下方。
  - 对手的座位显示一张牌背和剩余张数，不排出 17 张牌背。
  - 地主的名字牌带「地主」标记；`seatTag` 显示「地主」或「农民」。
  - 每家最近出的那手牌或「不要」，画在座位和桌子中心之间（用 `seatPoint` 的 `'bet'` 位置），用小号的牌。
  - 中间显示 3 张底牌：定出地主前是牌背，之后翻开；还显示「倍数 ×N」和当前阶段（叫地主、加倍、出牌中、本局结束）。
- **手牌区** `#dd-hand`：
  - 放在 `.table-wrap` 里、`#table` 下方，只在斗地主里显示。
  - 牌按点数从大到小排，叠着排开，选中的牌上移约 `0.3 × 牌宽`，并加高亮边框。
  - 点一下切换选中。手指或鼠标按下后横着滑过的牌，都设成和第一张相同的选中状态。拖动时不能触发页面滚动（`touch-action:none`）。
- **操作区**：
  - 叫地主阶段：「叫地主 / 不叫」或「抢地主 / 不抢」，只对轮到的人显示。
  - 加倍阶段：「加倍 / 不加倍」。
  - 出牌阶段：「出牌」「不要」「重选」。下列情况「出牌」不可点，并在按钮下方写明原因：
    - 选的牌不成牌型：「选的牌不成牌型」；
    - 压不过上家：「压不过上家的 XX」，XX 用 `ddTypeName`；
    - 自己是首出时不能点「不要」。
  - 不轮到你时只显示「等待 XX…」，没有按钮；手牌仍然可以选。
- **`ui.js` 里的分支**：
  - `renderTable`、`renderActions`：只在 `!myTurn()` 那段换成斗地主自己的等待文字，其余共用的提示（输光、`handover`、`waiting`）保持不变。
  - `renderMeta`：显示「斗地主 · 底分」和底分。
  - `seatTag`、`rulesHTML('ddz')`。
  - `renderCoach`：斗地主只显示「斗地主的教练建议、提示和记牌器会在下一版加入。」，不调用 `getAdvice`。
  - `renderProfiles`：斗地主显示玩家、局数、当地主次数、对你。
  - `renderSession`：显示盈亏（倍底分）、局数、赢下的局数。
  - `renderSettle`：单位用「倍底分」；没有教练记录时，跳过依赖记录的段落。
  - `humanAct`：斗地主分支直接调用 `act(P()[0], type, arg)`；联机部分在第 3 步做。
  - 点击事件新增 `data-act`：`ddbid`、`dddbl`（都带 `data-v="1|0"`），`ddplay`、`ddpass`、`ddreset`。
- **音效和语音**（`fxDiff` 的斗地主分支，用现有的 `say()` 和 `SFX`）：
  - 叫抢和加倍：「叫地主」「不叫」「抢地主」「不抢」「加倍」「不加倍」。
  - 出牌：说 `ddTypeName`；单张和对子只说点数，比如「对 K」。
  - 不要：「不要」。
  - 报单、报双：某家剩 1 张或 2 张时说「我只剩 1 张了」「我只剩 2 张了」。
  - 炸弹和王炸：复用 `allInFx` 的写法做一个 `ddBombFx(pid, text)`，横幅文字是「炸弹」或「王炸」。
- **手机**：
  - 横屏 873×393、800×360，竖屏 393×873、360×780 这 4 种尺寸下，手牌、座位、出牌区、中心区互不重叠，页面不上下滚动，20 张手牌每张至少露出 14px 可以点。
  - 竖屏首次进入斗地主时，用 `flashBanner` 提示一次「横屏体验更好」，记在 `localStorage` 的 `dushen-ddz-tip` 里，读写都包在 `try` 里。

- [ ] **Step 1: 实现表单、牌桌、手牌、操作区、音效和样式**

- [ ] **Step 2: 规则测试不回退**

Run: `node tools/ddz-test.js`
Expected: `… passed, 0 failed`

- [ ] **Step 3: 浏览器里人工检查**

用 `python3 -m http.server` 在本地打开 `index.html`，单机选斗地主打满一局：能叫地主、加倍、选牌出牌、不要，结束后亮牌并显示结算。浏览器控制台没有报错。

- [ ] **Step 4: 提交**

```bash
git add index.html js/ui.js js/games/doudizhu.js css/app.css
git commit -m "斗地主：设置表单、牌桌、手牌选择、操作区、音效和手机布局"
```

---

### Task 6: 自动对打、布局检查、回归和收尾

**Files:**
- Modify: `sw.js`（缓存清单加 `./js/games/doudizhu.js`，`dushen-v7` → `dushen-v8`）
- Modify: `README.md`（目录说明）

- [ ] **Step 1: 更新缓存清单和 README，确认打包成功**

Run: `python3 tools/bundle.py && grep -c "js/games/doudizhu.js" ../赌神智慧树.html`
Expected: 打包成功，输出 `1`

- [ ] **Step 2: 无界面 Chrome 自动对打**

在会话的临时目录写一个 CDP 脚本，不提交进仓库。用本地 http 服务打开页面，单机选斗地主，速度设为快，开自动下一局。由脚本代替真人：轮到你时，叫抢阶段随机选；出牌阶段点选第一个合法出法的牌再点「出牌」，没有合法出法就点「不要」。

Expected：
- 打 30 局，没有页面报错；
- 每局结束后 3 家筹码之和减去起始筹码和补码的总和等于 0；
- 结束结算页能正常显示。

- [ ] **Step 3: 手机布局检查**

在 873×393、800×360、393×873、360×780 这 4 种模拟触屏尺寸下打到出牌阶段，逐一计算座位名字牌、出牌区、中心区、手牌区、操作区的矩形，检查有没有重叠。

Expected：
- 两两重叠不超过 2px；
- 页面不上下滚动；
- 20 张手牌的可点区域宽度都 ≥ 14px。

- [ ] **Step 4: 德州和炸金花回归**

在同样 4 种尺寸和电脑 1280×800 下，单机跑德州 6 人、炸金花 6 人，再跑一次互联网房间（房主 + 客人）。

Expected：没有报错，重叠检查结果和 `main` 一致。

- [ ] **Step 5: 提交并推送**

```bash
git add sw.js README.md
git commit -m "斗地主第 1 步：缓存清单、README"
git push -u origin feat/ddz-step1
```
