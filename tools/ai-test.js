#!/usr/bin/env node
/* 德州电脑难度测试：node tools/ai-test.js
   高手性格（翻牌后按对手范围算胜率）、难度选择（简单 / 普通 / 困难），困难时电脑按教练的建议打。
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
vm.runInContext(`function ctxGet(n){return globalThis[n]}function ctxSet(n,f){globalThis[n]=f}`,ctx);
for(const f of ['js/common.js','js/games/holdem.js','js/games/zjh.js','js/games/doudizhu.js','js/games/doudizhu-coach.js','js/games/hongzhong.js','js/games/hongzhong-coach.js','js/engine.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});

function tests(){
  let passed=0,failed=0;
  const ok=(c,msg)=>{if(c)passed++;else{failed++;console.log('FAIL',msg||'')}};
  const eq=(a,b,msg)=>{const A=JSON.stringify(a),B=JSON.stringify(b);if(A===B)passed++;else{failed++;console.log('FAIL',msg||'',' got',A,' want',B)}};
  const game=(g,x)=>{TQ=[];startGame({game:g,players:6,stack:40000,sb:10,bb:20,ante:20,aiFill:true,rebuy:true,speed:'fast',auto:false,ff:false,coach:true,...x},[{name:'你',kind:'local',gender:'m'}]);TQ=[]};
  const bots=()=>P().filter(p=>p.kind==='ai');

  /* ---------- settings ---------- */
  eq(normalizeCfg({}).level,'easy','默认简单');eq(normalizeCfg({level:'hard'}).level,'hard');eq(normalizeCfg({level:'x'}).level,'easy','不认识的难度当简单');
  eq(normalizeCfg({game:'zjh',style:'pro'}).style,'mixed','炸金花没有高手性格');eq(normalizeCfg({game:'holdem',style:'pro'}).style,'pro');
  ok(STYLES.pro&&STYLES.pro.name==='高手','有「高手」性格');

  /* ---------- who sits down ---------- */
  let seen=new Set();for(let i=0;i<400;i++)seen.add(pickArch('holdem'));ok(seen.has('pro'),'德州随机池里有高手');
  seen=new Set();for(let i=0;i<400;i++)seen.add(pickArch('zjh'));ok(!seen.has('pro')&&!seen.has('coach'),'炸金花随机池里没有高手');
  game('holdem',{level:'easy',style:'mixed'});ok(bots().length===5,'5 个电脑');
  game('holdem',{level:'normal',style:'station'});ok(bots().every(p=>p.style==='pro'),'普通：电脑都是高手（不管选了什么风格）');
  game('holdem',{level:'hard'});ok(bots().every(p=>p.style==='coach'),'困难：电脑都按教练的算法');eq(styleName(bots()[0]),'教练算法');
  game('zjh',{level:'hard'});ok(bots().every(p=>p.style!=='coach'&&p.style!=='pro'),'炸金花不受难度影响');

  /* ---------- how they decide ---------- */
  /* a flop where the bot faces a bet; spies tell which model it used */
  const flop=()=>{const b=bots()[0];S.street='flop';S.board=[44,29,10];S.phase='playing';
    P().forEach((p,i)=>Object.assign(p,{inHand:true,folded:i>2,allIn:false,bet:0,total:40,cards:i===b.id?[48,49]:[0,5],pre:null,post:[]}));
    P()[0].bet=40;S.currentBet=40;S.minRaise=20;S.raises=1;S.toAct=b.id;return b};
  const spy=(name)=>{const keep=ctxGet(name);let n=0;ctxSet(name,(...a)=>{n++;return keep(...a)});return {n:()=>n,undo:()=>ctxSet(name,keep)}};
  game('holdem',{level:'normal'});let b=flop(),sR=spy('equityRanges'),sE=spy('equity');aiAct(b);
  ok(sR.n()>0,'高手翻牌后按对手范围算胜率');sR.undo();sE.undo();
  game('holdem',{level:'easy',style:'station'});b=flop();sR=spy('equityRanges');aiAct(b);ok(sR.n()===0,'跟注站还是按随机牌算');sR.undo();
  game('holdem',{level:'hard'});b=flop();const sA=spy('advise'),sX=spy('exploitAdvice');aiAct(b);
  ok(sA.n()>0&&sX.n()>0,'困难：按教练建议（含剥削建议）行动');sA.undo();sX.undo();
  /* preflop the hard bot plays the GTO chart exactly */
  game('holdem',{level:'hard'});b=bots()[0];S.street='preflop';S.phase='playing';S.toAct=b.id;
  P().forEach(p=>Object.assign(p,{inHand:true,folded:false,allIn:false}));b.cards=[0,5];
  const want=advise(S,b).rec.type;aiAct(b);ok(b.folded===(want==='fold'),'翻牌前照教练：'+want+' / '+b.lastAction);

  /* ---------- whole hands: every level plays to the end, chips conserved ---------- */
  for(const lv of ['easy','normal','hard']){
    TQ=[];startGame({game:'holdem',players:6,stack:4000,sb:10,bb:20,aiFill:true,rebuy:true,speed:'fast',auto:false,ff:false,coach:true,turnSec:10,level:lv},[{name:'你',kind:'local',gender:'m'}]);P()[0].trust=true;let bad=0,done=0;
    for(let h=0;h<40;h++){
      for(let i=0;i<20000&&(S.phase==='playing'||S.phase==='runout');i++)if(!tick())break;
      if(S.phase==='busted'){P().forEach(q=>{if(q.stack<=0&&!q.inHand){q.stack=S.cfg.stack;q.rebuys++}});startHand();continue}
      if(S.phase!=='handover'){ok(false,lv+' 第 '+h+' 手没打完：'+S.phase);break}
      done++;const sum=P().reduce((a,q)=>a+q.stack,0),want2=P().reduce((a,q)=>a+S.cfg.stack*(1+q.rebuys),0);if(sum!==want2)bad++;
      P().forEach(q=>{if(q.stack<=0){q.stack=S.cfg.stack;q.rebuys++}});startHand();
    }
    eq(bad,0,lv+' 筹码守恒');ok(done>=30,lv+' 打完 '+done+' 手');
  }
  console.log(`ai: ${passed} passed, ${failed} failed`);
  return failed;
}
let failed;
try{failed=vm.runInContext('('+tests.toString()+')()',ctx)}catch(e){console.log('ERROR',e.stack.split('\n').slice(0,3).join(' | '));failed=1}
process.exit(failed?1:0);
