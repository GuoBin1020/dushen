#!/usr/bin/env node
/* 分底池测试：node tools/pot-test.js
   德州、炸金花一手结束时怎么分筹码：没人跟到的多压筹码算「退回」，不算赢；炸金花只有全下的人受边池限制。
   和 turn-test.js 一样用 vm 跑真实的引擎。 */
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
  const game=(g,x)=>{TQ=[];startGame({game:g,players:4,stack:40000,sb:10,bb:20,ante:20,aiFill:true,rebuy:true,speed:'fast',auto:false,ff:false,coach:true,...x},[{name:'你',kind:'local',gender:'m'}]);TQ=[]};
  /* a hand set by hand: totals put in, who folded, who is all-in, cards */
  const set=(rows)=>{S.phase='playing';rows.forEach((r,i)=>Object.assign(P()[i],{inHand:true,bet:0,won:0,refund:0,folded:false,allIn:false,shown:false,seen:true},r))};

  /* ---------- 德州 ---------- */
  game('holdem');
  /* everyone folds to a bet: the part nobody called comes back, it is not won */
  set([{total:120},{total:20,folded:true},{total:20,folded:true},{total:0,folded:true}]);
  let s0=P()[0].stack;winUncontested(P()[0]);
  eq(P()[0].won,60,'没人跟：赢下底池 60（大家都跟到的部分）');eq(P()[0].refund,100,'多压的 100 退回');eq(P()[0].stack-s0,160,'筹码一共回来 160');
  eq(P()[0].total,20,'退回的不算这手投入');
  ok(/退回/.test(S.msg)&&/100/.test(S.msg),'消息里写退回 100：'+S.msg);ok(!/赢得底池 160/.test(S.msg),'不说赢得 160');
  eq(viewFor(0).players[0].refund,100,'视图里带退回的数目');
  /* showdown against a shorter all-in: the bigger stack's extra comes back; it lost the hand, so it won nothing */
  game('holdem');
  S.board=[44,29,10,39,7];
  set([{total:1000,cards:[20,1]},{total:300,allIn:true,cards:[48,49]},{total:50,folded:true,cards:[]},{total:0,folded:true,cards:[]}]);
  const st0=P().reduce((a,p)=>a+p.stack,0),tot0=P().reduce((a,p)=>a+p.total,0);showdown();
  eq(P()[1].won,650,'短码全下的 AA 赢 650');eq(P()[0].won,0,'输的人没有赢');eq(P()[0].refund,700,'多出的 700 退回');
  eq(P().reduce((a,p)=>a+p.stack,0),st0+tot0,'筹码守恒');
  ok(!new RegExp(P()[0].name+' 以').test(S.msg),'消息里不说输的人赢了：'+S.msg);ok(/退回/.test(S.msg),'消息里写退回');

  /* ---------- 炸金花 ---------- */
  /* at the round cap a blind player (1x) and a seen player (2x) both stay in: the winner takes it all, nothing comes back */
  game('zjh');
  set([{total:100,seen:false,cards:[48,49,50]},{total:200,cards:[8,13,22]},{total:20,folded:true,cards:[]},{total:20,folded:true,cards:[]}]);
  zShowdown('测试');
  eq(P()[0].won,340,'闷牌的人赢下整个底池');eq(P()[1].won,0);eq(P()[1].refund||0,0,'看牌多付的不退');
  /* an all-in for less: it wins only what it could match; the other's extra comes back */
  game('zjh');
  set([{total:100,allIn:true,cards:[48,49,50]},{total:300,cards:[8,13,22]},{total:0,folded:true,cards:[]},{total:0,folded:true,cards:[]}]);
  zShowdown('测试');
  eq(P()[0].won,200,'全下 100 的人只赢 200');eq(P()[1].refund,200,'对方多压的 200 退回');eq(P()[1].won,0);
  /* everyone else out: the pot is all the winner's, whatever each paid */
  game('zjh');
  set([{total:100,folded:true,seen:false,cards:[]},{total:200,cards:[8,13,22]},{total:20,folded:true,cards:[]},{total:20,folded:true,cards:[]}]);
  winUncontested(P()[1]);eq(P()[1].won,340,'别人都出局：整个底池 340 都是他的');eq(P()[1].refund||0,0,'炸金花不算退回');
  /* 200 hands each with the bots (seat 0 on 托管): chips are conserved, nothing goes negative, refunds only to players still in */
  for(const g of ['holdem','zjh']){
    TQ=[];startGame({game:g,players:4,stack:40000,sb:10,bb:20,ante:20,aiFill:true,rebuy:true,speed:'fast',auto:false,ff:false,coach:true,turnSec:10},[{name:'你',kind:'local',gender:'m'}]);P()[0].trust=true;let bad=0,refunds=0;
    for(let h=0;h<200;h++){
      for(let i=0;i<20000&&(S.phase==='playing'||S.phase==='runout');i++)if(!tick())break;
      if(S.phase!=='handover'){if(S.phase==='busted'){P().forEach(q=>{if(q.stack<=0&&!q.inHand){q.stack=S.cfg.stack;q.rebuys++}});startHand();continue}ok(false,g+' 第 '+h+' 手没有结束：'+S.phase);break}
      const sum=P().concat(S.gone||[]).reduce((a,q)=>a+q.stack,0),want=P().concat(S.gone||[]).reduce((a,q)=>a+S.cfg.stack*(1+q.rebuys),0);
      if(sum!==want)bad++;
      P().forEach(q=>{if(q.refund<0||q.won<0||q.total<0)bad++;if(q.refund>0){refunds++;if(q.folded)bad++}});
      P().forEach(q=>{if(q.stack<=0){q.stack=S.cfg.stack;q.rebuys++}});startHand();
    }
    eq(bad,0,g+' 200 手筹码守恒、没有负数');ok(g!=='holdem'||refunds>0,g+' 200 手里有退回 '+refunds);
  }
  console.log(`pot: ${passed} passed, ${failed} failed`);
  return failed;
}
let failed;
try{failed=vm.runInContext('('+tests.toString()+')()',ctx)}catch(e){console.log('ERROR',e.stack.split('\n').slice(0,3).join(' | '));failed=1}
process.exit(failed?1:0);
