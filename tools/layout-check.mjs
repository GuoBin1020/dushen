#!/usr/bin/env node
/* 牌桌布局检查：node tools/layout-check.mjs [--shots 目录]
   自己在项目目录起一个本地服务器（默认端口 8767，被占用就换一个空闲端口），用无头 Chrome 打开牌局，
   在几种人数、游戏和屏幕尺寸下检查：页面不滚动、标题栏和页脚隐藏、座位互不重叠、座位不压住公共牌 / 底牌 / 出的牌 / 按钮面板，
   斗地主 20 张手牌一行放下，下注筹码不压住按钮区，手机上按钮至少 40px 高，转屏后重新检查，控制台没有报错。
   按钮区另有场景：按钮一排的位置在各种状态下不动、德州加注的弹出面板和炸金花点头像比牌的面板、斗地主按钮一行放下、旁观等待时没有结算按钮、教练高亮。输出 JSON，有任何一项不通过时退出码为 1。 */
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

/* the five original sizes, then 6.7-inch phones both ways up */
const SIZES=[[393,873,true],[360,780,true],[873,393,true],[768,1024,true],[1280,800,false],[430,932,true],[412,915,true],[932,430,true],[915,412,true]];
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
/* 炸金花 compare: no 比牌 button in the row; tapping an opponent's avatar opens a small panel by the seat with name, chips and
   status, and a 「和 TA 比牌」 button that compares when that is allowed; a folded player's panel only shows information */
const ZJH_POP=`(async()=>{${PG}
  S.round=Math.max(2,S.round);sync();clearTimeout(timer);await sleep(80);
  if(Q('#actions [data-act="zpop"][data-pop="cmp"]'))f.push('按钮行里还有比牌按钮');
  if(Q('#actions [data-act="zcmp"]'))f.push('按钮区里还有比牌按钮');
  const tap=pid=>{const a=Q('#table .seat[data-pid="'+pid+'"] .ava');if(!a)return null;const r=a.getBoundingClientRect(),t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);if(t)t.click();return t};
  const pop=()=>Q('#seat-pop'),gap=(a,b)=>Math.max(0,a.x-(b.x+b.w),b.x-(a.x+a.w))+Math.max(0,a.y-(b.y+b.h),b.y-(a.y+a.h));
  const panel=(tag,q,cmp)=>{const p=pop();if(!vis(p)){f.push(tag+'：点头像没有弹出面板');return null}
    const r=R(p),sr=R(Q('#table .seat[data-pid="'+q.id+'"]'));
    if(r.x<-0.5||r.y<-0.5||r.x+r.w>innerWidth+0.5||r.y+r.h>innerHeight+0.5)f.push(tag+'：面板超出屏幕');
    if(gap(r,sr)>24)f.push(tag+'：面板离座位 '+gap(r,sr).toFixed(0)+'px');
    const t=p.textContent;if(!t.includes(q.name))f.push(tag+'：面板里没有名字');if(!t.includes(fmt(q.stack)))f.push(tag+'：面板里没有筹码');
    const want=q.folded?'弃牌':q.seen?'看牌':'闷牌';if(!t.includes(want))f.push(tag+'：面板里没有状态「'+want+'」');
    const b=p.querySelector('[data-act="zcmp"]');
    if(cmp){if(!b||!vis(b))f.push(tag+'：能比牌却没有比牌按钮');else{if(+b.dataset.t!==q.id)f.push(tag+'：比牌按钮的对象不对');if(!/和 TA 比牌（付 /.test(b.textContent))f.push(tag+'：按钮文字是「'+b.textContent+'」');
      if(innerWidth<1000&&b.getBoundingClientRect().height<39.5)f.push(tag+'：比牌按钮不到 40px')}}
    else if(b)f.push(tag+'：不能比牌却有比牌按钮');
    return p};
  const opps=V.players.filter(q=>q.id!==V.me&&alive(q));if(opps.length<2)return ['对手不够'];
  const a=opps[0],c=opps[opps.length-1];
  tap(a.id);await sleep(80);if(!panel('对手',a,true))return f;
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await sleep(60);if(vis(pop()))f.push('按 Esc 没有关闭面板');
  tap(a.id);await sleep(80);Q('#table').click();await sleep(60);if(vis(pop()))f.push('点面板外面没有关闭');
  S.players[c.id].folded=true;sync();clearTimeout(timer);await sleep(60);
  tap(c.id);await sleep(80);panel('弃牌的对手',V.players[c.id],false);Q('#table').click();await sleep(60);
  tap(a.id);await sleep(80);const p=panel('比牌',a,true);const b=p&&p.querySelector('[data-act="zcmp"]');
  if(b){const st0=V.players[V.me].stack;b.click();await sleep(300);
    if(!(V.players[V.me].stack<st0))f.push('点了比牌没有比牌：筹码 '+st0+' → '+V.players[V.me].stack);
    if(vis(pop()))f.push('比牌后面板没有关闭')}
  return f})()`;
/* 德州 seats keep their old tap: no panel, the bet chip lifts */
const HM_SEAT_TAP=`(async()=>{${PG}
  const s=[...document.querySelectorAll('#table .seat:not(.me)')][0],a=s&&s.querySelector('.ava');if(!a)return ['没有对手座位'];
  const r=a.getBoundingClientRect(),t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);if(t)t.click();await sleep(80);
  if(vis(Q('#seat-pop')))f.push('德州点座位弹出了面板');
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
  {name:'zjh-pop',game:'zjh',n:6,extra:ZJH_POP,sizes:[...PH,[412,915,true],[915,412,true],[1280,800,false]]},
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
/* chip-art: bet chips and flying chips show the chip image, not a CSS circle */
const CHIP_ART=`(async()=>{${PG}
  const okUrl=el=>{const b=getComputedStyle(el).backgroundImage;return /chips\\/|blob:/.test(b)};
  const c=Q('#table .bet .chip');if(!c)return ['没有 .bet .chip'];
  if(!okUrl(c))f.push('.bet .chip 没有筹码图：'+getComputedStyle(c).backgroundImage);
  const fx=Q('#fx');fx.innerHTML='';flyChips({x:50,y:50},{x:100,y:100},2);
  const fc=fx.querySelector('.fly-chip');if(!fc)f.push('没有 .fly-chip');else if(!okUrl(fc))f.push('.fly-chip 没有筹码图：'+getComputedStyle(fc).backgroundImage);
  fx.innerHTML='';
  const a=[...document.querySelectorAll('#table .seat .ava')].map(e=>e.textContent);if(a.some(x=>x==='一'))f.push('头像是「一」');
  return f})()`;
SCEN.push({name:'chip-art',game:'holdem',n:6,extra:CHIP_ART,sizes:[...PH,[1280,800,false]]});
/* sheets: each corner panel opens above its backdrop: a tap in its middle lands inside it, its tabs and close button work,
   and a tap on the backdrop beside it closes it. Taps go to whatever element is on top at that point, like a finger would. */
const SHEET_CLICK=`(async()=>{${PG}
  const at=(x,y)=>document.elementFromPoint(x,y),nm=t=>t?(t.id?'#'+t.id:t.className?'.'+String(t.className).split(' ')[0]:t.tagName):'空';
  const tap=el=>{const r=el.getBoundingClientRect(),t=at(r.left+r.width/2,r.top+r.height/2);if(t)t.click();return t};
  for(const [name,label] of [['coach','教练'],['stats','统计'],['rules','规则'],['menu','菜单']]){
    const b=Q('.corner [data-sheet="'+name+'"]');if(!b){f.push(label+'：没有角落按钮');continue}
    tap(b);await sleep(80);
    const sh=Q('#sheet');if(!vis(sh)){f.push(label+'：面板没有打开');continue}
    const r=R(sh),t=at(r.x+r.w/2,r.y+r.h/2);
    if(!t||!sh.contains(t))f.push(label+'：面板中部点到的是 '+nm(t));
    const tabs=[...sh.querySelectorAll('[data-sheet-tab]')];
    if(tabs.length>1){const want=tabs[1].dataset.sheetTab,th=tap(tabs[1]);await sleep(60);
      const cur=Q('#sheet-tabs [aria-selected="true"]');if(!cur||cur.dataset.sheetTab!==want)f.push(label+'：点第二个标签没有切换（点到 '+nm(th)+'）')}
    const cl=Q('#sheet [data-act="sheet-close"]'),ch=tap(cl);await sleep(60);
    if(vis(Q('#sheet')))f.push(label+'：点关闭没有关上（点到 '+nm(ch)+'）');
    tap(b);await sleep(80);const r2=R(Q('#sheet'));
    const p=r2.y>10?[innerWidth/2,r2.y/2]:[r2.x/2,innerHeight/2],bg=at(p[0],p[1]);
    if(!bg||bg.id!=='sheet-bg')f.push(label+'：面板外面点到的是 '+nm(bg)+'，不是遮罩');else{bg.click();await sleep(60);if(vis(Q('#sheet')))f.push(label+'：点遮罩没有关上')}
    if(vis(Q('#sheet')))Q('#sheet [data-act="sheet-close"]').click();
  }
  return f})()`;
/* ddz-top: with plays in front of all three seats, the card counter strip sits under the corner buttons (two rows upright,
   one row sideways), on screen and clear of everything; the played and bottom cards are bigger than they used to be
   (OLD: their widths before, per screen size) and still clear of seats, buttons, the counter and my hand */
const DDZ_TOP=`(async()=>{${PG}
  const OLD={'393x873':[25.15,25.15],'360x780':[23.04,23.04],'873x393':[27.51,25.15],'768x1024':[42,40],'1280x800':[46,40]};
  const d=S.dd,pc=(i,k)=>S.players[i].cards.slice(0,k);
  d.shown[0]={cards:pc(0,4),cls:{type:'single'}};d.shown[1]={cards:pc(1,6),cls:{type:'single'}};d.shown[2]={cards:pc(2,5),cls:{type:'single'}};
  sync();clearTimeout(timer);await sleep(150);
  const all=s=>[...document.querySelectorAll(s)].filter(vis);
  const land=innerWidth>=innerHeight,seats=all('#table .seat').map(R),corner=all('.corner > *').map(R);
  const bar=[...all('#actions .act-bar button'),...all('#actions .act-hint')].map(R),handC=all('#dd-hand .card').map(R);
  const plays=all('#table .dd-play').map(R),bottom=all('#table .dd-bottom').map(R),center=all('#table .dd-center').map(R);
  const off=r=>r.x<-0.5||r.y<-0.5||r.x+r.w>innerWidth+0.5||r.y+r.h>innerHeight+0.5;
  const clear=(tag,r,list,what)=>list.forEach((o,i)=>{if(hit(r,o))f.push(tag+' 压住 '+what+' '+i)});
  const st=Q('#dd-strip');let sr=null;
  if(!vis(st))f.push('记牌器没有显示');else{
    sr=R(st);if(off(sr))f.push('记牌器超出屏幕');
    const cells=[...st.querySelectorAll('span')].filter(vis).map(R);if(cells.length!==15)f.push('记牌器格子 '+cells.length+' 个，不是 15');
    const rows=new Set(cells.map(c=>Math.round(c.y))).size;if(rows!==(land?1:2))f.push('记牌器 '+rows+' 行，应是 '+(land?1:2)+' 行');
    const top=Math.max(...corner.map(c=>c.y+c.h));if(sr.y<top-0.5)f.push('记牌器不在角落按钮下面：'+sr.y.toFixed(1)+' < '+top.toFixed(1));
    clear('记牌器',sr,seats,'座位');clear('记牌器',sr,center,'底牌区');clear('记牌器',sr,plays,'出的牌');clear('记牌器',sr,corner,'角落按钮');clear('记牌器',sr,bar,'按钮区');
  }
  const w=s=>{const c=Q(s);return c?parseFloat(getComputedStyle(c).width):0};
  const old=OLD[innerWidth+'x'+innerHeight],k=land?1.4:1.15,pw=w('#table .dd-play:not(.rest) .card'),dbw=w('#table .dd-bottom .card');
  if(old){if(pw<old[0]*k-0.05)f.push('出的牌宽 '+pw.toFixed(1)+'px，不到原来 '+old[0]+' 的 '+k+' 倍');
    if(dbw<old[1]*k-0.05)f.push('底牌宽 '+dbw.toFixed(1)+'px，不到原来 '+old[1]+' 的 '+k+' 倍')}
  if(plays.length!==3)f.push('出的牌 '+plays.length+' 组，不是 3');
  [...plays.map((r,i)=>['出的牌 '+i,r]),...bottom.map(r=>['底牌',r])].forEach(([tag,r])=>{
    if(off(r))f.push(tag+' 超出屏幕');
    clear(tag,r,seats,'座位');clear(tag,r,corner,'角落按钮');clear(tag,r,bar,'按钮区');clear(tag,r,handC,'手牌');if(sr)clear(tag,r,[sr],'记牌器')});
  const tg=Q('.corner [data-act="ddcounter"]');if(!tg)f.push('没有 🃏 开关');else{
    tg.click();await sleep(80);if(vis(Q('#dd-strip')))f.push('点 🃏 没有隐藏记牌器');
    Q('.corner [data-act="ddcounter"]').click();await sleep(80);if(!vis(Q('#dd-strip')))f.push('再点 🃏 没有显示记牌器')}
  return f})()`;
SCEN.push(
  {name:'sheets',game:'holdem',n:6,extra:SHEET_CLICK},
  {name:'sheets-ddz',game:'ddz',n:3,extra:SHEET_CLICK,sizes:[...PH,[1280,800,false]]},
  {name:'ddz-top',game:'ddz',n:3,lord20:true,extra:DDZ_TOP}
);
/* board-cards: no bet chip touches any seat (plate and cards included) and each lies on its seat's line to the middle; the middle (德州 board and pot, 炸金花 pot) sits lower than it used to (OLD_TOP: the board's top before, per size)
   and clear of every seat, bet and the buttons; opponents' cards are at least 1.3x their old width on phones (OLD_CW) and
   clear of the other seats, their cards, the middle and the buttons */
const BOARD_CARDS=`(async()=>{${PG}
  const OLD_TOP={'393x873':265.1,'360x780':236.8,'873x393':109.2,'768x1024':300.8,'1280x800':251.8,'430x932':282.8,'412x915':278.1,'932x430':120.9,'915x412':115.2};
  const OLD_CW={'393x873':18.86,'360x780':17.27,'873x393':21.22,'768x1024':32,'1280x800':34,'430x932':20.63,'412x915':19.77,'932x430':23.22,'915x412':22.23};
  const key=innerWidth+'x'+innerHeight,all=s=>[...document.querySelectorAll(s)].filter(vis);
  const seats=all('#table .seat'),bets=all('#table .bet').map(R),bar=[...all('#actions .act-bar'),...all('#actions .act-hint')].map(R);
  const mid=[...all('#table .board'),...all('#table .center .pot')].map(R);
  const bd=Q('#table .board');
  if(bd&&OLD_TOP[key]){const top=R(bd).y,want=OLD_TOP[key]+innerHeight*0.04;if(top<want-0.5)f.push('公共牌上沿 '+top.toFixed(1)+'px，没有比原来 '+OLD_TOP[key]+' 低屏幕高度的 4%（'+want.toFixed(1)+'）')}
  mid.forEach((m,i)=>{seats.forEach((s,j)=>{if(hit(m,R(s)))f.push('桌面中间 '+i+' 压住座位 '+j)});bets.forEach((b,j)=>{if(hit(m,b))f.push('桌面中间 '+i+' 压住下注 '+j)});bar.forEach(b=>{if(hit(m,b))f.push('桌面中间 '+i+' 压住按钮区')})});
  /* bet chips never touch any seat, plate or seat cards, their own included */
  bets.forEach((b,i)=>seats.forEach((s,j)=>{const pl=s.querySelector('.plate'),cs=s.querySelector('.cards');
    if(hit(b,R(s)))f.push('下注 '+i+' 压住座位 '+j);else if(pl&&hit(b,R(pl)))f.push('下注 '+i+' 压住座位 '+j+' 的名牌');
    if(cs&&vis(cs)&&hit(b,R(cs)))f.push('下注 '+i+' 压住座位 '+j+' 的牌')}));
  /* each chip lies on the line from its seat's centre to the middle of the table, nearer the middle than the seat */
  const cen=R(Q('#table .center')),C={x:cen.x+cen.w/2,y:cen.y+cen.h/2};
  all('#table .bet[data-pid]').forEach(el=>{const s=R(Q('#table .seat[data-pid="'+el.dataset.pid+'"]')),r=R(el),P={x:s.x+s.w/2,y:s.y+s.h/2},B={x:r.x+r.w/2,y:r.y+r.h/2};
    const dx=C.x-P.x,dy=C.y-P.y,L=Math.hypot(dx,dy)||1,off=Math.abs((B.x-P.x)*dy-(B.y-P.y)*dx)/L;
    if(off>6)f.push('下注 '+el.dataset.pid+' 离座位到桌心的连线 '+off.toFixed(1)+'px');
    if(!(Math.hypot(C.x-B.x,C.y-B.y)<Math.hypot(C.x-P.x,C.y-P.y)))f.push('下注 '+el.dataset.pid+' 没有比座位更靠近桌心')});
  const phone=Math.min(innerWidth,innerHeight)<500,c0=Q('#table .seat:not(.me) .cards .card');
  if(phone&&c0&&OLD_CW[key]){const w=parseFloat(getComputedStyle(c0).width);if(w<OLD_CW[key]*1.3-0.05)f.push('对手的牌宽 '+w.toFixed(1)+'px，不到原来 '+OLD_CW[key]+' 的 1.3 倍')}
  const cards=seats.map(s=>{const c=s.querySelector('.cards');return c&&vis(c)?R(c):null});
  cards.forEach((c,i)=>{if(!c||seats[i].classList.contains('me'))return;
    if(c.x<-0.5||c.y<-0.5||c.x+c.w>innerWidth+0.5||c.y+c.h>innerHeight+0.5)f.push('座位 '+i+' 的牌超出屏幕');
    seats.forEach((s,j)=>{if(j!==i&&hit(c,R(s)))f.push('座位 '+i+' 的牌压住座位 '+j)});
    cards.forEach((d,j)=>{if(d&&j>i&&hit(c,d))f.push('座位 '+i+' 和 '+j+' 的牌重叠')});
    mid.forEach((m,j)=>{if(hit(c,m))f.push('座位 '+i+' 的牌压住桌面中间 '+j)});bar.forEach(b=>{if(hit(c,b))f.push('座位 '+i+' 的牌压住按钮区')})});
  return f})()`;
/* showdown: every hand shown at the end of a 德州 / 炸金花 hand has its hand name beside it, the winner's marked; with
   「亮出所有人的底牌」 on, a player who folded also shows cards and a name marked 「已弃牌」; with it off, they show nothing */
const SHOWDOWN=all=>`(async()=>{${PG}
  const FP=2;S.cfg.showAll=${all};S.toAct=FP;act(S.players[FP],'fold');clearTimeout(timer);
  if(isZ(S))zShowdown('');else{while(S.board.length<5)S.board.push(S.deck.pop());S.street='river';showdown()}
  clearTimeout(timer);await sleep(150);
  if(V.phase!=='handover')return ['没有进入本手结束：'+V.phase];
  const gap=(a,b)=>Math.max(0,a.x-(b.x+b.w),b.x-(a.x+a.w))+Math.max(0,a.y-(b.y+b.h),b.y-(a.y+a.h));
  const off=r=>r.x<-0.5||r.y<-0.5||r.x+r.w>innerWidth+0.5||r.y+r.h>innerHeight+0.5;
  const seats=[...document.querySelectorAll('#table .seat')],bar=[...document.querySelectorAll('#actions .act-bar')].filter(vis).map(R);
  const label=(tag,el,near,p)=>{
    if(!vis(el)){f.push(tag+'：没有牌型标签');return}
    const r=R(el);if(off(r))f.push(tag+'：牌型标签超出屏幕');if(gap(r,near)>8)f.push(tag+'：牌型标签离牌 '+gap(r,near).toFixed(0)+'px');
    seats.forEach(s=>{if(+s.dataset.pid!==p.id&&hit(r,R(s)))f.push(tag+'：牌型标签压住座位 '+s.dataset.pid)});
    bar.forEach(b=>{if(hit(r,b))f.push(tag+'：牌型标签压住按钮区')});
    if(p.won>0&&!el.classList.contains('win'))f.push(tag+'：赢家的标签没有标出');
    if(!(p.won>0)&&el.classList.contains('win'))f.push(tag+'：输家的标签标成了赢家');
    return el.textContent};
  for(const s of seats){const p=V.players[+s.dataset.pid];if(p.id===V.me)continue;
    const faces=[...s.querySelectorAll('.cards .card:not(.back)')].filter(vis),hn=s.querySelector('.hname'),tag='座位 '+p.id;
    if(p.id===FP){
      if(${all}){if(!faces.length)f.push(tag+'：弃牌的人没有亮出底牌');else{const t=label(tag,hn,R(s.querySelector('.cards')),p)||'';if(!vis(s.querySelector('.pact'))||!s.querySelector('.pact').textContent.includes('已弃牌'))f.push(tag+'：座位上没有标明「已弃牌」');if(t.trim().length<2)f.push(tag+'：弃牌的人没有牌型：'+t)}}
      else{if(faces.length)f.push(tag+'：没勾选却亮出了弃牌的人的底牌');if(hn&&vis(hn))f.push(tag+'：没勾选却给弃牌的人标了牌型')}
      continue}
    if(!faces.length)continue;
    const t=label(tag,hn,R(s.querySelector('.cards')),p);if(t!=null&&p.handName&&!t.includes(p.handName))f.push(tag+'：标签「'+t+'」不是 '+p.handName);
  }
  const mh=Q('#table .my-hand');if(!mh)f.push('没有我的手牌');else{const m=V.players[V.me],t=label('我',Q('#table .hname.mine'),R(mh),m);if(t!=null&&!t.includes(m.handName))f.push('我：标签「'+t+'」不是 '+m.handName)}
  if(!document.querySelector('#table .hname.win'))f.push('没有标出赢家');
  return f})()`;
/* toasts during a game sit near the top, under the corner buttons, clear of my hand and the buttons */
const TOAST_TOP=`(async()=>{${PG}
  toast('横屏体验更好：把手机横过来，或者点上方的「横屏全屏」。',6000);await sleep(60);
  const t=Q('#toast');if(!vis(t))return ['toast 没有出现'];const r=R(t);
  if(r.x<-0.5||r.y<-0.5||r.x+r.w>innerWidth+0.5||r.y+r.h>innerHeight+0.5)f.push('toast 超出屏幕');
  [...document.querySelectorAll('#dd-hand .card,#table .my-hand .card')].filter(vis).forEach((c,i)=>{if(hit(R(c),r))f.push('toast 压住手牌 '+i)});
  [...document.querySelectorAll('#actions .act-bar button,.corner > *')].filter(vis).forEach(b=>{if(hit(R(b),r))f.push('toast 压住「'+(b.textContent.trim()||b.getAttribute('aria-label')||'按钮')+'」')});
  t.hidden=true;return f})()`;
const PH4=[[393,873,true],[873,393,true],[412,915,true],[915,412,true]];
SCEN.push(
  {name:'board-cards',game:'holdem',n:6,extra:BOARD_CARDS},
  {name:'board-cards-9',game:'holdem',n:9,extra:BOARD_CARDS},
  {name:'board-cards-zjh',game:'zjh',n:6,extra:BOARD_CARDS},
  {name:'showdown-all',game:'holdem',n:6,extra:SHOWDOWN(true),sizes:[...PH4,[1280,800,false]]},
  {name:'showdown-none',game:'holdem',n:6,extra:SHOWDOWN(false),sizes:PH4},
  {name:'showdown-9-all',game:'holdem',n:9,extra:SHOWDOWN(true),sizes:PH4},
  {name:'showdown-zjh-all',game:'zjh',n:6,extra:SHOWDOWN(true),sizes:[...PH4,[1280,800,false]]},
  {name:'showdown-zjh-none',game:'zjh',n:6,extra:SHOWDOWN(false),sizes:PH4},
  {name:'hm-seat-tap',game:'holdem',n:6,extra:HM_SEAT_TAP,sizes:PH},
  {name:'toast-top',game:'ddz',n:3,lord20:true,extra:TOAST_TOP,sizes:PH4},
  {name:'toast-top-hm',game:'holdem',n:6,extra:TOAST_TOP,sizes:PH4}
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
  if(then){if(await then(pg)!=='skip')await measure(tag+' rotated')}
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
  /* home-confirm: a solo game asks before leaving; dismissing the dialog stays, accepting goes home */
  if(!process.env.LC_ONLY||process.env.LC_ONLY==='home-confirm'){
    const fl=[];
    const r=await run({name:'home-confirm',game:'holdem',n:6},[1280,800,false],async pg=>{
      const click=()=>pg.ev(`(()=>{const b=document.querySelector('#menu [data-act="menu-home"]');if(!b)return 'nobtn';b.click();return 'ok'})()`);
      const inGame=()=>pg.ev(`!document.getElementById('game-view').hidden`);
      pg.dialogAnswer(false);const n0=pg.dialogs.length;
      if(await click()!=='ok')fl.push('菜单里没有 回到主页');
      await sleep(200);
      if(pg.dialogs.length!==n0+1)fl.push('点 回到主页 没有弹出确认框');
      if(!(await inGame()))fl.push('取消确认后离开了牌局');
      pg.dialogAnswer(true);await click();await sleep(300);
      if(await inGame())fl.push('确认后仍在牌局');
      if(await pg.ev(`document.getElementById('setup-view').hidden`))fl.push('确认后没有回到主页');
      return 'skip';
    });
    r[r.length-1].fails.push(...fl);
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
