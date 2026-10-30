#!/usr/bin/env node
/* 炸金花 比牌后的看牌权限测试：node tools/zjh-view-test.js
   比牌后只有比牌的两个人能看到对方的牌，第三个人看到的还是背面；比牌的日志和事件里不带牌面；
   牌型名只在最后开牌（或勾选「亮出所有人的底牌」时的本手结束）才出现在别人的快照里。和 turn-test.js 一样用 vm 跑真实的引擎。 */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..');
const ctx=vm.createContext({console,Math,Date,JSON,Set,Map,Object,Array,Number,String,Boolean});
/* cardTxt marks every card it writes, so a card in a log line is easy to spot */
vm.runInContext(`var TQ=[],TID=0;
  var setTimeout=(f,ms)=>{const id=++TID;TQ.push({id,f});return id};
  var clearTimeout=id=>{TQ=TQ.filter(x=>x.id!==id)};
  var NET={role:'solo',conns:new Map()};function applyView(){}function hostSave(){}function voiceClear(){}function resetT(){}function onChat(){}function onSettle(){}
  function cardTxt(c){return '⟨'+c+'⟩'}`,ctx);
for(const f of ['js/common.js','js/games/holdem.js','js/games/zjh.js','js/games/doudizhu.js','js/games/doudizhu-coach.js','js/engine.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});

function tests(){
  let passed=0,failed=0;
  const ok=(c,msg)=>{if(c)passed++;else{failed++;console.log('FAIL',msg||'')}};
  const eq=(a,b,msg)=>{const A=JSON.stringify(a),B=JSON.stringify(b);if(A===B)passed++;else{failed++;console.log('FAIL',msg||'',' got',A,' want',B)}};
  const hidden=(v,id)=>v.players[id].cards.length===3&&v.players[id].cards.every(c=>c===null);
  const open=(v,id)=>eq(v.players[id].cards,S.players[id].cards,`座位 ${v.me} 看得到 ${id} 的牌`);
  /* four people, no bots and no clock, so nothing moves unless the test says so; A compares with B, C and D watch */
  const deal=showAll=>{TQ=[];startGame({game:'zjh',players:4,stack:4000,ante:20,aiFill:false,rebuy:true,speed:'fast',auto:false,coach:true,turnSec:0,showAll},
    ['甲','乙','丙','丁'].map(n=>({name:n,kind:'local',gender:'m'})));TQ=[]};
  const compare=(a,b)=>{S.round=2;S.toAct=a;const n0=S.log.length;zAct(P()[a],'compare',b);TQ=[];return S.log.slice(n0)};
  for(const showAll of [false,true]){
    const tag=showAll?'（亮出所有人）':'';
    deal(showAll);
    const A=0,B=1,C=2,D=3;
    ok(S.phase==='playing','发牌后在打'+tag);
    /* everyone looks first, so a blind player's own cards being hidden does not muddy the checks */
    P().forEach(p=>p.seen=true);
    const lines=compare(A,B),ev=S.ev,loser=ev.loser,winner=loser===A?B:A;
    ok(P()[loser].folded&&P()[loser].lostCmp,'输的一方出局'+tag);
    eq(Object.keys(ev).sort(),['allIn','loser','pid','seq','target','type'],'比牌事件只有这些字段'+tag);
    ok(ev.type==='compare'&&ev.pid===A&&ev.target===B,'比牌事件说明谁和谁比'+tag);
    ok(lines.length>=2&&lines.every(l=>!/⟨/.test(l.t)),'比牌日志不带牌面'+tag);
    ok(!/⟨/.test(JSON.stringify(ev)),'比牌事件不带牌面'+tag);
    for(const w of [C,D]){const v=viewFor(w);ok(hidden(v,A)&&hidden(v,B),`第三个人 ${w} 看到的还是背面`+tag)}
    open(viewFor(A),B);open(viewFor(B),A);
    ok(hidden(viewFor(A),C)&&hidden(viewFor(B),D),'比牌的人看不到没比的人的牌'+tag);
    /* no hand names go out before the end of the hand */
    for(let w=0;w<4;w++){const v=viewFor(w);ok(v.players.every(p=>!p.handName&&!p.revealName),`本手没结束，座位 ${w} 的快照里没有牌型名`+tag)}
    ok(viewFor(C).log.every(l=>!/⟨/.test(l.t)),'第三个人的日志里没有牌面'+tag);
    /* the rest show down: the winner of the compare and C and D (D folds first, so only C and the winner show) */
    S.toAct=D;zAct(P()[D],'fold');TQ=[];
    if(S.phase==='playing'){S.round=S.cfg.zrounds+1;zProceed();TQ=[]}
    eq(S.phase,'handover','本手结束'+tag);
    const vc=viewFor(C);
    ok(P()[winner].shown&&vc.players[winner].handName,'开牌的人有牌型名'+tag);
    if(showAll){
      ok(vc.players[loser].revealName&&vc.players[D].revealName,'亮出所有人：比牌输的和弃牌的也有牌型名');
      ok(!hidden(vc,loser),'亮出所有人：本手结束时亮出比牌输的人的牌');
    }else{
      ok(!vc.players[loser].handName&&!vc.players[loser].revealName,'没勾选：比牌输的人到最后也没有牌型名');
      ok(!vc.players[D].handName&&!vc.players[D].revealName,'没勾选：弃牌的人没有牌型名');
      ok(hidden(vc,loser)&&hidden(vc,D),'没勾选：第三个人到最后也看不到比牌输的人和弃牌的人的牌');
      open(viewFor(winner===A?B:A),winner);
    }
  }
  console.log(`zjh-view: ${passed} passed, ${failed} failed`);
  return failed;
}
let failed;
try{failed=vm.runInContext('('+tests.toString()+')()',ctx)}catch(e){console.log('ERROR',e.stack.split('\n').slice(0,3).join(' | '));failed=1}
process.exit(failed?1:0);
