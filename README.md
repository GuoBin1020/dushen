# 赌神智慧树

德州扑克、炸金花和斗地主练习桌：单机对电脑，或互联网 / 局域网联机。只用虚拟筹码，仅供娱乐与学习。

## 目录

```
index.html               页面结构，按顺序加载下面的样式和脚本
css/app.css              全部样式
js/vendor/peerjs.min.js  PeerJS 1.5.4（MIT），互联网联机用
js/common.js             共用：常量、工具函数、电脑性格
js/games/holdem.js       德州：牌型、胜率、GTO 翻前范围、对手范围、教练、剥削建议、电脑、下注轮
js/games/zjh.js          炸金花：牌型、闷牌/看牌、比牌、电脑、教练、画像
js/games/doudizhu.js     斗地主：牌型、出牌枚举、拆牌、抢地主、结算、电脑、牌局流程、牌桌和手牌、联机座位交接、赖子模式
js/games/doudizhu-coach.js 斗地主教练：记牌、出法打分（电脑也用它）、建议、点评、教练面板、提示、结算页
js/engine.js             三种游戏共用的牌局：座位、筹码、底池、结算、统计、每个座位的视图
js/net-core.js           联机的公共部分：身份 ID、一房间一标签页、房间存档、离开房间
js/card.js               卡密：验证、本机保存、防止调回时间、解开加密的联机代码、输入卡密的弹窗
js/net-online.enc.js     联机核心（加密）：PeerJS、局域网连接码、房主和客人
js/vendor/nacl.min.js    TweetNaCl 1.0.3（公有领域），卡密签名和解密用
js/state.js              本机状态：我的视图、我的统计、本地设置
js/audio.js              音效、行动语音、按住说话的语音消息
js/ui.js                 界面：牌桌、操作、教练、聊天、大厅、结算、设置表单、事件
js/main.js               启动：刷新后恢复房间、注册离线缓存
manifest.webmanifest     添加到主屏幕的配置
sw.js                    离线缓存
icon-*.png               图标
tools/bundle.py          打包成单个 HTML 文件
tools/seal.mjs           作者用：把联机核心加密成 js/net-online.enc.js
tools/card-test.js       卡密测试：node tools/card-test.js
tools/ddz-test.js        斗地主规则和牌局流程测试：node tools/ddz-test.js
LICENSE                  使用许可：仅限非商业娱乐学习，禁止赌博和收费
```

脚本是普通 `<script>`（不是 ES 模块），共用一个全局作用域，所以直接双击 `index.html` 也能运行。
加载顺序有意义：后面的文件可以在运行时调用前面文件的函数。

## 运行

- 本地：直接用浏览器打开 `index.html`。
- 手机用语音、添加到主屏幕：需要 https，把整个文件夹上传到 GitHub Pages（仓库根目录放这些文件，Settings → Pages 选 main 分支 / root）。

## 打包成单个文件

```
python3 tools/bundle.py
```

生成 `../赌神智慧树.html`，样式和脚本都内嵌在里面，方便直接发给朋友。

## 素材来源

牌面、大小王、筹码、牌背和音效来自公共领域或 CC0 / Apache-2.0 素材，作者、网址、许可证和本项目所做的修改都写在 [assets/CREDITS.txt](assets/CREDITS.txt)。素材由 `tools/make-assets.mjs` 从原始文件生成。

## 使用声明

本游戏仅供朋友之间娱乐与学习。游戏里的积分（筹码）没有任何价值，不能充值、兑换或转让。

**禁止用于赌博或任何形式的金钱结算**，包括在游戏外按积分输赢转账、发红包。违反者自行承担全部法律责任，与本游戏作者无关。

第一次使用联机功能（创建或加入房间）时，需要先同意这份声明。完整条款见 [LICENSE](LICENSE)。

## 联机需要卡号和卡密

单机随便玩。联机（互联网和局域网）需要作者发给你的卡号和卡密：第一次创建或加入房间时输入，之后这台设备会记住，到期后需要新卡。卡密免费，不出售。

联机核心代码在仓库里只有加密版本（`js/net-online.enc.js`），用有效卡密里的密钥才能打开。
