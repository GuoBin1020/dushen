#!/usr/bin/env node
/* 五子棋测试：node tools/gm-test.js
   页面脚本是共用全局作用域的普通 <script>，这里用 vm 按顺序跑在同一个上下文里。 */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..');
const ctx=vm.createContext({console,Math,Date,JSON,Set,Map,Object,Array,Number,String,Boolean});
for(const f of ['js/common.js','js/games/gomoku.js','js/games/gomoku-ai.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
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
for(const [lo,hi] of [['easy','normal'],['normal','hard'],['hard','hell']]){
  let pts=0;const t0=Date.now();for(let g=0;g<10;g++){const hb=g%2===0,w=run(`GAME(${show(hb?hi:lo)},${show(hb?lo:hi)},${7+g*31})`);pts+=w===0?0.5:(w===1)===hb?1:0}
  console.log(`  ${hi} 对 ${lo}：${pts} / 10（${((Date.now()-t0)/1000).toFixed(0)} 秒）`);ok(pts>=7,hi+' 应稳定赢 '+lo+'，得分 '+pts);}
/* real time: three mid-game positions stay within the limits */
{const ps=[mk([[7,7],[8,8],[6,8],[9,6]],[[8,7],[7,8],[6,6],[9,9]]),mk([[7,7],[7,8],[8,9],[6,6],[9,7]],[[8,8],[6,7],[8,6],[5,5],[9,9]]),mk([[5,5],[6,6],[7,7],[5,7],[9,9],[8,5]],[[6,5],[7,6],[8,7],[4,4],[6,8],[10,10]])];
  for(const [L,ms] of [['hard',1000],['hell',2000]])ps.forEach((b,k)=>{const r=srch(b,1,{level:L,forbid:false,maxMs:ms});ok(r.ms<=ms*1.2,L+' 局面 '+k+' 用时 '+r.ms+'ms')});}

console.log(`gm: ${passed} passed, ${failed} failed`);
process.exit(failed?1:0);
