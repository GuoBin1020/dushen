#!/usr/bin/env node
/* 牌桌布局检查：node tools/layout-check.mjs [--shots 目录]
   自己在项目目录起一个本地服务器（默认端口 8767，被占用就换一个空闲端口），用无头 Chrome 打开牌局，
   在几种人数、游戏和屏幕尺寸下检查：页面不滚动、标题栏和页脚隐藏、座位互不重叠、座位不压住公共牌 / 底牌 / 出的牌 / 按钮面板，
   斗地主 20 张手牌一行放下，转屏后重新检查，控制台没有报错。输出 JSON，有任何一项不通过时退出码为 1。 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startChrome,openPage,sleep} from './cdp.mjs';

const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const ai=process.argv.indexOf('--shots'),SHOTS=ai>0?process.argv[ai+1]:null;
if(SHOTS)fs.mkdirSync(SHOTS,{recursive:true});
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json',
  '.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.mp3':'audio/mpeg','.txt':'text/plain; charset=utf-8'};

/* static files from the project directory, nothing else */
function serve(port){
  const srv=http.createServer((req,res)=>{
    let p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(p.endsWith('/'))p+='index.html';
    const f=path.join(ROOT,path.normalize(p));
    if(!f.startsWith(ROOT)){res.writeHead(403);return res.end()}
    fs.readFile(f,(e,b)=>{if(e){res.writeHead(404);return res.end()}res.writeHead(200,{'content-type':TYPES[path.extname(f)]||'application/octet-stream','cache-control':'no-store'});res.end(b)});
  });
  return new Promise((ok,bad)=>{
    srv.once('error',e=>e.code==='EADDRINUSE'&&port?serve(0).then(ok,bad):bad(e));
    srv.listen(port,'127.0.0.1',()=>ok(srv));
  });
}

const SIZES=[[393,873,true],[360,780,true],[873,393,true],[768,1024,true],[1280,800,false]];
const LONG='一二三四五六七八九十甲乙';
let SCEN=[
  {name:'holdem-2',game:'holdem',n:2},{name:'holdem-6',game:'holdem',n:6},{name:'holdem-9',game:'holdem',n:9},
  {name:'holdem-9-long-names',game:'holdem',n:9,long:true},{name:'zjh-6',game:'zjh',n:6},
  {name:'ddz-3',game:'ddz',n:3},{name:'ddz-20-cards',game:'ddz',n:3,lord20:true}
];

/* LC_ONLY=holdem-6 runs one scenario while iterating */
if(process.env.LC_ONLY)SCEN=SCEN.filter(s=>s.name===process.env.LC_ONLY);
/* in the page: start a solo game, wait for my turn, freeze the bots, then stage the scenario */
const setup=sc=>`(async()=>{
  NET.role='solo';show('game');
  startGame({game:'${sc.game}',players:${sc.n},stack:2000,sb:10,bb:20,ante:20,base:20,aiFill:true,rebuy:true,speed:'fast',ff:false,coach:true},[{name:'我',kind:'local',gender:'m'}]);
  for(let i=0;i<80&&!myTurn();i++)await new Promise(r=>setTimeout(r,100));
  clearTimeout(timer);
  ${sc.long?`S.players.forEach((p,i)=>{p.name='${LONG}'.slice(0,11)+'甲乙丙丁戊己庚辛壬'[i]});sync();`:''}
  ${sc.lord20?`ddLandlord({landlord:0,robs:0});clearTimeout(timer);
    const d=S.dd;d.stage='play';d.dblAsk=[];d.lead=null;S.toAct=0;
    const c1=S.players[1].cards.slice(0,5);d.shown[1]={cards:c1,cls:{type:'single'}};d.shown[2]='pass';sync();`:''}
  await new Promise(r=>setTimeout(r,250));
  return {turn:myTurn(),cards:S.players[0].cards.length};
})()`;

/* in the page: measure everything the checks need */
const MEASURE=`(()=>{
  const R=el=>{const r=el.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height}};
  const vis=el=>{if(!el)return false;const cs=getComputedStyle(el),r=el.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0};
  const all=sel=>[...document.querySelectorAll(sel)].filter(vis).map(R);
  const se=document.scrollingElement;
  const hand=[...document.querySelectorAll('#dd-hand .card')].map(R);
  return {sh:se.scrollHeight,sw:se.scrollWidth,ih:innerHeight,iw:innerWidth,
    header:vis(document.querySelector('header.top')),footer:vis(document.querySelector('footer.foot')),
    seats:all('#table .seat'),others:{board:all('#table .board'),'dd-bottom':all('#table .dd-bottom'),'dd-center':all('#table .dd-center'),'dd-play':all('#table .dd-play'),actions:all('#actions')},
    hand,ddStage:document.querySelector('#table .dd-center')?vis(document.querySelector('#table .dd-center .street')):null,
    /* rendered text size on each seat: computed font size times the seat's scale */
    fonts:[...document.querySelectorAll('#table .seat')].flatMap((s,i)=>{const k=s.offsetWidth?s.getBoundingClientRect().width/s.offsetWidth:1;
      return [...s.querySelectorAll('.pname,.pstack,.pact')].filter(vis).map(e=>({i,c:e.className,px:parseFloat(getComputedStyle(e).fontSize)*k}))})};
})()`;

const hit=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>0.5&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>0.5;
function check(m,sc){
  const f=[];
  if(m.sh>m.ih+1)f.push(`页面竖向滚动 ${m.sh}>${m.ih}`);
  if(m.sw>m.iw+1)f.push(`页面横向滚动 ${m.sw}>${m.iw}`);
  if(m.header)f.push('header.top 可见');
  if(m.footer)f.push('footer.foot 可见');
  if(m.seats.length!==sc.n)f.push(`座位数 ${m.seats.length}≠${sc.n}`);
  for(let i=0;i<m.seats.length;i++)for(let j=i+1;j<m.seats.length;j++)if(hit(m.seats[i],m.seats[j]))f.push(`座位 ${i} 和 ${j} 重叠`);
  for(const [k,list] of Object.entries(m.others))list.forEach(r=>m.seats.forEach((s,i)=>{if(hit(s,r))f.push(`座位 ${i} 压住 ${k}`)}));
  for(const t of m.fonts)if(t.px<9.95){f.push(`座位 ${t.i} 的 .${t.c} 只有 ${t.px.toFixed(1)}px`);break}
  if(m.ddStage===false)f.push('斗地主的阶段文字（叫地主 / 加倍 / 出牌中）不可见');
  m.others['dd-play'].forEach((r,i)=>m.others['dd-center'].forEach(c=>{if(hit(r,c))f.push(`出的牌 ${i} 压住底牌区`)}));
  if(sc.lord20){
    const h=m.hand;
    if(h.length!==20)f.push(`手牌 ${h.length} 张，不是 20`);
    if(h.length&&h.some(r=>Math.abs(r.y-h[0].y)>h[0].h*0.5))f.push('手牌不在一行');
    if(h.some(r=>r.x<-0.5||r.x+r.w>m.iw+0.5))f.push('手牌超出屏幕');
    for(let i=1;i<h.length;i++)if(h[i].x-h[i-1].x<14){f.push(`手牌第 ${i} 张只露出 ${(h[i].x-h[i-1].x).toFixed(1)}px`);break}
  }
  return f;
}

const out={ok:true,port:0,results:[]};
const srv=await serve(8767);out.port=srv.address().port;
const URL0=`http://127.0.0.1:${out.port}/index.html`;
const chrome=await startChrome(9347);
/* console errors and failed loads from this server; the optional web-font host may be unreachable */
const LOGHOOK=`(()=>{window.__errs=[];const e=console.error.bind(console);console.error=(...a)=>{window.__errs.push(a.map(String).join(' ').slice(0,200));e(...a)};
  addEventListener('error',ev=>{const t=ev.target;if(t&&t!==window&&(t.src||t.href)&&String(t.src||t.href).startsWith(location.origin))window.__errs.push('load failed: '+(t.src||t.href))},true)})()`;
async function page(w,h,mobile){
  const pg=await openPage(chrome.port,{w,h,mobile});
  await pg.send('Page.addScriptToEvaluateOnNewDocument',{source:LOGHOOK});
  await pg.send('Page.navigate',{url:URL0});
  for(let i=0;i<150&&(await pg.ev('document.readyState'))!=='complete';i++)await sleep(100);
  await sleep(200);
  return pg;
}
async function run(sc,[w,h,mobile],then){
  const pg=await page(w,h,mobile),tag=`${sc.name} ${w}x${h}`;
  if(process.env.LC_DEBUG)console.error('…',tag);
  const st=await pg.ev(setup(sc));
  const res=[];
  const measure=async label=>{
    const m=await pg.ev(MEASURE);
    const fails=m?check(m,sc):['测量失败'];
    const errs=[...pg.errs,...((await pg.ev('window.__errs'))||[])];
    if(errs.length)fails.push(...errs.map(e=>'控制台报错: '+e));
    res.push({scenario:label,size:`${m?m.iw:w}x${m?m.ih:h}`,turn:st&&st.turn,fails});
    if(SHOTS)await pg.shot(path.join(SHOTS,label.replace(/\s+/g,'_')+'.jpg'));
  };
  await measure(tag);
  if(then){await then(pg);await measure(tag+' rotated')}
  try{await pg.send('Page.close')}catch(e){}
  pg.close();
  return res;
}
try{
  for(const sc of SCEN)for(const sz of SIZES)out.results.push(...await run(sc,sz));
  /* keep-raise: a phone's address bar shrinks the height a little; the table must not rebuild and reset the raise slider */
  if(!process.env.LC_ONLY||process.env.LC_ONLY==='keep-raise'){
    let kept=null;
    const r=await run({name:'keep-raise',game:'holdem',n:6},[393,873,true],async pg=>{
      const set=await pg.ev(`(()=>{const r=document.getElementById('raise-amt');if(!r)return null;r.value=r.max;r.dispatchEvent(new Event('input',{bubbles:true}));return r.value})()`);
      await pg.send('Emulation.setDeviceMetricsOverride',{width:393,height:830,deviceScaleFactor:2.75,mobile:true,screenOrientation:{type:'portraitPrimary',angle:0}});
      await sleep(700);
      kept={set,now:await pg.ev(`(document.getElementById('raise-amt')||{}).value`)};
    });
    const last=r[r.length-1];
    if(!kept||kept.set==null)last.fails.push('没有加注滑块，无法检查');
    else if(kept.now!==kept.set)last.fails.push(`高度小变化后加注滑块被重置：${kept.set} → ${kept.now}`);
    out.results.push(...r);
  }
  /* rotate: start upright, then turn the phone sideways */
  out.results.push(...await run({name:'rotate',game:'holdem',n:6},[393,873,true],async pg=>{
    await pg.send('Emulation.setDeviceMetricsOverride',{width:873,height:393,deviceScaleFactor:2.75,mobile:true,screenOrientation:{type:'landscapePrimary',angle:90}});
    await sleep(700);
  }));
}finally{chrome.kill();srv.close()}
out.failed=out.results.filter(r=>r.fails.length).length;
out.ok=!out.failed;
out.passed=out.results.length-out.failed;
console.log(JSON.stringify({ok:out.ok,passed:out.passed,failed:out.failed,port:out.port,results:out.results.filter(r=>r.fails.length||process.argv.includes('--all'))},null,1));
process.exit(out.ok?0:1);
