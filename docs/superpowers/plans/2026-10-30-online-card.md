# 联机卡密与联机代码加密 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 联机需要作者发放的卡号和卡密；联机核心代码在公开仓库里只有加密版本，用卡密里的密钥解密后才能运行；房主和客人互相检查卡密；最后用一个只含加密版本的干净提交重建公开仓库。

**Architecture:**
- **签名和加密**：都用打包进来的 TweetNaCl。卡密用 Ed25519 签名，联机代码用 secretbox 加密。
- **拆分 `js/net.js`**：
  - 明文的 `js/net-core.js`：单机也要用的部分；
  - 加密的 `js/net-online.enc.js`：联机核心。它的明文源码只存在本机的 `~/Downloads/dushen-private/`。
- **`js/card.js`**（新文件，明文）：
  - 验证卡密、本地保存卡、防止调回时间；
  - 解密联机代码，并以 `<script>` 的方式插入页面；
  - 卡号和卡密输入弹窗。
- **生成器**：独立的 HTML 文件，在 `Downloads` 下，不进仓库。

**Tech Stack:** 普通 `<script>`；TweetNaCl 1.0.3（公有领域许可）；Node 跑卡密测试和封装工具；无界面 Chrome + PeerJS 做端到端测试。

**Spec:** `docs/superpowers/specs/2026-10-30-online-card-design.md`

## Global Constraints

- 单机模式完全不变，不需要卡密。
- 公开仓库里不能出现：明文联机实现代码、私钥、K。
- 以下文件只放在 `~/Downloads/dushen-private/`，不进入任何 Git 仓库：
  - 明文联机代码 `net-online.js`；
  - `keys.json`；
  - 联机测试 `online-test.js`；
  - 完整仓库备份。
- 生成器 `~/Downloads/赌神卡密生成器.html` 不进仓库。
- 卡号：任意文字，最长 32 个字符，不能含换行和 `|`，首尾空格去掉。
- 卡密：`base64url(到期时间(4 字节，Unix 分钟数，大端) + K(32 字节) + Ed25519 签名(64 字节))`。签名的内容是 `dushen-card-v1|卡号|到期时间|K 的 base64url`。
- 防止调回时间：
  - localStorage 的 `dushen-clock` 记录这台设备见过的最晚时间；
  - 当前时间比它早 10 分钟以上时，卡暂时无效，提示「设备时间被调回」，但不删除保存的卡；
  - 输入新的有效卡时，把它重置为当前时间。
- 保存卡：
  - localStorage 的 `dushen-card` 里保存 `{no, secret, exp}`；
  - 只保留一张，输入新卡会覆盖旧的；
  - 页面打开时，发现已经过期就删除这条记录。
- 卡过期时，只允许恢复一场进行中的对局：本机的 `holdem-host` 或 `holdem-session` 存档的 `at` 早于卡的到期时间，并且距今不到 2 小时，才允许解密并恢复这个房间；不能新建或加入房间。
- 互相检查：
  - 客人的 `hello` 里带上 `card:{no, secret}`；
  - 房主用自己的设备时间判断客人的卡有没有过期。对局中重连回原座位的客人，卡过期也放行；新加入的人、排队等座的人，必须是有效的卡；
  - 无效时房主回复 `{t:'card-bad', why}` 并断开连接；
  - 房主在大厅消息和对局状态里带上 `hostCard:{no, secret}`，客人验证不通过就主动断开连接，并显示原因；
  - 大厅里每个玩家名字后面显示卡号，显示时要转义。
- 德州、炸金花、斗地主的联机行为，在持有有效卡时和现在完全一样。

## Review Focus

1. **不支持浏览器加密功能的环境**：没有 `crypto.subtle` 时（微信内置浏览器、直接打开文件），卡密验证和解密照样能用，因为全部走 TweetNaCl。（测试放在 Task 5）
2. **有效卡下的重连**：客人刷新、房主刷新、掉线后重连，都和现在一样能回到原座位，不会被要求重新输入卡密。（Task 4、Task 5）
3. **页面先于解密就调用了联机函数**：`main.js` 恢复房间、点击大厅按钮、`audio.js` 调用联机相关函数时，如果联机代码还没解密，不能抛异常。要么先解密再调用，要么跳过。（Task 4）
4. **卡号里有特殊字符**：卡号里的 `<`、`"`、表情和中文，在大厅显示、在消息里传输时都不会出错，也不会被注入 HTML。（Task 1、Task 5）
5. **重建仓库时把私密文件推了上去**：推送前检查要推送的内容，`keys`、私钥、`net-online.js` 明文、`function hostOnMsg` 都不能出现。（Task 6）

---

## File Structure

| 文件 | 位置 | 内容 |
|---|---|---|
| `js/vendor/nacl.min.js` | 公开仓库 | TweetNaCl 1.0.3 原版压缩文件，保留许可说明 |
| `js/card.js` | 公开仓库 | 卡密验证、保存、防止调回时间、解密并插入联机代码、输入弹窗；公钥常量 `CARD_PUB` |
| `js/net-core.js` | 公开仓库 | 从 `net.js` 拆出来的明文部分 |
| `js/net-online.enc.js` | 公开仓库 | `window.DUSHEN_SEALED={v:1,n:'…',ct:'…'}` |
| `tools/seal.mjs` | 公开仓库 | `node tools/seal.mjs <明文> <keys.json>`，生成 `js/net-online.enc.js` |
| `tools/card-test.js` | 公开仓库 | 卡密的 Node 测试，测试里自己生成临时密钥，不用真实密钥 |
| `js/net.js` | 删除 | 拆成上面两个文件 |
| `index.html`、`sw.js`、`tools/bundle.py`、`README.md` | 公开仓库 | 脚本加载顺序、缓存清单（版本 +1）、打包包含新文件、说明怎么拿到卡密 |
| `js/ui.js`、`js/main.js` | 公开仓库 | 联机前先确保有有效卡并解密；大厅显示卡号；刷新恢复前先解密 |
| `tools/ddz-test.js` | 公开仓库 | 去掉 online 部分 |
| `dushen-private/net-online.js` | 本机 | 联机核心明文（含互相检查卡密） |
| `dushen-private/keys.json` | 本机 | `{signPublic, signSecret, boxKey}`（base64url） |
| `dushen-private/online-test.js` | 本机 | 原来的联机测试，加上卡密检查的测试 |
| `dushen-private/make-card.mjs` | 本机 | 测试时生成卡密用 |
| `dushen-private/README.txt` | 本机 | 怎么改联机代码、怎么重新封装、怎么备份 |
| `dushen-private/dushen-full.bundle` | 本机 | 重建仓库前的完整 git 备份 |
| `Downloads/赌神卡密生成器.html` | 本机 | 生成器 |

开工前：第 2 点的 PR（`feat/no-gambling-notice`）合并后，从最新的 `main` 拉分支 `feat/online-card`。第 6 步会改变整个仓库，所以第 1 到第 5 步完成并验证之后才开始第 6 步。

---

### Task 1: TweetNaCl 和卡密核心

**Files:**
- Create: `js/vendor/nacl.min.js`、`js/card.js`（核心函数部分）、`tools/card-test.js`

**Interfaces:**
- Produces（`js/card.js`，不碰页面的部分要能在 Node 的 vm 里运行）：
  - `const CARD_PUB` 公钥（base64url）。本任务先放一个占位值，Task 2 换成真实公钥。
  - `b64u(bytes) -> string`、`unb64u(string) -> Uint8Array | null`：格式不对时返回 `null`，不抛异常。
  - `cardNormNo(no) -> string | null`：按 Global Constraints 的规则清理卡号，不合法时返回 `null`。
  - `cardMake(no, expMs, key, signSecret) -> secret`：只在测试和生成器里用。
  - `cardCheck(no, secret, {now, pub=CARD_PUB, clockMin=0}) -> {ok, exp, key, why}`，`why` 是下面之一：
    - `'bad-no'`、`'bad-format'`、`'bad-sign'`：卡号或卡密不对；
    - `'expired'`：已过期；
    - `'clock'`：设备时间被调回（`now < clockMin - 10 分钟`）。
  - `cardWhyText(why) -> string`：中文提示，比如「卡号或卡密不对」「卡密已于 X 到期」「设备时间被调回，请把时间改对」。
  - `sealOpen(sealed, key) -> string | null`：解密，失败返回 `null`。
  - `sealMake(src, key) -> {v, n, ct}`：封装工具和测试用，每次随机生成 nonce。

- [ ] **Step 1: 下载 TweetNaCl**

从 npm 下载 `tweetnacl@1.0.3` 的 `nacl.min.js`，约 32KB，放进 `js/vendor/`，文件开头保留许可说明。下载前告诉用户文件名、来源和大小。

- [ ] **Step 2: 写失败的测试** `tools/card-test.js`（用 vm 加载 `nacl.min.js` 和 `card.js`）

```js
const kp=nacl.sign.keyPair(),K=nacl.randomBytes(32),pub=b64u(kp.publicKey),now=Date.now(),day=864e5;
const s=cardMake('阿杰<1>',now+7*day,K,kp.secretKey);
{const r=cardCheck('阿杰<1>',s,{now,pub});ok(r.ok&&r.key.length===32&&Math.abs(r.exp-(now+7*day))<60e3,'有效');}
eq(cardCheck('阿杰<2>',s,{now,pub}).why,'bad-sign','改卡号失效');
{const b=unb64u(s);b[2]^=1;eq(cardCheck('阿杰<1>',b64u(b),{now,pub}).why,'bad-sign','改有效期失效');}
{const b=unb64u(s);b[10]^=1;eq(cardCheck('阿杰<1>',b64u(b),{now,pub}).why,'bad-sign','改 K 失效');}
eq(cardCheck('阿杰<1>',s,{now:now+8*day,pub}).why,'expired');
eq(cardCheck('阿杰<1>',s,{now,pub,clockMin:now+3600e3}).why,'clock','时间被调回');
ok(cardCheck('阿杰<1>',s,{now,pub,clockMin:now+5*60e3}).ok,'差 5 分钟不算调回');
for(const bad of ['','x','!!!',s.slice(0,40),s+'AA'])eq(cardCheck('阿杰<1>',bad,{now,pub}).ok,false,'格式不对 '+bad.length);
eq(cardNormNo('  a|b '),null);eq(cardNormNo('x'.repeat(33)),null);eq(cardNormNo(' 小美 😀 '),'小美 😀');
{const sealed=sealMake('var X=1;',K);eq(sealOpen(sealed,K),'var X=1;');eq(sealOpen(sealed,nacl.randomBytes(32)),null);eq(sealOpen({v:1,n:'@@',ct:'@@'},K),null);}
{const a=sealMake('x',K),b=sealMake('x',K);ok(a.n!==b.n,'每次 nonce 不同');}
```

- [ ] **Step 3: 运行，确认失败**

Run: `node tools/card-test.js`
Expected: 报错 `cardMake is not defined`

- [ ] **Step 4: 实现** `js/card.js` 的上述函数（全部用 `nacl`，不用 `crypto.subtle`）

- [ ] **Step 5: 运行，确认通过**

Run: `node tools/card-test.js`
Expected: `… passed, 0 failed`

- [ ] **Step 6: 提交**

```bash
git add js/vendor/nacl.min.js js/card.js tools/card-test.js
git commit -m "卡密：TweetNaCl，卡密签名验证、防止调回时间、联机代码解密"
```

---

### Task 2: 密钥、生成器和封装工具

**Files:**
- Create（本机）：`dushen-private/keys.json`、`dushen-private/make-card.mjs`、`dushen-private/README.txt`、`Downloads/赌神卡密生成器.html`
- Create（仓库）：`tools/seal.mjs`
- Modify：`js/card.js`（把 `CARD_PUB` 换成真实公钥）

**Interfaces:**
- `keys.json`：`{signPublic, signSecret, boxKey}`，都是 base64url，用 `nacl.sign.keyPair()` 和 `nacl.randomBytes(32)` 生成，只生成一次。
- 生成器页面：
  - 自带内联的 `nacl.min.js`、`card.js` 的核心函数，以及 `keys.json` 的内容；
  - 功能：
    - 生成：输入卡号，有效期选「天数」或「到期日期和时间」，生成后卡号、卡密各带一个复制按钮；
    - 验证：粘贴卡号和卡密，显示是否有效、什么时候到期；
    - 生成记录：保存在生成器自己的 localStorage，列出卡号、到期时间、生成时间，可以删除记录；
  - 页面顶部醒目提示：「这个文件里有私钥，不要分享；丢失后无法再生成卡密，请备份」。
- `tools/seal.mjs`：用法是 `node tools/seal.mjs <明文> <keys.json>`。它读 `boxKey`，调用 `card.js` 的 `sealMake`，写出 `js/net-online.enc.js`；不打印任何密钥。
- `make-card.mjs`：`node make-card.mjs <卡号> <天数>`，输出卡密，测试用。

- [ ] **Step 1: 生成密钥和生成器；把 `CARD_PUB` 改成 `keys.json` 里的公钥**

- [ ] **Step 2: 检查**

```bash
node ~/Downloads/dushen-private/make-card.mjs 测试卡 1
```

Expected：输出约 134 个字符的卡密。用 `card-test.js` 里的 `cardCheck`（默认公钥）验证它，结果有效。

在浏览器里打开生成器，生成一张卡，复制出来，再用验证功能检查，结果有效。

另外确认：`grep -r signSecret` 和 `grep -r boxKey`（在 `dushen` 仓库目录里）没有匹配。

- [ ] **Step 3: 提交**（只提交仓库里的文件）

```bash
git add js/card.js tools/seal.mjs
git commit -m "卡密：公钥和联机代码封装工具"
```

---

### Task 3: 拆分 `net.js` 并加密联机核心

**Files:**
- Create：`js/net-core.js`、`dushen-private/net-online.js`、`js/net-online.enc.js`（由 `seal.mjs` 生成）、`dushen-private/online-test.js`
- Delete：`js/net.js`
- Modify：`index.html`（加载顺序见下）、`sw.js`、`tools/bundle.py`（如果它按标签收集脚本，确认能打包新文件）、`tools/ddz-test.js`（去掉 online 部分，搬到 `online-test.js`）

**Interfaces:**
- 脚本加载顺序：`peerjs.min.js` → `nacl.min.js` → `common.js` → 各游戏文件 → `engine.js` → `net-core.js` → `card.js` → `net-online.enc.js` → `state.js` → `audio.js` → `ui.js` → `main.js`。
- `net-core.js` 包含设计文档 5 节列出的明文部分。凡是 `ui.js`、`engine.js`、`audio.js` 和各游戏文件在单机路径里会调用的东西，都必须在这里或者有空实现。
- `net-online.js` 包含其余全部，执行后在全局定义原来的联机函数。
- `card.js` 新增 `onlineReady() -> boolean`：联机代码是否已经解密加载。

- [ ] **Step 1: 拆分**

把 `net-online.js` 写到本机目录，然后运行：

```bash
node tools/seal.mjs ~/Downloads/dushen-private/net-online.js ~/Downloads/dushen-private/keys.json
```

- [ ] **Step 2: 单机回归**

Run: `node tools/ddz-test.js && node tools/card-test.js`
Expected: 全部通过

用无界面 Chrome 跑单机的德州、炸金花和斗地主，在 4 种手机尺寸和电脑上检查布局。Expected：结果和拆分前一样，没有报错。

- [ ] **Step 3: 联机测试移到本机**

Run: `node ~/Downloads/dushen-private/online-test.js`
Expected: 原来的 59 项全部通过。这个测试直接加载本机的明文 `net-online.js`，再加上 `net-core.js` 等公开文件。

- [ ] **Step 4: 确认仓库里没有联机实现代码**

Run: `grep -rn "function hostOnMsg\|function guestOnMsg\|function openHostPeer" --include=*.js --include=*.html . | grep -v docs/`
Expected: 没有输出

- [ ] **Step 5: 提交**

```bash
git add -A js index.html sw.js tools
git commit -m "联机核心改为加密存放：拆出 net-core.js，联机代码只有加密版本"
```

---

### Task 4: 联机前要卡，刷新恢复前先解密，房主和客人互相检查

**Files:**
- Modify：`js/card.js`（界面部分）、`js/ui.js`、`js/main.js`、`dushen-private/net-online.js`（互相检查，然后重新封装）、`css/app.css`
- Test：`dushen-private/online-test.js`

**Interfaces:**
- `ensureOnline() -> Promise<boolean>`（在 `card.js`）：
  - 已经加载了联机代码，直接返回 `true`；
  - 本机保存的卡有效，就解密、插入页面，返回 `true`；
  - 否则弹出输入框，输入卡号和卡密；验证失败时在输入框里显示 `cardWhyText`，不关闭；
  - 验证成功后保存卡、重置 `dushen-clock`、解密，返回 `true`；点取消返回 `false`。
- `cardForRestore() -> boolean`：页面打开时调用，按 Global Constraints 里「过期后只允许恢复一场对局」的规则，判断能不能解密来恢复房间。
- `myCard() -> {no, secret} | null`：当前有效的卡，用来放进 `hello` 和 `hostCard`。
- `ui.js` 的 `submitSetup`：在联机确认弹窗之后，先 `await ensureOnline()`；返回 `false` 时停下，提示「需要卡号和卡密才能联机」。
- `main.js`：恢复房间之前，先判断 `onlineReady() || (cardForRestore() && await 解密)`。条件不满足时不恢复，并清掉 `holdem-session` 和 `holdem-host`。
- `net-online.js`：
  - `hello` 带 `card`；
  - 房主在 `hostOnMsg` 的 `hello` 分支里调用 `cardCheck`，重连回原座位的客人放行；
  - 大厅消息和 `state` 带 `hostCard`，客人收到后验证；
  - 新消息 `card-bad`；
  - 大厅玩家行显示卡号（用 `esc`）。

- [ ] **Step 1: 在 `online-test.js` 里写失败的测试**（用 `make-card.mjs` 的逻辑生成测试卡）

```js
// 客人没有卡 → 房主回复 card-bad，客人不进大厅
// 客人的卡过期 → card-bad，why === 'expired'
// 客人有有效卡 → 进入大厅，LOBBY.humans 里记下卡号
// 对局中断线，然后用过期的卡重连回原座位 → 放行
// 对局中的新加入者用过期的卡 → card-bad
// 房主的 hostCard 无效 → 客人主动断开连接（guestOnMsg 设置 NET.settled，并显示原因）
// 卡号是 '<img src=x>'：大厅消息里原样传输；renderLobby 生成的 HTML 里经过转义
```

- [ ] **Step 2: 运行，确认失败**

Run: `node ~/Downloads/dushen-private/online-test.js`
Expected: 新增测试失败

- [ ] **Step 3: 实现，重新封装**

- [ ] **Step 4: 运行，确认通过**

Run: `node ~/Downloads/dushen-private/online-test.js && node tools/card-test.js && node tools/ddz-test.js`
Expected: 全部通过

- [ ] **Step 5: 提交**

```bash
git add js css
git commit -m "联机前需要卡号和卡密；刷新恢复前先解密；房主和客人互相检查卡密"
```

---

### Task 5: 浏览器端到端测试和回归

- [ ] **Step 1: 用 CDP 脚本跑下面的场景**

在会话临时目录写 CDP 脚本，用 `make-card.mjs` 生成测试卡。每个场景都检查页面没有报错：
1. **单机**：不出现卡密弹窗。
2. **第一次联机**：
   - 弹出卡密输入框；
   - 输错时显示「卡号或卡密不对」，弹窗不关闭；
   - 输入过期的卡时显示到期时间；
   - 输对后能创建房间；
   - 刷新后不再要求输入；房主刷新后房间自动恢复。
3. **互联网房间（房主 + 2 个客人，各用不同的卡）**：
   - 大厅显示每个人的卡号；
   - 打 2 局，客人刷新后回到原座位；
   - 结算页合计为 0。
4. **客人的卡过期**：房主拒绝，客人看到原因。
5. **房主的卡被改坏**：在页面里篡改 `hostCard`，客人主动断开连接。
6. **没有 `crypto.subtle`**：用 `Page.addScriptToEvaluateOnNewDocument` 把 `crypto.subtle` 删掉后，完整跑一遍第 2 个场景。
7. **局域网**：房主和客人互换连接码，打 1 局。
8. **单文件**：用 `tools/bundle.py` 打包出来的 HTML，从 `file://` 打开，输入卡密后能创建房间。

- [ ] **Step 2: 回归**

在 4 种手机尺寸和电脑上，单机的德州、炸金花、斗地主（开和不开赖子）布局检查和聊天检查，结果和 `main` 一致。

- [ ] **Step 3: 全分支审阅，修复，推送分支**

```bash
git push -u origin feat/online-card
```

先推送一个分支，方便审阅和测试 GitHub Pages。注意：这个分支是在旧仓库里，旧历史里仍然有明文。

---

### Task 6: 重建公开仓库

**Files:** 整个仓库

- [ ] **Step 1: 完整备份**

```bash
cd ~/Downloads/dushen && git bundle create ~/Downloads/dushen-private/dushen-full.bundle --all
git bundle verify ~/Downloads/dushen-private/dushen-full.bundle
```

Expected: `… is okay`

- [ ] **Step 2: 准备干净的单个提交**

在临时目录里：
1. `git clone` 本机仓库，切到 `feat/online-card`（已经合并了第 2 点的 `main` 加上本功能）；
2. `git checkout --orphan clean`，然后 `git add -A`，再 `git commit -m "赌神智慧树"`（提交说明末尾带 Co-Authored-By）；
3. 在这个提交上检查：
   - `git grep -n "function hostOnMsg\|signSecret\|boxKey"` 没有输出；
   - 提交里没有 `js/net.js`；
   - 所有 HTML 文件里都没有明文联机代码。

- [ ] **Step 3: 用户确认后，在 GitHub 上删除并重建仓库**

告诉用户：
- 旧的 PR 记录会消失；
- 本机 `dushen` 文件夹的历史会换成这一个提交，旧历史保留在备份里。

**等用户明确同意。** 然后由用户自己在 GitHub 上：
1. 删除 `GuoBin1020/dushen`；
2. 用同一个名字新建一个公开仓库，不勾选初始化 README；
3. 告诉 Claude 已经建好。

- [ ] **Step 4: 用户确认后推送**

把 `clean` 推到新仓库的 `main`，然后让本机 `dushen` 文件夹的 `main` 对齐它：

```bash
git fetch
git switch -C main origin/main
```

请用户重新开启 GitHub Pages（Settings → Pages → main / root）。

- [ ] **Step 5: 线上验证**

- 打开 GitHub Pages 网页版：单机能玩；输入卡密后能创建房间，并且能和一个客人联机。
- 在新仓库里搜索 `hostOnMsg`，只出现在设计文档里，没有函数定义。

- [ ] **Step 6: 更新 `dushen-private/README.txt`**

写明以后怎么改联机代码：
1. 编辑 `dushen-private/net-online.js`；
2. 运行 `node tools/seal.mjs …` 重新封装；
3. 运行 `node online-test.js`；
4. 提交 `js/net-online.enc.js`。

再写明怎么备份 `dushen-private` 和生成器，以及 K 泄露时怎么换密钥。
