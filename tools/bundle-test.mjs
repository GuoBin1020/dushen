#!/usr/bin/env node
/* 单文件版检查：node tools/bundle-test.mjs
   运行 tools/bundle.py，用无头 Chrome 以 file:// 打开 ../赌神智慧树.html 并断网，单机开一局德州，检查：
   所有 .card 的 --face 都是 data: 或 blob: 开头且图片能解码、SND.buf 至少 6 个键、window.ASSET_DATA 已换成 blob:、控制台没有报错。 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startChrome,openPage,sleep} from './cdp.mjs';

const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(ROOT,'..','赌神智慧树.html');
const fails=[];
execFileSync('python3',[path.join(ROOT,'tools','bundle.py')],{stdio:'inherit'});
const size=fs.statSync(OUT).size;
if(size>6*1024*1024)fails.push('单文件 '+(size/1048576).toFixed(2)+'MB，超过 6MB');
const chrome=await startChrome(9349,['--allow-file-access-from-files','--autoplay-policy=no-user-gesture-required']);
let info={};
try{
  const pg=await openPage(chrome.port,{w:873,h:393,mobile:true});
  await pg.send('Network.enable');
  await pg.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await pg.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__errs=[];const e=console.error.bind(console);console.error=(...a)=>{window.__errs.push(a.map(String).join(' ').slice(0,200));e(...a)}`});
  await pg.send('Page.navigate',{url:'file://'+OUT});
  for(let i=0;i<150&&(await pg.ev('document.readyState'))!=='complete';i++)await sleep(100);
  await sleep(500);
  await pg.ev(`(async()=>{NET.role='solo';show('game');
    startGame({game:'holdem',players:6,stack:2000,sb:10,bb:20,ante:20,base:20,aiFill:true,rebuy:true,speed:'fast',ff:false,coach:false},[{name:'我',kind:'local',gender:'m'}]);
    for(let i=0;i<80&&!myTurn();i++)await new Promise(r=>setTimeout(r,100));clearTimeout(timer);
    document.body.dispatchEvent(new Event('pointerdown',{bubbles:true}));await sfxLoad();return 1})()`);
  await sleep(300);
  info=await pg.ev(`(async()=>{
    const cards=[...document.querySelectorAll('.card')],faces=cards.map(c=>(c.getAttribute('style')||'').match(/--face:url\\(['"]?([^'")]+)/)).filter(Boolean).map(m=>m[1]);
    const bad=faces.filter(u=>!/^(data|blob):/.test(u));
    let undec=0;await Promise.all([...new Set(faces)].map(u=>new Promise(r=>{const i=new Image();i.onload=()=>{if(!(i.naturalWidth>0))undec++;r()};i.onerror=()=>{undec++;r()};i.src=u})));
    const ad=window.ASSET_DATA||{},ak=Object.keys(ad);
    return {cards:cards.length,faces:faces.length,bad:bad.slice(0,3).map(u=>u.slice(0,40)),undec,sndKeys:Object.keys(SND.buf).length,assets:ak.length,dataLeft:ak.filter(k=>/^data:/.test(ad[k])).length,errs:window.__errs}})()`);
  if(!info)fails.push('页面里取不到检查结果');
  else{
    if(!info.faces)fails.push('没有任何带 --face 的牌');
    if(info.bad.length)fails.push('--face 不是 data:/blob: 开头：'+info.bad.join(' | '));
    if(info.undec)fails.push(info.undec+' 张图片解码失败');
    if(info.sndKeys<6)fails.push('SND.buf 只有 '+info.sndKeys+' 个键');
    if(!info.assets)fails.push('window.ASSET_DATA 为空');
    if(info.dataLeft)fails.push('ASSET_DATA 里还有 '+info.dataLeft+' 个 data: 值没有换成 blob:');
    if(info.errs&&info.errs.length)fails.push(...info.errs.map(e=>'控制台报错: '+e));
  }
  fails.push(...pg.errs.map(e=>'页面异常: '+e));
}finally{chrome.kill()}
console.log(JSON.stringify({ok:!fails.length,sizeMB:+(size/1048576).toFixed(2),info,fails},null,1));
process.exit(fails.length?1:0);
