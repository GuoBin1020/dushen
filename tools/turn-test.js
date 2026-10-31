#!/usr/bin/env node
/* 出牌限时 / 托管 / 暂时离桌 测试：node tools/turn-test.js
   和 ddz-test.js 一样用 vm 跑真实的引擎，但定时器和时钟是假的：按到期时间先后执行，时钟跳到到期时刻。 */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..');
/* a clock the tests move: Date.now() is CLOCK.t; new Date() still works */
const CLOCK={t:1e12};
class FakeDate extends Date{constructor(...a){super(...(a.length?a:[CLOCK.t]))}static now(){return CLOCK.t}}
const ctx=vm.createContext({console,Math,Date:FakeDate,JSON,Set,Map,Object,Array,Number,String,Boolean,CLOCK});
vm.runInContext(`var TQ=[],TID=0;
  var setTimeout=(f,ms)=>{const id=++TID;TQ.push({id,f,at:CLOCK.t+Math.max(0,+ms||0)});return id};
  var clearTimeout=id=>{TQ=TQ.filter(x=>x.id!==id)};
  /* run the timer due first; the clock jumps to its time */
  function tick(){if(!TQ.length)return false;TQ.sort((a,b)=>a.at-b.at||a.id-b.id);const x=TQ.shift();CLOCK.t=Math.max(CLOCK.t,x.at);x.f();return true}
  var NET={role:'solo',conns:new Map()};function applyView(){}function hostSave(){}function voiceClear(){}function resetT(){}function onChat(){}var SETTLE_SEEN=null;function onSettle(m){SETTLE_SEEN=m}function cardTxt(c){return String(c)}`,ctx);
for(const f of ['js/common.js','js/games/holdem.js','js/games/zjh.js','js/games/doudizhu.js','js/games/doudizhu-coach.js','js/games/hongzhong.js','js/games/hongzhong-coach.js','js/engine.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});

function tests(){
  let passed=0,failed=0;
  const ok=(c,msg)=>{if(c)passed++;else{failed++;console.log('FAIL',msg||'')}};
  const eq=(a,b,msg)=>{const A=JSON.stringify(a),B=JSON.stringify(b);if(A===B)passed++;else{failed++;console.log('FAIL',msg||'',' got',A,' want',B)}};
  const ME=()=>P()[0];
  /* run timers until seat 0 (a person) is to act; a timer that is seat 0's own turn clock is not run */
  const toMe=(max=4000)=>{for(let i=0;i<max;i++){
    if(S.phase==='playing'&&S.toAct===0)return true;
    if(S.phase!=='playing'&&S.phase!=='runout')return false;
    if(!tick())return false}return false};
  /* finish the hand: run everything, seat 0 included */
  const finish=(max=6000)=>{for(let i=0;i<max&&(S.phase==='playing'||S.phase==='runout');i++)if(!tick())return false;return S.phase==='handover'};
  /* the next time seat 0 acts, dealing new hands when one ends before that */
  const meTurn=()=>{for(let k=0;k<30;k++){if(toMe())return true;if(S.phase==='handover')startHand();else return false}return false};
  /* run timers until seat 0's (or the given seat's) turn is over (a bot's chat line may come due first) */
  const out=(seat=0)=>{const hn=S.handNo,seq=S.ev&&S.ev.seq;for(let i=0;i<50&&S.phase==='playing'&&S.toAct===seat&&S.handNo===hn&&(S.ev&&S.ev.seq)===seq;i++)if(!tick())break};
  const pending=()=>TQ.map(x=>x.at-CLOCK.t);
  const game=(g,extra,humans)=>{TQ=[];startGame({game:g,players:g==='ddz'?3:4,stack:40000,sb:10,bb:20,ante:20,base:20,aiFill:true,rebuy:true,speed:'fast',auto:false,ff:false,coach:true,...extra},humans||[{name:'你',kind:'local',gender:'m'}])};

  /* ---------- settings ---------- */
  eq(normalizeCfg({}).turnSec,0,'旧设置没有出牌限时：不限时');
  eq(normalizeCfg({turnSec:15}).turnSec,15);eq(normalizeCfg({turnSec:60}).turnSec,60);eq(normalizeCfg({turnSec:0}).turnSec,0);
  eq(normalizeCfg({turnSec:7}).turnSec,0,'不在选项里的限时当作不限时');
  eq(normalizeCfg({}).coachAuto,true,'默认采用教练方案');eq(normalizeCfg({coachAuto:false}).coachAuto,false);

  /* ---------- 德州, not checked: default action, 托管 to the end of the hand, then 暂时离桌 ---------- */
  game('holdem',{turnSec:10,coachAuto:false});
  ok(meTurn(),'轮到我');
  {const v=viewFor(0);eq(v.turnMs,10000,'快照带限时');eq(v.turnLeft,10000,'快照带剩余时间');}
  ok(pending().includes(10000),'我的计时器 10 秒');
  /* the clock moves 4 s: the next snapshot says 6 s are left */
  CLOCK.t+=4000;eq(viewFor(0).turnLeft,6000,'4 秒后剩 6 秒');eq(viewFor(1).turnLeft,6000,'别人的快照也是 6 秒');
  {const owe=S.currentBet>ME().bet;out();
    ok(ME().trust,'超时后进入托管');ok(ME().folded===owe,'需要跟注时超时弃牌，否则过牌');
    eq(viewFor(1).players[0].trust,true,'所有人都看到托管');}
  ok(finish(),'这手打完');
  ok(ME().trust,'这手结束前一直托管');
  startHand();
  ok(ME().away&&!ME().trust,'没勾选：下一手起暂时离桌');ok(!ME().inHand,'离桌的人不发牌');eq(ME().total,0,'离桌不扣盲注');
  eq(viewFor(0).players[0].away,true,'快照里有暂时离桌');
  eq(S.phase,'waiting','单机只有我一个真人：牌桌暂停');ok(/下一局加入/.test(S.msg),'提示点下一局加入');
  startHand();ok(ME().away&&!ME().inHand,'一直不回来就保持离桌');
  doRebuy(ME());ok(!ME().away,'下一局加入');eq(S.phase,'playing','暂停时点了马上发牌');ok(ME().inHand,'重新发牌');
  /* online: another person sat out while a hand is under way joins from the next hand, not this one */
  game('holdem',{turnSec:0},[{name:'你',kind:'local',gender:'m'},{name:'乙',kind:'remote',gender:'m'}]);
  {const R=P()[1];finish();R.away=true;startHand();ok(!R.inHand&&S.phase==='playing','离桌的人不发牌，别人照打');
    eq(viewFor(0).players[1].away,true,'所有人都看到暂时离桌');
    doRebuy(R);ok(!R.away&&!R.inHand,'这一手不插进来');finish();startHand();ok(R.inHand,'下一手重新发牌');}

  /* ---------- 德州, checked: the coach's move; 托管 goes on into the next hand until 取消托管 ---------- */
  {const keep=advise;let calls=0;advise=(st,p)=>{calls++;return {rec:{type:'call'}}};
    game('holdem',{turnSec:15,coachAuto:true});
    ok(meTurn(),'轮到我');eq(viewFor(0).turnLeft,15000,'默认 15 秒');
    out();
    ok(calls>0,'超时后问了教练');ok(ME().trust,'进入托管');ok(!ME().folded,'按教练的跟注，没有弃牌');
    finish();startHand();
    ok(ME().trust&&!ME().away&&ME().inHand,'勾选：下一手照常发牌，继续托管');
    ok(meTurn(),'又轮到我');
    ok(!pending().some(ms=>ms>=15000),'托管时不再等满限时');eq(viewFor(0).turnLeft,0,'托管时没有倒计时');
    const c0=calls;out();ok(calls>c0,'托管时自动按教练操作');
    /* 取消托管 on my own turn: the clock starts again and nobody plays for me */
    meTurn();
    if(S.phase==='playing'&&S.toAct===0){doRebuy(ME());ok(!ME().trust,'取消托管');eq(viewFor(0).turnLeft,15000,'取消后重新计时');ok(pending().includes(15000),'取消后等我自己操作')}
    else ok(false,'没能再轮到我');
    advise=keep;}

  /* ---------- 炸金花 ---------- */
  game('zjh',{turnSec:10,coachAuto:false});
  ok(meTurn(),'炸金花轮到我');eq(viewFor(0).turnLeft,10000);
  out();ok(ME().folded&&ME().trust,'没勾选：超时弃牌并托管');
  finish();startHand();ok(ME().away&&!ME().inHand,'下一手暂时离桌');
  eq(S.phase,'waiting');doRebuy(ME());ok(ME().inHand&&!ME().away,'点了下一局加入后重新入座');
  {const keep=zAdvise;zAdvise=(st,p)=>({rec:p.seen?{type:'call'}:{type:'look'}});
    game('zjh',{turnSec:10,coachAuto:true});ok(meTurn(),'轮到我');
    const st0=ME().stack;out();
    ok(ME().seen,'按教练先看牌');ok(!ME().folded&&ME().stack<st0,'再按教练跟注');ok(ME().trust,'托管');
    finish();startHand();ok(ME().trust&&ME().inHand,'勾选：继续托管');
    zAdvise=keep;}
  /* 看牌 does not restart the clock */
  game('zjh',{turnSec:10,coachAuto:true});ok(meTurn(),'轮到我');CLOCK.t+=3000;zAct(ME(),'look');eq(viewFor(0).turnLeft,7000,'看牌后时间接着走');

  /* ---------- 斗地主: 托管 with either choice; it lasts across hands until 取消托管 ---------- */
  game('ddz',{turnSec:10,coachAuto:false});
  ok(meTurn(),'斗地主轮到我');eq(S.dd.stage,'bid');eq(viewFor(0).turnLeft,10000);
  out();ok(ME().trust,'超时托管');ok(/^你：(不叫|不抢)$/.test((S.log.filter(x=>/^你：/.test(x.t)).pop()||{}).t),'没勾选：叫地主阶段不叫不抢');
  /* play stage, my lead: the smallest single; facing a play: 不要 */
  {const d=S.dd;S.phase='playing';d.stage='play';d.landlord=1;d.lead=null;d.passes=0;d.shown={};S.toAct=0;
    const low=ddSort(ME().cards).pop(),n0=ME().cards.length;clearTimeout(timer);autoMove(ME());
    eq(ME().cards.length,n0-1,'先出：出一张');ok(!ME().cards.includes(low)&&S.dd.lead&&S.dd.lead.cls.type==='single','出的是最小的单张');
    d.lead={pid:2,cls:{type:'single',main:12,len:1},cards:[48]};d.passes=0;S.toAct=0;clearTimeout(timer);autoMove(ME());eq(ME().lastAction,'不要','跟牌：不要');}
  game('ddz',{turnSec:10,coachAuto:true});
  {const keep=ddAdvise;let seen=null;ddAdvise=v=>{seen=v;return keep(v)};
    ok(meTurn(),'轮到我');out();ok(seen&&seen.me===0,'勾选：按我这一座的教练建议');ok(ME().trust,'托管');ddAdvise=keep;}
  finish();startHand();ok(ME().trust&&ME().inHand&&!ME().away,'斗地主托管跨局保持，不离座');
  doRebuy(ME());ok(!ME().trust,'取消托管');

  /* ---------- a dropped player keeps the old 15 s grace and the old behaviour ---------- */
  game('holdem',{turnSec:10,coachAuto:true},[{name:'你',kind:'local',gender:'m'},{name:'乙',kind:'remote',gender:'m'}]);
  {const R=P()[1];
    for(let i=0;i<4000&&!(S.phase==='playing'&&S.toAct===1);i++){if(S.phase!=='playing'){startHand();continue}if(S.toAct===0){act(ME(),'call');continue}tick()}
    R.connected=false;R.discAt=CLOCK.t;proceed();
    ok(S.toAct===1,'轮到掉线的人');
    const left=R.discAt+DISC_GRACE-CLOCK.t;ok(pending().includes(Math.max(400,left)),'掉线等重连，不用出牌限时');eq(viewFor(0).turnLeft,0,'掉线时不显示倒计时');
    const owe=S.currentBet>R.bet;out(1);ok(!R.trust,'掉线超时不算托管');ok(R.folded===owe,'掉线照旧：过牌或弃牌');
    finish();startHand();ok(!R.inHand&&!R.away,'掉线的人照旧不发牌（直到重连）');}
  /* a dropped player who had sat out (暂时离桌) is dealt in again from the next hand once they reconnect; the sealed online
     code only flips p.connected and syncs, so the engine notices the change itself. A connected player stays away. */
  game('holdem',{turnSec:0},[{name:'你',kind:'local',gender:'m'},{name:'乙',kind:'remote',gender:'m'},{name:'丙',kind:'remote',gender:'m'}]);
  {const R=P()[1],Q=P()[2];finish();R.away=true;Q.away=true;R.connected=false;sync();startHand();
    ok(!R.inHand&&R.away,'掉线又离桌：不发牌');
    R.connected=true;sync();ok(!R.away,'重连后不再暂时离桌');ok(Q.away,'没掉线的离桌玩家仍然暂时离桌');
    ok(!R.inHand,'重连不插进这一手');finish();startHand();ok(R.inHand&&!Q.inHand,'重连的人下一手发牌，没掉线的离桌玩家不发');
    /* dropped and back between two hands, with no sync while away: the next deal still notices */
    finish();R.away=true;R.connected=false;R.discAt=CLOCK.t;startHand();R.connected=true;finish();startHand();ok(R.inHand&&!R.away,'两手之间掉线又重连：下一手发牌');}
  /* everyone left at the table sat out: the one who reconnects starts the next hand */
  game('holdem',{turnSec:0},[{name:'你',kind:'local',gender:'m'},{name:'乙',kind:'remote',gender:'m'}]);
  {const R=P()[1];finish();ME().away=true;R.away=true;R.connected=false;startHand();eq(S.phase,'waiting','都离桌：暂停');
    R.connected=true;sync();for(let i=0;i<5&&S.phase==='waiting';i++)tick();eq(S.phase,'playing','重连的人回来后接着发牌');ok(R.inHand&&!ME().inHand,'只给重连的人和电脑发牌');}

  /* ---------- 托管 / 暂时离桌 and out of chips: one 补码 tap cancels it and rebuys ---------- */
  game('holdem',{turnSec:10,coachAuto:true});
  {finish();ME().trust=true;ME().stack=0;startHand();eq(S.phase,'busted','托管输光：牌桌停下');
    doRebuy(ME());ok(!ME().trust,'托管输光：补码取消托管');ok(ME().stack>39000,'托管输光：一次补码就到账');ok(S.phase==='playing'&&ME().inHand,'补码后发牌');}
  game('zjh',{turnSec:10,coachAuto:false});
  {finish();ME().trust=true;ME().stack=0;startHand();ok(ME().away&&ME().stack<=0,'炸金花没勾选输光：离桌');
    doRebuy(ME());ok(!ME().away&&!ME().trust,'离桌输光：补码取消离桌');ok(ME().stack>39000,'离桌输光：一次补码就到账');ok(ME().inHand,'补码后入座');}
  /* M5: auto-next-hand off, the host sat out at handover: 下一局加入 deals the next hand in one tap */
  game('holdem',{turnSec:10,coachAuto:false,auto:false});
  {finish();ME().away=true;eq(S.phase,'handover');doRebuy(ME());ok(!ME().away&&S.phase==='playing'&&ME().inHand,'手间离桌：一次下一局加入就发牌');}
  /* M1: the turn clock fires for someone who just dropped: the old grace, not 托管 */
  game('holdem',{turnSec:10,coachAuto:true},[{name:'你',kind:'local',gender:'m'},{name:'乙',kind:'remote',gender:'m'}]);
  {const R=P()[1];
    for(let i=0;i<4000&&!(S.phase==='playing'&&S.toAct===1);i++){if(S.phase!=='playing'){startHand();continue}if(S.toAct===0){act(ME(),'call');continue}tick()}
    ok(S.toAct===1&&viewFor(0).turnLeft>0,'乙在计时');R.connected=false;R.discAt=CLOCK.t;
    tick();ok(!R.trust,'计时到点时刚掉线：不托管');ok(S.toAct===1&&!R.folded,'还在等重连');
    eq(viewFor(0).turnLeft,0,'不再显示倒计时');out(1);ok(!R.trust,'宽限到了照旧过牌或弃牌');}

  /* ---------- 不限时 and bots ---------- */
  game('holdem',{turnSec:0});ok(meTurn(),'轮到我');eq(pending(),[],'不限时：没有计时器');eq(viewFor(0).turnLeft,0);eq(viewFor(0).turnMs,0);
  game('holdem',{turnSec:10});
  {let botWait=[];for(let i=0;i<300;i++){if(S.phase!=='playing'&&S.phase!=='runout'){startHand();continue}
      if(S.phase==='playing'&&S.toAct===0){act(ME(),S.currentBet>ME().bet?'fold':'check');continue}
      if(S.phase==='playing'&&isBot(P()[S.toAct]))botWait.push(TQ.find(x=>x.id===timer).at-CLOCK.t);if(!tick())break}
    ok(botWait.length&&botWait.every(ms=>ms<10000),'电脑照常思考，不等限时');ok(P().filter(isBot).every(p=>!p.trust&&!p.away),'电脑不会托管或离桌');}
  console.log(`turn: ${passed} passed, ${failed} failed`);
  return failed;
}
let failed;
try{failed=vm.runInContext('('+tests.toString()+')()',ctx)}catch(e){console.log('ERROR',e.stack.split('\n').slice(0,3).join(' | '));failed=1}
process.exit(failed?1:0);
