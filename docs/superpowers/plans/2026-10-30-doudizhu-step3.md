# 斗地主 第 3 步：联机 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 斗地主可以在互联网房间和局域网里玩：固定 3 个座位，真人不够时由电脑补位；掉线时由电脑托管，重连后自动恢复；对局中途有人加入或彻底离开时，座位在下一局开始时由真人或电脑接替；聊天、语音、补码和统一结算都和德州、炸金花一样。

**Architecture:** 联机的消息流程不变：房主跑牌局，每个座位只收到自己的视图。改动集中在三处：
- `js/net.js`：房主收消息时，认识斗地主的动作；处理中途加入、彻底离开和恢复旧存档。
- `js/engine.js`：斗地主开局时把掉线的真人也算进座位（由电脑托管）；在开局前处理排队等座的人。
- `js/games/doudizhu.js`：座位交接，即真人换电脑、电脑换真人，两种情况都保留输赢记录。

客人端的教练记录改为「房主确认后才记」。

**Tech Stack:** 普通 `<script>`；Node（`vm`）里用假连接对象测房主收消息的逻辑；无界面 Chrome + PeerJS 公共服务做互联网房间的端到端测试，局域网用两个标签页互换连接码。

**Spec:** `docs/superpowers/specs/2026-10-30-doudizhu-design.md`（第 8 节、第 5.5 节的座位规则，对应第 12 节的第 3 步）

## Global Constraints

- 德州和炸金花的联机行为完全不变（设计文档第 4 节）。所有改动都要放在 `isD(S)` 或 `game==='ddz'` 分支里。
- 每个人只收到自己的手牌。别人的手牌只发张数；出过的牌、底牌和赖子点数对所有人公开。
- 斗地主固定 3 个座位，座位不能空着（设计文档 5.5）：
  - 电脑输光、没开补码，换一个新电脑；
  - 真人输光不补码，或者彻底离开，由一个新电脑顶上；
  - 中途有真人加入，在下一局开始时替换一个电脑；
  - 被换下的人或电脑，输赢记录都留在结算里。
- 断线（不是彻底离开）时座位保留：轮到他时等待现有的 `DISC_GRACE`（15 秒），之后由电脑代打；座位上标「托管中」；重连后恢复由本人操作。
- 房主开局前可以选「电脑补位」或「等满 3 个真人」，沿用现有的 `#f-aifill`。
- 新增或修改的 HTML 和 JS 不改变德州、炸金花的消息格式。

## Review Focus

1. **断线的真人没被算进下一局**：`startHand` 现有的过滤条件会排除掉线的人，斗地主就会因为凑不齐 3 人而停在「等待」。斗地主里掉线的真人必须照常发牌，由电脑托管。（测试放在 Task 1）
2. **中途加入变成第 4 个座位**：现有的加入逻辑会追加座位。斗地主里只能排队，等下一局开始时替换电脑；没有电脑可以替换时回复「房间已满」。（Task 1）
3. **客人发来的出牌数据不合法**：比如 `to` 不是数组、有重复、超过 20 张、混进字符串，都不能让房主抛异常，也不能让牌局卡住。（Task 1）
4. **同一个人反复离开又加入**：彻底离开后用同一个身份重新加入，应该排队等座，而不是被当作重连回到原座位；他原来的输赢记录留在结算里。（Task 1）
5. **客人端记录被房主拒绝的决定**：客人发出的动作如果房主没接受（局号不对、已经不是他出牌），不能出现在他的复盘里。（Task 2）

---

## File Structure

| 文件 | 改动 |
|---|---|
| `js/net.js` | `hostOnMsg`：斗地主动作的白名单和参数清洗；中途加入改为排队；`leave` 消息标记彻底离开；`hostStart` 斗地主不补电脑时至少 3 人；`restoreHost` 补齐旧存档缺的 `S.dd.out`；排队等座的客人收到等待消息 |
| `js/engine.js` | `startHand`：斗地主里掉线的真人也发牌；开局前调用 `ddSeatChanges()` |
| `js/games/doudizhu.js` | `ddSeatChanges()`、`ddReplaceHuman(p)`、`ddSeatWaiting(w)`；座位名字牌上标「托管中」 |
| `js/games/doudizhu-coach.js` | 客人端教练记录改成先挂起，房主确认后再记 |
| `js/ui.js` | 大厅和客人大厅里斗地主的说明；斗地主等座中的客人大厅；输光的真人旁边加「让电脑顶上」按钮（只有房主能看到）；`applyView` 里确认挂起的记录 |
| `index.html` | 「斗地主」按钮去掉 `data-modes="solo"`；删掉 `setMode` 里切回德州的那段 |
| `tools/ddz-test.js` | 新增第三个 Node 上下文，加载 `net.js`，用假连接测试房主收消息的逻辑 |
| `sw.js`、`README.md` | 缓存版本号 `dushen-v9` → `dushen-v10`；README 里「目前只有单机」改掉 |

开工前：第 2 步的 PR（`feat/ddz-step2`）合并进 `main` 以后，从最新的 `main` 拉新分支 `feat/ddz-step3`，把本计划作为第一个提交。如果第 2 步还没合并，先问用户。

---

### Task 1: 房主端：动作、座位交接、掉线托管、恢复存档

**Files:**
- Modify: `js/net.js`（`hostOnMsg`、`hostOnClose`、`hostStart`、`restoreHost`）
- Modify: `js/engine.js`（`startHand`）
- Modify: `js/games/doudizhu.js`
- Test: `tools/ddz-test.js`

**Interfaces:**
- Produces:
  - `S.ddWait: Array<{name, gender, cid, conn}>`：中途加入、正在排队等座的人，默认 `[]`。
  - `p.left: boolean`：真人发来 `leave` 消息，表示彻底离开。
  - `ddSeatChanges()`：斗地主每局开局前调用，按顺序做三件事：
    1. 彻底离开的真人（`p.left`）换成新电脑；
    2. 排队的人按加入顺序，各替换一个当前的电脑（座位号最小的先换）。没有电脑可以替换时，给他发 `{t:'full'}`；
    3. 被换下的人或电脑都进入 `S.gone`，输赢流向的重新编号和第 1 步的 `ddReplaceBot` 一样。新入座的真人用起始筹码，`rebuys:0`。
  - `ddReplaceHuman(p)`：把一个真人换成新电脑，规则同上，并关闭他的连接。
  - 等座的客人会收到 `{t:'lobby', …, wait:true}` 消息（字段和现有大厅消息相同），开局入座后正常收到 `state`。
  - 房主收到斗地主的 `act` 消息时：
    - `type` 必须是 `bid`、`double`、`play`、`pass` 之一；
    - `play` 的 `to` 必须是数组，长度 1 到 20，元素全部是整数，否则忽略这条消息；
    - 其他动作的 `to` 取 `Math.floor(+to || 0)`。
  - `ddTakeover(pid)`：房主点「让电脑顶上」时调用（房主本机的按钮，不是网络消息）。只对斗地主里输光、没有入座这一局的真人生效，内部调用 `ddReplaceHuman`，然后 `startHand()`。
  - `ddNormalizeSave(S)`：斗地主的存档缺 `S.dd.out`、`S.ddWait`、`S.gone` 时都补成 `[]`。`restoreHost` 在恢复斗地主存档时调用它。

- [ ] **Step 1: 写失败的测试**

`tools/ddz-test.js` 新建第三个上下文：加载 `common.js`、`holdem.js`、`zjh.js`、`doudizhu.js`、`doudizhu-coach.js`、`engine.js`、`net.js`。需要打桩：
- `sessionStorage`、`localStorage`：用内存对象；
- `crypto.randomUUID`；
- `show`、`renderLobby`、`renderGuestLobby`、`showBanner`、`flashBanner`、`lobbySync` 依赖的 `renderLobby`：空函数；
- 计时器：用和 flow 上下文一样的队列。

假连接：`mk=()=>({sent:[],closed:false,send(m){this.sent.push(m)},close(){this.closed=true;this.onclose&&this.onclose()}})`。

```js
// 房主 + 两个客人开一桌斗地主（不补电脑）
NET.role='host';NET.net='internet';
LOBBY={cfg:normalizeCfg({game:'ddz',base:20,stack:2000,aiFill:false,speed:'fast'}),humans:[{name:'房主',kind:'local',cid:'h'}]};
const g1=mk(),g2=mk();hostAttach(g1);hostAttach(g2);
hostOnMsg(g1,{t:'hello',name:'甲',cid:'c1'});hostOnMsg(g2,{t:'hello',name:'乙',cid:'c2'});
eq(LOBBY.humans.length,3);
hostStart();eq(S.players.length,3,'3 个座位');ok(S.players.every(p=>p.kind!=='ai'),'没有电脑');
// 每个客人只收到自己的手牌
{const v=g1.sent.filter(m=>m.t==='state').pop().v;ok(v.players[v.me].cards.every(c=>c!==null));ok(v.players.filter((p,i)=>i!==v.me).every(p=>p.cards.every(c=>c===null)),'看不到别人的牌');}
// 不合法的出牌数据：不抛异常，牌局不变
{const seq=S.ev&&S.ev.seq;let threw=false;
 try{for(const to of [null,'1,2',[],[1,1],new Array(21).fill(0),['x'],[1.5],{0:1}])hostOnMsg(g1,{t:'act',type:'play',to,hand:S.handNo});hostOnMsg(g1,{t:'act',type:'fold',hand:S.handNo})}catch(e){threw=true}
 ok(!threw,'不合法的数据不抛异常');eq(S.ev&&S.ev.seq,seq,'牌局没有变化');}
// 掉线：轮到他时等宽限期，然后电脑代打；下一局照常发牌
g1.close();ok(!P()[1].connected);
runAll();   // 跑完计时器，宽限期按计时器队列处理
ok(S.phase==='handover','掉线的人由电脑代打，这局打完');
startHand();eq(P()[1].inHand,true,'掉线的人下一局照常发牌');eq(S.dd.stage,'bid');
// 重连：同一个 cid，回到原座位
const g1b=mk();hostAttach(g1b);hostOnMsg(g1b,{t:'hello',name:'甲',cid:'c1'});ok(P()[1].connected&&NET.conns.get(1)===g1b,'重连回原座位');
// 中途加入：不增加座位，排队；下一局替换电脑
// （这里先让乙彻底离开：他的座位在下一局由电脑顶上，然后丙加入、再下一局替换那个电脑）
hostOnMsg(g2,{t:'leave'});ok(P()[2].left);
finishHand();startHand();eq(P()[2].kind,'ai','彻底离开的人由电脑顶上');ok(S.gone.some(x=>x.name==='乙'),'乙留在结算里');
const g3=mk();hostAttach(g3);hostOnMsg(g3,{t:'hello',name:'丙',cid:'c3'});
eq(S.players.length,3,'中途加入不增加座位');eq(S.ddWait.length,1);ok(g3.sent.some(m=>m.t==='lobby'&&m.wait),'丙收到等座消息');
finishHand();startHand();eq(P()[2].name,'丙','丙在下一局替换电脑');eq(P()[2].kind,'remote');eq(S.ddWait.length,0);
const g4=mk();hostAttach(g4);hostOnMsg(g4,{t:'hello',name:'丁',cid:'c4'});finishHand();startHand();
ok(g4.sent.some(m=>m.t==='full'),'没有电脑可以替换时房间已满');
// 乙用原来的身份回来：排队，不是重连
const g2b=mk();hostAttach(g2b);hostOnMsg(g2b,{t:'hello',name:'乙',cid:'c2'});ok(!P().some(p=>p.cid==='c2'&&p.connected)&&g2b.sent.some(m=>m.t==='full'||m.wait),'离开后回来不是重连');
// 客人输光：补码后照常入座；不补码时房主可以让电脑顶上
finishHand();P()[2].stack=0;P()[0].stack+=0;startHand();ok(['busted','waiting'].includes(S.phase),'等他补码');hostOnMsg(g3,{t:'rebuy'});eq(P()[2].stack,2000,'补码');ok(P()[2].inHand,'补码后入座');
finishHand();const st=P()[2].stack;P()[1].stack+=st;P()[2].stack=0;startHand();ddTakeover(2);eq(P()[2].kind,'ai','让电脑顶上');ok(g3.sent.some(m=>m.t==='full'));
// 筹码守恒（算上 S.gone）
ok(conserved(),'交接后筹码守恒');
// 旧存档缺字段：补齐后视图不报错
{const old=JSON.parse(JSON.stringify(S));delete old.dd.out;delete old.ddWait;delete old.gone;ddNormalizeSave(old);ok(Array.isArray(old.dd.out)&&Array.isArray(old.ddWait)&&Array.isArray(old.gone));S=old;let threw=false;try{viewFor(0)}catch(e){threw=true}ok(!threw,'恢复后视图不报错');}
```

上面的 `runAll`、`finishHand`、`conserved` 是测试里的小工具：
- `runAll`：跑完计时器队列，房主座位（座位 0）用 `ddBotTurn` 代替真人操作，客人座位也一样；
- `finishHand`：一直 `runAll`，直到 `S.phase==='handover'`；
- `conserved`：和 flow 测试里的定义相同。

德州和炸金花：用同样的假连接开一桌 4 人德州，中途有第 5 个人加入，断言仍然是追加座位（`S.players.length===5`），确认现有行为没变。

- [ ] **Step 2: 运行，确认失败**

Run: `node tools/ddz-test.js`
Expected: 新上下文里的测试失败（比如中途加入后座位变成 4 个、`ddSeatChanges is not defined`）

- [ ] **Step 3: 实现上面列出的接口**

- `startHand`：斗地主分支里，`live` 的过滤条件对掉线的真人放行；在计算 `live` 之前调用 `ddSeatChanges()`。
- `hostOnMsg`：
  - `hello`：对局中、斗地主、找不到可重连的座位时，放进 `S.ddWait` 并发送等座消息，不再追加座位。
  - `leave`：斗地主里设置 `p.left=true`，再关闭连接。重连判断要跳过 `p.left` 的座位。
  - `act`：斗地主走单独的白名单和参数清洗。
- `hostStart`：斗地主不补电脑时，少于 3 人提示「斗地主需要 3 名真人，或者勾选「空位由电脑补位」」。
- `ddProceed`：现有的「掉线等宽限期后电脑代打」保持不变。

- [ ] **Step 4: 运行，确认通过**

Run: `node tools/ddz-test.js`
Expected: `… passed, 0 failed`

- [ ] **Step 5: 提交**

```bash
git add js/net.js js/engine.js js/games/doudizhu.js tools/ddz-test.js
git commit -m "斗地主联机：房主端动作校验、中途加入排队、离开由电脑顶上、掉线托管"
```

---

### Task 2: 客人端和界面

**Files:**
- Modify: `index.html`、`js/ui.js`、`js/games/doudizhu.js`、`js/games/doudizhu-coach.js`、`css/app.css`
- Test: 浏览器检查（Step 3）

**Interfaces:**
- Consumes: Task 1 的等座消息 `{t:'lobby', wait:true}`、`ddTakeover(pid)`、`p.left`
- Produces:
  - `ddRecord(type, arg)`：
    - 房主和单机：照旧，立刻记录；
    - 客人：先放进 `T.ddPending = {rec, hand, type}`，不进 `T.decisions`。
  - `ddConfirmPending(v)`：在 `applyView` 里调用。
    - 新视图的 `ev` 是自己的、局号相同、动作类型对得上时，把挂起的记录放进 `T.decisions` 和 `T.last`；
    - 局号变了，或者已经轮到别人，丢掉挂起的记录。

界面要求：
- **设置表单**：
  - 「斗地主」按钮在「创建房间」里也显示；
  - 删掉 `setMode` 里「非单机切回德州」的那段；
  - 「加入房间」页面不显示游戏选择，和现在一样。
- **房主大厅**（`renderLobby`）：
  - 斗地主显示「斗地主 · 底分 X，封顶 Y 倍 · 固定 3 个座位」；
  - 座位行固定 3 行。
- **客人大厅**（`renderGuestLobby`）：
  - 斗地主的说明同上；
  - 收到 `wait:true` 时，把「等待房主开始对局…」换成「对局进行中，下一局开始时你会替换一个电脑入座。」
- **座位名字牌**：
  - 掉线的真人，`ddRole` 后面加「托管中」；
  - 等待文字沿用 `ddWaitText` 里现有的「掉线了，稍后由电脑代打」。
- **输光的真人**：
  - 斗地主联机里，有真人输光、牌局停在 `busted` 或 `waiting` 时，房主的操作区为每个输光的真人显示一个「让电脑顶上 XX」按钮（`data-act="ddtakeover" data-pid`），点击时调用 `ddTakeover(pid)`；
  - 输光的本人仍然看到现有的补码按钮；
  - 被顶替的客人收到 `{t:'full'}`，横幅文字改为「你的座位已由电脑顶上。」
- **CSS**：「托管中」用 `--warn` 颜色。

- [ ] **Step 1: 实现上面的界面和挂起记录**

- [ ] **Step 2: 规则测试不回退**

Run: `node tools/ddz-test.js`
Expected: `… passed, 0 failed`

- [ ] **Step 3: 浏览器端到端检查**

在会话临时目录写 CDP 脚本，用本地 http 服务和 PeerJS 公共服务，下面每个场景结束时都检查房主和客人页面没有报错：
1. **房主 + 2 个客人（不补电脑）**：
   - 打 3 局，房主和客人都由脚本代替操作；
   - 每个客人的视图里，别人的手牌全是 `null`；
   - 结束结算后，三个页面的「合计（应为 0）」都是 0。
2. **房主 + 1 个客人（补电脑）**：
   - 客人刷新页面：重连回原座位，教练记录还在；
   - 客人关掉标签页：轮到他时等宽限期后由电脑出牌，名字牌上显示「托管中」；
   - 客人用同一个邀请码重新加入：恢复由本人操作。
3. **中途加入**：
   - 房主 + 1 个客人 + 1 个电脑对局中，第 3 个标签页加入；
   - 他先看到等座提示，下一局开始时出现在原来电脑的座位上。
4. **挂起记录**：
   - 客人在不是自己出牌时，直接用 `NET.host.send` 发一个出牌；
   - 期望 `T.decisions` 没有增加。
5. **局域网冒烟测试**：
   - 两个标签页互换连接码，打 1 局；
   - 客人视图里看不到房主的牌。

Expected：以上全部成立，页面没有报错。

- [ ] **Step 4: 提交**

```bash
git add index.html js/ui.js js/games/doudizhu.js js/games/doudizhu-coach.js css/app.css
git commit -m "斗地主联机：创建房间、大厅、等座、托管标记、让电脑顶上，客人记录等房主确认"
```

---

### Task 3: 回归和收尾

**Files:**
- Modify: `sw.js`（`dushen-v9` → `dushen-v10`）、`README.md`（去掉「目前只有单机」）

- [ ] **Step 1: 更新缓存版本和 README，确认打包成功**

Run: `python3 tools/bundle.py`
Expected: 打包成功

- [ ] **Step 2: 回归**

在 873×393、800×360、393×873、360×780 和电脑 1280×800 下，跑这几项检查：
- 单机斗地主的布局检查；
- 德州、炸金花的布局检查和聊天检查；
- 德州的互联网房间（房主 + 客人）。

Expected：结果和 `main` 一致，没有报错。

- [ ] **Step 3: 提交并推送**

```bash
git add sw.js README.md
git commit -m "斗地主第 3 步：缓存版本、README"
git push -u origin feat/ddz-step3
```
