# 斗地主 第 2 步：教练、记牌器、统计 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 斗地主里有完整的教练：叫地主、抢地主、加倍和出牌都给建议和理由，「提示」按钮可以轮流切换能出的牌，有记牌器和报单、报双提醒，每个决定都有点评；统计和结算页按斗地主的指标显示；电脑出牌用同一套评估，变得更强。

**Architecture:** 新文件 `js/games/doudizhu-coach.js`，紧跟在 `doudizhu.js` 之后加载。上半部分是纯函数：记牌（还没出的牌）、「这手牌别人还压不压得住」、出法打分、叫地主 / 加倍 / 出牌建议、点评打分，都能在 Node 里测；下半部分是教练面板、记牌器、提示按钮和结算页里斗地主的部分。电脑的 `ddBotPlay` 改用同一个出法打分函数，再按性格加一点偏好。

**Tech Stack:** 普通 `<script>`，共用全局作用域；Node（`vm`）跑规则测试；无界面 Chrome（CDP）做界面检查。

**Spec:** `docs/superpowers/specs/2026-10-30-doudizhu-design.md`（本计划覆盖第 7 节、第 9 节的统计和结算页、第 6 节的电脑出牌，对应第 12 节的第 2 步）

## Global Constraints

- 德州和炸金花的行为完全不变（设计文档第 4 节）。
- 电脑和教练都只用一个座位能看到的信息：自己的手牌、已经出过的牌、亮出的底牌、各家剩余张数。不能读别人的手牌。
- 联机时教练建议只显示在自己的设备上；房主关闭教练后，斗地主也不显示建议、提示按钮和记牌器，但赛后复盘照常记录（和德州、炸金花一致）。
- 「实时」和「先决定再看建议」两种教练模式都要支持。
- 新文件要在 `index.html`、`sw.js` 缓存清单里登记，缓存版本号 +1；`python3 tools/bundle.py` 要能打包。
- **【计划的决定】** 设计文档第 10 节写的是「新代码放在 `js/games/doudizhu.js`」。第 1 步之后这个文件已有约 600 行，教练部分再放进去会超过 1000 行，所以拆到 `js/games/doudizhu-coach.js`。两个文件都属于斗地主模块，加载顺序固定。

## Review Focus

1. **记牌在一局里被重置或算重**：重新发牌（没人叫地主）以后记牌器要从头算；底牌翻开后，地主手里还没出的底牌要单独标出来，不能算成「不知道在谁手里」。（测试放在 Task 1）
2. **「压不住」判断漏掉炸弹和王炸**：别人手里可能还有四张同点数或者两张王时，任何非王炸的牌都不能算「压不住」。（Task 1）
3. **提示按钮在没有能出的牌时**：只能「不要」时，提示按钮要说「没有能压过上家的牌」，不能选出一手不合法的牌。（Task 4）
4. **点评把「不要」误判**：自己是首出时没有「不要」这个选项；上家是队友时「不要」是正确的，不能算失误。（Task 3）
5. **教练被房主关闭时**：提示按钮、推荐高亮、记牌器都不显示，但复盘记录照常保存，结算页仍有点评。（Task 4）

---

## File Structure

| 文件 | 改动 |
|---|---|
| `js/games/doudizhu-coach.js` | **新建**：记牌、压不住判断、出法打分、建议、点评（纯函数）；教练面板、记牌器、提示、结算页斗地主部分（界面） |
| `js/games/doudizhu.js` | `S.dd.out` 记录所有出过的牌并放进 `ddPublic`；`ddBotPlay` 改用 `ddEvalMoves`；`ddKickers` 允许把对子拆成两张单牌当翅膀；`ddBotTurn` 加兜底；每人的斗地主统计；规则面板加「教练怎么算」 |
| `js/ui.js` | `renderCoach`、`renderSession`、`renderSettle`、`humanAct`、`renderActions`（提示按钮）里的斗地主分支 |
| `index.html` | 在 `doudizhu.js` 之后加载 `doudizhu-coach.js` |
| `css/app.css` | 推荐高亮、记牌器、报单报双提醒 |
| `tools/ddz-test.js` | 加载新文件，新增测试 |
| `sw.js`、`README.md` | 缓存清单、目录说明 |

开工前：从最新的 `main` 拉新分支 `feat/ddz-step2`，把本计划作为第一个提交。

---

### Task 1: 记牌和「压不住」判断

**Files:**
- Modify: `js/games/doudizhu.js`（`ddShuffleDeal`、`ddAct`、`ddPublic`）
- Create: `js/games/doudizhu-coach.js`
- Modify: `index.html`（加载新文件）、`tools/ddz-test.js`（两个上下文都加载新文件）

**Interfaces:**
- Produces:
  - `S.dd.out: number[]`：这一局按顺序出过的所有牌。重新发牌时清空，`ddPublic` 原样带出。
  - `ddUnseen(hand:number[], out:number[]) -> number[15]`：每个点数还剩几张没出，并且不在自己手里（小王、大王最多 1）。
  - `ddLordBottom(view) -> number[]`：底牌里还没出过、并且不在自己手里的牌。自己是地主或者还没定地主时返回 `[]`。
  - `ddCanBeBeaten(cls, unseen:number[15]) -> boolean`：只用这些没见过的牌，有没有可能凑出压过 `cls` 的一手。
    - 两张王都没见过，就能凑出王炸。
    - 某个点数 4 张都没见过，就能凑出炸弹。
    - 非炸弹的牌，按同类型、同张数、更大的主牌判断；带牌部分不检查。
    - `cls` 是王炸时返回 `false`。

- [ ] **Step 1: 写失败的测试**

```js
// ddUnseen
{const u=ddUnseen(C('3 3 大王'),C('3 2'));eq(u[0],1,'3 还剩 1 张');eq(u[12],3);eq(u[14],0);eq(u[13],1);}
// ddCanBeBeaten
{const u=new Array(15).fill(0);u[5]=1;ok(!ddCanBeBeaten(ddClassify(C('9')),u),'只剩一张 8，压不住 9');}
{const u=new Array(15).fill(0);u[10]=1;ok(ddCanBeBeaten(ddClassify(C('9')),u),'K 压得住 9');}
{const u=new Array(15).fill(0);u[3]=4;ok(ddCanBeBeaten(ddClassify(C('2')),u),'别人可能有炸弹');}
{const u=new Array(15).fill(0);u[13]=1;u[14]=1;ok(ddCanBeBeaten(ddClassify(C('2 2 2 2')),u),'别人可能有王炸');}
{const u=new Array(15).fill(0);u[11]=2;ok(!ddCanBeBeaten(ddClassify(C('K K K 3')),u),'只剩两张 A，压不住三个 K');}
{const u=new Array(15).fill(1);u[13]=0;ok(!ddCanBeBeaten(ddClassify(C('10 J Q K A')),u),'最大的顺子压不住');}
ok(!ddCanBeBeaten(ddClassify(C('小王 大王')),new Array(15).fill(4)),'王炸压不住');
// S.dd.out 和 ddLordBottom（在 flow 上下文里）
startGame({game:'ddz',base:20,ddcap:64,stack:2000,speed:'fast',rebuy:true,auto:false,aiFill:true},[{name:'你',kind:'local',gender:'m'}]);
run();   // 打完一局
eq(S.dd.out.length,54-P().reduce((a,p)=>a+p.cards.length,0),'出过的牌 = 54 − 手里剩的');
eq(viewFor(0).dd.out,S.dd.out,'视图里有 out');
{const keep=ddBotBid;ddBotBid=()=>false;startHand();for(let i=0;i<9&&S.dd.redeals<1;i++){if(TIMERS.length)TIMERS.shift()();else if(S.toAct===0)ddBotTurn(P()[0])}ddBotBid=keep;eq(S.dd.out,[],'重新发牌后清空');}
```

`ddLordBottom` 的测试：手工构造一个视图 `{me:1, dd:{landlord:0, bottom:[A,B,C], out:[B]}, players:[…,{cards:[C,…]}]}`，期望结果是 `[A]`。再分别用 `me:0`（自己是地主）和 `landlord:-1`（还没定地主）测，都期望 `[]`。

- [ ] **Step 2: 运行，确认失败**

Run: `node tools/ddz-test.js`
Expected: 报错 `ddUnseen is not defined`，或者新增的测试失败

- [ ] **Step 3: 实现**

在 `ddShuffleDeal` 初始化 `out:[]`，在 `ddAct` 出牌成功时追加，在 `ddPublic` 带出 `out`；在新文件实现上面三个函数。新文件头注释的格式和 `zjh.js` 一样。

- [ ] **Step 4: 运行，确认通过**

Run: `node tools/ddz-test.js`
Expected: `… passed, 0 failed`

- [ ] **Step 5: 提交**

```bash
git add js/games/doudizhu.js js/games/doudizhu-coach.js index.html tools/ddz-test.js
git commit -m "斗地主：记录出过的牌，记牌和「压不住」判断"
```

---

### Task 2: 出法打分，电脑改用它

**Files:**
- Modify: `js/games/doudizhu-coach.js`、`js/games/doudizhu.js`（`ddBotPlay`、`ddKickers`、`ddBotTurn`）
- Test: `tools/ddz-test.js`

**Interfaces:**
- Consumes: `ddUnseen`、`ddCanBeBeaten`（Task 1），`ddMoves`、`ddSplit`、`ddClassify`
- Produces:
  - `ddEvalMoves(info) -> Array<{cards: number[] | null, cls, after: number, boss: boolean, score: number, why: string}>`
    - `info` 和第 1 步 `ddBotPlay` 的参数相同（`hand, prev, me, landlord, counts, arch`），另外加 `out`（出过的牌，可以省略）。
    - 结果包含每一手合法出法；有上家时还包含「不要」（`cards: null`）。按 `score` 从高到低排序。
    - `after`：出完以后剩余的手数。`boss`：这手牌别人压不住（用 `ddCanBeBeaten` 判断）。
    - `why`：一句中文理由，教练直接显示。
  - `ddBotPlay(info)`：取 `ddEvalMoves` 排第一的出法。性格只在分数相差很小时起作用：`aggro` 更早出炸弹，`team` 更愿意让队友的牌。已有的电脑测试必须全部继续通过。
  - `ddKickers`：凑翅膀时，单张不够可以把一个对子拆成两张单牌。
  - `ddBotTurn` 把 `S.dd.out` 作为 `out` 传给 `ddBotPlay`。
  - `ddBotTurn`：`ddAct` 没有接受电脑的出法时（`S.toAct` 没变），改为「不要」；首出时改为出 `ddMoves` 的第一手。不能让牌局卡住。

打分规则，按优先级从高到低（权重由实现者决定，但必须通过下面的测试）：
1. 能一次出完就出完。
2. 剩下两手时，先出别人压不住（`boss`）的那手，这样能保住出牌权，下一手出完。
3. 一般情况：剩余手数越少越好；手数一样时，先出点数小的。
4. 队友、拦地主、炸弹的规则沿用第 1 步：
   - 不压队友的牌；
   - 队友只剩 1 到 2 张时送牌；
   - 地主快出完时用最大的牌拦；
   - 下家对手只剩 1 到 2 张时，不出他能接的单张或对子；
   - 炸弹只在对手剩不到 5 张、或者炸完自己剩不超过 2 手时出。

- [ ] **Step 1: 写失败的测试**

```js
const ev=(hand,prev,o={})=>ddEvalMoves({hand,prev,me:1,landlord:0,counts:{0:10,1:hand.length,2:10},arch:DD_ARCH.safe,out:[],...o});
// 剩两手时先出别人压不住的：A、2、王都出完了，3 到 Q 每个点数也各出过一张（谁都凑不出炸弹），K 对就压不住了
{const out=[...[0,1,2,3,4,5,6,7,8,9].map(r=>r*4+3),...C('A A A A 2 2 2 2 小王 大王')];const top=ev(C('K K 3'),null,{out})[0];eq(top.cards.map(ddRank),[10,10],'先出压不住的 KK');ok(top.boss);}
// 同样的牌，A 对还没出：KK 压得住，先出小的 3
{const top=ev(C('K K 3'),null,{out:[]})[0];eq(top.cards.map(ddRank),[0],'没有把握时先出小牌');}
// 有上家时，结果里有「不要」
ok(ev(C('5 K'),{cls:ddClassify(C('4')),pid:0}).some(m=>m.cards===null),'有「不要」');
ok(ev(C('5 K'),{cls:ddClassify(C('4')),pid:0}).every(m=>typeof m.why==='string'&&m.why.length>0),'每个出法都有理由');
// 首出时结果里没有「不要」
ok(ev(C('5 K'),null).every(m=>m.cards!==null),'首出没有「不要」');
// 翅膀可以拆对子
ok(ddMoves(C('8 8 8 9 9 9 4 4 K'),ddClassify(C('5 5 5 6 6 6 7 10'))).length>0,'对子拆成两张单牌当翅膀');
// ddBotTurn 兜底：打桩 ddBotPlay 返回非法的牌，牌局仍然往下走（在 flow 上下文里）
```

`ddBotTurn` 兜底的测试：在 flow 上下文里，把 `ddBotPlay` 临时换成返回 `[999]`，跑完计时器，期望这一局能正常结束，并且没有抛出异常。

- [ ] **Step 2: 运行，确认失败**

Run: `node tools/ddz-test.js`
Expected: 新增测试失败

- [ ] **Step 3: 实现 `ddEvalMoves`，改写 `ddBotPlay`，修改 `ddKickers` 和 `ddBotTurn`**

- [ ] **Step 4: 运行，确认通过，并测地主胜率**

Run: `node tools/ddz-test.js`
Expected: `… passed, 0 failed`

再用会话临时目录里的统计脚本（3000 局全电脑对局，和第 1 步用的一样）记录两个数，写进提交说明，不设硬性目标：
- 随机指定地主时的地主胜率（第 1 步是 50.9%）；
- 正常叫地主时的地主胜率（第 1 步是 67.8%）。

- [ ] **Step 5: 提交**

```bash
git add js/games/doudizhu.js js/games/doudizhu-coach.js tools/ddz-test.js
git commit -m "斗地主：出法打分（保住出牌权、先出压不住的牌），电脑改用同一套评估"
```

---

### Task 3: 教练建议和点评

**Files:**
- Modify: `js/games/doudizhu-coach.js`
- Test: `tools/ddz-test.js`

**Interfaces:**
- Consumes: `ddEvalMoves`、`ddStrength`、`ddSplit`、`ddUnseen`、`ddLordBottom`
- Produces:
  - `const DD_COACH={bid:6,rob:8.5,dbl:10}`：教练用的门槛，**【计划的决定】**取在三种电脑性格之间。
  - `ddAdvise(v) -> a`：`v` 是一个座位的视图，必须轮到这个座位，并且 `stage` 是 `bid`、`double` 或 `play`。返回：
    ```
    {game:'ddz', stage, hand: v.handNo, rec, why, strength, hands, bombs, counts, unseen, lordBottom, alts}
    ```
    - `rec` 是下面四种之一：
      - `{type:'bid', kind:'call'|'rob', yes:boolean}`
      - `{type:'double', yes:boolean}`
      - `{type:'play', cards:number[]}`
      - `{type:'pass'}`
    - `alts`：出牌阶段取 `ddEvalMoves` 排名前 3 的出法，其他阶段为 `[]`。
    - `why` 要说出依据。叫抢和加倍阶段写强度、炸弹数、拆完的手数、大王 / 小王 / 2 的张数，例如「你有 2 个炸弹、拆完 6 手，大牌有大王和两张 2，建议抢」。出牌阶段写 `ddEvalMoves` 第一名的 `why`。
  - `ddRecLabel(rec) -> string`：返回「叫地主 / 不叫 / 抢地主 / 不抢 / 加倍 / 不加倍 / 不要」，出牌时返回 `ddPlayText(cls)` 加上牌面，例如「顺子（3 4 5 6 7）」。
  - `ddGrade(a, act) -> {g:'good'|'ok'|'minor'|'mistake', note:string, extra:number}`
    - `act` 是 `{type:'bid'|'double', yes}`、`{type:'play', cards}` 或 `{type:'pass'}`。
    - `extra`：比建议多出来的剩余手数，不会小于 0。结算页「损失」一栏用它，单位是「手」。

点评规则：
- 和建议一样，评 `good`。
- 叫抢、加倍和建议不一样时，看手牌强度离门槛有多远：差距小于 2 评 `ok`，否则评 `minor`。
- 出了牌、建议也是出牌、但出的不一样时：
  - `extra` 为 0，评 `ok`；
  - `extra` 为 1，评 `minor`，`note` 写「多拆出 1 手」；
  - `extra` ≥ 2，评 `mistake`。
- 建议出牌、你却「不要」时：
  - 上家是对手，并且他剩不超过 5 张：评 `mistake`，`note` 写「对手快出完了，该压不压」；
  - 其他情况评 `minor`。
- 建议「不要」、你却出了牌时：
  - 上家是队友：评 `minor`，`note` 写「压了队友的牌」；
  - 你出的是炸弹，而建议不出炸弹：评 `minor`，`note` 写「炸弹用早了」；
  - 其他情况评 `ok`。

- [ ] **Step 1: 写失败的测试**

```js
const V0=(o)=>({handNo:3,me:1,toAct:1,phase:'playing',players:[{cards:new Array(o.c0||17).fill(null)},{cards:o.hand},{cards:new Array(o.c2||17).fill(null)}],
  dd:{stage:o.stage||'play',landlord:o.lord??0,ask:o.ask||null,lead:o.lead||null,out:o.out||[],bottom:o.bottom||[null,null,null],dbl:{},mult:1}});
{const a=ddAdvise(V0({stage:'bid',lord:-1,ask:{pid:1,kind:'call'},hand:C('小王 大王 2 2 2 A A K 9 9 8 7 6 5 4 3 3')}));eq(a.rec,{type:'bid',kind:'call',yes:true});ok(/炸弹|大王|手/.test(a.why),'叫地主有理由');}
{const a=ddAdvise(V0({stage:'bid',lord:-1,ask:{pid:1,kind:'call'},hand:C('3 4 5 7 8 9 10 J 3 4 6 8 9 J Q 5 6')}));eq(a.rec.yes,false);}
{const a=ddAdvise(V0({hand:C('5 K'),lead:{pid:0,cls:ddClassify(C('4')),cards:C('4')}}));eq(a.rec.type,'play');eq(a.rec.cards.map(ddRank),[2]);ok(a.alts.length>=2);}
eq(ddRecLabel({type:'bid',kind:'rob',yes:false}),'不抢');
eq(ddRecLabel({type:'play',cards:C('3 4 5 6 7')}),'顺子（3 4 5 6 7）');
// 点评
{const a=ddAdvise(V0({hand:C('5 K'),lead:{pid:0,cls:ddClassify(C('4')),cards:C('4')}}));
 eq(ddGrade(a,{type:'play',cards:a.rec.cards}).g,'good');
 eq(ddGrade(a,{type:'pass'}).g,'minor','地主还有 17 张，不压只算小偏差');}
{const a=ddAdvise(V0({hand:C('5 K'),c0:3,lead:{pid:0,cls:ddClassify(C('4')),cards:C('4')}}));eq(ddGrade(a,{type:'pass'}).g,'mistake','地主只剩 3 张，该压不压');}
{const a=ddAdvise(V0({hand:C('3 4 5 6 7 9'),lead:{pid:2,cls:ddClassify(C('8')),cards:C('8')}}));eq(a.rec.type,'pass');
 const g=ddGrade(a,{type:'play',cards:C('9')});eq(g.g,'minor');ok(/队友/.test(g.note),'压了队友');
 eq(ddGrade(a,{type:'pass'}).g,'good','队友的牌不要是对的');}
{const a=ddAdvise(V0({hand:C('3 4 5 6 7 9'),lead:null}));const g=ddGrade(a,{type:'play',cards:C('5')});ok(g.extra>=1&&g.g==='mistake','拆散顺子多出手数');}
```

- [ ] **Step 2: 运行，确认失败**

Run: `node tools/ddz-test.js`
Expected: 报错 `ddAdvise is not defined`

- [ ] **Step 3: 实现 `DD_COACH`、`ddAdvise`、`ddRecLabel`、`ddGrade`**

- [ ] **Step 4: 运行，确认通过**

Run: `node tools/ddz-test.js`
Expected: `… passed, 0 failed`

- [ ] **Step 5: 提交**

```bash
git add js/games/doudizhu-coach.js tools/ddz-test.js
git commit -m "斗地主：叫地主、加倍和出牌建议，决定点评"
```

---

### Task 4: 教练面板、提示按钮、记牌器、统计和结算页

**Files:**
- Modify: `js/games/doudizhu-coach.js`（界面部分）、`js/games/doudizhu.js`（`ddEnd`、`ddAct` 里的统计，以及 `ddRenderHand`、`ddRenderActions`）
- Modify: `js/ui.js`（`renderCoach`、`renderSession`、`renderSettle`、`humanAct`、点击事件）
- Modify: `css/app.css`
- Test: `tools/ddz-test.js`（统计字段）

**Interfaces:**
- Consumes: `ddAdvise`、`ddGrade`、`ddRecLabel`、`ddUnseen`、`ddLordBottom`
- Produces:
  - 每个玩家 `p.st` 新增的字段，在 `ddEnd` 和 `ddAct` 里更新：
    - `ddB`：自己打出的炸弹和王炸数；
    - `ddS`：自己在赢的一方、并且这局是春天或反春的局数；
    - `ddM`：自己参加的每局最终倍数之和。
    - 第 1 步已有的 `dd`、`ddL`、`ddLW`、`ddW` 保持不变。
  - `ddCoachHTML(v) -> string`：斗地主教练面板的内容。
  - `ddCounterHTML(v) -> string`：记牌器。
  - `ddHint()`：「提示」按钮的行为。
  - `ddSettleParts(m, ds) -> {stats: string, tips: string[], review: string}`：结算页里斗地主的三块。

- [ ] **Step 1: 统计字段的测试先失败**

在 flow 测试的 200 局里断言：
- 所有玩家 `ddB` 之和，等于每局 `S.dd.bombs + S.dd.rockets` 累加之和；
- 每个玩家 `ddM ≥ dd`（倍数至少是 1）；
- `ddS` 不超过 `ddW`。

Run: `node tools/ddz-test.js`
Expected: 新断言失败

- [ ] **Step 2: 实现统计字段，确认测试通过**

Run: `node tools/ddz-test.js`
Expected: `… passed, 0 failed`

- [ ] **Step 3: 实现界面**

- **教练面板**（`renderCoach` 的斗地主分支调用 `ddCoachHTML`）：
  - 教练开着、轮到你、并且是「实时」模式：
    - 显示建议（`ddRecLabel`）、理由，以及「手牌强度 / 拆完手数 / 炸弹数」三个数；
    - 出牌阶段再列出前 3 名出法和各自的理由。
  - 「先决定再看建议」模式：轮到你时只提示「先自己决定」。
  - 显示上一个决定的点评，格式和德州一样：「上一个决定 · 第 N 局 · 阶段」，加上评分、你的动作、建议和 `note`。
  - 记牌器（`ddCounterHTML`）：
    - 按 大王、小王、2、A……3 列出每个点数还剩几张在别人手里，0 张的变灰；
    - 下面一行写「地主手里确定有：…」，内容是 `ddLordBottom`，为空时不显示这行。
  - 报单报双提醒：出牌阶段有对手只剩 1 或 2 张时，面板顶部用红色写「⚠ 地主只剩 1 张」，或「⚠ 农民 XX 只剩 2 张」。
- **提示按钮**：
  - 出牌阶段的操作区多一个「提示」按钮，只在教练开着时显示。
  - 每按一次，把 `DSEL` 设成下一手可以出的牌：第一手是教练推荐（推荐「不要」时跳过），之后按 `ddMoves` 的顺序，到最后一手后回到第一手。
  - 换了上家的牌，或者到了新的一局，重新从第一手开始。
  - 没有能出的牌时，按钮不可点，提示写「没有能压过上家的牌」。
- **推荐高亮**：教练开着、「实时」模式、轮到你、建议出牌时，手牌里推荐的那几张加 `rec` 类（绿色描边）；操作区里推荐的按钮加现有的 `is-rec` 类。
- **记录决定**：`humanAct` 的斗地主分支在执行动作之前：
  - 先调用 `ddAdvise(V)` 和 `ddGrade`；
  - 把 `{...a, action: 动作文字, type, grade, note, extra, recText, lossBB: 0}` 放进 `T.decisions`，同时设为 `T.last`；
  - 教练关着也要记录，赛后复盘要用。
- **我的统计**（`renderSession`）：
  - 盈亏（倍底分）；
  - 当地主：次数和胜率；
  - 当农民：次数和胜率；
  - 炸弹数；
  - 春天次数；
  - 平均倍数；
  - 决策正确率（`good` 加 `ok` 占全部决定的比例）。
- **结算页**（`renderSettle` 的斗地主分支调用 `ddSettleParts`）：
  - 顶部统计换成和「我的统计」相同的 6 项。
  - 「改进建议」根据 `T.decisions` 生成，下面这几条按次数出现：
    - 「有 N 次对手快出完了你没压」；
    - 「有 N 次压了队友的牌」；
    - 「有 N 次出牌多拆出了手数，共多出 M 手」；
    - 「有 N 次炸弹用早了」；
    - 当地主胜率低于 40% 并且当地主至少 5 次时：「叫地主偏激进，手牌一般时可以让给别人」。
  - 「决策评分」面板：显示四种评分的个数，再列出 `extra` 最大的 5 个决定，列为：局、阶段、你、建议、多出手数、评价。
- **规则面板**：`ddRulesHTML` 末尾加一节「教练怎么算」：
  - 手牌强度怎么算；
  - 拆牌和手数是什么意思；
  - 「压不住的牌」是什么意思；
  - 记牌器只用公开信息。
- **CSS**：
  - `.dd-row .card.rec`：绿色描边；
  - `.dd-counter`：一行可以横向滚动的小格子；
  - `.dd-warn`：红色提醒；
  - 手机竖屏和横屏下，教练抽屉里的内容不能横向溢出。

- [ ] **Step 4: 浏览器检查**

在会话临时目录里写 CDP 脚本，用本地 http 服务打开页面，单机斗地主：
- 轮到你时，教练面板有建议；
- 按「提示」后，`DSEL` 依次变成不同的合法出法，并且每一手都能压过上家；
- 选「先决定再看建议」时，轮到你只显示提示，出牌后显示点评；
- 打完 3 局后结算，「决策评分」里的决定数等于你做过的决定数，改进建议不为空。

再验证教练被关闭的情况：单机里没有关闭教练的开关，所以直接把视图的 `cfg.coach=false` 再 `render()`。期望提示按钮、推荐高亮、记牌器都不出现，但 `T.decisions` 照常增加。

Expected：以上全部成立，页面没有报错。

- [ ] **Step 5: 规则测试不回退**

Run: `node tools/ddz-test.js`
Expected: `… passed, 0 failed`

- [ ] **Step 6: 提交**

```bash
git add js/games/doudizhu.js js/games/doudizhu-coach.js js/ui.js css/app.css tools/ddz-test.js
git commit -m "斗地主：教练面板、提示按钮、记牌器、报单报双提醒、统计和结算页"
```

---

### Task 5: 回归、布局检查和收尾

**Files:**
- Modify: `sw.js`（缓存清单加 `./js/games/doudizhu-coach.js`，`dushen-v8` → `dushen-v9`）、`README.md`（目录说明）

- [ ] **Step 1: 更新缓存清单和 README，确认打包成功**

Run: `python3 tools/bundle.py && grep -c "doudizhu-coach.js" ../赌神智慧树.html`
Expected: 打包成功，输出 `1`

- [ ] **Step 2: 斗地主布局和自动对打**

在 873×393、800×360、393×873、360×780 和电脑 1280×800 下打斗地主，提示按钮出现以后：
- 座位、出牌区、中心区、手牌区、操作区两两重叠不超过 2px；
- 手机页面不上下滚动；
- 每张手牌露出的宽度 ≥ 14px；
- 打开教练抽屉时，内容不横向溢出；
- 筹码守恒，页面没有报错。

- [ ] **Step 3: 德州和炸金花回归**

和第 1 步一样，跑德州、炸金花的布局检查、聊天检查和互联网房间（房主 + 客人）。

Expected：结果和 `main` 一致，没有报错。

- [ ] **Step 4: 提交并推送**

```bash
git add sw.js README.md
git commit -m "斗地主第 2 步：缓存清单、README"
git push -u origin feat/ddz-step2
```
