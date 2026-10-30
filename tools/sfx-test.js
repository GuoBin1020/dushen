#!/usr/bin/env node
/* 音效测试：node tools/sfx-test.js。检查采样优先、合成回退、加载失败和音效开关。 */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..');
let passed=0,failed=0;
const ok=(c,msg)=>{if(c)passed++;else{failed++;console.log('FAIL',msg||'')}};
const eq=(a,b,msg)=>{const A=JSON.stringify(a),B=JSON.stringify(b);if(A===B)passed++;else{failed++;console.log('FAIL',msg||'',' got',A,' want',B)}};

function mk(fetchImpl){
  const cnt={starts:0,sampleStarts:0};
  const node=()=>({connect(n){return n},start(){},stop(){},frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},Q:{}});
  class AC{
    constructor(){this.currentTime=0;this.sampleRate=8000;this.state='running';this.destination={}}
    resume(){}
    createOscillator(){return node()}
    createGain(){return node()}
    createBiquadFilter(){return node()}
    createBuffer(c,l){return {length:l,getChannelData:()=>new Float32Array(l)}}
    createBufferSource(){const s=node();s.start=function(){cnt.starts++;if(this.sampled)cnt.sampleStarts++};return new Proxy(s,{set(t,k,v){t[k]=v;if(k==='buffer'&&v&&v.__sample)t.sampled=true;return true},get(t,k){return t[k]}})}
    decodeAudioData(ab){return Promise.resolve({__sample:true,len:ab.byteLength})}
  }
  const ctx=vm.createContext({console,Math,JSON,Object,Array,Number,String,Boolean,Promise,Map,Set,ArrayBuffer,Float32Array,
    window:{AudioContext:AC},document:{addEventListener(){}},LOCAL:{sfx:true},
    fetch:fetchImpl||(()=>Promise.resolve({ok:true,arrayBuffer:()=>Promise.resolve(new ArrayBuffer(8))}))});
  for(const f of ['js/common.js','js/assets.js','js/audio.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
  return {ctx,cnt,run:s=>vm.runInContext(s,ctx)};
}
/* count synthesized noise calls by wrapping noise() via a global hook */
function spyNoise(t){t.run('globalThis.__n=0;{const o=noise;noise=function(){__n++;return o.apply(this,arguments)}}');return()=>t.run('__n')}

(async()=>{
  /* sample-hit: deal(3) = shuffle + 3 slides, no synthesized noise */
  let t=mk();
  t.run('actx()');
  let nz=spyNoise(t);
  t.run('SND.buf={slide:[{__sample:true}],shuffle:[{__sample:true}]}');
  t.run('SFX.deal(3)');
  eq(t.cnt.sampleStarts,4,'sample-hit 采样次数');
  eq(nz(),0,'sample-hit 不应合成 noise');
  ok(t.run("sample('slide')")===true,'sample 命中返回 true');
  ok(t.run("sample('nope')")===false,'sample 未命中返回 false');

  /* sfx-fallback: no buffers -> synthesized noise, no throw */
  t=mk();t.run('actx()');nz=spyNoise(t);
  t.run('SND.buf={}');
  let threw=false;try{t.run('SFX.fold()')}catch(e){threw=true}
  ok(!threw,'sfx-fallback 不抛异常');
  ok(nz()>=1,'sfx-fallback 走合成 noise');
  eq(t.cnt.sampleStarts,0,'sfx-fallback 无采样');

  /* sfx-load-fail: fetch rejects -> resolves, no keys */
  t=mk(()=>Promise.reject(new Error('net')));
  let res=false;try{await t.run('sfxLoad()');res=true}catch(e){}
  ok(res,'sfx-load-fail 正常 resolve');
  eq(Object.keys(t.run('SND.buf')).length,0,'sfx-load-fail buf 无键');

  /* load success + once-only */
  let calls=0;
  t=mk(()=>{calls++;return Promise.resolve({ok:true,arrayBuffer:()=>Promise.resolve(new ArrayBuffer(8))})});
  await t.run('sfxLoad()');const n1=calls;await t.run('sfxLoad()');
  eq(calls,n1,'sfxLoad 只执行一次');
  eq(t.run('SND.buf.slide.length'),4,'slide 解码 4 个');
  /* partial failure skips only that file */
  t=mk(u=>/slide-2|slide2/.test(String(u))?Promise.reject(new Error('x')):Promise.resolve({ok:true,arrayBuffer:()=>Promise.resolve(new ArrayBuffer(8))}));
  await t.run('sfxLoad()');
  eq(t.run('SND.buf.slide.length'),3,'单个失败不影响其他');

  /* sfx-off */
  t=mk();t.run('actx()');nz=spyNoise(t);
  t.run('SND.buf={chipLay:[{__sample:true}],chipStack:[{__sample:true}]};LOCAL.sfx=false');
  t.run('SFX.chips(5)');
  eq(t.cnt.starts,0,'sfx-off 什么都不播');
  ok(t.run("sample('chipStack')")===false,'sfx-off sample 返回 false');

  /* chips routing */
  t=mk();t.run('actx()');
  t.run('SND.buf={chipLay:[{__sample:true}],chipStack:[{__sample:true}]}');
  t.run('SFX.chips(3)');eq(t.cnt.sampleStarts,1,'chips(3) lay');
  t.run('SFX.chips(4)');eq(t.cnt.sampleStarts,2,'chips(4) stack');


  /* ddz-play: a 斗地主 card play maps to 'place', never the shuffle/slide of dealing */
  {
    const calls=[];
    const c2=vm.createContext({console,Math,Date,JSON,Set,Map,Object,Array,Number,String,Boolean,
      SFX:new Proxy({},{get:(_,k)=>()=>calls.push(k)}),say(){},setTimeout(){},LOCAL:{mode:'live'}});
    for(const f of ['js/common.js','js/games/doudizhu.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),c2,{filename:f});
    const play=vm.runInContext("ddFx({players:[{gender:'m',kind:'ai'}]},{type:'play',pid:0,cls:ddClassify([0]),left:5})",c2);
    ok(calls.includes('flip'),'ddz 出牌走 flip(place)');
    ok(!calls.includes('deal'),'ddz 出牌不走 deal(shuffle)');
  }

  /* deal(n,false) skips the shuffle (wheel); the default still shuffles */
  t=mk();t.run('actx()');t.run('SND.buf={slide:[{__sample:true}],shuffle:[{__sample:true}]}');
  t.run('SFX.deal(6,false)');eq(t.cnt.sampleStarts,6,'deal(6,false) 只有 6 次 slide，没有 shuffle');
  t=mk();t.run('actx()');t.run('SND.buf={slide:[{__sample:true}],shuffle:[{__sample:true}]}');
  t.run('SFX.deal(6)');eq(t.cnt.sampleStarts,7,'deal(6) 仍带 shuffle');
  ok(/SFX\.deal\(6,\s*false\)/.test(fs.readFileSync(path.join(ROOT,'js/wheel.js'),'utf8')),'转盘调用 deal(6,false)');

  console.log(`sfx: ${passed} passed, ${failed} failed`);
  process.exit(failed?1:0);
})();
