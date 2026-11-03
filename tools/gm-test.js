#!/usr/bin/env node
/* 五子棋测试：node tools/gm-test.js
   页面脚本是共用全局作用域的普通 <script>，这里用 vm 按顺序跑在同一个上下文里。 */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..');
const ctx=vm.createContext({console,Math,Date,JSON,Set,Map,Object,Array,Number,String,Boolean});
for(const f of ['js/common.js','js/games/gomoku.js','js/games/gomoku-ai.js','js/games/gomoku-coach.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
const run=s=>vm.runInContext(s,ctx);
let passed=0,failed=0;
const show=x=>JSON.stringify(x);
const ok=(c,msg)=>{if(c)passed++;else{failed++;console.log('FAIL',msg||'')}};
const eq=(a,b,msg)=>{const A=show(a),B=show(b);if(A===B)passed++;else{failed++;console.log('FAIL',msg||'',' got',A,' want',B)}};
/* a board from stone lists: x = black, o = white, each [x,y] */
const mk=(xs=[],os=[])=>{const b=new Array(225).fill(0);xs.forEach(([x,y])=>{b[y*15+x]=1});os.forEach(([x,y])=>{b[y*15+x]=2});return b};
const I=(x,y)=>y*15+x;
const win=(b,x,y,c,forbid)=>run(`gmWinner(${show(b)},${I(x,y)},${c},${forbid})`);
const fb=(b,x,y)=>run(`gmForbid(${show(b)},${I(x,y)})`);

/* ---------- Task 1: five in a row, overlines, forbidden points ---------- */
eq(run('gmPos(gmIdx(5,6))'),'F9','坐标写法 F9');eq(run('gmPos(0)'),'A15');eq(run('gmPos(224)'),'O1');
/* five in every direction */
eq(win(mk([[4,5],[5,5],[6,5],[7,5]]),8,5,1,false),'win','横向成五');
eq(win(mk([[3,2],[3,3],[3,4],[3,5]]),3,6,2,false),'','颜色不对不算');
eq(win(mk([],[[3,2],[3,3],[3,4],[3,5]]),3,6,2,false),'win','竖向成五');
eq(win(mk([[2,2],[3,3],[4,4],[5,5]]),6,6,1,true),'win','斜向成五（开禁手也算）');
eq(win(mk([],[[10,2],[9,3],[8,4],[7,5]]),6,6,2,false),'win','反斜向成五');
eq(run(`gmFive(${show(mk([[4,5],[5,5],[6,5],[7,5]]))},${I(8,5)},1).line.length`),5,'连线 5 个');
eq(win(mk([[4,5],[5,5],[6,5]]),7,5,1,false),'','四个不算赢');
/* overline */
const ov=mk([[3,7],[4,7],[5,7],[7,7],[8,7]]);
eq(win(ov,6,7,1,false),'win','不开禁手：黑长连算赢');eq(win(ov,6,7,1,true),'forbid:长连','开禁手：黑长连是禁手');
const ovw=mk([],[[3,7],[4,7],[5,7],[7,7],[8,7]]);eq(win(ovw,6,7,2,true),'win','白长连开禁手也算赢');
/* 三三 */
eq(fb(mk([[6,7],[8,7],[7,6],[7,8]]),7,7),'三三','十字三三');
eq(fb(mk([[5,5],[6,6],[8,7],[10,7]]),7,7),'三三','斜线三 + 跳三');
/* 四四 */
eq(fb(mk([[4,7],[5,7],[6,7],[7,4],[7,5],[7,6]]),7,7),'四四','横竖四四');
eq(fb(mk([[3,7],[5,7],[7,7],[9,7]]),6,7),'四四','同一行的四四 X.XXX.X');
/* five beats everything */
eq(win(mk([[3,7],[4,7],[5,7],[6,7],[7,4],[7,5],[7,6],[10,4],[9,5],[8,6]]),7,7,1,true),'win','成五同时四四：算赢');
/* 四三 is allowed */
eq(fb(mk([[4,7],[5,7],[6,7],[7,6],[7,8]]),7,7),'','四三不是禁手');
/* a false 三三: the horizontal three's two straight-four points (5,7) and (9,7) are both 长连 for black, so it is no real
   three and only the vertical one counts. Counting threes without the recursive check would wrongly call it 三三. */
const fake=mk([[6,7],[8,7],[7,6],[7,8],[5,6],[5,8],[5,9],[5,10],[5,11],[9,6],[9,8],[9,9],[9,10],[9,11]]);
eq(fb(fake,5,7),'长连','（假三三的前提）F8 对黑是长连');eq(fb(fake,7,7),'','假三三不是禁手');
/* gm-black-stuck: a full board with no five; the two empty points are both 长连 for black */
{const b=new Array(225).fill(0);for(let y=0;y<15;y++)for(let x=0;x<15;x++)b[I(x,y)]=Math.floor((x+2*y)/2)%2?2:1;
  for(const y of [3,11]){for(let x=0;x<=5;x++)b[I(x,y)]=1;b[I(6,y)]=2;b[I(3,y)]=0}
  let five=false;for(let i=0;i<225;i++)if(b[i]&&run(`gmFive(${show(b)},${i},${b[i]}).win`))five=true;
  ok(!five,'（前提）满盘没有现成的五连');
  eq([fb(b,3,3),fb(b,3,11)],['长连','长连'],'gm-black-stuck：剩下两个空位都是黑棋禁手');
  ctx.STUCK=b;}

/* ---------- Task 2: the engine ---------- */
run('var AI=gmAiModule()');
const srch=(b,c,o)=>run(`AI.search(${show(b)},${c},${show(o)})`);
const lv=['normal','hard','hell'];
/* make five when it can */
{const b=mk([[4,5],[5,5],[6,5],[7,5]],[[4,6],[5,6],[6,6]]);for(const L of ['easy',...lv])ok([I(8,5),I(3,5)].includes(srch(b,1,{level:L,forbid:false,maxNodes:3000}).move),L+'：能成五就成五')}
/* block a 冲四 (white has four, black has nothing big) */
{const b=mk([[3,3],[10,10],[3,7]],[[4,7],[5,7],[6,7],[7,7]]);for(const L of ['easy',...lv])eq(srch(b,1,{level:L,forbid:false,maxNodes:3000}).move,I(8,7),L+'：必堵冲四');}
/* block an open three (normal and up) */
{const b=mk([[3,3],[11,11]],[[6,7],[7,7],[8,7]]);for(const L of lv)ok([I(5,7),I(9,7),I(4,7),I(10,7)].includes(srch(b,1,{level:L,forbid:false,maxNodes:3000}).move),L+'：必堵活三');}
/* black (5,5)(6,5)(7,5) blocked at (4,5), and (8,6)(8,7)(8,8) blocked at (8,9): (8,5) makes two 冲四 at once (四四), a win */
{const b=mk([[5,5],[6,5],[7,5],[8,6],[8,7],[8,8],[2,12]],[[4,5],[8,9],[12,2],[13,3],[11,1]]);
  ok(srch(b,1,{level:'hell',forbid:false,maxNodes:20000}).move===I(8,5),'地狱：找到四四杀 I10');}
/* black never plays a forbidden point when the rule is on */
{const b=mk([[6,7],[8,7],[7,6],[7,8]],[[2,2],[12,12],[2,12],[12,2]]);for(const L of ['easy',...lv]){const m=srch(b,1,{level:L,forbid:true,maxNodes:3000}).move;ok(m!==I(7,7)&&!run(`gmForbid(${show(b)},${m})`),L+'：开禁手不下禁手点')}}
/* explain */
{const b=mk([[3,3],[11,11]],[[6,7],[7,7],[8,7]]);const e=run(`AI.explain(${show(b)},1,${I(5,7)},false)`);ok(e.block.includes('活三'),'解释：堵住对方的活三 '+show(e));
  const b2=mk([[3,3],[11,11]],[[6,7],[7,7],[8,7]]);const e2=run(`AI.explain(${show(b2)},1,${I(0,0)},false)`);ok(e2.lose,'解释：不堵活三会输 '+show(e2));
  ok(run('AI.SCORES["五连"]>AI.SCORES["活四"]&&AI.SCORES["活四"]>AI.SCORES["活三"]'),'评分表从大到小');}
/* strength: neighbouring levels play 10 games, colours alternating, on fixed node budgets; the stronger one scores 7+ */
const BUD={easy:{},normal:{},hard:{maxNodes:1500},hell:{maxNodes:12000}};
run(`function GAME(bl,wl,seed){let s=seed;const rnd=()=>((s=(s*1103515245+12345)%2147483648)/2147483648);const b=new Array(225).fill(0);
  const open=[112,112+1+15*((rnd()*3|0)-1)];b[open[0]]=1;let c=2;
  for(let n=1;n<225;n++){const L=c===1?bl:wl,o=Object.assign({level:L,forbid:false,rnd},${show(BUD)}[L]);const m=n===1?open[1]===112?113:open[1]:AI.search(b,c,o).move;
    if(m==null||b[m])return 0;b[m]=c;if(gmFive(b,m,c).win)return c;c=3-c}return 0}`);
/* GM_FAST=1 skips these matches while iterating; the full run always plays them */
if(!process.env.GM_FAST)for(const [lo,hi] of [['easy','normal'],['normal','hard'],['hard','hell']]){
  let pts=0;const t0=Date.now();for(let g=0;g<10;g++){const hb=g%2===0,w=run(`GAME(${show(hb?hi:lo)},${show(hb?lo:hi)},${7+g*31})`);pts+=w===0?0.5:(w===1)===hb?1:0}
  console.log(`  ${hi} 对 ${lo}：${pts} / 10（${((Date.now()-t0)/1000).toFixed(0)} 秒）`);ok(pts>=7,hi+' 应稳定赢 '+lo+'，得分 '+pts);}
/* real time: three mid-game positions stay within the limits */
{const ps=[mk([[7,7],[8,8],[6,8],[9,6]],[[8,7],[7,8],[6,6],[9,9]]),mk([[7,7],[7,8],[8,9],[6,6],[9,7]],[[8,8],[6,7],[8,6],[5,5],[9,9]]),mk([[5,5],[6,6],[7,7],[5,7],[9,9],[8,5]],[[6,5],[7,6],[8,7],[4,4],[6,8],[10,10]])];
  for(const [L,ms] of [['hard',1000],['hell',2000]])ps.forEach((b,k)=>{const r=srch(b,1,{level:L,forbid:false,maxMs:ms});ok(r.ms<=ms*1.2,L+' 局面 '+k+' 用时 '+r.ms+'ms')});}

/* ---------- Task 6: the coach and the review ---------- */
{const V0=(b)=>({me:0,phase:'playing',toAct:0,handNo:1,cfg:{gmForbid:false},players:[{id:0},{id:1}],gm:{board:b,black:0,moves:b.map((c,i)=>c?i:-1).filter(i=>i>=0)}});
  const adv=v=>{let out=null;ctx.__V=v;run(`gmAdvise(__V,r=>{__R=r})`);out=run('__R');return out};
  run('var __R=null');
  let a=adv(V0(mk([[3,3],[11,11]],[[6,7],[7,7],[8,7]])));
  ok(a&&[I(5,7),I(9,7),I(4,7),I(10,7)].includes(a.best[0].i),'教练：对方活三时推荐堵点 '+(a&&a.best[0].pos));
  ok(a&&/活三/.test(a.best[0].why),'教练：理由写明活三 '+(a&&a.best[0].why));
  ok(a&&a.best.length===3&&a.best[0].score>=a.best[1].score&&a.best[1].score>=a.best[2].score,'教练：3 个候选，评分从高到低');
  ok(a&&/推算/.test(a.text)&&/局面/.test(a.text),'教练：写明怎么算的 '+(a&&a.text));
  a=adv(V0(mk([[4,5],[5,5],[6,5],[7,5]],[[4,6],[5,6],[6,6]])));ok(a&&[I(8,5),I(3,5)].includes(a.best[0].i),'教练：能成五时推荐成五');
  /* the review: a move that leaves the other side's 冲四 open is a big mistake, the block is not */
  const b=mk([[3,3],[10,10],[3,7]],[[4,7],[5,7],[6,7],[7,7]]);
  eq(run(`gmReview(${show(b)},1,${I(0,0)},false).bad`),true,'复盘：漏堵冲四算大失误');eq(run(`gmReview(${show(b)},1,${I(8,7)},false).bad`),false,'复盘：堵住不算失误');}

/* ---------- Task 3: the game in the real engine (fake clock, like turn-test.js) ---------- */
{const CLOCK={t:1e12};class FakeDate extends Date{constructor(...a){super(...(a.length?a:[CLOCK.t]))}static now(){return CLOCK.t}}
const g=vm.createContext({console,Math,Date:FakeDate,JSON,Set,Map,Object,Array,Number,String,Boolean,Uint8Array,CLOCK});
vm.runInContext(`var TQ=[],TID=0;var setTimeout=(f,ms)=>{const id=++TID;TQ.push({id,f,at:CLOCK.t+Math.max(0,+ms||0)});return id};var clearTimeout=id=>{TQ=TQ.filter(x=>x.id!==id)};
  function tick(){if(!TQ.length)return false;TQ.sort((a,b)=>a.at-b.at||a.id-b.id);const x=TQ.shift();CLOCK.t=Math.max(CLOCK.t,x.at);x.f();return true}
  var NET={role:'solo',conns:new Map()};function applyView(){}function hostSave(){}function voiceClear(){}function resetT(){}function onChat(){}var SETTLE_SEEN=null;function onSettle(m){SETTLE_SEEN=m}function cardTxt(c){return String(c)}`,g);
for(const f of ['js/common.js','js/games/holdem.js','js/games/zjh.js','js/games/doudizhu.js','js/games/doudizhu-coach.js','js/games/hongzhong.js','js/games/hongzhong-coach.js','js/games/gomoku.js','js/games/gomoku-ai.js','js/engine.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),g,{filename:f});
const E=s=>vm.runInContext(s,g);
const SOLO=(x)=>E(`NET.role='solo';TQ=[];startGame(${show({game:'gm',players:2,stack:1000,aiFill:true,speed:'fast',auto:false,turnSec:0,gmLevel:'normal',...x})},[{name:'你',kind:'local',gender:'m'}])`);
const DUO=(x)=>E(`NET.role='host';TQ=[];startGame(${show({game:'gm',players:2,stack:1000,aiFill:false,speed:'fast',auto:false,turnSec:15,...x})},[{name:'甲',kind:'local',gender:'m'},{name:'乙',kind:'remote',gender:'m',conn:{send(){},seat:1}}])`);
const run2=(max=400)=>{for(let i=0;i<max;i++){if(E('S.phase')!=='playing')return;if(!E('tick()'))return}};
const PL=(pid,x,y)=>E(`gmAct(P()[${pid}],'place',${I(x,y)})`);
/* settings */
eq(E(`[normalizeCfg({game:'gm'}).players,normalizeCfg({game:'gm'}).gmLevel,normalizeCfg({game:'gm'}).gmForbid,normalizeCfg({game:'gm'}).gmFirst]`),[2,'normal',false,'me'],'五子棋默认：2 人、普通、不禁手、我执黑');
eq(E(`normalizeCfg({game:'gm',gmLevel:'x'}).gmLevel`),'normal');eq(E(`normalizeCfg({game:'gm',gmLevel:'hell'}).gmLevel`),'hell');
/* first game: who is black */
SOLO({gmFirst:'me'});eq(E('S.gm.black'),0,'单机选我执黑');eq(E('S.toAct'),0,'我先下');
SOLO({gmFirst:'ai'});eq(E('S.gm.black'),1,'单机选电脑执黑');run2(3);eq(E('S.gm.moves.length'),1,'电脑先下了一步');
{const seen=new Set();for(let k=0;k<30;k++){DUO();seen.add(E('S.gm.black'))}eq([...seen].sort(),[0,1],'联机第一盘随机执黑');}
/* a game to the end; the loser is black next; a draw swaps */
SOLO({gmFirst:'me'});
E(`P()[1].kind='local'`);/* both seats played by hand for this test */
for(const [x,y,q] of [[3,3,0],[3,9,1],[4,3,0],[4,9,1],[5,3,0],[5,9,1],[6,3,0],[6,9,1]])PL(q,x,y);
eq(E('S.phase'),'playing');PL(0,7,3);eq(E('S.phase'),'handover','成五结束这一盘');
eq(E('[P()[0].gw,P()[0].gl,P()[1].gw,P()[1].gl]'),[1,0,0,1],'胜负记数');ok(E('S.gm.over.line.length')===5,'记下连成的五子');
E('startHand()');eq(E('S.gm.black'),1,'输的一方下一盘执黑');
E(`S.gm.over=null;gmEnd(-1,'draw',[])`);eq(E('[P()[0].gd,P()[1].gd]'),[1,1],'和棋双方各记一盘');E('startHand()');eq(E('S.gm.black'),0,'和棋交换黑白');
/* gm-black-stuck: forbidden rule on, black to move, only forbidden points left: a draw */
SOLO({gmFirst:'me',gmForbid:true});E(`P()[1].kind='local'`);
E(`S.gm.board=${show(ctx.STUCK)};S.gm.moves=[1];S.toAct=1`);E(`gmAct(P()[1],'place',${I(3,3)})`);
ok(E('S.phase')==='handover'&&E('S.gm.over.winner')===-1,'gm-black-stuck：黑棋只剩禁手点，判和棋');
/* solo undo: my turn takes back the computer's move and mine; ignored while it thinks or after the game */
SOLO({gmFirst:'me'});PL(0,7,7);run2(5);eq(E('S.gm.moves.length'),2,'电脑应了一手');
E(`gmAct(P()[0],'undo')`);eq(E('S.gm.moves.length'),0,'单机悔棋撤回两步');eq(E('S.toAct'),0);
E(`var HOLD=null;var keepThink=gmThink;gmThink=(b,c,o,cb)=>{HOLD=cb}`);PL(0,7,7);run2(3);ok(E('HOLD!==null'),'电脑在思考');
E(`gmAct(P()[0],'undo')`);eq(E('S.gm.moves.length'),1,'电脑思考时不能悔棋');
/* gm-stale-ai: I resign while it thinks; its late answer is dropped */
E(`gmAct(P()[0],'resign')`);eq(E('S.phase'),'handover','认输结束');eq(E('[P()[1].gw,P()[0].gl]'),[1,1],'认输算对方赢');
E(`HOLD({move:${I(8,8)}})`);eq(E('S.gm.moves.length'),1,'gm-stale-ai：认输后电脑迟到的结果作废');E('gmThink=keepThink');
eq(E(`(gmAct(P()[0],'undo'),S.gm.moves.length)`),1,'一局结束后不能悔棋');
/* gm-place-guard and gm-bad-input */
DUO();E(`S.gm.black=0;S.toAct=0`);PL(1,7,7);eq(E('S.gm.moves.length'),0,'不是自己回合不能下');
PL(0,7,7);PL(1,7,7);eq(E('S.gm.moves.length'),1,'已有棋子的位置不能下');
for(const bad of ['-1','225','3.5','"x"','null'])E(`gmAct(P()[1],'place',${bad})`);eq(E('S.gm.moves.length'),1,'gm-bad-input：非法位置都无效');
PL(1,8,8);eq(E('S.gm.moves.length'),2,'之后照常能下');
/* forbidden point refused */
DUO({gmForbid:true});E(`S.gm.black=0;S.toAct=0;for(const i of [${[I(6,7),I(8,7),I(7,6),I(7,8)]}])S.gm.board[i]=1;for(const i of [${[I(1,1),I(13,13),I(1,13),I(13,1)]}])S.gm.board[i]=2`);
PL(0,7,7);eq(E('S.gm.board['+I(7,7)+']'),0,'禁手点下不了');ok(/三三/.test(E('S.ev&&S.ev.forbid||""')),'提示禁手名称');
/* online undo */
DUO();E(`S.gm.black=0;S.toAct=0`);PL(0,7,7);
E('CLOCK.t+=5000');const left0=E('S.turnEnd-CLOCK.t');
E(`gmAct(P()[0],'undo')`);ok(E('!!S.gm.undo'),'联机：申请悔棋');eq(E('S.turnEnd'),0,'申请挂着时对方倒计时暂停');
PL(1,8,8);eq(E('S.gm.moves.length'),1,'申请挂着时对方不能落子');
E(`gmAct(P()[1],'undoNo')`);ok(E('!S.gm.undo'),'不同意');eq(E('S.gm.moves.length'),1);eq(E('S.turnEnd-CLOCK.t'),left0,'倒计时接着走，剩余时间不变');
E(`gmAct(P()[0],'undo')`);E(`gmAct(P()[1],'undoYes')`);eq(E('S.gm.moves.length'),0,'同意：撤回');eq(E('S.toAct'),0,'轮回申请人');
PL(0,7,7);E(`gmAct(P()[0],'undo')`);E('CLOCK.t+=15000;tick()');ok(E('!S.gm.undo')&&E('S.gm.moves.length')===1,'15 秒不回应算不同意');
E(`gmAct(P()[0],'undo')`);ok(E('!S.gm.undo'),'每局最多 3 次（第 4 次被拒）');eq(E('S.gm.undoLeft[0]'),0);
PL(1,8,8);E(`gmAct(P()[0],'undo')`);ok(E('!S.gm.undo'),'对方已落子后不能申请');
DUO();E(`S.gm.black=0;S.toAct=0`);PL(0,7,7);E(`P()[1].trust=true`);E(`gmAct(P()[0],'undo')`);ok(E('!S.gm.undo'),'对方托管时申请直接算不同意');
/* gm-undo-disc: the requester drops while it waits */
DUO();E(`S.gm.black=1;S.toAct=1`);PL(1,7,7);E(`gmAct(P()[1],'undo')`);E(`P()[1].connected=false`);E('CLOCK.t+=15000;tick()');
ok(E('!S.gm.undo'),'gm-undo-disc：申请人掉线，15 秒后算不同意');ok(E('S.turnEnd>CLOCK.t'),'对方倒计时恢复');
/* timeout: the coach plays and the player goes on 托管 */
DUO();E(`S.gm.black=0;S.toAct=0`);PL(0,7,7);E('CLOCK.t+=16000;for(let k=0;k<5&&S.gm.moves.length<2;k++)tick()');
ok(E('P()[1].trust')&&E('S.gm.moves.length')===2,'超时后按教练落子并托管');
/* the view: nothing hidden */
DUO();PL(E('S.toAct'),7,7);eq(E('JSON.stringify(viewFor(1).gm)'),E('JSON.stringify(viewFor(0).gm)'),'两边看到的棋局一样');
}

console.log(`gm: ${passed} passed, ${failed} failed`);
process.exit(failed?1:0);
