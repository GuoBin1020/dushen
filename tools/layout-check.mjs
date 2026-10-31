#!/usr/bin/env node
/* 牌桌布局检查：node tools/layout-check.mjs [--shots 目录]
   自己在项目目录起一个本地服务器（默认端口 8767，被占用就换一个空闲端口），用无头 Chrome 打开牌局，
   在几种人数、游戏和屏幕尺寸下检查：页面不滚动、标题栏和页脚隐藏、座位互不重叠、座位不压住公共牌 / 底牌 / 出的牌 / 按钮面板，
   斗地主 20 张手牌一行放下，下注筹码不压住按钮区，手机上按钮至少 40px 高，转屏后重新检查，控制台没有报错。
   座位按左右半边对齐；炸金花比牌的 PK 动画；开牌的牌型标签不压住任何人的名字和筹码。
   按钮区另有场景：出牌限时的倒计时圈（和头像一样大、在头像朝桌心的一侧、不压住别的东西、秒数减少、最后 5 秒变红）、托管面板和「取消托管」「下一局加入」按钮（能点、点了恢复）、按钮一排的位置在各种状态下不动、德州加注的弹出面板和炸金花点头像比牌的面板、斗地主按钮一行放下、旁观等待时没有结算按钮、教练高亮。输出 JSON，有任何一项不通过时退出码为 1。 */
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
/* 红中麻将 on the setup form: its own options with their defaults, 4 seats, and 开始 opens a 红中麻将 table */
const HZ_SETUP=`(async()=>{const f=[];const vis=el=>!!el&&!el.closest('[hidden]')&&el.getBoundingClientRect().width>0;
  clearTimeout(timer);show('setup');setMode('solo');
  const b=document.querySelector('#f-game [data-game="hz"]');if(!b)return ['首页没有「红中麻将」按钮'];
  b.click();await new Promise(r=>setTimeout(r,100));
  for(const id of ['f-hzbase','f-hzbirds','f-hzdp','f-hzredself','f-hzqiang','f-hznored'])if(!vis(document.getElementById(id)))f.push('红中麻将选项 '+id+' 不可见');
  if(vis(document.getElementById('f-players')))f.push('红中麻将不该显示座位数（固定 4 人）');
  const want={'f-hzdp':false,'f-hzredself':true,'f-hzqiang':true,'f-hznored':false};
  for(const [id,v] of Object.entries(want)){const el=document.getElementById(id);if(el&&el.checked!==v)f.push(id+' 默认应为 '+v)}
  if(document.getElementById('f-hzbirds')&&document.getElementById('f-hzbirds').value!=='2')f.push('抓鸟默认应为 2');
  document.getElementById('start-btn').click();
  for(let i=0;i<60&&!(V&&V.cfg&&V.cfg.game==='hz');i++)await new Promise(r=>setTimeout(r,50));
  if(!(V&&V.cfg.game==='hz'))f.push('点「开始」没有进入红中麻将');
  else{if(V.players.length!==4)f.push('红中麻将应为 4 人，实际 '+V.players.length);
    const c=V.cfg;if(c.hzDianpao!==false||c.hzRedSelf!==true||c.hzQiangGang!==true||c.hzNoRed!==false||c.hzBirds!==2)f.push('开局配置默认值不对 '+JSON.stringify({dp:c.hzDianpao,rs:c.hzRedSelf,qg:c.hzQiangGang,nr:c.hzNoRed,b:c.hzBirds}))}
  clearTimeout(timer);return f})()`;

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
    /* the seat as drawn: its box and what sticks out of it (a crowded row's cards) */
    const se=Q('#table .seat[data-pid="'+q.id+'"]'),ps=[se,...se.querySelectorAll('.stop > *,.plate')].filter(vis).map(R);
    const r=R(p),x0=Math.min(...ps.map(o=>o.x)),y0=Math.min(...ps.map(o=>o.y)),sr={x:x0,y:y0,w:Math.max(...ps.map(o=>o.x+o.w))-x0,h:Math.max(...ps.map(o=>o.y+o.h))-y0};
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
  {name:'hz-setup',game:'holdem',n:6,extra:HZ_SETUP,sizes:PH},
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
  /* the coach's hint is as long as it ever gets (a long run plus a warning), so the check does not depend on the hand dealt */
  const hint=Q('#actions .act-hint');if(hint)hint.innerHTML='<span class="dd-warn">注意：下家只剩 1 张牌！</span>教练建议：<b>飞机带翅膀（3 3 3 4 4 4 5 5 5 6 6 6 7 8 9 10）</b> · 你先出，可以出任意牌型 · 先点选要出的牌';
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
  /* the cards grew, so compare the board's middle (not its top edge) with the old top edge */
  if(bd&&OLD_TOP[key]){const r=R(bd),mid=r.y+r.h/2,want=OLD_TOP[key]+innerHeight*0.04;if(mid<want-0.5)f.push('公共牌中线 '+mid.toFixed(1)+'px，没有比原来上沿 '+OLD_TOP[key]+' 低屏幕高度的 4%（'+want.toFixed(1)+'）')}
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
const SHOWDOWN=(all,long)=>`(async()=>{${PG}
  const FP=2;S.cfg.showAll=${all};S.toAct=FP;act(S.players[FP],'fold');clearTimeout(timer);
  if(isZ(S))zShowdown('');else{while(S.board.length<5)S.board.push(S.deck.pop());S.street='river';showdown()}
  clearTimeout(timer);await sleep(150);
  if(V.phase!=='handover')return ['没有进入本手结束：'+V.phase];
  /* long: the widest name on every shown hand, so the check does not depend on the cards dealt */
  if(${!!long}){V.players.forEach(p=>{if(p.handName)p.handName='同花顺';if(p.revealName)p.revealName='同花顺'});renderTable();await sleep(60)}
  const gap=(a,b)=>Math.max(0,a.x-(b.x+b.w),b.x-(a.x+a.w))+Math.max(0,a.y-(b.y+b.h),b.y-(a.y+a.h));
  const off=r=>r.x<-0.5||r.y<-0.5||r.x+r.w>innerWidth+0.5||r.y+r.h>innerHeight+0.5;
  const seats=[...document.querySelectorAll('#table .seat')],bar=[...document.querySelectorAll('#actions .act-bar')].filter(vis).map(R);
  const label=(tag,el,near,p)=>{
    if(!vis(el)){f.push(tag+'：没有牌型标签');return}
    const r=R(el);if(off(r))f.push(tag+'：牌型标签超出屏幕');if(gap(r,near)>8)f.push(tag+'：牌型标签离牌 '+gap(r,near).toFixed(0)+'px');
    seats.forEach(s=>{if(+s.dataset.pid!==p.id&&hit(r,R(s)))f.push(tag+'：牌型标签压住座位 '+s.dataset.pid)});
    /* never on anybody's name or chips line, its own seat's included */
    document.querySelectorAll('#table .pname,#table .pstack').forEach(e=>{if(vis(e)&&hit(r,R(e)))f.push(tag+'：牌型标签压住座位 '+e.closest('.seat').dataset.pid+' 的'+(e.classList.contains('pname')?'名字':'筹码'))});
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
/* 出牌限时: the ring beside the avatar of whoever is to act, on screen and clear of other seats, the middle, my hand and the
   buttons; the seconds go down and turn red for the last 5 s. Checked on my own turn (the host's real clock), then on every seat. */
const TURN_RING=`(async()=>{${PG}
  S.cfg.turnSec=15;proceed();await sleep(120);clearTimeout(timer);
  const ring=()=>Q('#table .seat.active .tring');
  /* about as big as the avatar, right beside it on the side toward the middle, not over it (its initial stays readable) */
  const tb=R(Q('#table')),c0=centerXY(),C={x:tb.x+tb.w*c0.x/100,y:tb.y+tb.h*c0.y/100},mid=r=>({x:r.x+r.w/2,y:r.y+r.h/2});
  const gap=(a,b)=>Math.max(0,a.x-(b.x+b.w),b.x-(a.x+a.w))+Math.max(0,a.y-(b.y+b.h),b.y-(a.y+a.h));
  const place=(tag,pid)=>{const r=ring();if(!vis(r)){f.push(tag+'：没有倒计时');return}
    const rr=R(r),seat=Q('#table .seat[data-pid="'+pid+'"]'),av=R(seat.querySelector('.ava'));
    if(!r.closest('.seat[data-pid="'+pid+'"]'))f.push(tag+'：倒计时不在轮到的人的座位上');
    if(rr.w<av.w*0.9-0.5)f.push(tag+'：倒计时 '+rr.w.toFixed(0)+'px，比头像 '+av.w.toFixed(0)+'px 小');
    if(hit(rr,av))f.push(tag+'：倒计时压住头像');
    if(gap(rr,av)>6)f.push(tag+'：倒计时离头像 '+gap(rr,av).toFixed(0)+'px');
    const dr=Math.hypot(mid(rr).x-C.x,mid(rr).y-C.y),da=Math.hypot(mid(av).x-C.x,mid(av).y-C.y);if(!(dr<da))f.push(tag+'：倒计时不在头像朝桌心的一侧');
    const b=r.querySelector('b'),k=seat.offsetWidth?seat.getBoundingClientRect().width/seat.offsetWidth:1,px=parseFloat(getComputedStyle(b).fontSize)*k;if(px<11.95)f.push(tag+'：秒数只有 '+px.toFixed(1)+'px');
    if(rr.x<-0.5||rr.y<-0.5||rr.x+rr.w>innerWidth+0.5||rr.y+rr.h>innerHeight+0.5)f.push(tag+'：倒计时超出屏幕');
    [...document.querySelectorAll('#table .seat')].forEach(s=>{const e=[s,...s.querySelectorAll('.ava,.cards,.plate,.card')].find(e=>vis(e)&&(s!==seat||e!==s)&&hit(R(e),rr));if(e)f.push(tag+'：倒计时压住座位 '+s.dataset.pid+' 的 '+(e===s?'座位':e.className.split(' ')[0])+(${process.env.LC_DEBUG?1:0}?JSON.stringify([R(e),rr]):''))});
    ['#table .board','#table .center .pot','#table .bet','#table .dd-bottom','#table .dd-play','#actions .act-bar button','#actions .act-hint','#table .my-hand .card','#dd-hand .card','.corner > *','#dd-strip'].forEach(q=>document.querySelectorAll(q).forEach(e=>{if(vis(e)&&hit(R(e),rr))f.push(tag+'：倒计时压住 '+q+(${process.env.LC_DEBUG?1:0}?JSON.stringify([R(e),rr,av]):''))}))};
  const r0=ring();if(!r0)return ['轮到我时没有倒计时'];
  const s0=+r0.textContent;if(s0!==15)f.push('开始时显示 '+s0+' 秒，不是 15');
  place('我',V.me);
  TURN.at-=3200;tickRing();const s1=+ring().textContent;if(!(s1<s0))f.push('3 秒后秒数没有减少：'+s0+' → '+s1);
  if(ring().classList.contains('low'))f.push('还剩 '+s1+' 秒就变红了');
  TURN.at-=7000;tickRing();if(!ring().classList.contains('low'))f.push('最后 5 秒没有变红');
  const keep=V.toAct;
  for(const p of V.players){if(p.id===V.me)continue;V.toAct=p.id;TURN={at:Date.now(),left:9000,total:15000};renderTable();tickRing();place('座位 '+p.id,p.id)}
  V.toAct=keep;render();
  return f})()`;
/* 托管 on my own device: a dim panel over my hand with 「托管中……」 and 「取消托管」, which gives control back; after a timeout
   without the coach option, 「下一局加入」 in the button row. Everyone's seat tag says which. */
const TRUST=`(async()=>{${PG}
  const tap=b=>{const r=b.getBoundingClientRect(),t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);if(t!==b&&!b.contains(t)){f.push('「'+b.textContent.trim()+'」被别的东西盖住');return false}t.click();return true};
  const tagHas=w=>[...document.querySelectorAll('#table .seat.me .ptag,#table .seat.me .pact')].some(e=>vis(e)&&e.textContent.includes(w));
  S.cfg.turnSec=10;S.players[0].trust=true;sync();clearTimeout(timer);await sleep(80);
  const v=Q('.trust-veil');if(!vis(v))return ['托管时手牌上没有面板'];
  const vr=R(v),h=hand();if(h&&!(vr.x<=h.x+1&&vr.y<=h.y+1&&vr.x+vr.w>=h.x+h.w-1&&vr.y+vr.h>=h.y+h.h-1))f.push('面板没有盖住手牌');
  if(!v.textContent.includes('托管中'))f.push('面板上没有「托管中」');
  if(vr.x<-0.5||vr.y<-0.5||vr.x+vr.w>innerWidth+0.5||vr.y+vr.h>innerHeight+0.5)f.push('面板超出屏幕');
  [...document.querySelectorAll('#table .seat:not(.me)')].forEach(s=>{if(hit(R(s),vr))f.push('面板压住座位 '+s.dataset.pid)});
  document.querySelectorAll('#actions .act-bar > *').forEach(e=>{if(vis(e)&&hit(R(e),vr))f.push('面板压住按钮行')});
  if(!tagHas('托管中'))f.push('座位上没有标「托管中」');
  const b=v.querySelector('[data-act="untrust"]');if(!vis(b))return [...f,'面板上没有取消托管'];
  if(innerWidth<1000&&R(b).h<39.5)f.push('取消托管不到 40px');
  if(Q('#actions [data-act="fold"],#actions [data-act="ddplay"],#actions [data-act="ddbid"]'))f.push('托管时还有出牌按钮');
  if(tap(b)){await sleep(80);clearTimeout(timer);
    if(S.players[0].trust)f.push('点了取消托管还在托管');if(vis(Q('.trust-veil')))f.push('取消托管后面板还在');
    if(!Q('#actions [data-act="fold"],#actions [data-act="ddplay"],#actions [data-act="ddbid"],#actions [data-act="ddpass"]'))f.push('取消托管后没有恢复出牌按钮');
    if(!vis(Q('#table .seat.active .tring')))f.push('取消托管后没有重新计时')}
  /* 暂时离桌 (德州 / 炸金花 only): not dealt in this hand */
  if(isD(S))return f;
  Object.assign(S.players[0],{away:true,inHand:false,cards:[]});S.toAct=1;sync();clearTimeout(timer);await sleep(80);
  const j=Q('#actions [data-act="rejoin"]');
  if(!vis(j))f.push('暂时离桌时没有「下一局加入」');
  else{if(!tagHas('暂时离桌'))f.push('座位上没有标「暂时离桌」');if(innerWidth<1000&&R(j).h<39.5)f.push('下一局加入不到 40px');
    if(tap(j)){await sleep(80);clearTimeout(timer);if(S.players[0].away)f.push('点了下一局加入还在离桌')}}
  return f})()`;
/* seat alignment: seats on the left half of the table line their avatar, cards and plate text up on the left edge of the
   seat, the right half on the right edge; the far middle and my own seat stay centred */
const ALIGN=`(async()=>{${PG}
  const tb=R(Q('#table')),cx=tb.x+tb.w/2;
  [...document.querySelectorAll('#table .seat')].forEach(s=>{const r=R(s),m=r.x+r.w/2,id=s.dataset.pid;
    const side=s.classList.contains('me')||Math.abs(m-cx)<tb.w*0.06?'c':m<cx?'l':'r',want={l:'left',r:'right',c:'center'}[side];
    const parts=[...s.querySelectorAll('.stop > .ava,.stop > .tring,.stop > .cards')].filter(vis).map(R),lo=Math.min(...parts.map(p=>p.x)),hi=Math.max(...parts.map(p=>p.x+p.w));
    ['.pname','.pstack'].forEach(q=>{const e=s.querySelector(q),ta=e&&getComputedStyle(e).textAlign;if(ta!==want)f.push('座位 '+id+' 的 '+q+' 是 '+ta+'，应该 '+want)});
    if(side==='l'&&Math.abs(lo-r.x)>1.5)f.push('座位 '+id+' 的头像和牌没有靠左：'+(lo-r.x).toFixed(1)+'px');
    if(side==='r'&&Math.abs(hi-r.x-r.w)>1.5)f.push('座位 '+id+' 的头像和牌没有靠右：'+(r.x+r.w-hi).toFixed(1)+'px');
    if(side==='c'&&Math.abs((lo+hi)/2-m)>1.5)f.push('座位 '+id+' 的头像和牌没有居中：'+((lo+hi)/2-m).toFixed(1)+'px')});
  return f})()`;
/* 炸金花 比牌 PK: both avatars fly to the middle and face each other across a 「PK」, the loser dims, they fly home and a short
   line says who is out; no second banner. Reduced motion: only the line. Then a real compare through the engine plays it. */
const ZJH_PK=`(async()=>{${PG}
  const fx=Q('#fx'),off=r=>r.x<-0.5||r.y<-0.5||r.x+r.w>innerWidth+0.5||r.y+r.h>innerHeight+0.5;
  const opp=V.players.filter(p=>p.id!==V.me&&alive(p)),a=opp[opp.length>2?2:0],m=V.players[V.me];
  const ev={type:'compare',pid:m.id,target:a.id,loser:a.id,seq:9999};
  const mid=()=>{const c=R(Q('#table .center'));return {x:c.x+c.w/2,y:c.y+c.h/2}};
  const flown=(tag)=>{const av=[...fx.querySelectorAll('.pk-ava')];if(av.length!==2){f.push(tag+'：飞出的头像 '+av.length+' 个');return null}
    const rs=av.map(R),C=mid();
    rs.forEach((r,i)=>{if(off(r))f.push(tag+'：头像 '+i+' 超出屏幕');const d=Math.hypot(r.x+r.w/2-C.x,r.y+r.h/2-C.y);if(d>r.w*1.6)f.push(tag+'：头像 '+i+' 没有飞到桌子中间（离桌心 '+d.toFixed(0)+'px）');if(r.w<40)f.push(tag+'：头像只有 '+r.w.toFixed(0)+'px')});
    if(hit(rs[0],rs[1]))f.push(tag+'：两个头像重叠');if(Math.abs(rs[0].y-rs[1].y)>1)f.push(tag+'：两个头像没有面对面');
    const mk=fx.querySelector('.pk-mark');if(!vis(mk)||!/PK/.test(mk.textContent))f.push(tag+'：没有 PK 字样');
    else{const k=R(mk),x=k.x+k.w/2,l=rs[0].x<rs[1].x?rs[0]:rs[1],r=rs[0].x<rs[1].x?rs[1]:rs[0];if(!(x>l.x+l.w/2&&x<r.x+r.w/2))f.push(tag+'：PK 不在两个头像中间')}
    return av};
  fx.innerHTML='';compareFx(ev);await sleep(800);
  if(fx.querySelector('.allin-banner'))f.push('比牌还有大横幅');
  const av=flown('比牌');
  if(av){await sleep(900);const lose=av.filter(e=>e.classList.contains('lose'));if(lose.length!==1||lose[0].textContent!==avatarChar(a.name))f.push('输的一方没有变暗');
    await sleep(1000);if(fx.querySelector('.pk-ava'))f.push('头像没有退回');
    const ln=fx.querySelector('.pk-line');if(!vis(ln)||!ln.textContent.includes(a.name+' 出局'))f.push('没有提示谁出局');
    else{const r=R(ln);if(off(r))f.push('出局提示超出屏幕');[...document.querySelectorAll('#actions .act-bar button')].filter(vis).forEach(b=>{if(hit(R(b),r))f.push('出局提示压住按钮')})}}
  fx.innerHTML='';Object.defineProperty(stillMQ,'matches',{value:true,configurable:true});
  try{compareFx(ev);await sleep(100);if(fx.querySelector('.pk-ava,.pk-mark'))f.push('减少动效时还有动画');if(!vis(fx.querySelector('.pk-line')))f.push('减少动效时没有出局提示')}
  finally{delete stillMQ.matches;fx.innerHTML=''}
  S.round=Math.max(2,S.round);S.toAct=V.me;zAct(S.players[V.me],'compare',a.id);clearTimeout(timer);await sleep(800);
  flown('真的比牌');if(fx.querySelector('.allin-banner'))f.push('真的比牌还有大横幅');
  return f})()`;
/* 炸金花 seats open the info / 比牌 panel: reachable by keyboard (role=button, tabindex, label; Enter / Space open it, Esc closes) */
const ZJH_SEAT_KBD=`(async()=>{${PG}
  const seats=[...document.querySelectorAll('#table .seat[data-pid]')];
  seats.forEach(s=>{const id=s.dataset.pid;if(s.getAttribute('tabindex')!=='0')f.push('座位 '+id+' 不能用键盘聚焦');if(s.getAttribute('role')!=='button')f.push('座位 '+id+' 没有 role=button');if(!(s.getAttribute('aria-label')||'').trim())f.push('座位 '+id+' 没有 aria-label')});
  const s=seats.find(x=>!x.classList.contains('me'));if(!s)return f.concat('没有对手座位');
  s.focus();for(const key of ['Enter',' ']){closeSeatPop();s.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));await sleep(60);if(!vis(Q('#seat-pop')))f.push('按 '+(key===' '?'空格':key)+' 没有打开座位面板')}
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await sleep(40);if(vis(Q('#seat-pop')))f.push('Esc 没有关掉座位面板');
  return f})()`;
/* once the showdown animations are over, no chip (.bet / .fly-chip) sits on top of a card */
const CHIPS_FINAL=`(async()=>{${PG}
  S.cfg.showAll=true;S.toAct=2;act(S.players[2],'fold');clearTimeout(timer);
  if(isZ(S))zShowdown('');else{while(S.board.length<5)S.board.push(S.deck.pop());S.street='river';showdown()}
  clearTimeout(timer);await sleep(2500);
  const cards=[...document.querySelectorAll('#table .card')].filter(vis).map(c=>[c,R(c)]);
  if(cards.length<3)f.push('桌上没有牌');
  [...document.querySelectorAll('#table .bet,.fly-chip')].filter(vis).forEach(b=>{const r=R(b);cards.forEach(([c,cr])=>{if(hit(r,cr))f.push((b.className||'chip')+' 压住牌 '+(c.closest('.seat')?'座位 '+c.closest('.seat').dataset.pid:'公共牌'))})});
  return f})()`;
const PH4=[[393,873,true],[873,393,true],[412,915,true],[915,412,true]];
/* 红中麻将: a full hand fits one row, a claim offers its buttons and 过 answers it, my turn shows the clock and 出牌 */
const HZ_FULL=`(async()=>{${PG}
  const me=S.players[0],h=S.hz;clearTimeout(timer);hzClear();
  const row=()=>{const r=R(Q('#dd-hand .hz-row'));if(!r)return f.push('没有手牌行');if(r.x<-0.5||r.x+r.w>innerWidth+0.5)f.push('手牌超出屏幕 '+r.x.toFixed(0)+'..'+(r.x+r.w).toFixed(0));
    const ts=[...document.querySelectorAll('#dd-hand .hz-row > .mj')].map(R);for(let i=1;i<ts.length;i++)if(ts[i].x-ts[i-1].x<18){f.push('手牌第 '+i+' 张只露出 '+(ts[i].x-ts[i-1].x).toFixed(1)+'px');break}
    if(document.scrollingElement.scrollWidth>innerWidth+1)f.push('页面横向滚动')};
  me.cards=hzSort(hzDeck().filter(id=>id<108).slice(0,14));h.melds[0]=[];h.drawn=me.cards[13];S.toAct=0;h.stage='turn';sync();await sleep(80);row();
  me.cards=hzSort([0,4]);h.melds[0]=[{t:'peng',ids:[8,9,10]},{t:'peng',ids:[12,13,14]},{t:'chi',ids:[36,40,44]},{t:'agang',ids:[60,61,62,63]}];sync();await sleep(80);row();
  return f})()`;
const HZ_CLAIM=`(async()=>{${PG}
  const h=S.hz;clearTimeout(timer);hzClear();
  S.players[0].cards=hzSort([...S.players[0].cards.filter(id=>hzKind(id)!==4).slice(0,9),16,17,12,20]);
  const tile=18;h.discards[3].push(tile);h.stage='claim';h.claim={tile,from:3,opts:{0:['hu','peng','chi']},ans:{},qiang:null};S.toAct=-1;sync();await sleep(100);
  const bs=[...document.querySelectorAll('#actions button')].filter(vis);
  for(const t of ['过','碰','胡'])if(!bs.some(b=>b.textContent.trim().startsWith(t)))f.push('询问面板缺「'+t+'」');
  bs.forEach(b=>{const r=R(b);if(r.x<0||r.y<0||r.x+r.w>innerWidth+0.5||r.y+r.h>innerHeight+0.5)f.push('按钮超出屏幕 '+b.textContent.trim())});
  const pass=bs.find(b=>b.textContent.trim()==='过');if(pass)pass.click();await sleep(100);
  if(S.hz.claim&&S.hz.claim.ans[0]==null)f.push('点「过」没有生效');
  return f})()`;
const HZ_TURN=`(async()=>{${PG}
  const h=S.hz;clearTimeout(timer);hzClear();S.cfg.turnSec=15;h.stage='turn';h.claim=null;S.toAct=0;hzProceed();await sleep(150);clearTimeout(timer);
  if(!vis(Q('#table .seat.me .tring')))f.push('轮到我时没有倒计时');
  if(![...document.querySelectorAll('#actions button')].some(b=>vis(b)&&b.textContent.includes('出牌')))f.push('轮到我时没有「出牌」按钮');
  const t=[...document.querySelectorAll('#dd-hand .hz-row > .mj')].find(x=>hzKind(+x.dataset.hz)!==27);const n0=S.players[0].cards.length;if(t){const id=t.dataset.hz;t.click();await sleep(60);Q('#dd-hand [data-hz="'+id+'"]').click();await sleep(120);if(S.players[0].cards.length!==n0-1)f.push('点两次没有打出这张牌（之前 '+n0+' 张，之后 '+S.players[0].cards.length+' 张，牌河 '+S.hz.discards[0].length+'，副露 '+S.hz.melds[0].length+'）')}
  return f})()`;

SCEN.push(
  {name:'board-cards',game:'holdem',n:6,extra:BOARD_CARDS},
  {name:'board-cards-9',game:'holdem',n:9,extra:BOARD_CARDS},
  {name:'board-cards-zjh',game:'zjh',n:6,extra:BOARD_CARDS},
  {name:'showdown-all',game:'holdem',n:6,extra:SHOWDOWN(true),sizes:[...PH4,[1280,800,false]]},
  {name:'showdown-none',game:'holdem',n:6,extra:SHOWDOWN(false),sizes:PH4},
  {name:'showdown-9-all',game:'holdem',n:9,extra:SHOWDOWN(true),sizes:PH4},
  {name:'showdown-long',game:'holdem',n:6,extra:SHOWDOWN(true,true)},{name:'showdown-9-long',game:'holdem',n:9,extra:SHOWDOWN(true,true)},
  {name:'showdown-zjh-long',game:'zjh',n:6,extra:SHOWDOWN(true,true)},
  {name:'showdown-zjh-all',game:'zjh',n:6,extra:SHOWDOWN(true),sizes:[...PH4,[1280,800,false]]},
  {name:'showdown-zjh-none',game:'zjh',n:6,extra:SHOWDOWN(false),sizes:PH4},
  {name:'hm-seat-tap',game:'holdem',n:6,extra:HM_SEAT_TAP,sizes:PH},
  {name:'toast-top',game:'ddz',n:3,lord20:true,extra:TOAST_TOP,sizes:PH4},
  {name:'toast-top-hm',game:'holdem',n:6,extra:TOAST_TOP,sizes:PH4},
  {name:'hz-4',game:'hz',n:4},{name:'hz-hand-full',game:'hz',n:4,extra:HZ_FULL},{name:'hz-claim',game:'hz',n:4,extra:HZ_CLAIM},{name:'hz-turn',game:'hz',n:4,extra:HZ_TURN},
  {name:'turn-ring',game:'holdem',n:6,extra:TURN_RING},{name:'turn-ring-9',game:'holdem',n:9,extra:TURN_RING},
  {name:'turn-ring-zjh',game:'zjh',n:6,extra:TURN_RING},{name:'turn-ring-ddz',game:'ddz',n:3,lord20:true,extra:TURN_RING},
  {name:'align',game:'holdem',n:6,extra:ALIGN},{name:'align-9',game:'holdem',n:9,extra:ALIGN},{name:'align-zjh',game:'zjh',n:6,extra:ALIGN},{name:'align-ddz',game:'ddz',n:3,extra:ALIGN},
  {name:'zjh-pk',game:'zjh',n:6,extra:ZJH_PK,sizes:[...PH4,[1280,800,false]]},{name:'zjh-pk-9',game:'zjh',n:9,extra:ZJH_PK,sizes:PH4},
  {name:'zjh-seat-kbd',game:'zjh',n:6,extra:ZJH_SEAT_KBD},{name:'chips-final-9',game:'holdem',n:9,extra:CHIPS_FINAL,sizes:PH4},{name:'chips-final-6',game:'holdem',n:6,extra:CHIPS_FINAL,sizes:PH4},
  {name:'trust',game:'holdem',n:6,extra:TRUST},{name:'trust-zjh',game:'zjh',n:6,extra:TRUST},{name:'trust-ddz',game:'ddz',n:3,lord20:true,extra:TRUST}
);
/* LC_ONLY=holdem-6 runs one scenario while iterating */
if(process.env.LC_ONLY)SCEN=SCEN.filter(s=>s.name===process.env.LC_ONLY);
/* in the page: start a solo game, wait for my turn, freeze the bots, then stage the scenario */
const setup=sc=>`(async()=>{
  NET.role='solo';show('game');
  startGame({game:'${sc.game}',players:${sc.n},stack:2000,sb:10,bb:20,ante:20,base:20,aiFill:true,rebuy:true,speed:'fast',ff:false,coach:true},[{name:'我',kind:'local',gender:'m'}]);
  /* a hand can end before my turn comes (everyone folds to my blind): deal the next one and keep waiting */
  for(let i=0;i<300&&!myTurn();i++){if(S.phase==='handover')startHand();await new Promise(r=>setTimeout(r,50))}
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
  const hand=[...document.querySelectorAll('#dd-hand .card,#dd-hand .hz-row > .mj')].map(R);
  return {sh:se.scrollHeight,sw:se.scrollWidth,ih:innerHeight,iw:innerWidth,
    header:vis(document.querySelector('header.top')),footer:vis(document.querySelector('footer.foot')),
    seats:all('#table .seat'),others:{board:all('#table .board'),'dd-bottom':all('#table .dd-bottom'),'dd-center':all('#table .dd-center'),'dd-play':all('#table .dd-play'),'hz-river':all('#table .hz-river'),'hz-center':all('#table .hz-center'),actions:all('#actions'),'act-hint':all('#actions .act-hint'),'act-pop':all('#actions .act-pop')},
    bets:all('#table .bet'),actions:all('#actions'),btns:[...document.querySelectorAll('#actions button')].filter(vis).map(b=>({t:b.textContent.trim().slice(0,12),h:b.getBoundingClientRect().height})),
    hand,ddStage:document.querySelector('#table .dd-center')?vis(document.querySelector('#table .dd-center .street')):null,
    /* 斗地主 is counter-clockwise: the player after me sits on my right */
    ddNext:V&&isD(V)?(()=>{const n=V.players.length,s=document.querySelector('#table .seat[data-pid="'+((V.me+1)%n)+'"]');if(!s)return null;const r=s.getBoundingClientRect();return r.left+r.width/2>innerWidth/2})():null,
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
  if(m.ddNext===false)f.push('斗地主是逆时针：下家应该坐在右边');
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
  /* progress on stderr, one line per scenario × size: [12/348] holdem-6 412x915 ✅ (stdout keeps the JSON) */
  const jobs=SCEN.flatMap(sc=>(sc.sizes||SIZES).map(sz=>[sc,sz])),t0=Date.now();let k=0,bad=0;
  for(const [sc,sz] of jobs){
    const r=await run(sc,sz),f=r.flatMap(x=>x.fails);k++;if(f.length)bad++;
    const left=Math.round((Date.now()-t0)/k*(jobs.length-k)/1000);
    process.stderr.write(`[${k}/${jobs.length}] ${sc.name} ${sz[0]}x${sz[1]} ${f.length?'❌ '+f[0].slice(0,60):'✅'}  （已失败 ${bad}，预计还剩 ${Math.floor(left/60)} 分 ${left%60} 秒）\n`);
    out.results.push(...r);
  }
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
