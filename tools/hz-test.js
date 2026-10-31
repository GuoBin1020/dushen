#!/usr/bin/env node
/* 红中麻将测试：node tools/hz-test.js
   页面脚本是共用全局作用域的普通 <script>，这里用 vm 按顺序跑在同一个上下文里。 */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..');
const ctx=vm.createContext({console,Math,Date,JSON,Set,Map,Object,Array,Number,String,Boolean});
for(const f of ['js/common.js','js/games/hongzhong.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
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
eq(win('5p5p 7s8s9s',`[{t:'peng',ids:H('1m1m1m')},{t:'chi',ids:H('2s3s4s')},{t:'agang',ids:H('9m9m9m9m')}]`),'ping','副露后的平胡');
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

/* 吃 / 碰 / 杠: 红中 never takes part */
eq(run(`hzChiOpts(H('3m4m 6m 1s'),H('5m')[0]).map(o=>o.map(hzKind))`),[[2,3],[3,5]],'吃五万：三四、四六');
eq(run(`hzChiOpts(H('hz 4m 1s'),H('5m')[0])`),[],'红中不能用来吃');
eq(run(`hzChiOpts(H('8m9m'),H('1s')[0])`),[],'不同花色不能连');
eq(run(`hzCanPeng(H('7s7s 1m'),H('7s')[0])`),true,'碰');
eq(run(`hzCanPeng(H('7s hz 1m'),H('7s')[0])`),false,'红中不能凑碰');
eq(run(`hzCanPeng(H('hz hz 1m'),109)`),false,'红中不能被碰');
eq(run(`hzCanMGang(H('7s7s7s 1m'),H('7s')[0])`),true,'明杠');
eq(run(`hzAGangKinds(H('5m5m5m hz 1s'))`),[],'红中不能凑暗杠');
eq(run(`hzAGangKinds(H('hz hz hz hz 1s'))`),[],'四张红中不能杠');
eq(run(`hzAGangKinds(H('5m5m5m5m 1s'))`),[4],'暗杠五万');
eq(run(`hzBGangKinds(H('3p 1s'),[{t:'peng',ids:H('3p3p3p')}])`),[20],'补杠三筒');
eq(run(`hzBGangKinds(H('hz 1s'),[{t:'peng',ids:H('3p3p3p')}])`),[],'红中不能补杠');

console.log(`hz: ${passed} passed, ${failed} failed`);
process.exit(failed?1:0);
