#!/usr/bin/env node
/* 红中麻将测试：node tools/hz-test.js
   页面脚本是共用全局作用域的普通 <script>，这里用 vm 按顺序跑在同一个上下文里。 */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..');
const ctx=vm.createContext({console,Math,Date,JSON,Set,Map,Object,Array,Number,String,Boolean});
for(const f of ['js/common.js','js/games/hongzhong.js','js/games/hongzhong-coach.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
const run=s=>vm.runInContext(s,ctx);
let passed=0,failed=0;
const show=x=>JSON.stringify(x);
const ok=(c,msg)=>{if(c)passed++;else{failed++;console.log('FAIL',msg||'')}};
const eq=(a,b,msg)=>{const A=show(a),B=show(b);if(A===B)passed++;else{failed++;console.log('FAIL',msg||'',' got',A,' want',B)}};
/* '1m2m3m 5p hz' -> tile ids; copies of a kind are handed out in turn (kind*4+copy), 红中 are 108..111 */
const H=s=>{const used={};return [...s.matchAll(/(\d)([msp])|hz/g)].map(m=>{const k=m[0]==='hz'?27:(+m[1]-1)+9*'msp'.indexOf(m[2]);const n=used[k]=(used[k]||0)+1;if(n>4)throw new Error('more than 4 of '+m[0]);return k===27?107+n:k*4+n-1})};
ctx.H=H;
const win=(s,melds='[]',o='{}')=>{const r=run(`hzWin(H(${show(s)}),${melds},${o})`);return r&&r.type};

/* ---------- Task 2: tiles, win shapes, shanten, claim legality ---------- */
eq(run('hzDeck().length'),112,'112 张');
eq(run('new Set(hzDeck()).size'),112,'每张不同');
eq(run('hzDeck().filter(id=>hzKind(id)===27).length'),4,'4 张红中');
eq(run('hzName(0)')+run('hzName(15)')+run('hzName(22)')+run('hzName(27)'),'一万七条五筒红中');
eq(run(`hzSort(H('hz 3p 1m 9s 2m')).map(hzKind)`),[0,1,17,20,27],'万条筒红中排序');

/* 平胡: any pair may be the eyes */
eq(win('1m2m3m 4m5m6m 7s8s9s 2p2p2p 5p5p'),'ping','平胡');
eq(win('1m2m3m 4m5m6m 7s8s9s 2p2p2p 9p9p'),'ping','任何对子都能做将');
eq(win('1m1m1m 2m3m4m 7s8s9s 2p2p2p 9p9p'),'ping','刻子加顺子');
/* 红中 as any tile */
eq(win('1m2m hz 4s5s6s 7p7p7p 1s1s1s 3m3m'),'ping','红中补顺子');
eq(win('1m2m3m 4s5s6s 7p7p hz 1s1s1s 3m hz'),'ping','红中补刻子和将');
eq(win('hz hz hz 4s5s6s 7p7p7p 1s1s1s 3m3m'),'ping','三张红中当一组');
/* 七对 */
eq(win('1m1m 2m2m 3s3s 4s4s 5p5p 6p6p 7p7p'),'qidui','七对');
eq(win('1m1m1m1m 2m2m 3s3s 4s4s 5p5p 6p6p'),'qidui','四张一样算两对');
eq(win('1m hz 2m2m 3s3s 4s4s 5p5p 6p6p 7p7p'),'qidui','红中补成对');
eq(win('1m1m 2m2m 3s3s 4s4s 5p5p',`[{t:'peng',ids:H('9p9p9p')}]`),null,'有副露不能算七对');
/* 四红中: only at the first action; when it is also 七对 the 七对 counts (scores higher) */
eq(win('hz hz hz hz 1m3m5m7m 2s4s6s 8s 3p5p','[]','{first:true}'),'sihz','起手四红中');
eq(win('hz hz hz hz 1m3m5m7m 2s4s6s 8s 3p5p'),null,'不是起手时四红中不算直接胡');
eq(win('hz hz hz hz 1m1m 2m2m 3s3s 4s4s 5p5p','[]','{first:true}'),'qidui','四红中又是七对时按七对');
/* not a win */
eq(win('1m2m4m 4m5m6m 7s8s9s 2p2p2p 5p5p'),null,'差一张');
eq(win('1m2m3m 4m5m6m 7s8s9s 2p2p 5p5p5p 1s'),null,'14 张但拆不开');
/* with melds: 4 tiles in hand + 3 melds */
eq(win('5p5p 7s8s9s',`[{t:'peng',ids:H('1m1m1m')},{t:'peng',ids:H('2s2s2s')},{t:'agang',ids:H('9m9m9m9m')}]`),'ping','副露后的平胡');
eq(run(`hzWin(H('1m2m hz 4s5s6s 7p7p7p 1s1s1s 3m3m'),[]).red`),1,'red 是手里红中张数');

/* 向听数 and waits */
eq(run(`hzShanten(H('1m2m3m 4m5m6m 7s8s9s 2p2p2p 5p'),[])`),0,'单钓听牌');
eq(run(`hzShanten(H('1m2m3m 4m5m6m 7s8s9s 2p2p 5p 8p'),[])`),1,'一向听');
eq(run(`hzShanten(H('1m2m3m 4m5m6m 7s8s9s 2p2p2p 5p 5p'),[])`),-1,'已经胡了');
eq(run(`hzShanten(H('1m2m3m 4m5m6m 7s8s9s 2p2p hz 8p'),[])`),0,'红中减一向听');
eq(run(`hzShanten(H('1m1m 2m2m 3s3s 4s4s 5p5p 6p6p 9s'),[])`),0,'七对听牌');
eq(run(`hzWaits(H('5m6m 1s2s3s 4s5s6s 7p8p9p 2p2p'),[])`),[3,6],'两面听 四万七万');
eq(run(`hzWaits(H('1m2m3m 4m5m6m 7s8s9s 2p2p2p 5p'),[])`),[22],'单钓五筒');
eq(run(`hzWaits(H('1m3m5m 7m9m 1s 3s5s7s 9s 1p 3p 5p'),[])`),[],'不听牌没有可胡的牌');

/* 碰 / 杠: 红中 never takes part; there is no 吃 in this game */
eq(run(`typeof hzChiOpts`),'undefined','没有吃牌');
eq(run(`hzCanPeng(H('7s7s 1m'),H('7s')[0])`),true,'碰');
eq(run(`hzCanPeng(H('7s hz 1m'),H('7s')[0])`),false,'红中不能凑碰');
eq(run(`hzCanPeng(H('hz hz 1m'),109)`),false,'红中不能被碰');
eq(run(`hzCanMGang(H('7s7s7s 1m'),H('7s')[0])`),true,'明杠');
eq(run(`hzAGangKinds(H('5m5m5m hz 1s'))`),[],'红中不能凑暗杠');
eq(run(`hzAGangKinds(H('hz hz hz hz 1s'))`),[],'四张红中不能杠');
eq(run(`hzAGangKinds(H('5m5m5m5m 1s'))`),[4],'暗杠五万');
eq(run(`hzBGangKinds(H('3p 1s'),[{t:'peng',ids:H('3p3p3p')}])`),[20],'补杠三筒');
eq(run(`hzBGangKinds(H('hz 1s'),[{t:'peng',ids:H('3p3p3p')}])`),[],'红中不能补杠');

/* ---------- Task 3: scoring ---------- */
const ids4=[0,1,2,3],rich={0:9999,1:9999,2:9999,3:9999};
eq(run(`hzPoints('ping',1,{hzNoRed:true})`),2,'平胡 2 分（有红中不加倍）');
eq(run(`hzPoints('qidui',1,{})`),4,'七对翻倍');
eq(run(`hzPoints('qidui',0,{hzNoRed:true})`),8,'七对加无红中 ×4');
eq(run(`hzPoints('ping',0,{hzNoRed:false})`),2,'没开无红中加倍');
eq(run(`hzPoints('sihz',4,{hzNoRed:true})`),2,'四红中按自摸平胡算');
eq(run(`hzPayout({w:0,from:null,pts:2,birds:2,base:1,ids:[0,1,2,3],stacks:${show(rich)}})`),{0:12,1:-4,2:-4,3:-4},'自摸平胡中 2 只鸟');
eq(run(`hzPayout({w:2,from:1,pts:4,birds:1,base:1,ids:[0,1,2,3],stacks:${show(rich)}})`),{0:0,1:-15,2:15,3:0},'点炮七对中 1 只鸟：一个人付 (4+1)×3');
eq(run(`hzPayout({w:0,from:null,pts:2,birds:0,base:10,ids:[0,1,2,3],stacks:${show(rich)}})`),{0:60,1:-20,2:-20,3:-20},'乘底分');
eq(run(`hzPayout({w:0,from:null,pts:2,birds:0,base:10,ids:[0,1,2,3],stacks:{0:0,1:5,2:9999,3:9999}})`),{0:45,1:-5,2:-20,3:-20},'筹码不够就付到 0 为止');
eq(run(`hzGangPay({t:'mgang',by:0,from:3,base:1,ids:[0,1,2,3],stacks:${show(rich)}})`),{0:3,1:0,2:0,3:-3},'明杠打牌的人付 3');
eq(run(`hzGangPay({t:'agang',by:1,from:null,base:1,ids:[0,1,2,3],stacks:${show(rich)}})`),{0:-2,1:6,2:-2,3:-2},'暗杠每家 2');
eq(run(`hzGangPay({t:'bgang',by:2,from:null,base:1,ids:[0,1,2,3],stacks:${show(rich)}})`),{0:-1,1:-1,2:3,3:-1},'补杠每家 1');
eq(run(`[106,108,0,17,52,5].map(hzBird)`),[true,true,true,true,true,false],'中鸟：1、5、9 和红中');

/* ---------- Task 3: the hand flow, run with the real engine and stubbed page / network ---------- */
const ectx=vm.createContext({console,Math,Date,JSON,Set,Map,Object,Array,Number,String,Boolean});
vm.runInContext(`var TIMERS=[];var setTimeout=(f)=>{TIMERS.push(f);return TIMERS.length};var clearTimeout=()=>{};
  var NET={role:'solo',conns:new Map()};function applyView(){}function hostSave(){}function voiceClear(){}function resetT(){}function onChat(){}var SETTLE_SEEN=null;function onSettle(m){SETTLE_SEEN=m}
  var LOCAL={mode:'live'},T={last:null,decisions:[]};function myTurn(){return false}function coachOn(){return true}`,ectx);
for(const f of ['js/common.js','js/games/holdem.js','js/games/zjh.js','js/games/doudizhu.js','js/games/doudizhu-coach.js','js/games/hongzhong.js','js/games/hongzhong-coach.js','js/engine.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ectx,{filename:f});
ectx.H=H;
const E=s=>vm.runInContext(s,ectx);
const CFG=o=>show(Object.assign({game:'hz',players:4,base:1,stack:2000,speed:'fast',rebuy:true,auto:false,aiFill:true,coach:true,hzDianpao:false,hzRedSelf:true,hzQiangGang:true,hzNoRed:false,hzBirds:2,turnSec:0},o||{}));
/* run timers; seat 0 is the only human and is played with the bot logic */
E(`function RUN(){for(let i=0;i<40000;i++){
  if(TIMERS.length){TIMERS.shift()();continue}
  if(S.phase==='playing'&&S.hz){const h=S.hz;
    if(h.stage==='turn'&&S.toAct===0){hzBotTurn(P()[0]);continue}
    if(h.stage==='claim'&&h.claim.opts[0]&&h.claim.ans[0]==null){hzBotClaim(P()[0]);continue}}
  if(S.phase==='busted'){doRebuy(P()[0]);continue}
  return true}return false}
  /* a fixed deal: hands[pid] as strings, the wall front-first, dealer 0 who has just drawn its 14th tile */
  function SETUP(cfg,hands,wall,melds){startGame(cfg,[{name:'你',kind:'local',gender:'m'}]);TIMERS.length=0;
    const h=S.hz;P().forEach((p,i)=>{p.cards=H(hands[i]||'')});h.wall=H(wall||'');h.melds={0:[],1:[],2:[],3:[]};Object.assign(h.melds,melds||{});
    h.discards={0:[],1:[],2:[],3:[]};h.river=[];h.claim=null;h.stage='turn';h.first={0:false,1:false,2:false,3:false};h.delta={0:0,1:0,2:0,3:0};
    S.toAct=0;h.drawn=P()[0].cards[P()[0].cards.length-1];return h}`);
const conserved=()=>E(`P().concat(S.gone||[]).reduce((a,p)=>a+p.stack-S.cfg.stack*(1+p.rebuys),0)`)===0;

/* 200 bot hands: every hand ends (win or draw), chips are conserved */
E(`startGame(${CFG()},[{name:'你',kind:'local',gender:'m'}])`);
eq(E('P().length'),4,'四个座位');eq(E('P()[0].cards.length+P()[1].cards.length+P()[2].cards.length+P()[3].cards.length+S.hz.wall.length'),112,'发牌后共 112 张');
eq(E('P()[S.dealer].cards.length'),14,'庄家 14 张');
let bad=0,wins=0,draws=0;
for(let h=0;h<200;h++){
  if(!E('RUN()')){ok(false,'卡住了 '+E('S.hz.stage'));break}
  if(E('S.phase')!=='handover'){ok(false,'没有结束: '+E('S.phase')+' '+E('S.msg'));break}
  if(!conserved())bad++;
  if(E('S.hz.result&&S.hz.result.w>=0'))wins++;else draws++;
  E('startHand()');
}
eq(bad,0,'200 局筹码守恒');ok(wins>20,'200 局里有人胡 '+wins+' / 流局 '+draws);ok(E('S.handNo')>=200,'打满 200 局');

/* claims: 胡 beats 碰, the nearest 胡 in turn order wins, 碰 beats 吃 */
E(`SETUP(${CFG({hzDianpao:true,hzRedSelf:false})},['1m2m3m 4m5m6m 7m8m9m 1s1s 5p 9p 9s','3p4p 7s8s9s 1p2p3p 4s5s6s 2m2m','5p5p 1m1m 2s3s4s 6s7s8s 9p9p9p','4p6p 7s8s9s 1p2p3p 4s5s6s 3m3m'],'1p 2p 3p 4p 5p 6p 7p 8p')`);
E(`hzAct(P()[0],'discard',P()[0].cards.find(id=>hzKind(id)===22))`);
eq(E('S.hz.stage'),'claim','打出五筒后进入询问');
ok(E('S.hz.claim.opts[1].includes("hu")')&&E('S.hz.claim.opts[3].includes("hu")'),'座位 1 和 3 都能胡五筒');
ok(E('S.hz.claim.opts[2].includes("peng")'),'座位 2 能碰');
E(`['1','2','3'].forEach(i=>{const p=P()[+i],o=S.hz.claim&&S.hz.claim.opts[i];if(o)hzAct(p,o.includes('hu')?'hu':o.includes('peng')?'peng':'pass')})`);
eq(E('S.hz.result&&S.hz.result.w'),1,'离打牌人最近的座位 1 胡');eq(E('S.hz.result.from'),0,'座位 0 点炮');

E(`SETUP(${CFG()},['1m2m3m 4m5m6m 7m8m9m 1s1s 5p 9p 9s','4p6p 7s8s9s 1p2p3p 4s5s6s 2m2m','5p5p 1m1m 2s3s4s 6s7s8s 9p9p 3p','1p 2p 3p 4p 5p 6p 7p 8p 9p 3s 4s 2s 6s'],'1p 2p 3p 4p 5p 6p 7p 8p')`);
E(`hzAct(P()[0],'discard',P()[0].cards.find(id=>hzKind(id)===22))`);
ok(!E('S.hz.claim.opts[1]')&&E('S.hz.claim.opts[2].includes("peng")'),'下家不能吃，座位 2 能碰');
E(`hzAct(P()[1],'chi',0);hzAct(P()[2],'peng');hzAct(P()[3],'pass')`);
eq(E('S.toAct'),2,'碰了，吃被忽略');eq(E('S.hz.melds[2].length&&S.hz.melds[2][0].t'),'peng');

/* hz-claim-red: with 「手里有红中只能自摸」 a hand holding 红中 gets no 胡 on a discard, nor on a 抢杠 */
E(`SETUP(${CFG({hzDianpao:true,hzRedSelf:true})},['1m2m3m 4m5m6m 7m8m9m 1s1s 5p 9p 9s','4p hz 7s8s9s 1p2p3p 4s5s6s 2m2m','1m 2m','1m 2m'],'1p 2p 3p')`);
E(`hzAct(P()[0],'discard',P()[0].cards.find(id=>hzKind(id)===22))`);
ok(!E('S.hz.claim')||!(E('S.hz.claim.opts[1]')||[]).includes('hu'),'手里有红中：别人打的牌不能胡');
/* 抢杠胡 works without 允许点炮 */
E(`SETUP(${CFG({hzDianpao:false,hzQiangGang:true})},['3p 1m 9m','4p5p 7s8s9s 1p2p3p 4s5s6s 2m2m','1m','1m'],'1s 2s 3s',{0:[{t:'peng',ids:H('3p3p3p'),from:2}]})`);
E(`hzAct(P()[0],'bgang',20)`);
ok((E('S.hz.claim&&S.hz.claim.opts[1]')||[]).includes('hu'),'没开点炮也能抢杠胡');
E(`hzAct(P()[1],'hu')`);eq(E('S.hz.result.how'),'qiang','抢杠胡');eq(E('S.hz.delta[0]<0&&S.hz.gangs.length'),0,'被抢的补杠不算杠分');

/* hz-last-tile: no gang with an empty wall; the last tile drawn then nobody wins -> draw (流局) */
E(`SETUP(${CFG()},['5m5m5m5m 1s 2s 4p 6p 8p 3s 7s 9s 1p 3p','1m','1m','1m'],'')`);
eq(E('hzAGangKinds(P()[0].cards).length'),1,'手里有四张五万');
E(`hzAct(P()[0],'agang',4)`);eq(E('S.hz.melds[0].length'),0,'牌堆空了不能杠');
E(`hzAct(P()[0],'discard',P()[0].cards.find(id=>hzKind(id)===9))`);E('RUN()');
eq(E('S.phase'),'handover','牌摸完流局');eq(E('S.hz.result.w'),-1,'流局没人胡');

/* hz-claim-timeout: an unanswered claim passes when the clock runs out, but a winning claim wins */
E(`SETUP(${CFG({turnSec:10})},['1m2m3m 4m5m6m 7m8m9m 1s1s 5p 9p 9s','5p5p 7s8s9s 1p2p3p 4s5s6s 2m','1m','1m'],'1p 2p 3p')`);
E(`P()[1].kind='local';P()[0].kind='ai'`);
E(`hzAct(P()[0],'discard',P()[0].cards.find(id=>hzKind(id)===22))`);
ok((E('S.hz.claim&&S.hz.claim.opts[1]')||[]).includes('peng'),'座位 1 可以碰');
E('RUN()');ok(E('!S.hz.claim'),'询问超时后算过，牌局继续');

/* hz-view: a guest sees counts only, never the wall */
E(`startGame(${CFG()},[{name:'你',kind:'local',gender:'m'}])`);
const v=E('viewFor(1)');
ok(v.hz&&!('wall' in v.hz)&&v.hz.wallLeft===E('S.hz.wall.length'),'视角里没有牌堆，只有剩余张数');
ok(v.players[0].cards.every(c=>c===null),'看不到别人的牌面');ok(v.players[1].cards.every(c=>c!==null),'看得到自己的牌');

/* dealer: the winner deals next; a draw keeps the dealer */
E(`SETUP(${CFG()},['1m2m3m 4m5m6m 7m8m9m 1s1s 5p5p 9s','1m','1m','1m'],'1p 2p')`);E('S.dealer=2');
E(`P()[0].cards=H('1m2m3m 4m5m6m 7m8m9m 1s1s 5p5p5p');S.hz.drawn=P()[0].cards[13];hzAct(P()[0],'hu')`);eq(E('S.hz.result.w'),0,'自摸');E('startHand()');eq(E('S.dealer'),0,'谁胡谁坐庄');
E(`SETUP(${CFG()},['1m3m5m 7m9m 1s 3s5s7s 9s 1p 3p 5p 7p','1m','1m','1m'],'')`);E('S.dealer=3');
E(`hzAct(P()[0],'discard',P()[0].cards[0])`);E('RUN()');eq(E('S.hz.result.w'),-1);E('startHand()');eq(E('S.dealer'),3,'流局连庄');

/* 四红中 at the dealer's first action */
E(`SETUP(${CFG()},['hz hz hz hz 1m3m5m7m 2s4s6s 8s 3p5p','1m','1m','1m'],'1p 2p');S.hz.first[0]=true`);
E(`hzAct(P()[0],'hu')`);eq(E('S.hz.result&&S.hz.result.type'),'sihz','起手四红中胡');
/* only 红中 left: a 红中 may go out, nothing stalls */
E(`SETUP(${CFG()},['hz hz','1m','1m','1m'],'1p 2p',{0:[{t:'peng',ids:H('1s1s1s')},{t:'peng',ids:H('2s2s2s')},{t:'peng',ids:H('3s3s3s')},{t:'peng',ids:H('4s4s4s')}]})`);
ok(E(`hzCanDiscard(P()[0],108)`),'只剩红中时可以打红中');
ok(!E(`hzCanDiscard({cards:H('hz 1m')},108)`),'还有别的牌时不能打红中');

/* ---------- Task 6: coach, counter, 托管 ---------- */
const VIEW=(mine,o={})=>`({me:0,phase:'playing',toAct:0,players:[{cards:H(${show(mine)})},{cards:new Array(13).fill(null)},{cards:new Array(13).fill(null)},{cards:new Array(13).fill(null)}],hz:Object.assign({stage:'turn',wallLeft:40,melds:{0:[],1:[],2:[],3:[]},discards:{0:[],1:[],2:[],3:[]},claim:null,first:false},${show(o)})})`;
/* one step from ready: keep the ready shape, throw the loose tile */
let a6=run(`hzAdvise(${VIEW('1m2m3m 4m5m6m 7s8s9s 2p2p 5p 8p 9m')})`);
eq(a6&&hzKindOf(a6.discard),8,'教练推荐打孤张九万');
function hzKindOf(id){return run(`hzKind(${id})`)}
ok(a6&&/1|一/.test(a6.why),'说明里有还差几步 '+(a6&&a6.why));
/* ready: the waits and how many of each are still unseen */
a6=run(`hzAdvise(${VIEW('5m6m 1s2s3s 4s5s6s 7p8p9p 2p2p 9s',{discards:{0:[],1:H('4m 4m'),2:[],3:[]}})})`);
eq(a6&&a6.waits,[3,6],'听四万七万');eq(a6&&a6.left[3],2,'四万还剩 2 张没出现');eq(a6&&a6.left[6],4,'七万还剩 4 张');
/* the advice reads only public information: other hands as null give the same result */
const v1=run(`hzAdvise(${VIEW('1m2m3m 4m5m6m 7s8s9s 2p2p 5p 8p 9m')})`);
ok(show(v1)===show(run(`(()=>{const v=${VIEW('1m2m3m 4m5m6m 7s8s9s 2p2p 5p 8p 9m')};v.players[1].cards=H('1p1p1p 2p 3p 4p 5p 6p 7p 8p 9p 1s 2s');return hzAdvise(v)})()`)),'教练不看别人的手牌');
/* a claim: 胡 when it wins, else 过 when taking it does not help */
a6=run(`hzAdvise(${VIEW('1m2m3m 4m5m6m 7s8s9s 2p2p2p 5p',{stage:'claim',claim:{tile:H('5p')[1],from:3,mine:['hu','peng'],answered:false}})})`);
eq(a6&&a6.claim,'hu','能胡就胡');
/* counter: 4 minus what I can see */
const cnt=run(`hzCounter(${VIEW('1m1m 2m',{discards:{0:[],1:H('1m'),2:[],3:[]},melds:{0:[],1:[],2:[{t:'peng',ids:H('9p9p9p')}],3:[]}})})`);
eq(cnt[0],1,'一万还剩 1');eq(cnt[1],3,'二万还剩 3');eq(cnt[26],1,'九筒还剩 1');eq(cnt[27],4,'红中 4');

/* 托管 timeouts in the real engine: with the coach the coach's discard, without it the drawn tile (or the rightmost non-红中) */
E(`SETUP(${CFG({coachAuto:false})},['1m2m3m 4m5m6m 7s8s9s 2p2p 5p 8p 9m','1m','1m','1m'],'1p 2p 3p')`);E(`S.hz.drawn=P()[0].cards.find(id=>hzKind(id)===22)`);
E(`hzAutoMove(P()[0],false)`);eq(E('hzKind(S.hz.discards[0][0])'),22,'不用教练：打出刚摸的牌');
E(`SETUP(${CFG({coachAuto:false})},['1m2m3m 4m5m6m 7s8s9s 2p2p 5p 8p hz','1m','1m','1m'],'1p 2p 3p')`);E(`S.hz.drawn=P()[0].cards.find(id=>hzKind(id)===27)`);
E(`hzAutoMove(P()[0],false)`);ok(E('S.hz.discards[0].length===1&&hzKind(S.hz.discards[0][0])!==27'),'摸到红中时打最右边的非红中');
E(`SETUP(${CFG()},['1m2m3m 4m5m6m 7s8s9s 2p2p 5p 8p 9m','1m','1m','1m'],'1p 2p 3p')`);
E(`hzAutoMove(P()[0],true)`);eq(E('hzKind(S.hz.discards[0][0])'),8,'用教练：打教练推荐的九万');
/* the engine's timeout always takes the coach's way for 红中, even with 超时后采用教练方案 off */
E(`SETUP(${CFG({coachAuto:false})},['1m2m3m 4m5m6m 7s8s9s 2p2p 5p 8p 9m','1m','1m','1m'],'1p 2p 3p')`);E(`S.hz.drawn=P()[0].cards.find(id=>hzKind(id)===22)`);
E(`autoMove(P()[0])`);eq(E('hzKind(S.hz.discards[0][0])'),8,'没勾选也按教练：打九万');

/* ---------- final review fixes ---------- */
/* after a 碰 / 吃 there is no drawn tile: no 自摸 then (that would dodge 「只能自摸」), and the bot still discards */
E(`SETUP(${CFG()},['1m2m3m 4m5m6m 7m8m9m 1s1s 5p 9p 9s','1m','5p5p 2s3s4s 6s7s8s 3p4p 1m1m','1m'],'1p 2p 3p 4p')`);
E(`hzAct(P()[0],'discard',P()[0].cards.find(id=>hzKind(id)===22))`);
E(`Object.keys(S.hz.claim.opts).forEach(k=>hzAct(P()[+k],S.hz.claim.opts[k].includes('peng')?'peng':'pass'))`);
eq(E('S.toAct'),2,'座位 2 碰了五筒');
E(`hzAct(P()[2],'hu')`);eq(E('S.phase'),'playing','碰完没摸牌不能自摸');ok(E('!S.hz.result'),'没有胡');
ok(!E(`hzCanZimo(P()[2])`),'碰完 hzCanZimo 为假');
E(`hzBotTurn(P()[2])`);eq(E('S.hz.discards[2].length'),1,'电脑碰完照常打一张，不会卡住');
/* the shared river on the table: every discard in the order played, less the tiles claimed */
eq(E('S.hz.river'),E('S.hz.discards[2]'),'牌河只剩碰后打出的那张，碰走的五筒不在');
E(`while(S.hz.stage==='claim'){const k=Object.keys(S.hz.claim.opts).find(k=>S.hz.claim.ans[k]==null);if(k==null)break;hzAct(P()[+k],'pass')}`);
eq(E('S.toAct')+E('S.hz.stage'),'3turn','轮到座位 3');E(`hzBotTurn(P()[3])`);
eq(E('S.hz.river'),[E('S.hz.discards[2][0]'),E('S.hz.discards[3][0]')],'按出牌顺序排');
eq(E('viewFor(1).hz.river'),E('S.hz.river'),'每个人都看得到牌河');
/* a 吃 sent from outside (an old or modified client) is no answer: nothing happens */
E(`SETUP(${CFG()},['1m2m3m 4m5m6m 7m8m9m 1s1s 5p 9p 9s','4p6p 7s8s9s 1p2p3p 4s5s6s 2m2m','1m','1m'],'1p 2p 3p')`);
E(`hzAct(P()[0],'discard',P()[0].cards.find(id=>hzKind(id)===22))`);
for(const bad of ['0','0.5','5','-1','"x"'])E(`hzAct(P()[1],'chi',${bad})`);
ok(!E('S.hz.claim')||E('S.hz.claim.ans[1]==null'),'吃不算回答');eq(E('S.hz.melds[1].length'),0,'没有吃出副露');
E(`hzAct(P()[1],'pass')`);ok(E('!S.hz.claim'),'之后正常回答，牌局继续');

console.log(`hz: ${passed} passed, ${failed} failed`);
process.exit(failed?1:0);
