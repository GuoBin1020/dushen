#!/usr/bin/env node
/* 牌桌布局检查：node tools/layout-check.mjs [--shots 目录]
   自己在项目目录起一个本地服务器（默认端口 8767，被占用就换一个空闲端口），用无头 Chrome 打开牌局，
   在几种人数、游戏和屏幕尺寸下检查：页面不滚动、标题栏和页脚隐藏、座位互不重叠、座位不压住公共牌 / 底牌 / 出的牌 / 按钮面板，
   斗地主 20 张手牌一行放下，下注筹码不压住按钮区，手机上按钮至少 40px 高，转屏后重新检查，控制台没有报错。
   按钮区另有场景：按钮一排的位置在各种状态下不动、德州加注和炸金花比牌的弹出面板、斗地主按钮一行放下、旁观等待时没有结算按钮、教练高亮。输出 JSON，有任何一项不通过时退出码为 1。 */
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

/* in-page checks for the action bar; each returns a list of failures */
const PG=`const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const vis=el=>{if(!el)return false;const cs=getComputedStyle(el),r=el.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&!el.closest('[hidden]')&&r.width>0&&r.height>0};
  const R=el=>{if(!el)return null;const r=el.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height}};
  const Q=s=>document.querySelector(s);
  const hit=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>0.5&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>0.5;
  const hand=()=>R(Q('#dd-hand:not([hidden])'))||R(Q('#table .my-hand'));
  const f=[];
  /* the open pop-up: visible, on screen, clear of every seat, buttons big enough */
  const popOk=(tag)=>{const p=Q('#actions .act-pop');if(!vis(p)){f.push(tag+'：.act-pop 没有出现');return false}
    const r=R(p);if(r.x<-0.5||r.y<-0.5||r.x+r.w>innerWidth+0.5||r.y+r.h>innerHeight+0.5)f.push(tag+'：.act-pop 超出屏幕');
    [...document.querySelectorAll('#table .seat')].forEach((s,i)=>{if(hit(R(s),r))f.push(tag+'：.act-pop 压住座位 '+i)});
    if(innerWidth<1000)[...p.querySelectorAll('button')].filter(vis).forEach(b=>{if(b.getBoundingClientRect().height<39.5)f.push(tag+'：面板按钮「'+b.textContent.trim()+'」不到 40px')});
    return true};`;
const BAR_STABLE=`(async()=>{${PG}
  const snap=()=>({bar:R(Q('#actions .act-bar')),hand:hand()});
  const keep={toAct:V.toAct,phase:V.phase},n=V.players.length;
  const s0=snap();V.toAct=(V.me+1)%n;render();const s1=snap();V.phase='handover';render();const s2=snap();
  Object.assign(V,keep);render();
  [[s1,'等待别人'],[s2,'本手结束']].forEach(([s,l])=>{
    if(!s0.bar||!s.bar){f.push(l+'：没有 .act-bar');return}
    if(Math.abs(s.bar.y-s0.bar.y)>1)f.push(l+'：.act-bar 上沿移动 '+(s.bar.y-s0.bar.y).toFixed(1)+'px');
    if(Math.abs(s.bar.h-s0.bar.h)>1)f.push(l+'：.act-bar 高度变化 '+s0.bar.h+'→'+s.bar.h);
    if(s0.hand&&s.hand&&Math.abs(s.hand.y-s0.hand.y)>1)f.push(l+'：手牌移动 '+(s.hand.y-s0.hand.y).toFixed(1)+'px')});
  return f})()`;
const GUEST_WAIT=`(async()=>{${PG}
  const keep={toAct:V.toAct,phase:V.phase},role=NET.role,n=V.players.length;
  const h0=(R(Q('#actions .act-bar'))||{}).h;
  try{NET.role='guest';V.toAct=(V.me+1)%n;renderActions();
    if(Q('#actions [data-act="settle"]'))f.push('等待时 #actions 里有结算按钮');
    if(!vis(Q('#actions .act-bar .act-wait')))f.push('.act-wait 不可见');
    const h1=(R(Q('#actions .act-bar'))||{}).h;if(!h1||Math.abs(h1-h0)>1)f.push('.act-bar 高度 '+h0+' → '+h1);
    V.phase='handover';renderActions();if(Q('#actions [data-act="settle"]'))f.push('本手结束时 #actions 里有结算按钮');
  }finally{NET.role=role;Object.assign(V,keep);renderActions()}
  if(Q('#actions [data-act="settle"]'))f.push('轮到自己时 #actions 里有结算按钮');
  return f})()`;
const RAISE_POP=`(async()=>{${PG}
  const b=Q('#actions .act-bar [data-act="raise-open"]');if(!b)return ['没有 raise-open 按钮'];
  b.click();await sleep(80);if(!popOk('加注面板'))return f;
  if(!Q('#actions .act-pop #raise-amt'))f.push('面板里没有 #raise-amt');
  if(!Q('#actions .act-pop [data-preset]'))f.push('面板里没有快捷金额');
  document.querySelector('#table').click();await sleep(80);if(vis(Q('#actions .act-pop')))f.push('点面板外面没有关闭');
  Q('#actions [data-act="raise-open"]').click();await sleep(80);
  const bet0=V.players[V.me].bet,ok=Q('#actions .act-pop [data-act="raise"]');if(!ok)return [...f,'面板里没有确定按钮'];
  ok.click();const bet1=V.players[V.me].bet;if(!(bet1>bet0))f.push('确定后下注没有变大：'+bet0+' → '+bet1);
  return f})()`;
const ZJH_POP=`(async()=>{${PG}
  S.round=Math.max(2,S.round);sync();clearTimeout(timer);await sleep(80);
  const b=Q('#actions .act-bar [data-act="zpop"][data-pop="cmp"]');if(!b)return ['没有比牌按钮'];
  b.click();await sleep(80);if(!popOk('比牌面板'))return f;
  const list=[...document.querySelectorAll('#actions .act-pop [data-act="zcmp"]')].filter(vis);if(!list.length)return [...f,'比牌面板里没有对手'];
  const r=Q('#actions .act-bar [data-act="zpop"][data-pop="raise"]');
  const st0=V.players[V.me].stack;list[0].click();await sleep(300);
  if(!(V.players[V.me].stack<st0))f.push('点了比牌没有比牌：筹码 '+st0+' → '+V.players[V.me].stack);
  return f})()`;
const DDZ_BAR=`(async()=>{${PG}
  const seen=[];
  const row=l=>{seen.push(l+':'+V.dd.stage);const bar=Q('#actions .act-bar');if(!vis(bar)){f.push(l+'：没有 .act-bar');return}
    const bs=[...bar.querySelectorAll('button')].filter(vis).map(R);if(bs.length<2)f.push(l+'：按钮只有 '+bs.length+' 个');
    if(bs.some(r=>Math.abs(r.y-bs[0].y)>1))f.push(l+'：按钮换行了');
    if(bar.scrollWidth>bar.clientWidth+1)f.push(l+'：按钮超出 .act-bar');
    if(bs.some(r=>r.x<-0.5||r.x+r.w>innerWidth+0.5))f.push(l+'：按钮超出屏幕')};
  if(V.dd.stage==='bid'&&myTurn())row('叫地主');else f.push('没有停在叫地主阶段：'+V.dd.stage);
  ddLandlord({landlord:2,robs:0});clearTimeout(timer);S.dd.dblAsk=[0];S.toAct=0;sync();clearTimeout(timer);await sleep(80);row('加倍');
  const d=S.dd;d.stage='play';d.dblAsk=[];const c1=S.players[1].cards.slice(0,1),k1=ddClassify(c1);d.lead={pid:1,cls:k1,cards:c1};d.shown[1]={cards:c1,cls:k1};S.toAct=0;sync();clearTimeout(timer);await sleep(80);row('出牌');
  return f})()`;
const COACH_REC=`(async()=>{${PG}
  const mode=LOCAL.mode;LOCAL.mode='live';renderActions();
  if(!Q('#actions .act-bar .is-rec'))f.push('没有 .is-rec 按钮');
  if(!(Q('#actions .act-hint')||{textContent:''}).textContent.includes('教练建议'))f.push('.act-hint 里没有「教练建议」');
  LOCAL.mode=mode;renderActions();return f})()`;
const PH=[[393,873,true],[873,393,true]];
SCEN.push(
  {name:'bar-stable',game:'holdem',n:6,extra:BAR_STABLE},
  {name:'raise-pop',game:'holdem',n:6,extra:RAISE_POP,sizes:[...PH,[360,780,true],[1280,800,false]]},
  {name:'raise-pop-9',game:'holdem',n:9,extra:RAISE_POP,sizes:[...PH,[1280,800,false]]},
  {name:'zjh-pop',game:'zjh',n:6,extra:ZJH_POP,sizes:[...PH,[1280,800,false]]},
  {name:'ddz-bar',game:'ddz',n:3,extra:DDZ_BAR},
  {name:'guest-wait',game:'holdem',n:6,extra:GUEST_WAIT,sizes:PH},
  {name:'coach-rec',game:'holdem',n:6,extra:COACH_REC,sizes:PH},
  {name:'coach-rec-zjh',game:'zjh',n:6,extra:COACH_REC,sizes:PH},
  {name:'coach-rec-ddz',game:'ddz',n:3,extra:COACH_REC,sizes:PH}
);
/* fx-points: the start of every animation sits within 20px of the seat it belongs to, and #fx lies over #table */
const FX_POINTS=`(async()=>{${PG}
  const fx=Q('#fx'),fr=R(fx),tr=R(Q('#table'));
  if(!fx)return ['没有 #fx'];
  if(['x','y','w','h'].some(k=>Math.abs(fr[k]-tr[k])>1))f.push('#fx 和 #table 没对齐：'+JSON.stringify(fr)+' vs '+JSON.stringify(tr));
  const mid=pid=>{const s=Q('#table .seat[data-pid="'+pid+'"]');if(!s)return null;const r=R(s);return {x:r.x+r.w/2,y:r.y+r.h/2}};
  const at=(el)=>({x:fr.x+parseFloat(el.style.left),y:fr.y+parseFloat(el.style.top)});
  const chk=(tag,pid,el)=>{const c=mid(pid);if(!el){f.push(tag+' '+pid+'：没有生成元素');return}
    const a=at(el),d=Math.hypot(a.x-c.x,a.y-c.y);if(!(d<=20))f.push(tag+' '+pid+'：起点离座位中心 '+d.toFixed(1)+'px')};
  const keep=V.ev;
  for(let pid=0;pid<V.players.length;pid++){
    if(!mid(pid)){f.push('座位 '+pid+' 找不到');continue}
    fx.innerHTML='';flyChips(seatPoint(pid,'seat'),seatPoint(pid,'bet'),1);chk('飞筹码',pid,fx.querySelector('.fly-chip'));
    fx.innerHTML='';showBubble(pid,'你好');chk('聊天气泡',pid,fx.querySelector('.bubble'));
    fx.innerHTML='';allInFx(pid);chk('全下光圈',pid,fx.querySelector('.allin-ring'));
    if(typeof ddBombFx==='function'&&isD(V)){fx.innerHTML='';ddBombFx(pid,'炸弹');chk('炸弹光圈',pid,fx.querySelector('.allin-ring'))}
  }
  fx.innerHTML='';
  return f})()`;
SCEN.push(
  {name:'fx-points',game:'holdem',n:6,extra:FX_POINTS,sizes:[...PH,[1280,800,false]]},
  {name:'fx-points-9',game:'holdem',n:9,extra:FX_POINTS,sizes:PH},
  {name:'fx-points-ddz',game:'ddz',n:3,extra:FX_POINTS,sizes:PH}
);
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
    seats:all('#table .seat'),others:{board:all('#table .board'),'dd-bottom':all('#table .dd-bottom'),'dd-center':all('#table .dd-center'),'dd-play':all('#table .dd-play'),actions:all('#actions'),'act-hint':all('#actions .act-hint'),'act-pop':all('#actions .act-pop')},
    bets:all('#table .bet'),actions:all('#actions'),btns:[...document.querySelectorAll('#actions button')].filter(vis).map(b=>({t:b.textContent.trim().slice(0,12),h:b.getBoundingClientRect().height})),
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
  m.bets.forEach((b,i)=>m.actions.forEach(a=>{if(hit(b,a))f.push(`下注筹码 ${i} 压住 #actions`)}));
  if(sc.mobile){const b=m.btns.find(b=>b.h<39.5);if(b)f.push(`按钮「${b.t}」只有 ${b.h.toFixed(1)}px 高`)}
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
    const fails=m?check(m,{...sc,mobile}):['测量失败'];
    const errs=[...pg.errs,...((await pg.ev('window.__errs'))||[])];
    if(errs.length)fails.push(...errs.map(e=>'控制台报错: '+e));
    res.push({scenario:label,size:`${m?m.iw:w}x${m?m.ih:h}`,turn:st&&st.turn,fails});
    if(SHOTS)await pg.shot(path.join(SHOTS,label.replace(/\s+/g,'_')+'.jpg'));
  };
  await measure(tag);
  if(sc.extra){const x=await pg.ev(sc.extra);const last=res[res.length-1];
    if(!Array.isArray(x))last.fails.push('检查脚本失败');else last.fails.push(...x);
    const errs=[...pg.errs,...((await pg.ev('window.__errs'))||[])];if(errs.length)last.fails.push(...errs.map(e=>'控制台报错: '+e));
    if(SHOTS)await pg.shot(path.join(SHOTS,tag.replace(/\s+/g,'_')+'_after.jpg'));}
  if(then){await then(pg);await measure(tag+' rotated')}
  try{await pg.send('Page.close')}catch(e){}
  pg.close();
  return res;
}
try{
  for(const sc of SCEN)for(const sz of sc.sizes||SIZES)out.results.push(...await run(sc,sz));
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
  if(!process.env.LC_ONLY||process.env.LC_ONLY==='rotate')out.results.push(...await run({name:'rotate',game:'holdem',n:6},[393,873,true],async pg=>{
    await pg.send('Emulation.setDeviceMetricsOverride',{width:873,height:393,deviceScaleFactor:2.75,mobile:true,screenOrientation:{type:'landscapePrimary',angle:90}});
    await sleep(700);
  }));
}finally{chrome.kill();srv.close()}
out.failed=out.results.filter(r=>r.fails.length).length;
out.ok=!out.failed;
out.passed=out.results.length-out.failed;
console.log(JSON.stringify({ok:out.ok,passed:out.passed,failed:out.failed,port:out.port,results:out.results.filter(r=>r.fails.length||process.argv.includes('--all'))},null,1));
process.exit(out.ok?0:1);
