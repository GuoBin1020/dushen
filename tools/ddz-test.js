#!/usr/bin/env node
/* 斗地主规则测试：node tools/ddz-test.js
   页面脚本是共用全局作用域的普通 <script>，这里用 vm 把它们按顺序跑在同一个上下文里，再在里面跑测试。 */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..');
const ctx=vm.createContext({console,Math,Date,JSON,Set,Map,Object,Array,Number,String,Boolean});
for(const f of ['js/common.js','js/games/doudizhu.js','js/games/doudizhu-coach.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
/* page globals the coach pieces read */
vm.runInContext("var LOCAL={mode:'live'},T={last:null,decisions:[]};function myTurn(){return false}function coachOn(){return true}",ctx);

function tests(){
  let passed=0,failed=0;
  const show=x=>JSON.stringify(x);
  const ok=(c,msg)=>{if(c)passed++;else{failed++;console.log('FAIL',msg||'')}};
  const eq=(a,b,msg)=>{const A=show(a),B=show(b);if(A===B)passed++;else{failed++;console.log('FAIL',msg||'',' got',A,' want',B)}};
  /* 'A A 3 小王' -> ids; suits are handed out in turn so a rank's cards differ */
  const C=s=>{const used={};return s.trim().split(/\s+/).map(t=>{if(t==='小王')return 52;if(t==='大王')return 53;const r=['3','4','5','6','7','8','9','10','J','Q','K','A','2'].indexOf(t);if(r<0)throw new Error('bad card '+t);used[r]=(used[r]||0)+1;return r*4+used[r]-1})};
  const T=s=>{const c=ddClassify(C(s));return c&&c.type};

  /* ---------- Task 1: cards and hand types ---------- */
  eq(T('5'),'single');
  eq(T('小王 大王'),'rocket');
  eq(T('3 3 3 4'),'triple1');
  eq(T('3 3 3 4 4'),'triple2');
  eq(ddClassify(C('3 3 3 4 5')),null,'三带两张单牌不合法');
  eq(T('3 4 5 6 7'),'straight');
  eq(ddClassify(C('3 4 5 6 7')).len,5);
  eq(T('10 J Q K A'),'straight');
  eq(ddClassify(C('J Q K A 2')),null,'2 不能进顺子');
  eq(ddClassify(C('3 4 5 6')),null,'顺子至少 5 张');
  eq(T('3 3 4 4 5 5'),'pairs');
  eq(ddClassify(C('Q Q K K A A 2 2')),null,'2 不能进连对');
  eq(T('3 3 3 4 4 4'),'plane');
  eq(T('3 3 3 4 4 4 7 9'),'plane1');
  eq(T('3 3 3 4 4 4 7 7 9 9'),'plane2');
  eq(T('6 6 6 6 3 8'),'four2');
  eq(T('6 6 6 6 3 3 8 8'),'four22');
  eq(T('6 6 6 6'),'bomb');
  eq(T('3 3 3 3 4 4 4 4'),'four22','多种理解时取四带两对');
  eq(ddClassify(C('3 3 3 3 4 4 4 4')).main,ddRank(C('4')[0]),'主体是 4444');
  eq(T('5 5 5 6 6 6 7 7 7 8 8 8'),'plane','12 张优先当 4 组飞机');
  eq(ddClassify(C('K K K A A A 2 2 2')),null,'2 不能进飞机');
  ok(ddBeats(ddClassify(C('6')),ddClassify(C('5'))),'6 压 5');
  ok(!ddBeats(ddClassify(C('5 5')),ddClassify(C('6'))),'类型不同不能压');
  ok(ddBeats(ddClassify(C('3 3 3 3')),ddClassify(C('A A A K'))),'炸弹压三带一');
  ok(ddBeats(ddClassify(C('小王 大王')),ddClassify(C('2 2 2 2'))),'王炸压炸弹');
  ok(!ddBeats(ddClassify(C('4 5 6 7 8')),ddClassify(C('3 4 5 6 7 8'))),'张数不同不能压');
  ok(ddBeats(ddClassify(C('2')),ddClassify(C('A'))),'2 压 A');
  ok(ddBeats(ddClassify(C('大王')),ddClassify(C('小王'))),'大王压小王');
  ok(ddBeats(ddClassify(C('4 4 4 4')),ddClassify(C('3 3 3 3'))),'大炸弹压小炸弹');
  ok(ddBeats(ddClassify(C('7')),null),'首出总能出');
  eq(ddRank(52),13);eq(ddRank(53),14);eq(ddRank(C('2')[0]),12);
  const d=ddDeck();eq(d.length,54);eq(new Set(d).size,54);
  eq(ddSort(C('3 小王 2 A')).map(ddRank),[13,12,11,0]);
  eq(ddTypeName(ddClassify(C('小王 大王'))),'王炸');
  eq(ddTypeName(ddClassify(C('3 4 5 6 7'))),'顺子');
  ok(isD({cfg:{game:'ddz'}})&&!isD({cfg:{game:'zjh'}}),'isD');

  /* ---------- Task 2: moves, split, bidding, spring, payout ---------- */
  eq(ddMoves(C('5 K'),ddClassify(C('4'))).map(m=>m.length),[1,1]);
  eq(ddRank(ddMoves(C('5 K'),ddClassify(C('4')))[0][0]),ddRank(C('5')[0]),'小的在前');
  ok(ddMoves(C('3 3 3 3 5'),ddClassify(C('A'))).some(m=>m.length===4),'炸弹能压单张');
  eq(ddMoves(C('3 4'),ddClassify(C('5 5'))).length,0);
  ok(ddMoves(C('3 4 5 6 7 9'),null).some(m=>ddClassify(m).type==='straight'),'首出能出顺子');
  ok(ddMoves(C('3 4 5 6 7 9'),null).every(m=>ddClassify(m)),'首出的每一手都成牌型');
  ok(ddMoves(C('小王 大王 3'),ddClassify(C('2 2 2 2'))).some(m=>ddClassify(m).type==='rocket'),'王炸压炸弹');
  {const ms=ddMoves(C('8 8 8 9 9 9 3 4 K K'),ddClassify(C('5 5 5 6 6 6 7 10')));ok(ms.length>0&&ms.every(m=>ddClassify(m).type==='plane1'),'飞机带翅膀能跟');}
  {const ms=ddMoves(C('9 9 9 9 3 3 3 3 5 7'),ddClassify(C('6')));eq(ms.slice(-2).map(m=>ddClassify(m).type),['bomb','bomb'],'炸弹排在最后');}
  eq(ddSplit(C('3 4 5 6 7 8 K K')).hands,2);
  eq(ddSplit(C('3 3 3 3 5')).hands,2);
  eq(ddSplit(C('小王 大王 7')).hands,2);
  ok(ddSplit(C('3 4 5 6 7 8 K K')).groups.every(g=>ddClassify(g)),'拆出来的每组都成牌型');
  let b=ddBidNew([0,1,2],false);
  eq(ddBidAsk(b),{pid:0,kind:'call'});
  b=ddBidStep(b,0,false);b=ddBidStep(b,1,true);b=ddBidStep(b,2,false);
  eq(ddBidAsk(b),null);eq(ddBidResult(b),{landlord:1,robs:0,redeal:false});
  b=ddBidNew([0,1,2],false);
  b=ddBidStep(b,0,true);eq(ddBidAsk(b),{pid:1,kind:'rob'});
  b=ddBidStep(b,1,true);b=ddBidStep(b,2,false);eq(ddBidAsk(b),{pid:0,kind:'rob'},'最先叫的人最后还能抢');
  b=ddBidStep(b,0,true);eq(ddBidResult(b),{landlord:0,robs:2,redeal:false});
  b=ddBidNew([0,1,2],false);b=ddBidStep(b,0,true);b=ddBidStep(b,1,true);b=ddBidStep(b,2,true);b=ddBidStep(b,0,false);
  eq(ddBidResult(b),{landlord:2,robs:2,redeal:false});
  b=ddBidNew([0,1,2],false);b=ddBidStep(b,0,true);b=ddBidStep(b,1,false);b=ddBidStep(b,2,false);
  eq(ddBidAsk(b),null,'没人抢，最先叫的人不再被问');eq(ddBidResult(b).landlord,0);
  b=ddBidNew([2,0,1],false);b=ddBidStep(b,2,false);b=ddBidStep(b,0,false);b=ddBidStep(b,1,false);
  eq(ddBidResult(b),{landlord:-1,robs:0,redeal:true});
  b=ddBidNew([2,0,1],false);b=ddBidStep(b,2,false);b=ddBidStep(b,0,true);eq(ddBidAsk(b),{pid:1,kind:'rob'},'说过不叫的人不能抢');
  b=ddBidStep(b,1,false);eq(ddBidAsk(b),null);
  {const b0=ddBidNew([0,1,2],false);ddBidStep(b0,0,true);eq(ddBidAsk(b0),{pid:0,kind:'call'},'ddBidStep 不改动原对象');}
  {const b0=ddBidNew([0,1,2],false);eq(ddBidStep(b0,1,true),b0,'不是他表态时忽略');}
  eq(ddBidResult(ddBidNew([1,2,0],true)),{landlord:1,robs:0,redeal:false});
  eq(ddBidAsk(ddBidNew([1,2,0],true)),null);
  eq(ddMultText({robs:2,bombs:1,rockets:1,spring:'spring',dbl:{0:true,1:false,2:true}},['甲','乙','丙']),'抢地主 2 次 ×4、炸弹 1 个 ×2、王炸 ×2、春天 ×2；加倍：甲、丙');
  eq(ddMultText({robs:0,bombs:0,rockets:0,spring:'',dbl:{}},['甲','乙','丙']),'没有翻倍');
  eq(ddMultText({robs:0,bombs:2,rockets:0,spring:'anti',dbl:{}},['甲','乙','丙']),'炸弹 2 个 ×4、反春 ×2');
  eq(ddSpring({0:5,1:0,2:0},0,0),'spring');eq(ddSpring({0:5,1:1,2:0},0,0),'');
  eq(ddSpring({0:1,1:6,2:3},0,1),'anti');eq(ddSpring({0:2,1:6,2:3},0,1),'');
  const S3={0:2000,1:2000,2:2000};
  eq(ddPayout({base:20,mult:4,cap:64,landlordWon:true,landlord:0,farmers:[1,2],dbl:{},stacks:S3}),{0:160,1:-80,2:-80});
  eq(ddPayout({base:20,mult:8,cap:64,landlordWon:false,landlord:0,farmers:[1,2],dbl:{1:true,0:true},stacks:S3}),{0:-960,1:640,2:320});
  eq(ddPayout({base:20,mult:128,cap:64,landlordWon:true,landlord:0,farmers:[1,2],dbl:{},stacks:S3}),{0:2560,1:-1280,2:-1280},'封顶');
  eq(ddPayout({base:20,mult:16,cap:64,landlordWon:true,landlord:0,farmers:[1,2],dbl:{},stacks:{0:2000,1:100,2:2000}}),{0:420,1:-100,2:-320},'农民筹码不够');
  eq(ddPayout({base:20,mult:8,cap:64,landlordWon:false,landlord:0,farmers:[1,2],dbl:{2:true,0:true},stacks:{0:300,1:2000,2:2000}}),{0:-300,1:100,2:200},'地主付不起按比例');
  eq(ddPayout({base:10,mult:1,cap:64,landlordWon:false,landlord:2,farmers:[0,1],dbl:{},stacks:{0:5,1:5,2:7}}),{0:4,1:3,2:-7},'余数守恒');

  /* ---------- Task 3: bots ---------- */
  ok(['aggro','safe','team'].every(k=>DD_ARCH[k]&&DD_ARCH[k].name&&'bid' in DD_ARCH[k]&&'bomb' in DD_ARCH[k]&&'team' in DD_ARCH[k]),'三种性格');
  ok(DD_ARCH[ddPickArch()],'ddPickArch');
  const A=DD_ARCH.safe;
  ok(ddStrength(C('小王 大王 2 2 2 A A K 9 9 8 7 6 5 4 3 3'))>ddStrength(C('3 4 5 7 8 9 10 J 3 4 6 8 9 J Q 5 6')),'强度');
  ok(ddBotBid(C('小王 大王 2 2 2 A A K 9 9 8 7 6 5 4 3 3'),'call',A),'好牌叫地主');
  ok(!ddBotBid(C('3 4 5 7 8 9 10 J 3 4 6 8 9 J Q 5 6'),'call',A),'烂牌不叫');
  ok(!ddBotDouble(C('3 4 5 7 8 9 10 J 3 4 6 8 9 J Q 5 6'),false,A),'烂牌不加倍');
  const info=(hand,prev,o={})=>({hand,prev,me:1,landlord:0,counts:{0:10,1:hand.length,2:10},arch:A,...o});
  eq(ddBotPlay(info(C('5 K'),{cls:ddClassify(C('4')),pid:0})).map(ddRank),[ddRank(C('5')[0])],'用最小的压');
  eq(ddBotPlay(info(C('3 4 5 6 7'),{cls:ddClassify(C('8')),pid:2})),null,'队友的牌不压');
  eq(ddBotPlay(info(C('9 9'),null)).length,2,'能一次出完');
  eq(ddBotPlay(info(C('3 3 3 3 5 9'),{cls:ddClassify(C('A')),pid:0},{counts:{0:2,1:6,2:10}})).length,4,'地主快走完用炸弹');
  eq(ddBotPlay(info(C('3 3 3 3 5 9'),{cls:ddClassify(C('6')),pid:0},{counts:{0:15,1:6,2:10}})).map(ddRank),[ddRank(C('9')[0])],'不浪费炸弹');
  {const lead=ddBotPlay(info(C('3 4 5 6 7 K K 2'),null));eq(ddClassify(lead).type,'straight','首出先出顺子');}
  {const lead=ddBotPlay(info(C('3 9 K'),null,{me:2,counts:{0:1,1:10,2:3}}));ok(lead.length!==1||ddRank(lead[0])===ddRank(C('K')[0]),'下家地主报单时不出小单张');}
  {const p=ddBotPlay(info(C('3 4 5 6 7'),{cls:ddClassify(C('5')),pid:0},{counts:{0:8,1:5,2:10}}));ok(p===null||ddClassify(p),'跟牌出的都合法');}
  /* teamwork: me 1, landlord 0, partner 2 sits next to me */
  eq(ddBotPlay(info(C('3 3 4 5 6 7 8 K K Q'),null,{counts:{0:10,1:10,2:1}})).map(ddRank),[ddRank(C('3')[0])],'队友只剩 1 张，送一张小单牌');
  {const m=ddBotPlay(info(C('3 9 9 J Q K A 2'),null,{counts:{0:10,1:8,2:2}}));eq(m.map(ddRank),[ddRank(C('9')[0]),ddRank(C('9')[0])],'队友只剩 2 张，送一对');}
  eq(ddBotPlay(info(C('6 9 A 3 3 3 3'),{cls:ddClassify(C('5')),pid:0},{counts:{0:4,1:7,2:10}})).map(ddRank),[ddRank(C('A')[0])],'地主快走完时用最大的牌拦');
  {const m=ddBotPlay(info(C('4 4 9 K'),null,{me:2,counts:{0:2,1:10,2:4}}));ok(m.length!==2,'下家地主剩 2 张时不出对子');}
  {for(let i=0;i<300;i++){const h=ddDeck().slice(0,17),pr=ddMoves(ddDeck().slice(0,17),null)[0],cls=ddClassify(pr);const p=ddBotPlay(info(h,{cls,pid:0},{counts:{0:10,1:17,2:10}}));if(p&&!(ddBeats(ddClassify(p),cls)&&p.every(id=>h.includes(id)))){ok(false,'随机跟牌不合法 '+JSON.stringify([h,pr,p]));break}}ok(true);}
  {for(let i=0;i<300;i++){const h=ddDeck().slice(0,17);const p=ddBotPlay(info(h,null,{counts:{0:10,1:17,2:10}}));if(!p||!ddClassify(p)||!p.every(id=>h.includes(id))){ok(false,'随机首出不合法 '+JSON.stringify([h,p]));break}}ok(true);}

  /* ---------- step 2 · Task 1: what is still out there ---------- */
  {const u=ddUnseen(C('3 3 大王'),[2,51]);eq(u[0],1,'3 还剩 1 张');eq(u[12],3,'2 还剩 3 张');eq(u[14],0,'大王在自己手里');eq(u[13],1);}
  {const u=new Array(15).fill(0);u[5]=1;ok(!ddCanBeBeaten(ddClassify(C('9')),u),'只剩一张 8，压不住 9');}
  {const u=new Array(15).fill(0);u[10]=1;ok(ddCanBeBeaten(ddClassify(C('9')),u),'K 压得住 9');}
  {const u=new Array(15).fill(0);u[3]=4;ok(ddCanBeBeaten(ddClassify(C('2')),u),'别人可能有炸弹');}
  {const u=new Array(15).fill(0);u[13]=1;u[14]=1;ok(ddCanBeBeaten(ddClassify(C('2 2 2 2')),u),'别人可能有王炸');}
  {const u=new Array(15).fill(0);u[11]=2;ok(!ddCanBeBeaten(ddClassify(C('K K K 3')),u),'只剩两张 A，压不住三个 K');}
  {const u=new Array(15).fill(1);u[13]=0;ok(!ddCanBeBeaten(ddClassify(C('10 J Q K A')),u),'最大的顺子压不住');}
  {const u=new Array(15).fill(1);ok(ddCanBeBeaten(ddClassify(C('9 10 J Q K')),u),'更大的顺子压得住');}
  {const u=new Array(15).fill(0);u[4]=4;ok(ddCanBeBeaten(ddClassify(C('3 3 3 3')),u),'更大的炸弹压得住炸弹');}
  ok(!ddCanBeBeaten(ddClassify(C('小王 大王')),new Array(15).fill(4)),'王炸压不住');
  {const A=C('A')[0],K=C('K')[0],Q=C('Q')[0];
   const v=(me,lord)=>({me,dd:{landlord:lord,bottom:[A,K,Q],out:[K]},players:[{cards:[]},{cards:[Q]},{cards:[]}]});
   eq(ddLordBottom(v(1,0)),[A],'地主手里确定有还没出的底牌');eq(ddLordBottom(v(0,0)),[],'自己是地主');eq(ddLordBottom({...v(1,-1),dd:{landlord:-1,bottom:[null,null,null],out:[]}}),[],'还没定地主');}

  /* ---------- step 2 · Task 2: move scoring ---------- */
  const ev=(hand,prev,o={})=>ddEvalMoves({hand,prev,me:1,landlord:0,counts:{0:10,1:hand.length,2:10},arch:DD_ARCH.safe,out:[],...o});
  {const out=[...[0,1,2,3,4,5,6,7,8,9].map(r=>r*4+3),...C('A A A A 2 2 2 2 小王 大王')];const top=ev(C('K K 3'),null,{out})[0];
   eq(top.cards.map(ddRank),[10,10],'剩两手时先出压不住的 KK');ok(top.boss,'KK 压不住');}
  eq(ev(C('K K 3'),null)[0].cards.map(ddRank),[0],'没有把握时先出小牌');
  ok(ev(C('5 K'),{cls:ddClassify(C('4')),pid:0}).some(m=>m.cards===null),'有上家时有「不要」');
  ok(ev(C('5 K'),{cls:ddClassify(C('4')),pid:0}).every(m=>typeof m.why==='string'&&m.why.length>0),'每个出法都有理由');
  ok(ev(C('5 K'),null).every(m=>m.cards!==null),'首出没有「不要」');
  {const r=ev(C('3 4 5 6 7 9'),null);ok(r.every((m,i)=>i===0||r[i-1].score>=m.score),'按分数从高到低');ok(r.every(m=>typeof m.after==='number'&&typeof m.boss==='boolean'),'有 after 和 boss');}
  ok(ddMoves(C('8 8 8 9 9 9 4 4'),ddClassify(C('5 5 5 6 6 6 7 10'))).some(m=>ddClassify(m).type==='plane1'),'对子拆成两张单牌当翅膀');

  /* ---------- step 2 · Task 3: advice and grading ---------- */
  const V0=o=>({handNo:3,me:1,toAct:1,phase:'playing',cfg:{base:20},players:[{cards:new Array(o.c0||17).fill(null)},{cards:o.hand},{cards:new Array(o.c2||17).fill(null)}],
    dd:{stage:o.stage||'play',landlord:o.lord??0,ask:o.ask||null,lead:o.lead||null,out:o.out||[],bottom:o.bottom||[null,null,null],dbl:{},mult:1}});
  const L4={pid:0,cls:ddClassify(C('4')),cards:C('4')};
  {const a=ddAdvise(V0({stage:'bid',lord:-1,ask:{pid:1,kind:'call'},hand:C('小王 大王 2 2 2 A A K 9 9 8 7 6 5 4 3 3')}));eq(a.rec,{type:'bid',kind:'call',yes:true});ok(/炸弹|大王|手/.test(a.why),'叫地主有理由');eq(a.alts,[]);}
  eq(ddAdvise(V0({stage:'bid',lord:-1,ask:{pid:1,kind:'call'},hand:C('3 4 5 7 8 9 10 J 3 4 6 8 9 J Q 5 6')})).rec.yes,false,'烂牌不叫');
  {const a=ddAdvise(V0({stage:'double',hand:C('3 4 5 7 8 9 10 J 3 4 6 8 9 J Q 5 6')}));eq(a.rec,{type:'double',yes:false});ok(a.why.length>0);}
  {const a=ddAdvise(V0({hand:C('5 K'),lead:L4}));eq(a.rec.type,'play');eq(a.rec.cards.map(ddRank),[2]);ok(a.alts.length>=2,'列出备选');ok(typeof a.strength==='number'&&typeof a.hands==='number');}
  eq(ddAdvise(V0({hand:C('3 4 5 6 7 9'),lead:{pid:2,cls:ddClassify(C('8')),cards:C('8')}})).rec,{type:'pass'},'队友的牌不要');
  eq(ddRecLabel({type:'bid',kind:'rob',yes:false}),'不抢');eq(ddRecLabel({type:'bid',kind:'call',yes:true}),'叫地主');
  eq(ddRecLabel({type:'double',yes:true}),'加倍');eq(ddRecLabel({type:'pass'}),'不要');
  eq(ddRecLabel({type:'play',cards:C('3 4 5 6 7')}),'顺子（3 4 5 6 7）');
  {const a=ddAdvise(V0({hand:C('5 K'),lead:L4}));
   eq(ddGrade(a,{type:'play',cards:a.rec.cards}).g,'good','和建议一样');
   eq(ddGrade(a,{type:'pass'}).g,'minor','地主还有 17 张，不压只算小偏差');}
  {const g=ddGrade(ddAdvise(V0({hand:C('5 K'),c0:3,lead:L4})),{type:'pass'});eq(g.g,'mistake','地主只剩 3 张，该压不压');ok(/快出完/.test(g.note));}
  {const a=ddAdvise(V0({hand:C('3 4 5 6 7 9'),lead:{pid:2,cls:ddClassify(C('8')),cards:C('8')}}));
   const g=ddGrade(a,{type:'play',cards:C('9')});eq(g.g,'minor');ok(/队友/.test(g.note),'压了队友');
   eq(ddGrade(a,{type:'pass'}).g,'good','队友的牌不要是对的');}
  {const a=ddAdvise(V0({hand:C('3 4 5 6 7 9'),lead:null}));const g=ddGrade(a,{type:'play',cards:C('5')});ok(g.extra>=2&&g.g==='mistake','拆散顺子多出手数');ok(/多/.test(g.note));}
  {const a=ddAdvise(V0({hand:C('3 3 3 3 5 9'),lead:{pid:0,cls:ddClassify(C('6')),cards:C('6')}}));const g=ddGrade(a,{type:'play',cards:C('3 3 3 3')});ok(/炸弹/.test(g.note)&&g.g!=='good','炸弹用早了');}
  {const a=ddAdvise(V0({stage:'bid',lord:-1,ask:{pid:1,kind:'call'},hand:C('小王 大王 2 2 2 A A K 9 9 8 7 6 5 4 3 3')}));ok(['ok','minor'].includes(ddGrade(a,{type:'bid',yes:false}).g),'叫抢不同评 ok 或 minor');eq(ddGrade(a,{type:'bid',yes:false}).extra,0);}
  ok(DD_COACH.bid===6&&DD_COACH.rob===8.5&&DD_COACH.dbl===10,'教练门槛');
  /* review fixes: the partner's play is not pressed even when the landlord is low (me 1, partner 2, landlord 0 with 2 cards) */
  {const hand=C('3 5 7 7 9 9 J J K 2'),prev={cls:ddClassify(C('6')),pid:2};
   for(const k of ['aggro','safe','team'])eq(ddEvalMoves({hand,prev,me:1,landlord:0,counts:{0:2,1:10,2:8},arch:DD_ARCH[k],out:[]})[0].cards,null,'不压队友（'+k+'）');
   const a=ddAdvise(V0({hand,c0:2,c2:8,lead:{pid:2,cls:prev.cls,cards:C('6')}}));eq(a.rec,{type:'pass'},'教练也说不要');eq(ddGrade(a,{type:'pass'}).g,'good','不压队友评好');}
  /* the coach panel copes with a view that has no deal yet */
  {let threw=false;try{ddCoachHTML({handNo:0,me:0,toAct:-1,phase:'waiting',dd:null,players:[{cards:[]},{cards:[]},{cards:[]}]},'')}catch(e){threw=e.message}eq(threw,false,'还没发牌时教练面板不报错');}
  /* the counter's note: no bottom pile once the landlord has taken it */
  {const v=(lord)=>({me:1,dd:{landlord:lord,bottom:lord<0?[null,null,null]:C('A K Q'),out:[]},players:[{cards:[]},{cards:C('3')},{cards:[]}]});
   ok(/底牌/.test(ddCounterHTML(v(-1))),'没定地主时说包括底牌');ok(!/或底牌里/.test(ddCounterHTML(v(0))),'地主拿走底牌后不再说底牌里');}

  /* ---------- step 4 · Task 1: 赖子 readings and bomb kinds (wild = 7) ---------- */
  {const LZ=ddRank(C('7')[0]);
   const R=s=>ddReadings(C(s),LZ).map(c=>c.type+':'+DR[c.main]+(c.bk?':'+c.bk:''));
   eq(R('7'),['single:7'],'单出赖子是 7');eq(R('7 7'),['pair:7']);eq(R('7 7 7'),['triple:7']);eq(R('7 7 7 7'),['bomb:7:pure'],'纯赖子炸');
   eq(R('9 7'),['pair:9'],'赖子配 9 成对 9');
   ok(R('9 9 9 7').includes('bomb:9:soft'),'软炸');ok(R('9 9 9 7').includes('triple1:9'),'也可以当三带一');eq(R('9 9 9 7')[0],'bomb:9:soft','炸弹排在前面');
   {const r=R('8 9 10 J 7');ok(r.includes('straight:7'),'赖子按本来点数进顺子');ok(r.includes('straight:8'),'赖子当 Q 补顺子');}
   eq(R('小王 7'),[],'赖子不能当王');eq(R('大王 7'),[],'赖子不能和王成对');
   eq(R('Q K A 7 7'),['straight:10'],'赖子补 10 和 J，不能补出 2');
   eq(R('3 3 3 7 7'),['triple2:3'],'三带二：两张赖子当对子');
   ok(R('5 5 5 6 6 7').includes('plane:5'),'赖子补飞机');
   ok(R('9 9 9 9 7 3').includes('four2:9'),'四带二带赖子');
   eq(ddReadings(C('3 4 5 6 8'),LZ),[],'没有赖子时照常不合法');eq(ddReadings(C('3 4 5 6 9'),-1),[],'不开赖子');
   {const c=ddReadings(C('8 9 10 J 7'),LZ).find(x=>x.main===5);eq(c.as.map(x=>DR[x.rank]),['Q'],'记下赖子当了 Q');}
   {const c=ddReadings(C('8 9 10 J 7'),LZ).find(x=>x.main===4);eq(c.as,[],'按本来点数不记');}
   {const c=ddClassify(C('9 9 9 9'),LZ);eq(c.bk,'hard');eq(c.as,[]);}
   eq(ddClassify(C('9 9 9 9')).bk,'hard','不开赖子时炸弹也标 hard');
   const B=s=>ddClassify(C(s),LZ);
   ok(ddBeats(B('3 3 3 3'),B('2 2 2 7')),'硬炸 3 压软炸 2');ok(!ddBeats(B('2 2 2 7'),B('3 3 3 3')),'软炸压不过硬炸');
   ok(ddBeats(B('7 7 7 7'),B('2 2 2 2')),'纯赖子炸压硬炸');ok(ddBeats(B('小王 大王'),B('7 7 7 7')),'王炸最大');
   ok(ddBeats(B('K K K 7'),B('Q Q Q 7')),'软炸之间比点数');ok(!ddBeats(B('Q Q Q 7'),B('K K K 7')));}

  /* ---------- step 4 · Task 2: moves, split, strength and "can be beaten" with 赖子 (wild = 7) ---------- */
  {const LZ=ddRank(C('7')[0]);
   ok(ddMoves(C('8 9 10 J 7 3'),null,LZ).some(m=>ddPlayReading(m,null,LZ).type==='straight'&&m.length===5),'用赖子凑出顺子');
   {const pr=ddClassify(C('2'),LZ);ok(ddMoves(C('9 9 9 7 3'),pr,LZ).some(m=>{const c=ddPlayReading(m,pr,LZ);return c&&c.bk==='soft'}),'用赖子凑软炸压 2');}
   ok(ddMoves(C('8 9 10 J 7 3'),null,LZ).every(m=>ddPlayReading(m,null,LZ)),'赖子模式首出的每一手都能理解');
   eq(ddSplit(C('8 9 10 J 7'),LZ).hands,1,'赖子补成顺子，一手出完');
   ok(ddSplit(C('8 9 10 J 7 3 3'),LZ).groups.every(g=>ddReadings(g,LZ).length),'拆出来的每组都能理解');
   eq(ddSplit(C('8 9 10 J 7 3'),LZ).groups.flat().length,6,'拆牌不丢牌');
   ok(ddStrength(C('7 7 3 4'),LZ)>ddStrength(C('7 7 3 4'),-1),'赖子加分');
   {const u=new Array(15).fill(0);u[9]=3;u[LZ]=1;ok(ddCanBeBeaten(ddClassify(C('5'),LZ),u,LZ),'三张 Q 加一张没出的赖子能凑软炸');}
   {const u=new Array(15).fill(0);u[9]=3;u[LZ]=1;ok(!ddCanBeBeaten(ddClassify(C('2 2 2 2'),LZ),u,LZ),'硬炸 2 不怕软炸');}
   {const u=new Array(15).fill(0);u[LZ]=4;ok(ddCanBeBeaten(ddClassify(C('2 2 2 2'),LZ),u,LZ),'四张赖子都没出，硬炸压得住');}
   {const u=new Array(15).fill(0);u[10]=1;u[LZ]=1;ok(ddCanBeBeaten(ddClassify(C('Q Q'),LZ),u,LZ),'一张 K 加赖子能凑对 K');}
   eq(ddRecLabel({type:'play',cards:C('8 9 10 J 7'),as:[{id:C('7')[0],rank:9}]},LZ),'顺子（8 9 10 J 赖→Q）','赖子按当成的点数显示');
   let bad=null;
   for(let i=0;i<300&&!bad;i++){const lz=Math.floor(Math.random()*13),h=ddDeck().slice(0,17),pr=ddMoves(ddDeck().slice(0,17),null,lz)[0],pc=ddPlayReading(pr,null,lz);
     const info={hand:h,prev:{cls:pc,pid:0},me:1,landlord:0,counts:{0:10,1:17,2:10},arch:DD_ARCH.safe,out:[],laizi:lz};
     const p=ddBotPlay(info);if(p&&(!ddPlayReading(p,pc,lz)||!p.every(id=>h.includes(id))))bad=[lz,h,pr,p];
     const l=ddBotPlay({...info,prev:null});if(!l||!ddPlayReading(l,null,lz))bad=['lead',lz,h,l];}
   eq(bad,null,'赖子模式电脑的牌都合法');
   {const a=ddAdvise({handNo:1,me:1,toAct:1,phase:'playing',cfg:{base:20},players:[{cards:new Array(17).fill(null)},{cards:C('8 9 10 J 7')},{cards:new Array(17).fill(null)}],
     dd:{stage:'play',landlord:0,lead:null,out:[],bottom:[null,null,null],dbl:{},mult:1,laizi:LZ}});
    eq(a.rec.type,'play');eq(a.rec.cards.length,5,'教练建议一次出完');ok(a.rec.cls&&a.rec.cls.type==='straight','建议带着理解');}
  }

  /* ---------- step 4 · review fixes (wild = 7) ---------- */
  {const LZ=ddRank(C('7')[0]),T1=ddClassify(C('8 8 8 3'));
   eq(ddPlayReading(C('9 9 9 7'),T1,LZ).type,'triple1','跟三带一时按三带一出，不浪费炸弹');
   eq(ddPlayReading(C('9 9 9 7'),null,LZ).type,'triple1','首出时先按非炸弹理解');
   {const r=ddEvalMoves({hand:C('9 9 9 7 3'),prev:null,me:1,landlord:0,counts:{0:10,1:5,2:10},arch:DD_ARCH.safe,out:[],laizi:LZ});
    const same=r.filter(m=>m.cards&&ddSameCards(m.cards,C('9 9 9 7')));ok(same.some(m=>m.cls.type==='bomb')&&same.some(m=>m.cls.type==='triple1'),'同一组牌的炸弹和三带一都参加打分');}
   {const p=ddBotPlay({hand:C('9 9 9 7 3 K'),prev:{cls:T1,pid:0},me:1,landlord:0,counts:{0:10,1:6,2:10},arch:DD_ARCH.safe,out:[],laizi:LZ});ok(p&&p.cls&&p.cls.type==='triple1','电脑用三带一压，不炸也不让');}
   {const hand=C('7 7 7 7 3 4 5 6 8 9 10 J Q 3 4 5 6');ok(ddBotBid(hand,'call',DD_ARCH.safe,LZ),'四张赖子会叫地主');ok(ddBotDouble(hand,true,DD_ARCH.aggro,LZ)&&!ddBotDouble(hand,true,DD_ARCH.aggro,-1),'加倍时算上赖子');}
   ok(ddChoices(C('7 7 7 5'),null,LZ).length<=4,'选项按牌型合并，不会一长串');
   {const ch=ddChoices(C('7 7 7 5'),null,LZ);ok(ch.some(c=>c.type==='bomb')&&ch.some(c=>c.type==='triple1'),'炸弹和三带一都还在');eq(ch.find(c=>c.type==='triple1').main,12,'同一牌型取最大的点数');}
   {const c=ddReadings(C('3 3 3 5 7'),LZ).find(x=>x.type==='triple2');ok(c&&c.as.some(x=>DR[x.rank]==='5'),'翅膀里配对的赖子也标出来');}
   {const t=ddReadings(C('8 9 10 J 7'),LZ).find(x=>x.main===5);const a={rec:{type:'play',cards:C('8 9 10 J 7'),cls:t}};ok(!/101010/.test(ddChoiceLabel({...t,as:[{id:1,rank:7},{id:2,rank:7},{id:3,rank:7}]})),'按钮上的点数分开写');}
   {const V0b=o=>({handNo:3,me:1,toAct:1,phase:'playing',cfg:{base:20},players:[{cards:new Array(17).fill(null)},{cards:o.hand},{cards:new Array(17).fill(null)}],dd:{stage:'play',landlord:0,lead:o.lead||null,out:[],bottom:[null,null,null],dbl:{},mult:1,laizi:LZ}});
    const a=ddAdvise(V0b({hand:C('9 9 9 7 3 K'),lead:{pid:0,cls:ddClassify(C('6')),cards:C('6')}}));const tri=ddReadings(C('9 9 9 7'),LZ).find(x=>x.type==='triple1');
    ok(!/炸弹/.test(ddGrade(a,{type:'play',cards:C('9 9 9 7'),cls:tri}).note),'点评按实际出的理解，三带一不算炸弹');}
  }

  console.log(`${passed} passed, ${failed} failed`);
  return failed;
}
/* ---------- Task 4: the host game flow, run with the real engine and stubbed page / network ---------- */
const ectx=vm.createContext({console,Math,Date,JSON,Set,Map,Object,Array,Number,String,Boolean});
vm.runInContext(`var TIMERS=[];var setTimeout=(f)=>{TIMERS.push(f);return TIMERS.length};var clearTimeout=()=>{};
  var NET={role:'solo',conns:new Map()};function applyView(){}function hostSave(){}function voiceClear(){}function resetT(){}function onChat(){}var SETTLE_SEEN=null;function onSettle(m){SETTLE_SEEN=m}`,ectx);
for(const f of ['js/common.js','js/games/holdem.js','js/games/zjh.js','js/games/doudizhu.js','js/games/doudizhu-coach.js','js/games/hongzhong.js','js/games/hongzhong-coach.js','js/engine.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ectx,{filename:f});
function flow(){
  let passed=0,failed=0;
  const ok=(c,msg)=>{if(c)passed++;else{failed++;console.log('FAIL',msg||'')}};
  const eq=(a,b,msg)=>{const A=JSON.stringify(a),B=JSON.stringify(b);if(A===B)passed++;else{failed++;console.log('FAIL',msg||'',' got',A,' want',B)}};
  /* run queued timers; seat 0 is the only human and is played with the bot logic; a busted human rebuys */
  const run=()=>{for(let i=0;i<20000;i++){
    if(TIMERS.length){TIMERS.shift()();continue}
    if(S.phase==='playing'&&S.toAct===0){ddBotTurn(P()[0]);continue}
    if(S.phase==='busted'){doRebuy(P()[0]);continue}
    return true}return false};
  const conserved=()=>P().concat(S.gone||[]).reduce((a,p)=>a+p.stack-S.cfg.stack*(1+p.rebuys),0)===0;
  for(const rebuy of [true,false]){
    startGame({game:'ddz',base:20,ddcap:64,stack:2000,speed:'fast',rebuy,auto:false,aiFill:true,coach:true},[{name:'你',kind:'local',gender:'m'}]);
    eq(S.players.length,3,'三个座位');ok(S.players.slice(1).every(p=>DD_ARCH[p.ddArch]),'电脑有性格');
    let bad=0;
    for(let h=0;h<200;h++){
      if(!run()){ok(false,'卡住了');break}
      if(S.phase!=='handover'){ok(false,'没有结束: '+S.phase+' '+S.msg);break}
      if(!conserved())bad++;
      if(!P().every(p=>p.cards.length<=20))bad++;
      startHand();
    }
    eq(bad,0,'筹码守恒、手牌不超过 20 张 (rebuy '+rebuy+')');
    ok(S.handNo>=200,'打满 200 局');
    if(!rebuy){
      /* a bot out of chips with rebuys off is replaced by a new bot in the same seat; the old one stays in the settlement */
      const old=P()[1],oldName=old.name,taken=old.stack,g0=S.gone.length;P()[2].stack+=taken;old.stack=0;S.flow={'1>0':500,'0>1':120,'2>1':30};startHand();
      eq(Object.keys(S.flow).filter(k=>k.split('>').includes('1')),[],'新电脑不继承旧电脑的输赢流向');eq(S.flow[(100+g0)+'>0'],500,'旧电脑的流向留在它自己名下');eq(S.flow['0>'+(100+g0)],120);
      ok(P()[1]!==old&&P()[1].name!==oldName&&P()[1].kind==='ai'&&P()[1].stack===2000&&DD_ARCH[P()[1].ddArch],'输光的电脑被换成新电脑');
      eq(S.gone.length,g0+1);eq(S.gone[g0].name,oldName);ok(S.phase==='playing'&&S.dd.stage==='bid','换人后照常开局');
      ok(conserved(),'换人后筹码守恒');
      hostSettle('');ok(SETTLE_SEEN.standings.some(x=>x.name===oldName&&x.out),'结算里有离桌的电脑');
    }
    ok(P().every(p=>p.kind==='local'||p.stack>0||p.inHand),'座位不空');
  }
  /* nobody calls three times: the fourth deal makes the first seat landlord, and it is still one hand */
  startGame({game:'ddz',base:20,ddcap:64,stack:2000,speed:'fast',rebuy:true,auto:false,aiFill:true},[{name:'你',kind:'local',gender:'m'}]);
  const keep=ddBotBid;ddBotBid=()=>false;
  for(let i=0;i<200&&S.dd.stage==='bid';i++){if(TIMERS.length)TIMERS.shift()();else if(S.toAct===0)ddBotTurn(P()[0])}
  ddBotBid=keep;
  eq(S.dd.redeals,3,'重新发了 3 次');eq(S.dd.landlord,S.dealer,'第一家当地主');eq(S.handNo,1,'只算 1 局');
  eq(P()[S.dd.landlord].cards.length,20,'地主拿到底牌');
  /* the view: other hands and the bottom cards stay hidden */
  startGame({game:'ddz',base:20,ddcap:64,stack:2000,speed:'fast',rebuy:true,auto:false,aiFill:true},[{name:'你',kind:'local',gender:'m'}]);
  const v=viewFor(0);
  ok(v.dd&&v.dd.stage==='bid','视图有 dd');eq(v.dd.bottom,[null,null,null],'底牌没翻开');
  ok(v.players[1].cards.every(c=>c===null)&&v.players[1].cards.length===17,'别人的牌只给张数');
  ok(v.players[0].cards.every(c=>c!==null),'自己的牌能看到');
  /* illegal moves are ignored, not thrown */
  const who=S.toAct;let threw=false;try{ddAct(P()[who],'play',[999]);ddAct(P()[who],'double',1);ddAct(P()[(who+1)%3],'bid',1)}catch(e){threw=true}
  ok(!threw&&S.toAct===who&&S.dd.stage==='bid','不合法的操作被忽略');
  /* hold'em and 炸金花 settings untouched */
  eq(normalizeCfg({game:'holdem'}).game,'holdem');eq(normalizeCfg({game:'zjh',players:7}).players,7);eq(normalizeCfg({game:'ddz',players:7}).players,3);
  eq(normalizeCfg({game:'ddz'}).stack,2000,'默认 100 倍底分');eq(normalizeCfg({game:'ddz',base:50,stack:100}).stack,5000,'筹码不足 20 倍底分时用默认');
  /* step 2 · Task 1: S.dd.out */
  startGame({game:'ddz',base:20,ddcap:64,stack:2000,speed:'fast',rebuy:true,auto:false,aiFill:true},[{name:'你',kind:'local',gender:'m'}]);
  run();
  eq(S.dd.out.length,54-P().reduce((a,p)=>a+p.cards.length,0),'出过的牌 = 54 − 手里剩的');
  eq(viewFor(0).dd.out,S.dd.out,'视图里有 out');
  {const keep=ddBotBid;ddBotBid=()=>false;startHand();for(let i=0;i<9&&S.dd.redeals<1;i++){if(TIMERS.length)TIMERS.shift()();else if(S.toAct===0)ddBotTurn(P()[0])}ddBotBid=keep;eq(S.dd.redeals,1,'重新发了牌');eq(S.dd.out,[],'重新发牌后清空');}
  /* step 2 · Task 4: per-player 斗地主 stats */
  startGame({game:'ddz',base:20,ddcap:64,stack:2000,speed:'fast',rebuy:true,auto:false,aiFill:true},[{name:'你',kind:'local',gender:'m'}]);
  {let bombs=0;for(let h=0;h<150;h++){run();bombs+=S.dd.bombs+S.dd.rockets;startHand()}
   const st=P().map(p=>p.st);
   eq(st.reduce((a,x)=>a+(x.ddB||0),0),bombs,'炸弹数之和等于每局炸弹之和');
   ok(st.every(x=>(x.ddM||0)>=(x.dd||0)&&(x.dd||0)>0),'倍数之和不小于局数');
   ok(st.every(x=>(x.ddS||0)<=(x.ddW||0)),'春天局数不超过赢的局数');}
  /* step 2 · Task 2: a bot move the host refuses must not stall the hand */
  startGame({game:'ddz',base:20,ddcap:64,stack:2000,speed:'fast',rebuy:true,auto:false,aiFill:true},[{name:'你',kind:'local',gender:'m'}]);
  {const keep=ddBotPlay;ddBotPlay=()=>[999];let threw=false;try{run()}catch(e){threw=true}ddBotPlay=keep;
   ok(!threw,'没有抛异常');eq(S.phase,'handover','电脑出了不合法的牌，这局照样打完');}
  /* step 4 · Task 3: 赖子 game flow */
  const C=s=>{const used={};return s.trim().split(/\s+/).map(t=>{if(t==='小王')return 52;if(t==='大王')return 53;const r=['3','4','5','6','7','8','9','10','J','Q','K','A','2'].indexOf(t);used[r]=(used[r]||0)+1;return r*4+used[r]-1})};
  startGame({game:'ddz',base:20,ddcap:64,stack:2000,speed:'fast',rebuy:true,auto:false,aiFill:true,laizi:true},[{name:'你',kind:'local',gender:'m'}]);
  ok(S.dd.laizi>=0&&S.dd.laizi<=12,'翻出赖子');eq(viewFor(0).dd.laizi,S.dd.laizi,'所有人都看得到赖子');
  {let bad=0,kinds=0;for(let h=0;h<300;h++){run();if(S.phase!=='handover'){bad++;break}if(!conserved())bad++;kinds+=S.dd.soft+S.dd.hard+S.dd.pure;if(S.dd.bombs!==S.dd.soft+S.dd.hard+S.dd.pure)bad++;startHand()}
   eq(bad,0,'赖子模式 300 局都打完，筹码守恒，炸弹分类计数对得上');ok(kinds>0,'打出过炸弹');}
  /* multipliers and readings, on a hand set up by hand (seat 0 leads, wild = 7) */
  const setup=(laizi,cards)=>{const d=S.dd;S.phase='playing';d.stage='play';d.landlord=0;d.lead=null;d.passes=0;d.mult=1;d.laizi=laizi;d.bombs=d.soft=d.hard=d.pure=0;S.toAct=0;P()[0].cards=ddSort(cards.concat(C('3 3')));};
  const LZ=ddRank(C('7')[0]);
  setup(LZ,C('9 9 9 7'));ddAct(P()[0],'play',{cards:C('9 9 9 7'),as:{type:'bomb',main:ddRank(C('9')[0]),len:1}});eq([S.dd.mult,S.dd.soft],[2,1],'软炸 ×2');
  setup(LZ,C('9 9 9 9'));ddAct(P()[0],'play',C('9 9 9 9'));eq([S.dd.mult,S.dd.hard],[4,1],'赖子模式硬炸 ×4');
  setup(LZ,C('7 7 7 7'));ddAct(P()[0],'play',C('7 7 7 7'));eq([S.dd.mult,S.dd.pure],[4,1],'纯赖子炸 ×4');
  setup(-1,C('9 9 9 9'));ddAct(P()[0],'play',C('9 9 9 9'));eq(S.dd.mult,2,'不开赖子炸弹 ×2');
  setup(LZ,C('9 9 9 7'));ddAct(P()[0],'play',{cards:C('9 9 9 7'),as:{type:'triple1',main:ddRank(C('9')[0]),len:1}});eq(S.dd.lead.cls.type,'triple1','按选的理解出三带一');eq(S.dd.bombs,0);
  setup(LZ,C('9 9 9 7'));{const before=P()[0].cards.length;ddAct(P()[0],'play',{cards:C('9 9 9 7'),as:{type:'pairs',main:0,len:3}});eq(P()[0].cards.length,before,'不存在的理解被忽略');}
  setup(LZ,C('8 9 10 J 7'));ddAct(P()[0],'play',{cards:C('8 9 10 J 7'),as:{type:'straight',main:ddRank(C('8')[0]),len:5}});eq(S.dd.lead.cls.as.map(x=>DR[x.rank]),['Q'],'桌面记下赖子当了 Q');
  ok(/软炸|硬炸|纯赖子炸/.test(ddMultText({robs:0,bombs:2,soft:1,hard:1,pure:0,rockets:0,spring:'',dbl:{},laizi:LZ},['a','b','c'])),'倍数说明分开写炸弹种类');
  console.log(`flow: ${passed} passed, ${failed} failed`);
  return failed;
}
let failed;
try{failed=vm.runInContext('('+tests.toString()+')()',ctx)}catch(e){console.log('ERROR',e.message);failed=1}
try{failed+=vm.runInContext('('+flow.toString()+')()',ectx)}catch(e){console.log('ERROR flow',e.stack.split('\n').slice(0,3).join(' | '));failed+=1}
process.exit(failed?1:0);
