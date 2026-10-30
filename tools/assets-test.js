#!/usr/bin/env node
/* 素材测试：node tools/assets-test.js。检查素材地址函数、文件是否齐全、体积和署名。 */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..'),AS=path.join(ROOT,'assets');
const ctx=vm.createContext({console,Math,JSON,Object,Array,Number,String,Boolean,window:{ASSET_DATA:{'cards/KS.webp':'data:x'}}});
for(const f of ['js/common.js','js/assets.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
const run=s=>vm.runInContext(s,ctx);
let passed=0,failed=0;
const ok=(c,msg)=>{if(c)passed++;else{failed++;console.log('FAIL',msg||'')}};
const eq=(a,b,msg)=>{const A=JSON.stringify(a),B=JSON.stringify(b);if(A===B)passed++;else{failed++;console.log('FAIL',msg||'',' got',A,' want',B)}};
const sz=p=>{try{return fs.statSync(path.join(AS,p)).size}catch(e){return -1}};
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);

eq(run("cardFaceFile('K',0)"),'cards/KS.webp');
eq(run("cardFaceFile('10',1)"),'cards/10H.webp');
eq(run("cardFaceFile('A',3)"),'cards/AC.webp');
eq(run("cardFaceFile('7',2)"),'cards/7D.webp');
eq(run('jokerFile(true)'),'cards/joker-big.webp');
eq(run('jokerFile(false)'),'cards/joker-small.webp');
eq(run('BACK_FILE'),'cards/back.webp');
for(const r of run('RL'))for(let s=0;s<4;s++){const f=run(`cardFaceFile(${JSON.stringify(r)},${s})`);ok(sz(f)>1024,'牌面缺失或太小 '+f)}
for(const f of [run('jokerFile(true)'),run('jokerFile(false)'),run('BACK_FILE')])ok(sz(f)>1024,'缺失或太小 '+f);
for(let i=0;i<7;i++){const f=run(`chipFile(${i})`);ok(sz(f)>0,'筹码缺失 '+f)}
ok(run('chipFile(0)')!==run('chipFile(1)'),'筹码颜色不同');
eq(run('chipFile(0)'),run('chipFile(5)'),'筹码循环');
let total=0;if(fs.existsSync(AS))for(const f of walk(AS))total+=fs.statSync(f).size;
ok(total>0&&total<=1.6*1024*1024,'素材总体积 '+total);
const sfx=run('SFX_FILES');
eq(Object.keys(sfx).sort(),['chipLay','chipStack','collide','handle','place','shove','shuffle','slide'],'SFX 键');
for(const k of Object.keys(sfx)){ok(sfx[k].length>0,'SFX 空 '+k);for(const f of sfx[k])ok(sz(f)>0,'音效缺失 '+f)}
const cr=fs.existsSync(path.join(AS,'CREDITS.txt'))?fs.readFileSync(path.join(AS,'CREDITS.txt'),'utf8'):'';
for(const w of ['Byron Knoll','Kenney','CC0','Noto Emoji','Apache'])ok(cr.includes(w),'CREDITS 缺 '+w);
eq(run("assetURL('cards/KS.webp')"),'data:x');
eq(run("assetURL('cards/AS.webp')"),'assets/cards/AS.webp');
console.log(`assets: ${passed} passed, ${failed} failed`);
process.exit(failed?1:0);
