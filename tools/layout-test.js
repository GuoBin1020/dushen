#!/usr/bin/env node
/* 牌桌布局测试：node tools/layout-test.js。用 vm 加载 js/table-layout.js，检查每种人数、横竖屏下的座位、下注、出牌和桌面中心的位置。 */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..');
const ctx=vm.createContext({console,Math,JSON,Object,Array,Number,String,Boolean,window:{innerWidth:873,innerHeight:393}});
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/table-layout.js'),'utf8'),ctx,{filename:'js/table-layout.js'});
const run=s=>vm.runInContext(s,ctx);
let passed=0,failed=0;
const ok=(c,msg)=>{if(c)passed++;else{failed++;console.log('FAIL',msg||'')}};
const f1=v=>Math.round(v*10)/10;

for(const o of ['land','port']){
  const c=run(`centerXY('${o}')`);
  ok(c&&c.x===50&&c.y===(o==='land'?42:64),`centerXY ${o} ${JSON.stringify(c)}`);
  const me=run(`seatXY(0,6,'${o}')`);
  ok(Math.abs(me.x-(o==='land'?8:12))<=3&&Math.abs(me.y-(o==='land'?84:74))<=3,`自己的座位 ${o} ${JSON.stringify(me)}`);
  const mp=run(`playXY(0,3,'${o}')`);
  ok(mp.al==='c'&&Math.abs(mp.x-50)<=2&&Math.abs(mp.y-(o==='land'?52:56))<=3,`自己出牌的位置 ${o} ${JSON.stringify(mp)}`);
  for(let n=2;n<=9;n++){
    const seats=[];for(let k=0;k<n;k++)seats.push(run(`seatXY(${k},${n},'${o}')`));
    const tag=`${o} n=${n}`;
    seats.forEach((s,k)=>{
      ok(s.x>=3&&s.x<=97&&s.y>=3&&s.y<=97,`${tag} slot ${k} 出界 ${f1(s.x)},${f1(s.y)}`);
      ok(s.s>=0.8&&s.s<=1,`${tag} slot ${k} 缩放 ${s.s}`);
      if(k>0){
        ok(s.y<seats[0].y,`${tag} slot ${k} 比自己还靠下`);
        ok(Math.hypot(s.x-c.x,s.y-c.y)>=18,`${tag} slot ${k} 离桌面中心太近 ${f1(Math.hypot(s.x-c.x,s.y-c.y))}`);
      }
      const b=run(`betXY(${k},${n},'${o}')`);
      ok(Math.abs(b.x-(s.x+(c.x-s.x)*0.35))<0.01&&Math.abs(b.y-(s.y+(c.y-s.y)*0.35))<0.01,`${tag} slot ${k} 下注位置`);
      const p=run(`playXY(${k},${n},'${o}')`);
      ok(['l','c','r'].includes(p.al),`${tag} slot ${k} 出牌对齐 ${p.al}`);
      seats.forEach((q,j)=>{const d=Math.hypot(p.x-q.x,p.y-q.y);ok(d>=10,`${tag} slot ${k} 出的牌压在 slot ${j} 上 ${f1(d)}`)});
    });
    const min=o==='port'?14:16;
    for(let a=0;a<n;a++)for(let b=a+1;b<n;b++){
      const d=Math.hypot(seats[a].x-seats[b].x,(seats[a].y-seats[b].y)*0.6);
      ok(d>=min,`${tag} slot ${a} 和 ${b} 太近 ${f1(d)}`);
    }
  }
}
/* 斗地主：底牌在桌子远端正中，不和对手座位、任何出的牌挤在一起 */
for(const o of ['land','port']){
  const b=run(`bottomXY('${o}')`);
  /* sideways it lies lower, below the card counter strip; upright just below the two far seats */
  ok(b&&b.x===50&&b.y>=12&&b.y<=32,`斗地主底牌在远端正中 ${o} ${JSON.stringify(b)}`);
  for(let k=0;k<3;k++){
    const s=run(`seatXY(${k},3,'${o}')`),p=run(`playXY(${k},3,'${o}')`);
    if(k)ok(Math.hypot(s.x-b.x,s.y-b.y)>=18,`斗地主底牌离 slot ${k} 太近 ${o}`);
    ok(Math.hypot(p.x-b.x,p.y-b.y)>=15,`斗地主 slot ${k} 出的牌压在底牌上 ${o} ${f1(Math.hypot(p.x-b.x,p.y-b.y))}`);
  }
}
/* 斗地主：两个对手在左右两侧 */
ok(run(`seatXY(1,3,'land')`).x<30,'斗地主左边的对手');
ok(run(`seatXY(2,3,'land')`).x>70,'斗地主右边的对手');
/* 下注筹码：在座位到桌心的连线上，刚好离开座位（座位范围 + 半个筹码 + 间距） */
{
  const q=run(`betClear({x:0,y:0},{x:100,y:0},{l:20,r:30,t:10,b:10},20,10,4)`);
  ok(Math.abs(q.x-44)<1e-9&&q.y===0&&Math.abs(q.t-0.44)<1e-9,`betClear 水平 ${JSON.stringify(q)}`);
  const d=run(`betClear({x:0,y:0},{x:0,y:-200},{l:20,r:20,t:40,b:50},30,20,4)`);
  ok(d.x===0&&Math.abs(d.y+54)<1e-9,`betClear 向上 ${JSON.stringify(d)}`);
  const g=run(`betClear({x:0,y:0},{x:100,y:100},{l:10,r:10,t:10,b:60},20,20,0)`);
  ok(Math.abs(g.x-20)<1e-9&&Math.abs(g.y-20)<1e-9,`betClear 斜向先从右边离开 ${JSON.stringify(g)}`);
}
/* 唯一读取窗口尺寸的函数 */
ok(run('tableOrient()')==='land','873x393 是横屏');
run('window.innerWidth=393;window.innerHeight=873');ok(run('tableOrient()')==='port','393x873 是竖屏');
run('window.innerWidth=500;window.innerHeight=500');ok(run('tableOrient()')==='land','正方形算横屏');

console.log(`layout: ${passed} passed, ${failed} failed`);
process.exit(failed?1:0);
