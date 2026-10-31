/* 赌神智慧树 · what this device shows: client state, table, actions, coach, chat, lobby, settlement, setup form and events */
'use strict';

/* ---------- table effects ---------- */
const isNarrow=()=>window.matchMedia('(max-width:760px) and (orientation:portrait)').matches;
/* bet chips sit between the seat and the middle; 炸金花 has no board, so on phones they move further in to clear the 3-card hands */
const isLandPhone=()=>window.matchMedia('(orientation:landscape) and (max-height:500px) and (pointer:coarse)').matches;
/* the old oval table's bet ring; kept for callers outside this file, the table itself now uses js/table-layout.js */
const betRadius=narrow=>isZ(V)&&narrow?[19,22]:narrow?[22,28]:isLandPhone()?[27,22]:[30,28];
/* a seat, its bet chips or the middle of the table, in px inside .table-wrap (where #fx draws) */
/* where a player sits, counted from me: 德州/炸金花 go clockwise, 斗地主 counter-clockwise (the next player sits on my right) */
const slotOf=(pid,v=V)=>{const n=v.players.length;return isD(v)||isM(v)?(v.me-pid+n)%n:(pid-v.me+n)%n};
function seatPoint(pid,kind){
  const tbl=$('#table'),wrap=$('.table-wrap');if(!tbl||!wrap||!V)return null;
  const n=V.players.length,slot=slotOf(pid),o=tableOrient();
  const p=kind==='center'?centerXY(o):kind==='bet'?BETPT[pid]||betXY(slot,n,o):seatXY(slot,n,o);
  const tr=tbl.getBoundingClientRect(),wr=wrap.getBoundingClientRect();
  return {x:tr.left-wr.left+tbl.clientLeft+tbl.clientWidth*p.x/100,y:tr.top-wr.top+tbl.clientTop+tbl.clientHeight*p.y/100};
}
function flyChips(a,b,n=3,wait=0,seat=0){
  const fx=$('#fx');if(!a||!b||!fx)return;
  for(let i=0;i<n;i++){
    const c=document.createElement('i');c.className='fly-chip';c.style.backgroundImage=`url('${chipURL(seat)}')`;
    c.style.left=(a.x+Math.random()*10-5)+'px';c.style.top=(a.y+Math.random()*10-5)+'px';fx.appendChild(c);
    setTimeout(()=>{c.style.left=(b.x+Math.random()*8-4)+'px';c.style.top=(b.y+Math.random()*8-4)+'px'},30+wait+i*50);
    setTimeout(()=>c.remove(),wait+i*50+560);
  }
}
const BUB={};
function showBubble(pid,text,voice,dur){
  const pt=seatPoint(pid,'seat'),fx=$('#fx');if(!pt||!fx)return;
  if(BUB[pid])BUB[pid].remove();
  const el=document.createElement('div');el.className='bubble'+(voice?' voice':'');
  if(voice)el.innerHTML=`<button type="button" class="vbub" data-vplay="${esc(voice)}" data-dur="${dur}">▶ ${dur}″</button>`;else el.textContent=text;
  /* anchored on the seat's centre; margin lifts the bubble clear of the seat. One that would leave the top of the
     screen hangs below the seat instead, and one near a side slides in, its tail still pointing at the seat */
  el.style.left=pt.x+'px';el.style.top=pt.y+'px';let mt=-(pid===V.me?66:54);
  fx.appendChild(el);BUB[pid]=el;
  const fr=fx.getBoundingClientRect(),w=el.offsetWidth,h=el.offsetHeight,st=document.querySelector(`#table .seat[data-pid="${pid}"]`);
  if(fr.top+pt.y+mt-h<4&&st){el.classList.add('dn');mt=st.getBoundingClientRect().bottom-fr.top-pt.y+8}
  el.style.marginTop=mt+'px';
  const x0=fr.left+pt.x-w/2,dx=Math.max(4-x0,Math.min(0,innerWidth-4-(x0+w)));
  if(dx){el.style.marginLeft=dx+'px';el.style.setProperty('--ax',`calc(50% - ${dx}px)`)}
  setTimeout(()=>{if(BUB[pid]===el){el.remove();delete BUB[pid]}},3900);
}
function allInFx(pid){
  const p=V.players[pid],fx=$('#fx'),pt=seatPoint(pid,'seat');if(!p||!fx)return;
  if(pt){const r=document.createElement('i');r.className='allin-ring';r.style.left=pt.x+'px';r.style.top=pt.y+'px';fx.appendChild(r);setTimeout(()=>r.remove(),1000)}
  const b=document.createElement('div');b.className='allin-banner';b.innerHTML=`<b>ALL IN</b><span>${esc(p.name)} 全下</span>`;fx.appendChild(b);setTimeout(()=>b.remove(),1700);
  const t=$('#table');t.classList.remove('shake');void t.offsetWidth;t.classList.add('shake');
  SFX.allin();
}
/* 炸金花 比牌: both avatars fly from their seats to face each other mid-table, 「PK」 clashes between them, after about 1.5 s
   the loser dims and both fly home, then a short line says who is out. Reduced motion: only the line. Driven by V.ev, so
   guests see the same. */
function compareFx(ev){
  const fx=$('#fx'),a=V.players[ev.pid],b=V.players[ev.target],l=V.players[ev.loser];if(!fx||!a||!b||!l)return;
  fx.querySelectorAll('.pk-ava,.pk-mark,.pk-line').forEach(e=>e.remove());
  const line=()=>{const t=document.createElement('div');t.className='pk-line';const m=seatPoint(a.id,'center');if(m)t.style.top=m.y+'px';t.innerHTML=`${esc(a.name)} 和 ${esc(b.name)} 比牌 · <b>${esc(l.name)} 出局</b>`;fx.appendChild(t);setTimeout(()=>t.remove(),1800)};
  const pa=seatPoint(a.id,'seat'),pb=seatPoint(b.id,'seat'),c=seatPoint(a.id,'center');
  if(stillMQ.matches||!pa||!pb||!c){SFX.clash();return line()}
  /* the avatars meet a little above the middle (the pot), facing each other across the 「PK」 */
  const av=document.querySelector(`#table .seat[data-pid="${a.id}"] .ava`),sz=Math.max(46,Math.min(72,(av?av.getBoundingClientRect().width:40)*1.5));
  const y=c.y-sz*0.2,dx=sz*0.95,left=pa.x<=pb.x?a:b;
  const fly=(p,from)=>{const e=document.createElement('div');e.className='pk-ava';e.textContent=avatarChar(p.name);
    Object.assign(e.style,{left:from.x+'px',top:from.y+'px',width:sz+'px',height:sz+'px',fontSize:sz*0.42+'px'});fx.appendChild(e);
    const to={x:c.x+(p===left?-dx:dx),y};
    setTimeout(()=>{e.classList.add('go');e.style.left=to.x+'px';e.style.top=to.y+'px'},30);
    setTimeout(()=>{if(p===l)e.classList.add('lose')},1500);
    setTimeout(()=>{e.classList.remove('go');e.classList.add('back');e.style.left=from.x+'px';e.style.top=from.y+'px'},1900);
    setTimeout(()=>e.remove(),2450);return e};
  fly(a,pa);fly(b,pb);
  const m=document.createElement('div');m.className='pk-mark';m.innerHTML='<i></i><b>PK</b>';
  Object.assign(m.style,{left:c.x+'px',top:y+'px',fontSize:sz*0.62+'px'});
  setTimeout(()=>{fx.appendChild(m);SFX.clash()},430);setTimeout(()=>m.remove(),1900);
  setTimeout(line,2000);
}
/* compare the previous view with the new one and play what happened in between */
function fxDiff(prev,v){
  if($('#game-view').hidden)return;
  const same=prev&&prev.handNo===v.handNo;
  if(v.phase==='playing'&&!same)SFX.deal(4);
  if(same&&v.board.length>prev.board.length)setTimeout(()=>SFX.flip(),120);
  const ev=v.ev;
  if(ev&&(!prev||!prev.ev||prev.ev.seq!==ev.seq)){
    const p=v.players[ev.pid],g=p?p.gender:'m',from=seatPoint(ev.pid,'seat'),to=seatPoint(ev.pid,'bet');
    if(isM(v))hzFx(v,ev);
    else if(isD(v))ddFx(v,ev);
    else if(ev.type==='look'){SFX.flip();say('看牌',g)}
    else if(ev.type==='compare'){say('比牌',g);flyChips(from,to,3,0,ev.pid);compareFx(ev)}
    else if(ev.allIn){allInFx(ev.pid);say('全下！',g);flyChips(from,to,6,0,ev.pid)}
    else if(ev.type==='raise'){SFX.chips(4);say(ev.open?'下注':'加注',g);flyChips(from,to,4,0,ev.pid)}
    else if(ev.type==='call'){SFX.chips(3);say('跟注',g);flyChips(from,to,3,0,ev.pid)}
    else if(ev.type==='check'){SFX.check();say('过牌',g)}
    else if(ev.type==='fold'){SFX.fold();say('弃牌',g)}
  }
  if(same&&v.phase==='handover'&&prev.phase!=='handover'){
    const ws=v.players.filter(p=>p.won>0);
    ws.forEach((w,i)=>flyChips(seatPoint(w.id,'center'),seatPoint(w.id,'seat'),6,250+i*120,w.id));
    setTimeout(()=>ws.some(w=>w.id===v.me)?SFX.win():SFX.pot(),300);
  }
  if(v.phase==='playing'&&v.toAct===v.me&&!(same&&prev.phase==='playing'&&prev.toAct===v.me))setTimeout(()=>SFX.ding(),ev&&ev.allIn?950:300);
}
function applyView(v){const prev=V;V=v;TURN={at:Date.now(),left:v.turnLeft||0,total:v.turnMs||0};onView(V);render();try{fxDiff(prev,V)}catch(e){}
  /* the bubble's default spot depends on the game's table, known once the first view arrives */
  if(!prev||prev.cfg.game!==v.cfg.game)placeBubble()}

/* ---------- chat ---------- */
const QUICK=['大家好，好运！','快点吧，等得花都谢了','好牌！','运气不错','这把我不玩了','我全下了，你敢跟吗','你是不是在诈唬？','别走，决战到天亮','我就看看不说话','再来一局'];
/* waiting-room messages carry no seat, so my own echo is recognised by its text (it must not count as unread) */
let LAST_SENT={text:'',at:0};
function sendChat(text){
  LAST_SENT={text:String(text||'').trim().slice(0,40),at:Date.now()};
  text=String(text||'').trim().slice(0,40);if(!text)return;
  if(NET.role==='guest')NET.host&&NET.host.send({t:'chat',text});
  else if(S)hostChat(0,text);
  else if(LOBBY)lobbyChat(null,text);
}
let UNREAD=0;
const chatPopOpen=()=>!$('#chat-slot').hidden;
function setChatPop(open){
  const pop=$('#chat-slot'),fab=$('#chat-bubble');
  pop.hidden=!open;fab.setAttribute('aria-expanded',String(open));
  /* on phones the chat opens as a sheet, so it shares the sheet's backdrop */
  if(sheetMQ.matches)$('#sheet-bg').hidden=!(open||sheetOpen());
  if(open){UNREAD=0;renderUnread();renderChat();const cl=$('#chat-list');if(cl)cl.scrollTop=cl.scrollHeight;const t=$('#chat-text');if(t&&window.matchMedia('(pointer:fine)').matches)t.focus();positionChatPop()}
}
function renderUnread(){const b=$('#chat-unread');b.hidden=!UNREAD;b.textContent=UNREAD>9?'9+':String(UNREAD)}
function onChat(m){
  CHAT.push(m);if(CHAT.length>60)CHAT.shift();
  if(!$('#chat-bubble').hidden&&!chatPopOpen()&&!(V&&m.pid===V.me)&&!(!V&&LAST_SENT.text===m.text&&Date.now()-LAST_SENT.at<5000)){UNREAD++;renderUnread()}
  if(m.pid>=0&&V&&!$('#game-view').hidden)showBubble(m.pid,m.text,m.voice,m.dur);
  renderChat();
  if(!m.voice&&m.text.length<=24)say(m.text,m.gender);
}
function renderChat(){
  const el=$('#chat');if(!el)return;
  if(!el.dataset.ready){
    el.innerHTML=`<div class="chat-head"><h2>聊天</h2><button type="button" class="btn sm chat-close" data-act="chat-toggle">关闭</button></div><div class="chat-list" id="chat-list"></div>
      <div class="quick">${QUICK.map((q,i)=>`<button type="button" data-quick="${i}">${q}</button>`).join('')}</div>
      <form class="chat-input" id="chat-form"><input type="text" id="chat-text" maxlength="40" placeholder="说点什么…（最多 40 字）" autocomplete="off"><button class="btn sm primary" type="submit">发送</button><button type="button" class="btn sm ptt" id="ptt" title="${pttFine()?'点击开始说话，再点发送；点上方「取消」不发送':'按住说话，松开发送；移出按钮再松开可取消'}；最长 ${VMAX_SEC} 秒，超时自动取消">${pttIdle()}</button></form>${micSupport().ok?'':`<p class="note ptt-hint">语音消息不可用：${micSupport().reason}</p>`}`;
    el.dataset.ready='1';
  }
  el.dataset.n=String(CHAT.length);
  const l=$('#chat-list');
  /* follow new messages only when the reader is already at the bottom, or the newest message is mine */
  const last=CHAT[CHAT.length-1],mine=last&&V&&last.pid===V.me;
  const atBottom=l.scrollHeight-l.scrollTop-l.clientHeight<24;
  l.innerHTML=CHAT.slice(-30).map(c=>`<div><span class="n">${esc(c.name)}</span>：${c.voice?(VMSG.store.has(c.voice)?`<button type="button" class="vmsg" data-vplay="${esc(c.voice)}" data-dur="${c.dur}">▶ ${c.dur}″</button>`:'<span class="muted">[语音已清理]</span>'):esc(c.text)}</div>`).join('')||'<div class="muted">还没有人说话。点下面的快捷语直接发送，气泡会从你的座位上弹出。</div>';
  if(atBottom||mine||!l.dataset.seen){l.scrollTop=l.scrollHeight;l.dataset.seen='1'}
  markPlaying();
}
resetT();
const me=()=>V.players[V.me];
const myProfit=v=>{const m=v.players[v.me];return m.stack-v.cfg.stack*(1+m.rebuys)};
function onView(v){
  const m=v.players[v.me];if(!m)return;
  if(m.inHand&&v.handNo!==T.cur){T.cur=v.handNo;T.start=m.stack+m.total;T.flags={vpip:false,pfr:false};T.hands++}
  if(v.phase==='handover'&&T.cur===v.handNo&&T.rec!==v.handNo){
    T.rec=v.handNo;const d=m.stack-T.start;
    T.hist.push({hand:v.handNo,delta:d,cum:myProfit(v)});
    if(d>0)T.won++;if(T.flags.vpip)T.vpip++;if(T.flags.pfr)T.pfr++;
  }
}
const myTurn=()=>V&&V.phase==='playing'&&V.toAct===V.me;
function getAdvice(){
  const key=[V.handNo,V.street,V.currentBet,V.raises,V.board.length,V.toAct,V.stake,V.round,me().seen].join('|');
  if(ADV&&ADV.key===key)return ADV.a;
  if(isZ(V)){const a=zAdvise(V,me());a.ex=null;ADV={key,a};return a}
  const a=advise(V,me());a.ex=exploitAdvice(V,me(),a);ADV={key,a};return a;
}
function exploitHTML(a){
  const ex=a.ex;if(!ex)return '';
  const differs=ex.rec&&ex.rec.type!==a.rec.type||(ex.rec&&ex.rec.type==='raise'&&a.rec.type==='raise'&&ex.rec.to!==a.rec.to);
  return `<div class="exploit"><div class="t">剥削建议${ex.target?' · 针对 '+esc(ex.target):''}</div>
    ${ex.rec&&differs?`<div class="verdict" style="margin:4px 0"><span class="pill brass">改为</span><span class="rec-big" style="font-size:20px">${recLabel(ex.rec,a.toCall,a.cb)}</span></div>`:''}
    <p class="why">${ex.text}${ex.rec&&!differs?' 和上面的建议一致。':''}</p></div>`;
}
function humanAct(type,to){
  /* 红中麻将: a discard on my turn, or an answer to a claim on someone else's */
  if(isM(V)){if(NET.role==='guest'){NET.host.send({t:'act',type,to,hand:V.handNo});render()}else act(P()[0],type,to);return}
  if(!myTurn())return;
  if(isD(V)){ddRecord(type,to);
    /* a play goes out as {cards, as}: the cards, and which 赖子 reading was picked */
    const play=type==='play'&&to&&!Array.isArray(to);
    if(NET.role==='guest'){NET.host.send({t:'act',type,to:play?to.cards:to,as:play?to.as:undefined,hand:V.handNo});V.toAct=-1;render()}else act(P()[0],type,to);return}
  if(isZ(V)){
    if(type==='look'){if(NET.role==='guest')NET.host.send({t:'act',type:'look',hand:V.handNo});else act(P()[0],'look');return}
    const a=getAdvice(),r=zGrade(a,type),tname=type==='compare'?(V.players[to]||{}).name||'':'';
    const label=type==='fold'?'弃牌':type==='call'?`${a.seen?'跟注':'闷跟'} ${fmt(a.toCall)}`:type==='raise'?`加到单注 ${fmt(to)}`:type==='compare'?`和 ${esc(tname)} 比牌`:'全下';
    const d={...a,ex:null,action:label,type,grade:r.g,note:r.note,lossBB:r.loss/a.bb,recText:zRecLabel(a.rec,a)};
    T.decisions.push(d);T.last=d;
    if(NET.role==='guest'){NET.host.send({t:'act',type,to,hand:V.handNo});V.toAct=-1;render()}
    else act(P()[0],type,to);
    return;
  }
  const a=getAdvice(),m=me();
  let r=grade(a,type);
  const ex=exploitAdvice(V,m,a);
  if(ex&&ex.rec&&ex.rec.type===type&&r.g!=='good')r={g:'good',note:'符合剥削建议：'+ex.text,loss:0};
  const label=type==='fold'?'弃牌':type==='check'?'过牌':type==='call'?`跟注 ${fmt(a.toCall)}`:((V.currentBet===0?'下注 ':'加注到 ')+fmt(Math.min(to,m.bet+m.stack)));
  const d={...a,ex,action:label,type,grade:r.g,note:r.note,lossBB:r.loss/a.bb,recText:recLabel(a.rec,a.toCall,a.cb)};
  T.decisions.push(d);T.last=d;
  if(V.street==='preflop'){if(type==='call'||type==='raise')T.flags.vpip=true;if(type==='raise')T.flags.pfr=true}
  if(NET.role==='guest'){NET.host.send({t:'act',type,to,hand:V.handNo});V.toAct=-1;render()}
  else act(P()[0],type,to);
}

/* ---------- menu / coach / stats / rules sheet ----------
   The panels keep their ids and keep rendering as usual; at the table (and on touch screens) they are moved into the sheet's panes,
   and moved back to their data-home spots in the side rail otherwise. The menu panel always lives in its pane. */
const SHEETS={
  menu:{title:'菜单',tabs:[['menu','菜单']]},
  coach:{title:'教练',tabs:[['coach-main','建议'],['coach-opp','对手画像'],['coach-room','房间',()=>NET.role!=='solo']]},
  stats:{title:'统计',tabs:[['stats-me','我的统计'],['stats-log','行动记录']]},
  rules:{title:'规则',tabs:[['rules','规则']]}
};
const PANE_SRC={'coach-main':'#coach','coach-opp':'#profiles','coach-room':'#room','stats-me':'#session','stats-log':'#log-panel','rules':'#rules-2'};
const sheetMQ=window.matchMedia('(pointer:coarse)');
let SHEET=null;
function placePanels(){
  const m=sheetMQ.matches||document.body.classList.contains('in-game');
  for(const [pane,sel] of Object.entries(PANE_SRC)){
    const el=$(sel),dest=m?$(`[data-pane="${pane}"]`):$(`[data-home="${pane}"]`);
    if(el&&dest&&el.parentElement!==dest)dest.appendChild(el);
  }
  document.body.classList.toggle('m-sheets',m);
  if(!m)closeSheet();
}
function openSheet(name,tab){
  const def=SHEETS[name];if(!def)return;
  const tabs=def.tabs.filter(t=>!t[2]||t[2]());
  if(!tabs.some(t=>t[0]===tab))tab=(SHEET&&SHEET.name===name&&tabs.some(t=>t[0]===SHEET.tab))?SHEET.tab:tabs[0][0];
  SHEET={name,tab};
  setChatPop(false);
  $('#sheet-title').textContent=def.title;
  $('#sheet-tabs').innerHTML=tabs.length>1?tabs.map(([id,label])=>`<button type="button" role="tab" data-sheet-tab="${id}" aria-selected="${id===tab}">${label}</button>`).join(''):'';
  document.querySelectorAll('[data-pane]').forEach(p=>{p.hidden=p.dataset.pane!==tab});
  document.querySelectorAll('[data-sheet]').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.sheet===name)));
  $('#sheet').hidden=false;$('#sheet-bg').hidden=false;
  if(tab==='stats-log'){const l=$('#log');if(l)l.scrollTop=0}
}
function closeSheet(){
  SHEET=null;$('#sheet').hidden=true;$('#sheet-bg').hidden=true;
  document.querySelectorAll('[data-sheet]').forEach(b=>b.setAttribute('aria-expanded','false'));
}
const sheetOpen=()=>!$('#sheet').hidden;

/* ---------- floating chat bubble ----------
   Drag it anywhere; let go and it sticks to the nearer side edge. The spot is kept apart for upright and sideways.
   Phones open the chat as a sheet (CSS); desktop opens a panel beside the bubble. */
const CHB={drag:null,moved:false};
const bubKey=()=>'dushen-bubble-'+(innerWidth>innerHeight?'land':'port');
function bubDefault(){
  /* at the table: upright, the left edge between the lowest side seat and mine; sideways, the bottom-right corner beside the hand.
     Elsewhere the bottom-right corner. */
  if(!$('#game-view').hidden&&tableOrient()==='port')return {side:'l',y:innerHeight*0.6};
  return {side:'r',y:innerHeight-(!$('#game-view').hidden?110:80)};
}
function setBubble(side,y){
  const b=$('#chat-bubble'),h=b.offsetHeight||48;
  b.classList.toggle('left',side==='l');b.style.left='';b.style.right='';
  b.style.top=Math.round(Math.max(8,Math.min(y,innerHeight-h-8)))+'px';
}
function placeBubble(){
  const b=$('#chat-bubble');if(!b||b.hidden)return;
  let p=null;try{p=JSON.parse(localStorage.getItem(bubKey())||'null')}catch(e){}
  if(p&&(p.side==='l'||p.side==='r')&&typeof p.y==='number')setBubble(p.side,p.y*innerHeight);
  else{const d=bubDefault();setBubble(d.side,d.y)}
  positionChatPop();
}
function positionChatPop(){
  const pop=$('#chat-slot');if(!pop||pop.hidden)return;
  if(isTouch()){pop.style.left=pop.style.right=pop.style.top='';return}
  const r=$('#chat-bubble').getBoundingClientRect(),h=pop.offsetHeight,onLeft=r.left+r.width/2<innerWidth/2;
  pop.style.left=onLeft?(r.right+10)+'px':'auto';
  pop.style.right=onLeft?'auto':(innerWidth-r.left+10)+'px';
  pop.style.top=Math.max(8,Math.min(r.bottom-h,innerHeight-h-8))+'px';
}
(function(){
  const b=$('#chat-bubble');
  b.addEventListener('pointerdown',e=>{if(e.button)return;const r=b.getBoundingClientRect();CHB.drag={x:e.clientX,y:e.clientY,dx:e.clientX-r.left,dy:e.clientY-r.top,id:e.pointerId,on:false};CHB.moved=false});
  window.addEventListener('pointermove',e=>{
    const d=CHB.drag;if(!d||e.pointerId!==d.id)return;
    if(!d.on){if(Math.hypot(e.clientX-d.x,e.clientY-d.y)<6)return;d.on=true;try{b.setPointerCapture(d.id)}catch(x){}b.classList.add('dragging')}
    b.style.right='auto';b.style.left=(e.clientX-d.dx)+'px';b.style.top=(e.clientY-d.dy)+'px';e.preventDefault();
  },{passive:false});
  const end=e=>{
    const d=CHB.drag;if(!d||e.pointerId!==d.id)return;CHB.drag=null;if(!d.on)return;
    CHB.moved=true;b.classList.remove('dragging');
    const r=b.getBoundingClientRect(),side=r.left+r.width/2<innerWidth/2?'l':'r';
    setBubble(side,r.top);
    try{localStorage.setItem(bubKey(),JSON.stringify({side,y:parseFloat(b.style.top)/innerHeight}))}catch(x){}
    positionChatPop();
  };
  window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);
  /* a drag is not a tap: swallow the click that follows it */
  b.addEventListener('click',e=>{if(CHB.moved){CHB.moved=false;e.stopPropagation();e.preventDefault()}});
  window.addEventListener('resize',()=>placeBubble());
})();
(sheetMQ.addEventListener?sheetMQ.addEventListener('change',placePanels):sheetMQ.addListener(placePanels));

/* ---------- rendering ---------- */
function cardTxt(c){return RL[c>>2]+SU[c&3]}
function cardHTML(c){if(c==null)return `<div class="card back" ${faceStyle(BACK_FILE)}></div>`;const red=(c&3)===1||(c&3)===2;return `<div class="card${red?' red':''}" ${faceStyle(cardImgFor(c))} aria-label="${SUIT_NAME[c&3]}${RL[c>>2]}"><span class="vh">${cardTxt(c)}</span><i class="ci" aria-hidden="true">${RL[c>>2]}<b>${SU[c&3]}</b></i></div>`}
function show(v){
  ['setup','lobby','game','settle'].forEach(x=>{$('#'+x+'-view').hidden=x!==v});window.scrollTo(0,0);
  /* the table fills the window: no page header, banner, footer or side rail; panels open in the sheet */
  document.body.classList.toggle('in-game',v==='game');placePanels();
  /* one floating chat for the waiting room and the table */
  const chatHere=v==='lobby'||v==='game';
  $('#chat-bubble').hidden=!chatHere;
  if(chatHere){renderChat();placeBubble()}else setChatPop(false);
  if(v==='game'){UNREAD=0;renderUnread()}
  if(v!=='game'&&$('#sheet'))closeSheet();
  if(v!=='game'){renderMeta();fsTipOff();FS_TIP.shown=false}
}
function showBanner(text,extra){$('#banner').innerHTML=text?`<span>${text}</span>${extra||''}`:''}
/* a short-lived notice that never wipes a newer one */
function flashBanner(text,ms){showBanner(text);const el=$('#banner'),mark=el.innerHTML;setTimeout(()=>{if(el.innerHTML===mark)showBanner('')},ms)}
const coachOn=()=>V&&V.cfg.coach!==false;
/* 斗地主 and 红中's tile counter: its own option, apart from the coach */
const counterOn=()=>!!V&&(isD(V)||isM(V))&&V.cfg.counter!==false;
function render(){
  if(!V)return;
  renderMeta();
  if(V.phase==='settled')return;
  renderTable();tickRing();renderActions();renderCoach();renderProfiles();renderRoom();renderSession();renderLog();
  if($('#chat').dataset.n!==String(CHAT.length))renderChat();
  const g=V.cfg.game||'holdem';if($('#rules-2').dataset.game!==g){$('#rules-2').innerHTML=rulesHTML(g);$('#rules-2').dataset.game=g}
}
function profileRows(list,vsOf){
  return list.map(p=>{const pr=profile(p),v=vsOf(p);return `<tr><td>${esc(p.name)}</td><td class="r num">${pr.h}</td><td class="r num">${pr.h?pct0(pr.vpip):'—'}</td><td class="r num">${pr.h?pct0(pr.pfr):'—'}</td><td class="r num">${pr.acts?pr.af.toFixed(1):'—'}</td><td class="r num">${pr.fvb!=null?pct0(pr.fvb):'—'}</td><td><span class="pill ${PROFILE_PILL[pr.key]}">${pr.type}</span></td><td class="r num ${v>0?'pos':v<0?'neg':''}">${sgn(v)}</td></tr>`}).join('');
}
const PROFILE_HEAD='<thead><tr><th>玩家</th><th class="r">手</th><th class="r">入池</th><th class="r">加注</th><th class="r">激进</th><th class="r">弃牌</th><th>类型</th><th class="r">对你</th></tr></thead>';
function renderProfiles(){
  const others=V.players.filter(p=>p.id!==V.me);
  if(isM(V)){$('#profiles').innerHTML=`<h2>对手画像</h2><div class="tbl-wrap" style="margin-top:8px"><table class="ptbl"><thead><tr><th>玩家</th><th class="r">局</th><th class="r">胡牌</th><th class="r">点炮</th></tr></thead><tbody>${others.map(p=>`<tr><td>${esc(p.name)}</td>${hzProfileRow(p)}</tr>`).join('')}</tbody></table></div>`;return}
  if(isD(V)){
    $('#profiles').innerHTML=`<h2>对手画像</h2><div class="tbl-wrap" style="margin-top:8px"><table class="ptbl"><thead><tr><th>玩家</th><th class="r">局</th><th class="r">当地主</th><th class="r">赢</th><th class="r">对你</th></tr></thead><tbody>${others.map(p=>{const s=p.st||{},v=p.vs||0;return `<tr><td>${esc(p.name)}</td><td class="r num">${s.dd||0}</td><td class="r num">${s.ddL||0}</td><td class="r num">${s.ddW||0}</td><td class="r num ${v>0?'pos':v<0?'neg':''}">${sgn(v)}</td></tr>`}).join('')}</tbody></table></div>
     <p class="note">对你 = 你在他身上赢或输的筹码。更详细的斗地主画像会和教练一起在下一版加入。</p>`;
    return;
  }
  if(isZ(V)){
    $('#profiles').innerHTML=`<h2>对手画像</h2><div class="tbl-wrap" style="margin-top:8px"><table class="ptbl"><thead><tr><th>玩家</th>${Z_PROFILE_HEAD}<th class="r">对你</th></tr></thead><tbody>${others.map(p=>{const v=p.vs||0;return `<tr><td>${esc(p.name)}</td>${zProfileRow(p)}<td class="r num ${v>0?'pos':v<0?'neg':''}">${sgn(v)}</td></tr>`}).join('')}</tbody></table></div>
     <p class="note">闷牌 = 没看牌时行动的比例；加注 = 行动中加注的比例；弃牌 = 弃牌的手数比例；对你 = 你在他身上赢或输的筹码。观察满 10 手后判断类型。${(()=>{const t=others.map(p=>({p,z:zProfile(p)})).filter(x=>x.z.key!=='unknown');return t.length?'<br>'+t.map(x=>`<b>${esc(x.p.name)}</b>：${ZTIP[x.z.key]}`).join('<br>'):''})()}</p>`;
    return;
  }
  $('#profiles').innerHTML=`<h2>对手画像</h2>
   <div class="tbl-wrap" style="margin-top:8px"><table class="ptbl">${PROFILE_HEAD}<tbody>${profileRows(others,p=>p.vs||0)}</tbody></table></div>
   <p class="note">入池 = 主动投钱入池的手数比例；加注 = 翻前加注率；激进 = 翻后（下注+加注）÷ 跟注；弃牌 = 翻后面对下注的弃牌率；对你 = 你在他身上赢或输的筹码。观察满 ${MIN_H} 手后才判断类型。</p>`;
}
function renderMeta(){
  const el=$('#meta');
  /* the home page also offers the 今天吃什么 wheel (js/wheel.js) */
  if(!V||$('#game-view').hidden){el.innerHTML=(!$('#setup-view').hidden?'<button class="btn" data-act="wheel">今天吃什么</button>':'')+fsButton()+(NET.role!=='solo'&&!$('#lobby-view').hidden?`<button class="btn" data-act="leave">${NET.role==='host'?'解散房间':'离开房间'}</button>`:'');return}
  /* at the table the page header is hidden: the game's own corners and the menu sheet carry what it showed */
  el.innerHTML='';renderCorners();
}
/* 斗地主 card counter: a strip under the top corners, shown unless turned off with 🃏 (a per-device choice) */
let DCOUNT=true;try{DCOUNT=localStorage.getItem('dushen-counter')!=='0'}catch(e){}
function renderCorners(){
  const pr=myProfit(V);
  const tag=NET.role==='solo'?'单机':NET.net==='lan'?'局域网联机':`联机 · 邀请码 ${NET.code||''}`;
  $('#corner-fs').innerHTML=fsCorner();fsTip();
  /* 红中麻将's wall count: sideways in the corner, upright a row under the tile counter (the corner has room for 底分 only, like 斗地主) */
  const port=tableOrient()==='port',wall=isM(V)&&V.hz&&V.phase==='playing'?`剩 ${V.hz.wallLeft} 张`:'';
  const info=isM(V)?(port?`底分 ${fmt(V.cfg.base)}`:`红中麻将 · 底分 ${fmt(V.cfg.base)}${wall?` · ${wall}`:''}`):isD(V)?`底分 ${fmt(V.cfg.base)}${V.dd?` · ×${V.dd.mult}`:''}`:isZ(V)?`底注 ${fmt(V.cfg.ante)}`:`盲注 ${fmt(V.cfg.sb)}/${fmt(V.cfg.bb)}`;
  /* 红中麻将: the strip only upright (sideways the far seat sits where it would go; 🃏 opens the coach panel's counter) */
  const hzc=isM(V)&&counterOn()&&!!V.hz,cnt=isD(V)&&counterOn()&&!!V.dd||hzc&&port;
  $('#corner-r').innerHTML=`<span class="cinfo">${info}</span>${cnt||hzc?`<button type="button" class="cbtn" data-act="ddcounter" aria-label="记牌器" aria-pressed="${DCOUNT}"><span class="ic" aria-hidden="true">🃏</span><span class="lb">记牌器</span></button>`:''}`;
  /* data-cnt moves the table down below the strip (CSS) */
  const st=$('#dd-strip'),on=cnt&&DCOUNT,wrow=wall&&port?`<div class="hz-wall">${wall}</div>`:'';st.hidden=!on&&!wrow;
  st.innerHTML=(on?(isM(V)?hzCounterStripHTML(V):ddCounterStripHTML(V)):'')+wrow;
  if(on||wrow)$('#game-view').dataset.cnt=on?'1':'w';else delete $('#game-view').dataset.cnt;
  $('#menu').innerHTML=`<h2>菜单</h2>
   <div class="menu-kv">
    <div class="kv"><span class="k">模式</span><span class="v">${esc(tag)}</span></div>
    <div class="kv"><span class="k">${isD(V)||isM(V)?'局数':'手数'}</span><span class="v num">${V.handNo}</span></div>
    <div class="kv"><span class="k">${isM(V)?'红中麻将 · 底分':isD(V)?'斗地主 · 底分':isZ(V)?'炸金花 · 底注':'德州 · 盲注'}</span><span class="v num">${isD(V)||isM(V)?V.cfg.base:isZ(V)?V.cfg.ante:V.cfg.sb+'/'+V.cfg.bb}</span></div>
    <div class="kv"><span class="k">我的盈亏</span><span class="v num ${pr>0?'pos':pr<0?'neg':''}">${sgn(pr)}</span></div>
   </div>
   <div class="menu-row"><span class="k">声音</span><span class="toggle" role="group" aria-label="声音"><button type="button" data-snd="sfx" aria-pressed="${LOCAL.sfx}">音效</button><button type="button" data-snd="voice" aria-pressed="${LOCAL.voice}">语音</button><button type="button" data-snd="vmsg" aria-pressed="${LOCAL.vmsg}" title="收到语音消息时自动播放">自动播放语音</button></span></div>
   <div class="menu-acts">${NET.role!=='guest'?'<button type="button" class="btn danger" data-act="settle">结束并结算</button>':''}<button type="button" class="btn" data-act="menu-home">${NET.role==='guest'?'离开房间':'回到主页'}</button></div>`;
}
/* fullscreen: Android and desktop browsers allow it for pages; iPhone only via the home-screen app */
const fsEl=()=>document.fullscreenElement||document.webkitFullscreenElement;
const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.matchMedia('(display-mode: fullscreen)').matches||navigator.standalone===true;
/* phones: one tap goes full screen and turns the table sideways; desktop keeps a plain full screen */
const isTouch=()=>window.matchMedia('(pointer:coarse)').matches;
let LAND_LOCK=false;
function fsLabel(){
  if(isStandalone())return isTouch()&&screen.orientation&&screen.orientation.lock?(LAND_LOCK?'解除横屏':'锁定横屏'):'';
  return fsEl()?'退出全屏':isTouch()?'横屏全屏':'全屏';
}
function fsButton(){const l=fsLabel();return l?`<button type="button" class="btn sm" data-act="fs">${l}</button>`:''}
/* the same button among the table's corner buttons; upright it shows only the icon */
function fsCorner(){const l=fsLabel();return l?`<button type="button" class="cbtn${Date.now()<FS_TIP.until?' fs-hi':''}" data-act="fs" aria-label="${l}"><span class="ic" aria-hidden="true">⤢</span><span class="lb">${l}</span></button>`:''}
/* a phone starting a 斗地主 or 红中麻将 game: the fullscreen button lights up and a small bubble under it says so, for
   FS_TIP_MS; once a game (show() clears it on the way out), gone early on a tap */
let FS_TIP_MS=6000;const FS_TIP={shown:false,until:0,timer:0};
function fsTip(){
  const b=$('#corner-fs .cbtn');let t=$('#fs-tip');
  if(!FS_TIP.shown&&b&&(isD(V)||isM(V))&&isTouch()&&!fsEl()&&!isStandalone()){
    FS_TIP.shown=true;FS_TIP.until=Date.now()+FS_TIP_MS;b.classList.add('fs-hi');
    clearTimeout(FS_TIP.timer);FS_TIP.timer=setTimeout(fsTipOff,FS_TIP_MS);
  }
  if(Date.now()>=FS_TIP.until||!b){if(t)t.remove();return}
  if(!t){t=document.createElement('div');t.id='fs-tip';t.className='fs-tip';t.setAttribute('role','status');t.textContent='全屏体验更佳';$('#game-view').appendChild(t)}
  const r=b.getBoundingClientRect(),w=t.offsetWidth;
  t.style.left=Math.max(6,Math.min(innerWidth-w-6,r.left+r.width/2-w/2))+'px';t.style.top=(r.bottom+8)+'px';
  t.style.setProperty('--ax',(r.left+r.width/2-parseFloat(t.style.left))+'px');
}
function fsTipOff(){FS_TIP.until=0;clearTimeout(FS_TIP.timer);const t=$('#fs-tip');if(t)t.remove();const b=$('#corner-fs .cbtn');if(b)b.classList.remove('fs-hi')}
async function lockLandscape(){
  if(!screen.orientation||!screen.orientation.lock)return false;
  try{await screen.orientation.lock('landscape');LAND_LOCK=true;return true}catch(e){return false}
}
function unlockOrientation(){try{screen.orientation&&screen.orientation.unlock&&screen.orientation.unlock()}catch(e){}LAND_LOCK=false}
async function toggleFS(){
  if(isStandalone()){                       /* home-screen app is already full screen: just toggle the sideways lock */
    if(LAND_LOCK)unlockOrientation();else if(!(await lockLandscape()))toast('这个浏览器不允许锁定横屏，请手动把手机横过来，并确认系统没有锁定竖屏。',5000);
    renderMeta();return;
  }
  if(fsEl()){unlockOrientation();(document.exitFullscreen||document.webkitExitFullscreen).call(document);return}
  const el=document.documentElement,req=el.requestFullscreen||el.webkitRequestFullscreen;
  if(!req){toast(/iPhone|iPod/.test(navigator.userAgent)?'iPhone 的浏览器不支持网页全屏。可以在 Safari 点底部的「分享 → 添加到主屏幕」，之后从桌面图标打开就是全屏，再把手机横过来。':'这个浏览器不支持网页全屏。',8000);return}
  try{await req.call(el,{navigationUI:'hide'})}catch(e){toast('浏览器拒绝了全屏请求。',3000);return}
  if(isTouch()&&!(await lockLandscape()))toast('已全屏。这个浏览器不允许网页锁定横屏，请手动把手机横过来，并确认系统没有锁定竖屏。',5000);
}
['fullscreenchange','webkitfullscreenchange'].forEach(t=>document.addEventListener(t,()=>{if(!fsEl())LAND_LOCK=false;renderMeta();if(V&&!$('#game-view').hidden)renderTable()}));
function seatTag(p){
  const pos=isM(V)?(V.hz&&V.hz.dealer===p.id?'庄家':''):isD(V)?ddRole(V,p.id):isZ(V)?(p.inHand&&!p.folded?(p.seen?'已看牌':'闷牌'):''):posName(V,p);
  const who=p.away?'暂时离桌':p.trust?'托管中':p.kind==='ai'?'电脑':p.kind==='remote'?(p.connected?'玩家':isD(V)||isM(V)?'托管中':'掉线'):(NET.role==='solo'?'':'房主');
  return [who,pos].filter(Boolean).join(' · ');
}
/* tapping a bet chip, or (德州) the seat it belongs to, lifts that chip above the cards for a moment; a 炸金花 seat opens its panel instead */
let PEEK=null,peekTimer=null;
function peekBet(pid){
  PEEK={pid,until:Date.now()+2500};
  document.querySelectorAll('.bet.peek').forEach(b=>b.classList.remove('peek'));
  const el=document.querySelector(`.bet[data-pid="${pid}"]`);if(el)el.classList.add('peek');
  clearTimeout(peekTimer);peekTimer=setTimeout(()=>{PEEK=null;document.querySelectorAll('.bet.peek').forEach(b=>b.classList.remove('peek'))},2500);
}
/* the round avatar on a seat (the name's first character), then the turn clock of whoever is to act: its own cell beside the
   avatar on the side toward the middle of the table (CSS), so it covers neither the initial nor the cards */
const avatarHTML=p=>`<div class="ava" aria-hidden="true">${esc(avatarChar(p.name))}</div>${turnRing(p.id)}`;
/* seat alignment: a seat on the left half of the table lines its cards and plate text up on the left, one on the right half
   on the right; the far middle and my own seat stay centred. rside: on the right edge the cards go on the inner side of the
   avatar, so they stay on screen. uh: the upper part of the table, where upright the turn clock goes under the avatar;
   tr: the clock is showing. */
const seatCls=(s,mine,pid)=>(mine||Math.abs(s.x-50)<6?'':s.x<50?' al-l':' al-r')+(s.x>80?' rside':'')+(s.y<40?' uh':'')+(turnRing(pid)?' tr':'');
/* ---------- 出牌限时: a ring that drains, seconds in the middle, red for the last 5 s ----------
   A snapshot says how much time was left when the host made it; this device counts down from when it got it. */
let TURN={at:0,left:0,total:0};
const RING_C=2*Math.PI*15.5;
const turnRing=pid=>V&&V.phase==='playing'&&V.toAct===pid&&TURN.total&&TURN.left?`<span class="tring"><svg viewBox="0 0 36 36"><circle class="tr-bg" cx="18" cy="18" r="15.5"/><circle class="tr-fg" cx="18" cy="18" r="15.5" stroke-dasharray="${RING_C.toFixed(2)}"/></svg><b></b></span>`:'';
const stillMQ=window.matchMedia('(prefers-reduced-motion: reduce)');
function tickRing(){
  const el=document.querySelector('#table .tring');if(!el)return;
  const left=Math.max(0,TURN.left-(Date.now()-TURN.at)),sec=Math.ceil(left/1000);
  /* reduced motion: the ring steps once a second instead of draining smoothly */
  const frac=Math.min(1,(stillMQ.matches?sec*1000:left)/TURN.total);
  el.querySelector('.tr-fg').style.strokeDashoffset=(RING_C*(1-frac)).toFixed(2);
  const b=el.querySelector('b');if(b.textContent!==String(sec))b.textContent=sec;
  el.classList.toggle('low',sec<=5);
}
setInterval(tickRing,200);
/* 托管 on my own device: a dim panel over my hand with 「取消托管」 */
const trustVeil=()=>V&&me().trust&&V.phase!=='settled'?'<div class="trust-veil" role="group" aria-label="托管中"><span>托管中……</span><button type="button" class="btn b-green" data-act="untrust">取消托管</button></div>':'';
/* which game and which way up, for the CSS that sizes the full-screen table */
let FRAME={o:'',w:0,h:0};
function tableFrame(o,g){const gv=$('#game-view');gv.dataset.orient=o;gv.dataset.game=g;FRAME={o,w:innerWidth,h:innerHeight}}
/* --s lets the seat's text grow back what the scale takes away, so far seats stay readable */
const seatStyle=s=>`left:${s.x.toFixed(2)}%;top:${s.y.toFixed(2)}%;transform:translate(-50%,-50%) scale(${s.s});--s:${s.s}`;
function renderTable(){
  if(isM(V)){BETPT={};return hzRenderTable()}
  if(isD(V)){BETPT={};return ddRenderTable()}
  const hand=$('#dd-hand');if(hand)hand.hidden=true;
  const n=V.players.length,o=tableOrient();
  tableFrame(o,isZ(V)?'zjh':'holdem');
  let html='';
  V.players.forEach((p,i)=>{
    const slot=(i-V.me+n)%n,s=seatXY(slot,n,o),b=betXY(slot,n,o);
    /* my own cards are drawn big at the bottom, not on my seat */
    const mine=i===V.me,cards=p.inHand?p.cards.map(c=>cardHTML(c)).join(''):'';
    const done=V.phase!=='playing'&&V.phase!=='runout';
    const cls=['seat',i===V.me?'me':'',V.toAct===i&&V.phase==='playing'?'active':'',p.folded?'folded':'',p.out||(!p.inHand&&V.phase==='playing')?'out':'',p.won>0&&done?'win':''].join(' ');
    const hn=handLabel(p);
    const status=p.folded&&hn?(p.lostCmp?'比牌输了 · 已弃牌':'已弃牌'):p.out?'已离桌':p.away&&!p.inHand?'暂时离桌':p.busted&&!p.inHand?'筹码输光':!p.inHand&&V.phase==='playing'?'下一手入座':p.lastAction||(p.shown&&p.handName?p.handName:'');
    /* 托管 shows on the status line too: the tag line is hidden on phones */
    const tg=p.trust&&p.inHand&&!done;
    const act=p.won>0&&done?`<div class="pact won">+${fmt(p.won)}${p.handName&&!hn?' · '+p.handName:''}</div>`:`<div class="pact${tg?' tg':''}">${esc(tg?['托管中',status].filter(Boolean).join(' · '):status)}</div>`;
    if(mine&&cards)html+=`<div class="my-hand" aria-label="我的底牌">${cards}${hn}${trustVeil()}</div>`;
    /* seats on the right keep their cards on the inner side of the avatar, so they stay on screen */
    html+=`<div class="${cls}${hn&&p.folded?' reveal':''}${seatCls(s,mine,i)}" data-pid="${i}"${isZ(V)?` role="button" tabindex="0" aria-label="${esc(p.name)}，点击查看信息和比牌"`:''} style="${seatStyle(s)}">
      <div class="stop">${avatarHTML(p)}<div class="cards">${mine||!cards?'':cards+hn}</div></div>
      <div class="plate">${V.dealer===i&&p.inHand?'<span class="dbtn" title="庄位">D</span>':''}
        <div class="pname">${esc(p.name)}${i===V.me&&NET.role!=='solo'?'（你）':''}</div>
        <div class="ptag">${esc(seatTag(p))||'&nbsp;'}</div>
        <div class="pstack">${fmt(p.stack)}</div>
        ${act}
      </div></div>`;
    if(p.bet>0)html+=`<div class="bet${PEEK&&PEEK.pid===i&&Date.now()<PEEK.until?' peek':''}" data-pid="${i}" role="button" tabindex="0" aria-label="${esc(p.name)} 下注 ${fmt(p.bet)}，点击放大查看" style="left:${b.x.toFixed(2)}%;top:${b.y.toFixed(2)}%"><i class="chip" ${chipStyle(i)}></i>${fmt(p.bet)}</div>`;
  });
  const slots=[0,1,2,3,4].map(k=>V.board[k]!=null?cardHTML(V.board[k]):'<div class="slot"></div>').join('');
  const ended=V.phase==='handover';
  const zinfo=isZ(V)?`<div class="pot" style="font-size:15px">${V.phase==='playing'?`第 ${V.round}/${V.cfg.zrounds} 轮 · 单注 <span>${fmt(V.stake)}</span>`:'炸金花'}</div>`:'';
  const c=centerXY(o);
  html+=`<div class="center" style="left:${c.x}%;top:${c.y}%"><div class="street">${ended?'本手结束':isZ(V)?(V.phase==='playing'?'炸金花':'暂停'):V.phase==='playing'||V.phase==='runout'?STREET_CN[V.street]||'':'暂停'}</div>${isZ(V)?zinfo:`<div class="board">${slots}</div>`}<div class="pot">底池 <span>${fmt(ended?V.players.reduce((a,p)=>a+p.won,0):potOf(V))}</span></div><div class="msg">${esc(V.msg)}</div></div>`;
  $('#table').innerHTML=html;
  $('#table').classList.toggle('zjh',isZ(V));$('#table').classList.remove('ddz');
  $('#table').dataset.n=String(n);
  placeBets();renderSeatPop();
}
/* where each player's bet chip goes, in % of the table: on the line from the seat to the middle, just clear of the seat as
   drawn (js/table-layout.js betClear). Flying chips aim at the same points (seatPoint). */
let BETPT={};
/* everything drawn for a seat: the box, its top row's avatar, clock and cards (which may stick out of the row) and the plate */
const seatParts=seat=>[seat,...seat.querySelectorAll(':scope > .stop > *,:scope > .plate')];
function placeBets(){
  BETPT={};const tb=$('#table');if(!tb||!V)return;
  const tr=tb.getBoundingClientRect(),W=tb.clientWidth,H=tb.clientHeight;if(!W||!H)return;
  const ox=tr.left+tb.clientLeft,oy=tr.top+tb.clientTop,c=centerXY(tableOrient()),C={x:W*c.x/100,y:H*c.y/100};
  const any=tb.querySelector('.bet'),dflt=any?any.getBoundingClientRect():{width:60,height:26};
  V.players.forEach((p,i)=>{
    const seat=tb.querySelector(`.seat[data-pid="${i}"]`);if(!seat)return;
    const rs=seatParts(seat).filter(e=>e.offsetWidth).map(e=>e.getBoundingClientRect()),sr=rs[0];
    const S={x:sr.left+sr.width/2-ox,y:sr.top+sr.height/2-oy};
    const box={l:S.x+ox-Math.min(...rs.map(r=>r.left)),r:Math.max(...rs.map(r=>r.right))-ox-S.x,t:S.y+oy-Math.min(...rs.map(r=>r.top)),b:Math.max(...rs.map(r=>r.bottom))-oy-S.y};
    const el=tb.querySelector(`.bet[data-pid="${i}"]`),br=el?el.getBoundingClientRect():dflt,q=betClear(S,C,box,br.width,br.height,4);
    const pt=BETPT[i]={x:q.x/W*100,y:q.y/H*100};
    if(el){el.style.left=pt.x.toFixed(2)+'%';el.style.top=pt.y.toFixed(2)+'%'}
  });
}
/* at the end of a hand, the hand name beside each shown hand (the winner's marked); with 「亮出所有人的底牌」 also the hands
   nobody showed down (a folded one's plate then says 「已弃牌」). It lies over the foot of the seat's cards, never on the plate. */
function handLabel(p){
  if(V.phase!=='handover'||!p.inHand||!p.cards.length||p.cards[0]==null)return '';
  const nm=p.shown&&!p.folded&&p.handName?p.handName:p.revealName;if(!nm)return '';
  const win=p.won>0&&!p.folded;
  return `<span class="hname${p.id===V.me?' mine':''}${win?' win':''}">${win?'<i class="hw">赢 </i>':''}${esc(nm)}${p.folded&&p.id===V.me?' · 已弃牌':''}</span>`;
}
/* 炸金花: tapping a seat opens a small panel beside it with the player's name, chips and status, and what I can do with
   them right now (seatPopActions: only 比牌 so far). It follows the table on every render; a tap outside or Esc closes it. */
let SEATPOP=null;
function seatPopActions(p){
  const acts=[];if(!isZ(V)||!myTurn()||p.id===V.me||!alive(p))return acts;
  const m=me(),cost=zCost(V,m),a=coachOn()&&LOCAL.mode==='live'?getAdvice():null,rec=a&&a.rec.type==='compare'&&a.rec.target===p.id?' is-rec':'';
  if(V.round>=2&&m.stack>=cost)acts.push(`<button type="button" class="btn b-red${rec}" data-act="zcmp" data-t="${p.id}">和 TA 比牌（付 ${fmt(cost)}）</button>`);
  return acts;
}
function seatStatus(p){return p.out||!p.inHand?'离座':p.folded?(p.lostCmp?'弃牌（比牌输了）':'弃牌'):isZ(V)?(p.seen?'看牌':'闷牌'):p.allIn?'全下':'在局中'}
function closeSeatPop(){SEATPOP=null;const el=$('#seat-pop');if(el)el.hidden=true}
function renderSeatPop(){
  let el=$('#seat-pop');
  const seat=SEATPOP&&document.querySelector(`#table .seat[data-pid="${SEATPOP.pid}"]`),p=SEATPOP&&V&&V.players[SEATPOP.pid];
  if(!seat||!p||!isZ(V)||V.handNo!==SEATPOP.hand){SEATPOP=null;if(el)el.hidden=true;return}
  if(!el){el=document.createElement('div');el.id='seat-pop';el.className='seat-pop';el.setAttribute('role','dialog');$('#game-view').appendChild(el)}
  const acts=seatPopActions(p);
  el.setAttribute('aria-label',p.name);
  el.innerHTML=`<div class="sp-name">${esc(p.name)}</div><div class="sp-info"><span>筹码 <b class="num">${fmt(p.stack)}</b></span><span class="sp-st">${seatStatus(p)}</span></div>${acts.length?`<div class="sp-acts">${acts.join('')}</div>`:''}`;
  el.hidden=false;
  /* beside a seat on the left or right edge (toward the middle), else below a seat in the upper half and above one in the
     lower half; kept on screen */
  const rs=seatParts(seat).filter(e=>e.offsetWidth).map(e=>e.getBoundingClientRect()),r={left:Math.min(...rs.map(q=>q.left)),right:Math.max(...rs.map(q=>q.right)),top:Math.min(...rs.map(q=>q.top)),bottom:Math.max(...rs.map(q=>q.bottom))};
  r.width=r.right-r.left;r.height=r.bottom-r.top;
  const g=$('#game-view').getBoundingClientRect(),w=el.offsetWidth,h=el.offsetHeight,cx=r.left+r.width/2,cy=r.top+r.height/2;
  const side=cx<innerWidth*0.3?1:cx>innerWidth*0.7?-1:0,up=cy>innerHeight/2;
  const x0=side>0?r.right+6:side<0?r.left-w-6:cx-w/2,y0=side?cy-h/2:up?r.top-h-6:r.bottom+6;
  const x=Math.max(8,Math.min(innerWidth-w-8,x0)),y=Math.max(8,Math.min(innerHeight-h-8,y0));
  el.style.left=(x-g.left)+'px';el.style.top=(y-g.top)+'px';
}
function toggleSeatPop(pid){if(SEATPOP&&SEATPOP.pid===pid)closeSeatPop();else{SEATPOP={pid,hand:V.handNo};renderSeatPop()}}
/* the action area: a hint label (coach advice or a tip, may be empty), one fixed-height row of buttons or one line of
   text, and an optional pop-up panel above the row. ACTPOP names the open panel ('raise'); it closes when the turn ends. */
let ACTPOP=null;
const actHTML=(hint,bar,pop,kind)=>`<div class="act-hint">${hint||''}</div><div class="act-bar">${bar}</div>${pop?`<div class="act-pop" data-pop="${kind||''}"${ACTPOP&&ACTPOP===kind?'':' hidden'}>${pop}</div>`:''}`;
const actWait=(txt,btns)=>actHTML('',`<span class="act-wait">${txt}</span>${btns||''}`);
function closeActPop(){ACTPOP=null;document.querySelectorAll('#actions .act-pop').forEach(p=>{p.hidden=true})}
function renderActions(){
  const el=$('#actions'),m=me(),isHost=NET.role!=='guest';
  if(!myTurn())ACTPOP=null;
  /* 暂时离桌 after a timeout: back from the next hand; 托管: 取消托管 is on the panel over my hand (here only if there is no hand) */
  /* out of chips comes first: 补码 also cancels 托管 / 离桌 */
  if(m.stack<=0&&!m.inHand){
    el.innerHTML=actWait(`你的筹码输光了。可以补码 ${fmt(V.cfg.stack)} 继续（补码会计入成本）${isHost?'，或者在菜单里结算':'，下一手入座'}。`,
      `<button class="btn b-green" data-act="rebuy">补码 ${fmt(V.cfg.stack)}</button>`);return;
  }
  if(m.away){el.innerHTML=actWait('你暂时离桌了，点了从下一手开始重新上桌。','<button class="btn b-green" data-act="rejoin">下一局加入</button>');return}
  if(m.trust&&V.phase==='playing'){el.innerHTML=actWait('托管中，轮到你时自动操作。',m.inHand&&m.cards.length?'':'<button class="btn b-green" data-act="untrust">取消托管</button>');return}
  if(V.phase==='busted'||V.phase==='waiting'){
    /* 斗地主 online: the host may let a bot take the seat of a player who is out of chips */
    const take=isD(V)&&NET.role==='host'?V.players.filter(p=>p.kind==='remote'&&p.stack<=0).map(p=>`<button class="btn b-green" data-act="ddtakeover" data-pid="${p.id}">让电脑顶上 ${esc(p.name)}</button>`).join(''):'';
    el.innerHTML=actWait(esc(V.msg),take);return;
  }
  if(V.phase==='handover'){
    const last=T.hist[T.hist.length-1];const d=last&&last.hand===V.handNo?last.delta:0;
    el.innerHTML=actWait(`这手你 <b class="${d>0?'pos':d<0?'neg':''}">${sgn(d)}</b>。${V.cfg.auto?'即将自动发下一手…':isHost?'':'等待房主发下一手…'}`,
      isHost&&!V.cfg.auto?'<button class="btn b-green" data-act="next">下一手 ▶</button>':'');return;
  }
  /* 红中麻将 asks for 吃 / 碰 / 杠 / 胡 on other players' turns too */
  if(isM(V))return hzRenderActions(el,m);
  if(!myTurn()&&isD(V)){el.innerHTML=actWait(!m.inHand?'你这局没有入座，下一局开始参与。':ddWaitText());return}
  if(!myTurn()){
    const p=V.players[V.toAct];
    const waitTxt=p&&p.kind==='remote'&&!p.connected?`${esc(p.name)} 掉线了，等他重连，最多等 15 秒，之后自动过牌或弃牌…`:p?`等待 ${esc(p.name)} 行动…`:'…';
    el.innerHTML=actWait(V.phase==='runout'?'正在发完公共牌…':!m.inHand?'你这手没有入座，下一手开始参与。':!alive(m)?'你已弃牌，等待本手结束…':waitTxt);return;
  }
  if(isZ(V))return zRenderActions(el,m);
  if(isD(V))return ddRenderActions(el,m);
  const live=coachOn()&&LOCAL.mode==='live';
  const a=live?getAdvice():null;
  const toCall=Math.min(V.currentBet-m.bet,m.stack),maxTo=m.bet+m.stack,pot=potOf(V);
  const minTo=Math.min(maxTo,V.currentBet+V.minRaise),canRaise=maxTo>V.currentBet,slide=canRaise&&maxTo>minTo;
  const rt=a?a.rec.type:'';
  const mark=t=>live&&rt===t?' is-rec':'';
  const def=live&&rt==='raise'?a.rec.to:minTo,verb=V.currentBet===0?'下注':'加注到';
  const presets=[['最小',0],['½ 池',0.5],['⅔ 池',0.66],['1 池',1]].map(([l,f])=>{
    const v=f===0?minTo:Math.min(maxTo,V.currentBet+Math.max(V.minRaise,roundU(V,f*(pot+toCall))));
    return `<button type="button" class="btn b-gray" data-preset="${v}">${l} · ${fmt(v)}</button>`}).join('');
  const bar=`<button class="btn b-gray${mark('fold')}" data-act="fold">弃牌</button>
     ${toCall>0?`<button class="btn b-green${mark('call')}" data-act="call">${toCall>=m.stack?'全下':'跟注'} ${fmt(toCall)}</button>`:`<button class="btn b-gray${mark('check')}" data-act="check">过牌</button>`}
     ${slide?`<button class="btn b-red${mark('raise')}" data-act="raise-open" aria-haspopup="true">${V.currentBet===0?'下注':'加注'}</button>`
       :canRaise?`<button class="btn b-red${mark('raise')}" data-act="allin">全下 ${fmt(maxTo)}</button>`:''}`;
  /* the raise panel: slider, all-in and the confirm button, then the quick amounts */
  const pop=slide?`<label for="raise-amt" class="pop-t raise-t">${verb}金额（总注额，最小 ${fmt(minTo)}，最多 ${fmt(maxTo)}）</label>
     <div class="pop-row pop-slide"><input type="range" id="raise-amt" min="${minTo}" max="${maxTo}" step="${V.cfg.sb}" value="${def}" aria-label="${verb}金额"><button class="btn b-red" data-act="allin">全下 ${fmt(maxTo)}</button><button class="btn b-green${mark('raise')}" data-act="raise" id="raise-btn">${verb} ${fmt(def)}</button></div>
     <div class="pop-row">${presets}</div>`:'';
  const hint=live?`教练建议：<b>${recLabel(a.rec,toCall,V.currentBet)}</b>${a.ex&&a.ex.rec&&a.ex.rec.type!==a.rec.type?` · 剥削建议：<b>${recLabel(a.ex.rec,toCall,V.currentBet)}</b>`:''}`:coachOn()?'练习模式：先自己决定，行动后教练面板显示点评。':'';
  el.innerHTML=actHTML(hint,bar,pop,'raise');
}
function meter(e,po){return `<div class="meter"><i style="width:${Math.min(100,e*100)}%"></i>${po>0?`<b style="left:${Math.min(99,po*100)}%"></b>`:''}</div><div class="legend"><span class="l1">你的胜率</span>${po>0?'<span class="l2">跟注所需胜率</span>':''}</div>`}
function preHead(){return '<div class="gto-tag"><span class="pill brass">GTO 翻前范围</span><span class="muted">6 人桌 · 100BB 近似</span></div>'}
function matrixHTML(pre){
  let h='<div class="mx" role="img" aria-label="起手牌范围矩阵">';
  for(let i=0;i<13;i++)for(let j=0;j<13;j++){
    const hi=12-Math.min(i,j),lo=12-Math.max(i,j),k=i===j?hk(hi,hi,''):hk(hi,lo,i<j?'s':'o');
    h+=`<span class="mc ${pre.chart[k]||'f'}${k===pre.key?' cur':''}">${k}</span>`;
  }
  const hasCall=Object.values(pre.chart).includes('c');
  return h+`</div><div class="legend"><span class="lr">${pre.labels.r}</span>${hasCall?'<span class="lc">跟注</span>':''}<span class="lf">${pre.labels.f}</span><span class="plain">白框 = 你的 ${pre.key}</span></div>`;
}
function oppsHTML(a){
  if(!a.oppInfo||!a.oppInfo.length)return '';
  return `<div class="opps"><div class="t">对手范围估计</div>${a.oppInfo.map(o=>`<div class="opp"><span><b>${esc(o.name)}</b> <span class="l">${esc(o.line)}</span></span><span class="num">${o.pct>=0.999?'任意牌':'前 '+pct(o.pct)}${o.post?' · 翻后收窄':''}</span></div>`).join('')}</div>`;
}
function decisionDetail(a){
  return `<div class="stats">
    <div class="stat"><div class="k">胜率（对估计范围）</div><div class="v">${pct(a.e)}</div><div class="s">对随机牌 ${pct(a.eRand)}</div></div>
    <div class="stat"><div class="k">${a.toCall>0?'底池赔率（所需胜率）':'平均胜率'}</div><div class="v">${a.toCall>0?pct(a.po):pct(a.fair)}</div><div class="s">${a.toCall>0?`跟 ${fmt(a.toCall)} 争 ${fmt(a.pot+a.toCall)}`:'每人平分时'}</div></div>
    <div class="stat"><div class="k">底池</div><div class="v">${fmt(a.pot)}</div><div class="s">${(a.pot/a.bb).toFixed(1)} BB</div></div>
    <div class="stat"><div class="k">${a.toCall>0?'跟注期望':'当前牌力'}</div><div class="v ${a.toCall>0?(a.evCall>=0?'pos':'neg'):''}">${a.toCall>0?sgn(a.evCall):a.made}</div><div class="s">${a.toCall>0?a.made:STREET_CN[a.street]}</div></div>
  </div>${meter(a.e,a.po)}${oppsHTML(a)}`;
}
function renderCoach(){
  const el=$('#coach'),m=me();
  const dot=$('#coach-dot');if(dot)dot.hidden=!(myTurn()&&coachOn()&&!(SHEET&&SHEET.tab==='coach-main'));
  const toggle=`<span class="toggle" role="group" aria-label="建议显示方式"><button type="button" data-mode-coach="live" aria-pressed="${LOCAL.mode==='live'}">实时</button><button type="button" data-mode-coach="after" aria-pressed="${LOCAL.mode==='after'}">先决定</button></span>`;
  if(!coachOn()){
    /* the counter stays when only the coach is off */
    const cnt=counterOn()?(isM(V)&&V.hz?hzCounterSectionHTML(V):isD(V)&&V.dd?ddCounterSectionHTML(V):''):'';
    el.innerHTML=`<div class="coach-head"><h2>教练</h2></div><p class="muted">${NET.role==='solo'?'你关闭了教练建议':'房主关闭了本局的教练建议'}。结算时你仍会看到自己的决策复盘。</p>${cnt}`;return;
  }
  if(isD(V)){el.innerHTML=ddCoachHTML(V,toggle);return}
  if(isM(V)){el.innerHTML=typeof hzCoachHTML==='function'?hzCoachHTML(V,toggle):`<div class="coach-head"><h2>教练</h2>${toggle}</div><p class="muted">轮到你时，手牌里会标出教练推荐打的牌。</p>`;return}
  let body='';
  const turn=myTurn();
  if(turn&&LOCAL.mode==='live'){
    const a=getAdvice();
    body=isZ(V)?`${zDetail(a)}<div class="verdict"><span class="muted">建议</span><span class="rec-big">${zRecLabel(a.rec,a)}</span></div><p class="why">${a.why}</p>`
      :`${a.pre?preHead():''}${decisionDetail(a)}<div class="verdict"><span class="muted">${a.pre?'GTO 建议':'建议'}</span><span class="rec-big">${recLabel(a.rec,a.toCall,a.cb)}</span></div><p class="why">${a.why}</p>${exploitHTML(a)}${a.pre?matrixHTML(a.pre):''}`;
  }else if(turn){
    body='<p class="muted">轮到你了。先自己判断：你的牌有多强？跟注要付多少、能赢多少？行动后这里会显示分析。</p>';
  }else if(!T.last){
    body=`<p class="muted">轮到你行动时，这里会显示胜率、底池赔率和建议。只有你自己能看到。${m.inHand&&!alive(m)&&V.phase==='playing'?'这手你已弃牌。':''}</p>`;
  }
  const f=T.last;
  if(f&&!(turn&&LOCAL.mode==='live'&&f.hand!==V.handNo)){
    const [gl,gc]=GRADE[f.grade];
    body+=`<div class="${body?'feedback':''}"><div class="t">上一个决定 · 第 ${f.hand} 手 ${f.game==='zjh'?'第 '+f.round+' 轮':STREET_CN[f.street]}</div>
      <div class="verdict" style="margin-top:2px"><span class="pill ${gc}">${gl}</span><span>你：<b>${f.action}</b></span><span class="muted">建议：${f.recText}</span></div>
      <p class="why">${f.note}</p>${LOCAL.mode==='after'&&f.game==='zjh'?zDetail(f)+`<p class="why muted">${f.why}</p>`:''}${LOCAL.mode==='after'&&f.game!=='zjh'?(f.pre?preHead():'')+decisionDetail(f)+`<p class="why muted">${f.why}</p>`+exploitHTML(f)+(f.pre&&f.pre.chart?matrixHTML(f.pre):''):''}</div>`;
  }
  el.innerHTML=`<div class="coach-head"><h2>教练</h2>${toggle}</div>${body}
   <p class="disclaim">${isZ(V)?'炸金花没有公认的 GTO 解。教练按牌力百分位和对手行为估计胜率，再对比所需胜率给建议，是学习用的简化模型。':''}</p><p class="disclaim" ${isZ(V)?'hidden':''}>翻牌前：按近似 GTO 起手牌范围（6 人桌、100BB，其他人数按位置换算）给建议。翻牌后：根据每个对手的行动估计他的牌力范围，模拟 1500 次算胜率，再对比底池赔率给建议。翻牌后部分是简化模型，不是 solver 算出的 GTO 解。</p>`;
}
let roomHTML='';
function renderRoom(){
  const el=$('#room');
  if(NET.role==='solo'){el.hidden=true;return}
  el.hidden=false;
  const h=`<h2>房间</h2>${NET.role==='host'?inviteHTML(true):''}<div id="room-ledger"></div>${NET.role==='host'?'<p class="note">对局中也可以邀请新玩家，他们会在下一手入座。掉线的玩家有 15 秒重连时间；刷新页面会自动回到原座位，筹码不变。</p>':''}`;
  if(h!==roomHTML){roomHTML=h;el.innerHTML=h;fillLanInputs()}
  const buy=p=>V.cfg.stack*(1+p.rebuys);
  const rows=V.players.filter(p=>p.kind!=='ai').map(p=>{const net=p.stack+p.total-buy(p);return `<tr><td><span class="dot${p.kind==='remote'&&!p.connected?' off':''}"></span>${esc(p.name)}${p.id===V.me?'（你）':''}</td><td class="r num">${1+p.rebuys}</td><td class="r num">${fmt(buy(p))}</td><td class="r num">${fmt(p.stack+p.total)}</td><td class="r num ${net>0?'pos':net<0?'neg':''}">${sgn(net)}</td></tr>`}).join('');
  $('#room-ledger').innerHTML=`<div class="tbl-wrap" style="margin-top:10px"><table class="ptbl"><thead><tr><th>真人玩家</th><th class="r">买入次数</th><th class="r">总买入</th><th class="r">当前筹码</th><th class="r">净输赢</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function inviteHTML(compact){
  if(NET.net==='internet'){
    return `<div class="muted" style="font-size:12px">邀请码</div>
      <div class="copyrow"><span class="roomcode">${NET.code}</span><button type="button" class="btn sm primary" data-copy-text="${NET.code}" data-label="复制邀请码">复制邀请码</button></div>
      ${compact?'':'<p class="note">把邀请码发给朋友。朋友打开同一个 HTML 文件，选「加入房间」输入邀请码即可。</p>'}`;
  }
  return `<div class="row" style="justify-content:space-between"><span class="muted" style="font-size:12.5px">局域网：每位玩家需要单独一组连接码</span><button type="button" class="btn sm" data-act="lan-new">生成连接码</button></div><div id="lan-slots">${lanSlotsHTML()}</div>`;
}
function lanSlotsHTML(){
  return NET.lanSlots.map((s,i)=>`<div class="slot-card">
    <div class="t">邀请 ${i+1} · ${esc(s.status)}</div>
    ${s.code?`<div class="t">① 把连接码发给对方（微信、邮件、AirDrop 都行）</div><textarea id="lan-code-${s.id}" readonly>${s.code}</textarea>
    <div class="row"><button type="button" class="btn sm primary" data-copy="#lan-code-${s.id}" data-label="复制连接码">复制连接码</button></div>
    <div class="t">② 粘贴对方发回的回复码</div><textarea id="lan-ans-${s.id}" data-ans="${s.id}" placeholder="粘贴回复码"></textarea>
    <div class="row"><button type="button" class="btn sm primary" data-lan-accept="${s.id}">连接</button></div>`:''}
  </div>`).join('');
}
function fillLanInputs(){NET.lanSlots.forEach(s=>{const t=document.getElementById('lan-ans-'+s.id);if(t&&!t.value)t.value=s.ans})}
function rerenderLan(){const c=$('#lan-slots');if(c){c.innerHTML=lanSlotsHTML();fillLanInputs()}roomHTML=''}
function sessionStats(){
  const ds=T.decisions,hands=T.hist.length,bb=V?V.cfg.bb:SETTLE.cfg.bb;
  const good=ds.filter(d=>d.grade==='good'||d.grade==='ok').length;
  const loss=ds.reduce((a,d)=>a+d.lossBB,0);
  const last=T.hist[T.hist.length-1],pr=V?myProfit(V):(last?last.cum:0);
  return {hands,pr,bb,bb100:hands?pr/bb/hands*100:0,vpip:T.hands?T.vpip/T.hands:0,pfr:T.hands?T.pfr/T.hands:0,acc:ds.length?good/ds.length:0,loss,n:ds.length,won:T.won};
}
function spark(w,h,pad){
  const pts=[{cum:0},...T.hist];const vals=pts.map(p=>p.cum);
  let mn=Math.min(0,...vals),mx=Math.max(0,...vals);if(mx===mn){mx+=1;mn-=1}
  const X=i=>pad+(w-2*pad)*(pts.length===1?0:i/(pts.length-1)),Y=v=>pad+(h-2*pad)*(1-(v-mn)/(mx-mn));
  const line=pts.map((p,i)=>`${X(i).toFixed(1)},${Y(p.cum).toFixed(1)}`).join(' ');
  const last=vals[vals.length-1],col=last>=0?'var(--good)':'var(--bad)';
  return {svg:`<line x1="${pad}" x2="${w-pad}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--line)" stroke-dasharray="3 3"/>
    <polygon points="${X(0)},${Y(0)} ${line} ${X(pts.length-1)},${Y(0)}" fill="${col}" opacity=".12"/>
    <polyline points="${line}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${X(pts.length-1)}" cy="${Y(last)}" r="3.5" fill="${col}"/>`,mn,mx,Y};
}
function renderSession(){
  const s=sessionStats();
  if(isM(V)){$('#session').innerHTML=`<h2>我的统计</h2><div class="stats" style="margin-top:10px">${hzStatsHTML(me().st,s)}</div><svg class="spark" viewBox="0 0 300 70" preserveAspectRatio="none" role="img" aria-label="累计盈亏走势">${spark(300,70,6).svg}</svg>`;return}
  if(isD(V)){
    $('#session').innerHTML=`<h2>我的统计</h2><div class="stats" style="margin-top:10px">${ddStatsHTML(me().st,s)}</div>
     <svg class="spark" viewBox="0 0 300 70" preserveAspectRatio="none" role="img" aria-label="累计盈亏走势">${spark(300,70,6).svg}</svg>`;
    return;
  }
  $('#session').innerHTML=`<h2>我的统计</h2>
   <div class="stats" style="margin-top:10px">
    <div class="stat"><div class="k">盈亏</div><div class="v ${s.pr>0?'pos':s.pr<0?'neg':''}">${sgn(s.pr)}</div><div class="s">${(s.pr/s.bb).toFixed(1)} ${isZ(V)?'倍底注':'BB'}</div></div>
    <div class="stat"><div class="k">每百手赢率</div><div class="v">${s.hands?s.bb100.toFixed(1):'—'}</div><div class="s">${isZ(V)?'底注/100 手':'BB/100'}</div></div>
    ${isZ(V)?`<div class="stat"><div class="k">赢下的手数</div><div class="v">${s.won}</div><div class="s">共 ${s.hands} 手</div></div>`:`<div class="stat"><div class="k">入池率 VPIP</div><div class="v">${s.hands?pct(s.vpip):'—'}</div><div class="s">主动投钱的手数比例</div></div>`}
    <div class="stat"><div class="k">决策正确率</div><div class="v">${s.n?pct(s.acc):'—'}</div><div class="s">${s.n} 次决定 · 损失 ${s.loss.toFixed(1)} BB</div></div>
   </div>
   <svg class="spark" viewBox="0 0 300 70" preserveAspectRatio="none" role="img" aria-label="累计盈亏走势">${spark(300,70,6).svg}</svg>`;
}
function renderLog(){
  $('#log').innerHTML=V.log.slice().reverse().map(l=>`<div class="${l.cls==='sep'?'sep':l.cls}">${l.cls==='sep'?'— '+esc(l.t)+' —':esc(l.t)}</div>`).join('');
}

/* ---------- lobby ---------- */
function renderLobby(){
  const c=LOBBY.cfg,hs=LOBBY.humans;
  const rows=[];
  for(let i=0;i<c.players;i++){
    const h=hs[i];
    const card=h?(i===0?(myCard()||{}).no:h.card):'';
    if(h)rows.push(`<div class="seatrow"><span class="n"><span class="dot"></span>${esc(h.name)}${i===0?'（你）':''}${card?` <span class="muted">· ${esc(card)}</span>`:''}</span><span class="muted">${i===0?'房主':'已加入'}</span></div>`);
    else rows.push(`<div class="seatrow empty"><span>座位 ${i+1}</span><span>${c.aiFill?'开局时由电脑补位':'空位'}</span></div>`);
  }
  $('#lobby-main').innerHTML=`<h2>房间大厅</h2>
    <p class="lead">${c.game==='hz'?`红中麻将 · 底分 ${c.base} · 固定 4 个座位，${hs.length} 名真人已就座`:c.game==='ddz'?`斗地主${c.laizi?'（赖子模式）':''} · 底分 ${c.base}，封顶 ${c.ddcap} 倍 · 固定 3 个座位，${hs.length} 名真人已就座`:`${c.game==='zjh'?'炸金花':'德州扑克'} · ${hs.length} 名真人已就座，共 ${c.players} 个座位。`}${c.game==='zjh'?`底注 ${c.ante}，单注封顶 ${c.zcap} 倍底注，最多 ${c.zrounds} 轮${c.z235?'，235 吃豹子':''}`:c.game==='ddz'?'':`盲注 ${c.sb}/${c.bb}`}，起始筹码 ${fmt(c.stack)}。教练建议${c.coach?'已开启（每人只看到自己的）':'已关闭'}。</p>
    <div class="seats">${rows.join('')}</div>
    <div class="setup-actions" style="margin-top:16px"><button class="btn primary" data-act="host-start">开始对局</button><button class="btn" data-act="leave">解散房间</button></div>
    <p class="note">底牌只发给本人，其他玩家的设备收不到你的底牌。牌局在房主的浏览器里运行，房主关闭页面牌局就会结束。仅限虚拟筹码，不涉及真钱。</p>`;
  $('#lobby-side').innerHTML=`<h2>邀请玩家</h2>${inviteHTML(false)}`;
  fillLanInputs();
}
function renderGuestLobby(){
  const g=GL;
  $('#lobby-main').innerHTML=g?`<h2>已加入房间</h2>
    <p class="lead">${g.game==='hz'?'红中麻将 · 固定 4 个座位':g.game==='ddz'?`斗地主${g.laizi?'（赖子模式）':''} · 固定 3 个座位`:g.game==='zjh'?'炸金花':'德州扑克'} · 房主 ${esc(g.host)} · ${g.players.length} 名真人 / ${g.seats} 个座位 · 教练建议${g.coach?'已开启（只有你能看到你的建议）':'已关闭'}</p>
    <div class="seats">${g.players.map((n,i)=>`<div class="seatrow"><span class="n"><span class="dot"></span>${esc(n)}${g.cards&&g.cards[i]?` <span class="muted">· ${esc(g.cards[i])}</span>`:''}</span><span class="muted">${i===0?'房主':'已加入'}</span></div>`).join('')}</div>
    <p class="note">${g.ended?'这一场已经结束，等房主回到大厅开新一场。':g.wait?'对局进行中，下一局开始时你会替换一个电脑入座。':'等待房主开始对局…'}</p>
    <div class="setup-actions" style="margin-top:12px"><button class="btn" data-act="leave">离开房间</button></div>`
    :'<h2>正在加入…</h2><p class="muted">已连上房主，等待房间信息。</p>';
  $('#lobby-side').innerHTML=`<h2>提示</h2><p class="muted">对局开始后，你的底牌和教练建议只显示在你自己的设备上。如果断线，用同一个昵称重新加入可以回到原座位。</p>`;
}

/* ---------- settle ---------- */
function onSettle(m,seat){
  SETTLE={...m,seat};
  const mine=m.standings.find(x=>x.id===seat);
  SFX.fanfare(!mine||mine.net>=0);
  renderSettle();show('settle');showBanner('');
}
function renderSettle(){
  const m=SETTLE,bb=m.cfg.bb,ds=T.decisions,s=sessionStats(),z=m.cfg.game==='zjh',dz=m.cfg.game==='ddz'||m.cfg.game==='hz',U=dz?'倍底分':z?'倍底注':'BB';
  const ddParts=dz?ddSettleParts(m,ds,s):null;
  const mine=m.standings.find(x=>x.id===m.seat);
  const pr=mine?mine.net:s.pr;
  const cnt=k=>ds.filter(d=>d.grade===k).length;
  const sp=spark(640,220,28);
  const yTicks=[sp.mx,0,sp.mn].filter((v,i,a)=>a.indexOf(v)===i);
  const chart=`<svg class="chart" viewBox="0 0 640 220" role="img" aria-label="每手累计盈亏">
     ${yTicks.map(v=>`<text x="4" y="${sp.Y(v)+4}" fill="var(--muted)" font-size="11" font-family="JetBrains Mono, monospace">${sgn(v)}</text>`).join('')}
     <g transform="translate(40,0) scale(${600/640},1)">${sp.svg}</g>
     <text x="636" y="214" text-anchor="end" fill="var(--muted)" font-size="11">第 ${T.hist.length} 手</text></svg>`;
  const standings=m.standings.slice().sort((a,b)=>b.net-a.net);
  const worst=ds.filter(d=>d.lossBB>0).sort((a,b)=>b.lossBB-a.lossBB).slice(0,5);
  const preDs=ds.filter(d=>d.pre),preDev=preDs.filter(d=>d.grade==='minor'||d.grade==='mistake');
  const tips=[];
  if(dz){
    tips.push(...ddParts.tips);
  }else if(z){
    const blindFold=ds.filter(d=>!d.seen&&d.type==='fold').length,lateLook=ds.filter(d=>!d.seen&&d.rec.type==='look'&&d.type!=='look').length;
    if(blindFold)tips.push(`有 ${blindFold} 次闷牌时直接弃牌。闷牌弃牌等于白送底注，先看一眼再决定也不花钱。`);
    if(lateLook)tips.push(`有 ${lateLook} 次底池已经很大还在闷牌。单注涨上去以后，闷牌的便宜就没了，该看牌了。`);
  }else if(s.hands>=10){
    if(s.vpip>0.38)tips.push(`入池率 ${pct(s.vpip)} 偏高。新手常见问题是玩太多手，建议把入池率控制在 20%–30% 之间，烂牌直接弃。`);
    else if(s.vpip<0.14)tips.push(`入池率 ${pct(s.vpip)} 偏低。过紧会被盲注慢慢吃掉，后位（BTN、CO）可以多玩一些牌。`);
    if(s.vpip>0&&s.pfr/s.vpip<0.4)tips.push(`翻牌前加注率 ${pct(s.pfr)} 远低于入池率，说明你经常只跟注入池。好牌应该主动加注，被动跟注很难赢钱。`);
  }else tips.push('打满 10 手以上，入池率等风格指标才有参考意义。');
  const post=ds.filter(d=>!d.pre&&(!z||d.seen));
  const callBad=post.filter(d=>d.toCall>0&&d.rec.type==='fold'&&d.type!=='fold').length;
  const foldBad=post.filter(d=>d.toCall>0&&d.rec.type!=='fold'&&d.type==='fold').length;
  const passive=post.filter(d=>d.rec.type==='raise'&&(d.type==='call'||d.type==='check')).length;
  if(callBad)tips.push(`${z?'看牌后':'翻牌后'}有 ${callBad} 次在胜率不够时继续跟注或加注。跟注前先算一下：需要的胜率 = 跟注额 ÷（底池 + 跟注额）。`);
  if(foldBad)tips.push(`${z?'看牌后':'翻牌后'}有 ${foldBad} 次胜率足够却弃牌。对手下注不代表他一定有好牌，赔率合适就该跟。`);
  if(passive)tips.push(`有 ${passive} 次牌力领先却只过牌或跟注，错过了价值。强牌要下注，让对手付钱。`);
  if(preDev.length){
    const loose=preDev.filter(d=>d.rec.type==='fold').length,tight=preDev.filter(d=>d.type==='fold'||d.type==='check').length;
    tips.push(`翻牌前有 ${preDev.length} 次偏离 GTO 范围${loose?`，其中 ${loose} 次玩了范围外的牌`:''}${tight?`，${tight} 次放弃了范围内的牌`:''}。对照下方「翻前对照」表，先把开池范围记熟。`);
  }
  if(!dz&&!callBad&&!foldBad&&!passive&&!preDev.length&&ds.length)tips.push('主要决策都和教练模型一致，可以把教练切到「先决定」来检验自己。');
  const vsList=m.standings.filter(p=>p.id!==m.seat).map(p=>({p,v:flowVs(m.flow||{},p.id,m.seat),pr:z?zProfile(p):profile(p)}));
  const worstOpp=vsList.filter(x=>x.v<0).sort((a,b)=>a.v-b.v)[0];
  if(worstOpp&&dz)tips.push(`你在 ${esc(worstOpp.p.name)} 身上输得最多（${sgn(worstOpp.v)}）。`);
  else if(worstOpp)tips.push(`你在 ${esc(worstOpp.p.name)}（${worstOpp.pr.type}${worstOpp.p.kind==='ai'?'，真实风格：'+styleName(worstOpp.p):''}）身上输得最多（${sgn(worstOpp.v)}）。针对这类对手：${z?(ZTIP[worstOpp.pr.key]||ZTIP.unknown):(EXPLOIT_TIP[worstOpp.pr.key==='unknown'&&worstOpp.p.kind==='ai'?worstOpp.p.style:worstOpp.pr.key]||EXPLOIT_TIP.unknown)}`);
  const exFollowed=ds.filter(d=>d.ex&&d.ex.rec&&d.type===d.ex.rec.type&&d.ex.rec.type!==d.rec.type).length;
  const exOffered=ds.filter(d=>d.ex&&d.ex.rec&&d.ex.rec.type!==d.rec.type).length;
  if(exOffered)tips.push(`教练给出了 ${exOffered} 次和 GTO 不同的剥削建议，你采纳了 ${exFollowed} 次。`);
  tips.push('短期盈亏受运气影响很大。几十手牌的输赢说明不了水平，决策正确率和 EV 损失更能反映你打得怎么样。');
  const isHost=NET.role!=='guest';
  const again=NET.role==='solo'?'<button class="btn primary" data-act="again">同样设置再来一场</button><button class="btn" data-act="home">修改设置</button>'
    :NET.role==='host'?'<button class="btn primary" data-act="relobby">回到大厅再来一场</button><button class="btn" data-act="leave">解散房间</button>'
    :'<span class="muted">等待房主开新一场，或</span><button class="btn" data-act="leave">离开房间</button>';
  $('#settle-view').innerHTML=`
   <div class="panel">
     <div class="hero-res">
       <div><div class="muted">${esc(mine?mine.name:'你')} 的本场净收益</div><div class="big ${pr>0?'pos':pr<0?'neg':''}">${sgn(pr)}</div><div class="sub">${(pr/bb).toFixed(1)} ${U} · ${dz?'斗地主':z?'炸金花':'德州扑克'} · 你参与了 ${s.hands} 手${mine&&mine.rebuys?` · 补码 ${mine.rebuys} 次（已计入成本）`:''}</div></div>
       ${dz?ddParts.stats:`<div class="stats" style="grid-template-columns:repeat(4,minmax(0,auto));gap:10px 28px">
         <div class="stat"><div class="k">每百手赢率</div><div class="v">${s.hands?(pr/bb/s.hands*100).toFixed(1):'—'}</div><div class="s">${dz?'底分/100 局':z?'底注/100 手':'BB/100'}</div></div>
         ${z||dz?'':`<div class="stat"><div class="k">入池率 / 翻前加注率</div><div class="v">${pct(s.vpip)} / ${pct(s.pfr)}</div></div>`}
         <div class="stat"><div class="k">赢下的手数</div><div class="v">${s.won}</div></div>
         <div class="stat"><div class="k">决策正确率</div><div class="v">${s.n?pct(s.acc):'—'}</div><div class="s">估算 EV 损失 ${s.loss.toFixed(1)} ${U}</div></div>
       </div>`}
     </div>
     ${m.reason||m.note?`<p class="muted" style="margin:12px 0 0">${esc([m.reason,m.note].filter(Boolean).join(' '))}</p>`:''}
     <div class="setup-actions" style="margin-top:16px">${again}</div>
   </div>
   <div class="panel"><h2>累计盈亏走势</h2>${T.hist.length?chart:'<p class="muted">还没有打完一手牌。</p>'}</div>
   <div class="grid2">
     <div class="panel"><h2>改进建议</h2><ul class="tips" style="margin-top:10px">${tips.map(t=>`<li>${t}</li>`).join('')}</ul></div>
     ${dz?ddParts.review:''}
     <div class="panel" ${dz?'hidden':''}><h2>${z?'决策评分':'翻牌后决策评分'}</h2>
       <div class="row" style="margin:10px 0 14px">${['good','ok','minor','mistake'].map(k=>`<span class="pill ${GRADE[k][1]}">${GRADE[k][0]} ${cnt(k)}</span>`).join('')}</div>
       ${worst.length?`<div class="tbl-wrap"><table><thead><tr><th>手</th><th>${z?'轮':'阶段'}</th><th>手牌</th><th class="r">胜率</th><th class="r">所需</th><th>你</th><th>建议</th><th class="r">损失</th></tr></thead><tbody>
       ${worst.map(d=>`<tr><td class="num">${d.hand}</td><td>${d.game==='zjh'?'第 '+d.round+' 轮':STREET_CN[d.street]}</td><td class="num">${d.cards.length?d.cards.filter(c=>c!=null).map(cardTxt).join(' '):'闷牌'}</td><td class="r num">${pct(d.e)}</td><td class="r num">${d.toCall>0?pct(d.po):'—'}</td><td>${d.action}</td><td>${d.recText}</td><td class="r num neg">${d.lossBB.toFixed(1)} ${U}</td></tr>`).join('')}
       </tbody></table></div><p class="muted" style="font-size:12px;margin:8px 0 0">损失最大的 ${worst.length} 个决定（评分统计包含翻前和翻后全部决定）</p>`:'<p class="muted">没有明显亏损的决定。</p>'}
     </div>
   </div>
   <div class="panel" ${z||dz?'hidden':''}><h2>翻前对照 GTO 范围</h2>
     ${preDs.length?`<p class="muted" style="margin:6px 0 10px">共 ${preDs.length} 次翻前决定，${preDs.length-preDev.length} 次符合或接近 GTO（${pct((preDs.length-preDev.length)/preDs.length)}）。下表是最近的偏离。</p>
     ${preDev.length?`<div class="tbl-wrap"><table><thead><tr><th>手</th><th>位置</th><th>手牌</th><th>你</th><th>GTO</th><th>评价</th></tr></thead><tbody>
     ${preDev.slice(-8).reverse().map(d=>`<tr><td class="num">${d.hand}</td><td>${d.pos}</td><td class="num">${d.pre.key}</td><td>${d.action}</td><td>${d.recText}</td><td><span class="pill ${GRADE[d.grade][1]}">${GRADE[d.grade][0]}</span></td></tr>`).join('')}
     </tbody></table></div>`:'<p class="muted">没有偏离 GTO 范围的翻前决定。</p>'}`:'<p class="muted">还没有翻前决定。</p>'}
     <p class="muted" style="font-size:12px;margin:8px 0 0">翻前偏离只按范围判定，不计入 EV 损失。这些复盘数据只保存在你自己的设备上。</p>
   </div>
   ${dz?`<div class="panel"><h2>对每个对手的输赢</h2><div class="tbl-wrap" style="margin-top:8px"><table><thead><tr><th>玩家</th><th>类型</th><th class="r">局</th><th class="r">当地主</th><th class="r">赢</th><th class="r">对你</th></tr></thead><tbody>${vsList.slice().sort((a,b)=>b.v-a.v).map(({p,v})=>{const st=p.st||{};return `<tr><td>${esc(p.name)}${p.out?' <span class="muted">（离桌）</span>':''}</td><td>${p.kind==='ai'?'电脑 · '+((DD_ARCH[p.ddArch]||{}).name||'—'):'玩家'}</td><td class="r num">${st.dd||0}</td><td class="r num">${st.ddL||0}</td><td class="r num">${st.ddW||0}</td><td class="r num ${v>0?'pos':v<0?'neg':''}">${sgn(v)}</td></tr>`}).join('')}</tbody></table></div><p class="muted" style="font-size:12px;margin:8px 0 0">输赢按每局的筹码流向估算。</p></div>`:''}
   <div class="panel" ${dz?'hidden':''}><h2>对每个对手的输赢</h2>
     <div class="tbl-wrap" style="margin-top:8px"><table><thead><tr><th>玩家</th>${z?Z_PROFILE_HEAD.replace('<th>类型</th>','<th>观察到的类型</th>'):'<th class="r">手</th><th class="r">入池</th><th class="r">加注</th><th class="r">激进</th><th class="r">弃牌</th><th>观察到的类型</th>'}<th>真实风格</th><th class="r">你赢 / 输</th></tr></thead><tbody>
     ${vsList.sort((a,b)=>b.v-a.v).map(({p,v,pr})=>`<tr><td>${esc(p.name)}</td>${z?zProfileRow(p):`<td class="r num">${pr.h}</td><td class="r num">${pr.h?pct0(pr.vpip):'—'}</td><td class="r num">${pr.h?pct0(pr.pfr):'—'}</td><td class="r num">${pr.acts?pr.af.toFixed(1):'—'}</td><td class="r num">${pr.fvb!=null?pct0(pr.fvb):'—'}</td><td><span class="pill ${PROFILE_PILL[pr.key]}">${pr.type}</span></td>`}<td>${p.kind==='ai'?styleName(p)+(p.ai?`（松 ${pct0(p.ai.loosenWide)} · 凶 ${pct0(p.ai.aggr)} · 诈 ${pct0(p.ai.bluff)}）`:''):'真人'}</td><td class="r num ${v>0?'pos':v<0?'neg':''}">${sgn(v)}</td></tr>`).join('')}
     </tbody></table></div>
     <p class="muted" style="font-size:12px;margin:8px 0 0">「观察到的类型」是按统计数据判断的，「真实风格」是电脑实际使用的打法，对照一下你读人准不准。输赢按每手牌的筹码流向估算。</p>
   </div>
   <div class="panel"><h2>筹码账本</h2>
     <p class="muted" style="margin:6px 0 10px">每次补码都算一次买入。净输赢 = 最终筹码 − 总买入，所有人加起来应该正好是 0。${standings.some(p=>p.kind!=='ai')&&standings.some(p=>p.kind==='ai')?'真人和电脑分开小计。':''}</p>
     <div class="tbl-wrap"><table><thead><tr><th>玩家</th><th>类型</th><th class="r">买入次数</th><th class="r">总买入</th><th class="r">最终筹码</th><th class="r">净输赢</th></tr></thead><tbody>
     ${(()=>{
        const row=p=>`<tr><td>${esc(p.name)}${p.id===m.seat?' <span class="muted">（你）</span>':''}${p.out?' <span class="muted">（离桌）</span>':''}</td><td>${p.kind==='ai'?'电脑 · '+(dz?((DD_ARCH[p.ddArch]||{}).name||'—'):styleName(p)):p.kind==='local'?(NET.role==='solo'?'你':'房主'):'玩家'}</td><td class="r num">${1+p.rebuys}</td><td class="r num">${fmt(m.cfg.stack*(1+p.rebuys))}</td><td class="r num">${fmt(p.stack)}</td><td class="r num ${p.net>0?'pos':p.net<0?'neg':''}">${sgn(p.net)}</td></tr>`;
        const sum=(list,label)=>{const b=list.reduce((a,p)=>a+m.cfg.stack*(1+p.rebuys),0),f=list.reduce((a,p)=>a+p.stack,0),n=list.reduce((a,p)=>a+p.net,0);return `<tr><td><b>${label}</b></td><td></td><td class="r num">${list.reduce((a,p)=>a+1+p.rebuys,0)}</td><td class="r num">${fmt(b)}</td><td class="r num">${fmt(f)}</td><td class="r num"><b>${sgn(n)}</b></td></tr>`};
        const hs=standings.filter(p=>p.kind!=='ai'),bs=standings.filter(p=>p.kind==='ai');
        return hs.map(row).join('')+(hs.length&&bs.length?sum(hs,'真人小计'):'')+bs.map(row).join('')+(hs.length&&bs.length?sum(bs,'电脑小计'):'')+sum(standings,'合计（应为 0）');
     })()}
     </tbody></table></div></div>`;
  void isHost;
}

/* ---------- rules ---------- */
function rulesHTML(game){
  if(game==='zjh')return zRulesHTML();
  if(game==='ddz')return ddRulesHTML();
  if(game==='hz')return hzRulesHTML();
  const ex=[[[51,47,43,39,35],'皇家同花顺'],[[33,29,25,21,17],'同花顺'],[[44,45,46,47,6],'四条'],[[40,41,42,13,14],'葫芦'],[[49,37,25,13,5],'同花'],[[35,30,27,20,18],'顺子'],[[28,29,30,51,5],'三条'],[[48,49,20,21,1],'两对'],[[44,45,51,26,9],'一对'],[[51,42,31,22,13],'高牌']];
  return `<h2>规则速查</h2><p class="lead">每人 2 张底牌，桌面最多 5 张公共牌，用其中任意 5 张组成最好的牌。</p>
  <h3>一手牌的流程</h3>
  <ol><li>庄位（D）左边两人下小盲、大盲。</li><li>每人发 2 张底牌，从大盲左边开始第一轮下注（翻牌前）。</li><li>发 3 张公共牌（翻牌），第二轮下注。</li><li>发第 4 张（转牌），第三轮下注。</li><li>发第 5 张（河牌），最后一轮下注。</li><li>还剩多人就亮牌比大小，牌大者赢底池。中途其他人都弃牌，剩下的人直接赢。</li></ol>
  <h3>每次轮到你，可以</h3>
  <dl class="terms"><div><dt>过牌：</dt><dd style="display:inline">没人下注时不花钱，把行动交给下一位。</dd></div><div><dt>跟注：</dt><dd style="display:inline">补齐到当前最高注额。</dd></div><div><dt>下注 / 加注：</dt><dd style="display:inline">投入更多，其他人必须跟上或弃牌。加注至少要加上一次的加注幅度。</dd></div><div><dt>弃牌：</dt><dd style="display:inline">放弃这手牌，已投入的筹码不退。</dd></div><div><dt>全下：</dt><dd style="display:inline">押上所有筹码。只能赢别人跟你同等数额的部分（边池）。</dd></div></dl>
  <h3>牌型从大到小</h3>
  <div class="ranks">${ex.map(([cs,n],i)=>`<div class="rank-row"><span class="i">${i+1}</span><span>${n}</span><span class="mini">${cs.map(c=>cardHTML(c)).join('')}</span></div>`).join('')}</div>
  <h3>教练用到的概念</h3>
  <dl class="terms"><div><dt>胜率：</dt><dd>如果直接发完所有牌，你赢的概率。</dd></div><div><dt>底池赔率：</dt><dd>跟注 ÷（底池 + 跟注）。胜率高于它，长期跟注就赚钱；低于它就该弃牌。比如底池 300、要跟 100，所需胜率 = 100 ÷ 400 = 25%。</dd></div><div><dt>位置：</dt><dd>BTN（庄位）最后行动，信息最多，位置最好；SB、BB、UTG 先行动，位置最差。</dd></div><div><dt>GTO：</dt><dd>博弈论最优策略，对手无论怎么打都无法针对你。这里翻牌前用近似 GTO 的起手牌范围表。</dd></div><div><dt>3-bet / 4-bet：</dt><dd>有人加注后再加注叫 3-bet，再往上叫 4-bet。</dd></div><div><dt>平跟（跛入）：</dt><dd>翻牌前不加注，只跟一个大盲入池。GTO 下除小盲外基本不这样做。</dd></div></dl>`;
}

/* ---------- setup form ---------- */
let MODE='solo',GAME='holdem',seatsDraft=6;
/* a field shows when it belongs to the current tab (data-modes) and the chosen game (data-games) */
function applyVis(){document.querySelectorAll('[data-modes],[data-games]').forEach(el=>{const m=el.dataset.modes,g=el.dataset.games;el.hidden=(m&&!m.split(' ').includes(MODE))||(g&&!g.split(' ').includes(GAME))})}
function setGame(g){GAME=['zjh','ddz','hz'].includes(g)?g:'holdem';document.querySelectorAll('#f-game [data-game]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.game===GAME)));applyVis();updateBB();$('#rules').innerHTML=rulesHTML(GAME);if(MODE!=='join')$('#players-hint').textContent=playersHint()}
const playersHint=()=>GAME==='hz'?'红中麻将固定 4 人。':GAME==='ddz'?'斗地主固定 3 人。':GAME==='zjh'?'炸金花 2 到 9 人都能玩，常见 5、6 人一桌。':MODE==='host'?'座位数包含你和所有真人玩家。真人不够时可以用电脑补位。':'德州扑克 2 到 10 人都能玩，线上常见 6 人桌，线下常见 9 人桌。新手建议 6 人。';
const LEADS={
  solo:'选德州扑克、炸金花或斗地主，和电脑对手同桌。轮到你时教练会给出建议，并给每个决定打分。打完点「结束并结算」查看收益和问题点。',
  host:'你当房主：选好规则后创建房间，把邀请码（互联网）或连接码（局域网）发给朋友。底牌只发给本人，教练建议也只显示在各自设备上。',
  join:'输入房主给你的邀请码，或粘贴局域网连接码。需要和房主用同一个 HTML 文件。'
};
function loadPrefs(){try{return JSON.parse(localStorage.getItem('holdem-prefs')||'null')}catch(e){return null}}
function savePrefs(c){try{localStorage.setItem('holdem-prefs',JSON.stringify(c))}catch(e){}}
function setMode(m){
  MODE=m;
  document.querySelectorAll('.tabs [data-mode]').forEach(b=>b.setAttribute('aria-selected',b.dataset.mode===m));
  applyVis();
  $('#mode-lead').textContent=LEADS[m];
  $('#start-btn').textContent=m==='solo'?'开始对局':m==='host'?'创建房间':'加入房间';
  $('#players-hint').textContent=playersHint();
  $('#setup-err').textContent='';
  syncJoinNet();
}
function syncJoinNet(){
  const lan=$('#f-net-lan').checked;
  if(MODE==='join'){$('#join-internet').hidden=lan;$('#join-lan').hidden=!lan;$('#start-btn').textContent=lan?'生成回复码':'加入房间'}
}
function renderSeg(){$('#f-players').innerHTML=[2,3,4,5,6,7,8,9].map(n=>`<button type="button" data-players="${n}" aria-pressed="${seatsDraft===n}">${n}</button>`).join('')}
function updateBB(){const st=+$('#f-stack').value||0;if(GAME==='hz'){const b=+$('#f-hzbase').value;$('#stack-bb').textContent=st?`= ${Math.round(st/b)} 倍底分`:''}else if(GAME==='ddz'){const b=+$('#f-ddbase').value;$('#stack-bb').textContent=st?`= ${Math.round(st/b)} 倍底分`:''}else if(GAME==='zjh'){const a=+$('#f-ante').value;$('#stack-bb').textContent=st?`= ${Math.round(st/a)} 倍底注`:''}else{const bb=+$('#f-blinds').value.split('/')[1];$('#stack-bb').textContent=st?`= ${Math.round(st/bb)} 个大盲`:''}}
/* a select only takes a value it has an option for; anything else (old prefs, the other game's numbers) keeps the default */
const hasOption=(el,v)=>[...el.options].some(o=>o.value===String(v));
function setSelect(sel,v){const el=$(sel);if(v!=null&&hasOption(el,v))el.value=String(v)}
const selVal=(sel,fallback)=>{const el=$(sel);return el.value&&hasOption(el,el.value)?el.value:fallback};
function readCfg(){
  const z=GAME==='zjh',ante=+selVal('#f-ante','20');
  const [sb,bb]=z?[ante,ante]:selVal('#f-blinds','10/20').split('/').map(Number);
  const hz=GAME==='hz',dz=GAME==='ddz'||hz,base=hz?+selVal('#f-hzbase','20'):+selVal('#f-ddbase','20');
  let stack=Math.round(+$('#f-stack').value)||2000;stack=Math.max(dz?base*20:z?ante*20:bb*10,stack);
  const solo=MODE==='solo';
  return normalizeCfg({game:GAME,base,hzDianpao:$('#f-hzdp').checked,hzRedSelf:$('#f-hzredself').checked,hzQiangGang:$('#f-hzqiang').checked,hzNoRed:$('#f-hznored').checked,hzBirds:+selVal('#f-hzbirds','2'),ddcap:+selVal('#f-ddcap','64'),laizi:$('#f-laizi').checked,ante,zcap:+selVal('#f-zcap','10'),zrounds:+selVal('#f-zrounds','10'),z235:$('#f-z235').checked,players:seatsDraft,stack,sb,bb,style:selVal('#f-style','mixed'),rebuy:$('#f-rebuy').checked,reveal:solo&&$('#f-reveal').checked,showAll:$('#f-showall').checked,auto:$('#f-auto').checked,ff:solo?$('#f-ff').checked:true,speed:selVal('#f-speed','normal'),turnSec:+selVal('#f-turn','15'),coachAuto:$('#f-coachauto').checked,
    coach:$('#f-coach').checked,counter:$('#f-counter').checked,aiFill:solo?true:$('#f-aifill').checked,net:$('#f-net-lan').checked?'lan':'internet'});
}
function fillForm(c){
  if(!c||typeof c!=='object')return;
  const n=Math.round(+c.players);seatsDraft=n>=2&&n<=MAX_SEATS?n:6;
  GAME=['zjh','ddz','hz'].includes(c.game)?c.game:'holdem';
  setSelect(c.game==='hz'?'#f-hzbase':'#f-ddbase',c.base);setSelect('#f-hzbirds',c.hzBirds);
  $('#f-hzdp').checked=!!c.hzDianpao;$('#f-hzredself').checked=c.hzRedSelf!==false;$('#f-hzqiang').checked=c.hzQiangGang!==false;$('#f-hznored').checked=!!c.hzNoRed;setSelect('#f-ddcap',c.ddcap);$('#f-laizi').checked=!!c.laizi;
  setSelect('#f-ante',c.ante);setSelect('#f-zcap',c.zcap);setSelect('#f-zrounds',c.zrounds);$('#f-z235').checked=c.z235!==false;
  const st=Math.round(+c.stack);$('#f-stack').value=st>0?st:2000;
  /* hold'em blinds are saved on their own: a 炸金花 session stores sb=bb=ante, which is not a blinds option */
  setSelect('#f-blinds',c.blinds||(c.game!=='zjh'&&c.sb?`${c.sb}/${c.bb}`:null));
  setSelect('#f-style',c.style);setSelect('#f-speed',c.speed);setSelect('#f-turn',c.turnSec);$('#f-coachauto').checked=c.coachAuto!==false;
  $('#f-rebuy').checked=c.rebuy!==false;$('#f-reveal').checked=!!c.reveal;$('#f-showall').checked=!!c.showAll;$('#f-auto').checked=!!c.auto;$('#f-ff').checked=c.ff!==false;
  $('#f-coach').checked=c.coach!==false;$('#f-counter').checked=c.counter!==false;$('#f-aifill').checked=c.aiFill!==false;
  if(c.net==='lan')$('#f-net-lan').checked=true;
  if(c.name)$('#f-name').value=c.name;
  if(c.gender==='f')$('#f-gender-f').checked=true;
}
/* the first time a device goes online it confirms this is for fun only; asked again if the wording (version) changes */
const TERMS_KEY='dushen-terms-v1';
function termsAccepted(){try{return localStorage.getItem(TERMS_KEY)==='1'}catch(e){return false}}
function askTerms(){
  return new Promise(res=>{
    const bg=document.createElement('div');bg.className='consent-bg';
    bg.innerHTML=`<div class="consent" role="dialog" aria-modal="true" aria-labelledby="consent-t">
      <h2 id="consent-t">联机前请确认</h2>
      <p>赌神智慧树仅供朋友之间娱乐和学习。游戏里的积分（筹码）没有任何价值，不能充值、兑换或转让。</p>
      <p><b>禁止用于赌博或任何形式的金钱结算</b>，包括在游戏外按积分输赢转账、发红包。违反者自行承担全部法律责任，与本游戏作者无关。</p>
      <label class="check"><input type="checkbox" id="consent-ok"><span>我已阅读并同意，只用于娱乐和学习</span></label>
      <div class="setup-actions"><button type="button" class="btn primary" id="consent-yes" disabled>同意并继续</button><button type="button" class="btn" id="consent-no">取消</button></div></div>`;
    document.body.appendChild(bg);
    const done=ok=>{bg.remove();if(ok)try{localStorage.setItem(TERMS_KEY,'1')}catch(e){}res(ok)};
    bg.querySelector('#consent-ok').addEventListener('change',e=>{bg.querySelector('#consent-yes').disabled=!e.target.checked});
    bg.querySelector('#consent-yes').addEventListener('click',()=>done(true));
    bg.querySelector('#consent-no').addEventListener('click',()=>done(false));
    bg.querySelector('#consent-ok').focus();
  });
}
async function submitSetup(){
  const err=$('#setup-err');err.textContent='';
  const name=cleanName($('#f-name').value||(MODE==='solo'?'你':''));
  const gender=$('#f-gender-f').checked?'f':'m';
  actx();
  if(MODE!=='solo'&&!$('#f-name').value.trim()){err.textContent='请先填写昵称，方便其他玩家认出你。';return}
  if(MODE!=='solo'&&!termsAccepted()&&!(await askTerms())){err.textContent='需要同意使用声明才能联机。单机模式不受影响。';return}
  /* online play needs a card from the author: it opens the sealed online code (js/card.js) */
  if(MODE!=='solo'&&!(await ensureOnline())){err.textContent='需要卡号和卡密才能联机。单机模式不受影响。';return}
  NET.needHostCard=MODE==='join';
  const cfg=readCfg();
  /* 斗地主 forces 3 seats and ante = 底分; keep the form's own values so the other games' defaults survive */
  const keep=cfg.game==='ddz'||cfg.game==='hz'?{players:seatsDraft,ante:+selVal('#f-ante','20')}:{};
  savePrefs({...cfg,...keep,blinds:selVal('#f-blinds','10/20'),name:$('#f-name').value.trim(),gender});
  const btn=$('#start-btn');btn.disabled=true;
  try{
    if(MODE==='solo'){NET.role='solo';show('game');startGame(cfg,[{name,kind:'local',gender}])}
    else if(MODE==='host'){await hostCreate(cfg,name,gender)}
    else if(!$('#f-net-lan').checked){
      const code=$('#f-code').value.trim().toUpperCase();
      if(!/^[A-Z0-9]{6}$/.test(code)){err.textContent='邀请码是 6 位字母或数字。';return}
      await withRoom(code,fresh=>runJoin(()=>guestJoinInternet(code,name,gender,fresh)),true);
    }else{
      if(!$('#f-offer').value.trim()){err.textContent='先粘贴房主发给你的连接码。';return}
      let desc;try{desc=await unpackDesc($('#f-offer').value)}catch(x){err.textContent='连接码无效，请让房主重新复制。';return}
      if(desc.room)await withRoom(desc.room,fresh=>runJoin(()=>guestJoinLan(desc,name,gender,fresh)),true);
      else await guestJoinLan(desc,name,gender,false);
    }
  }catch(e){
    const hint=/RTCPeerConnection|WebRTC/i.test(String(e))||typeof RTCPeerConnection==='undefined'?' 联机需要用浏览器直接打开 HTML 文件（在线预览版不支持联机）。':'';
    err.textContent=(e&&e.message?e.message:String(e))+hint;
    if(MODE!=='solo')leaveAll();
  }finally{btn.disabled=false}
}

/* clipboard API first; older file:// contexts fall back to a hidden textarea + execCommand */
async function copyText(v){
  try{await navigator.clipboard.writeText(v);return true}catch(e){}
  try{
    const t=document.createElement('textarea');t.value=v;t.setAttribute('readonly','');t.style.cssText='position:fixed;left:-9999px;top:0';
    document.body.appendChild(t);t.select();const ok=document.execCommand('copy');t.remove();return ok;
  }catch(e){return false}
}
/* joins started after a tab-clash prompt run outside submitSetup, so they report their own errors */
async function runJoin(fn){
  try{await fn()}
  catch(e){$('#setup-err').textContent=e&&e.message?e.message:String(e);leaveAll();show('setup')}
}

/* ---------- events ---------- */
document.addEventListener('click',async e=>{
  const ra=e.target.closest('[data-act="takeover"],[data-act="newid"],[data-act="cancel-room"]');
  if(ra){
    const p=PENDING;PENDING=null;showBanner('');if(!p)return;
    if(ra.dataset.act==='takeover'){await takeoverRoom(p.code,p.role);p.go(false)}
    else if(ra.dataset.act==='newid')p.go(true);
    return;
  }
  const rl=e.target.closest('[data-act="restore-last"],[data-act="drop-last"]');
  if(rl){
    let hs=null;try{hs=JSON.parse(localStorage.getItem('holdem-host-last')||'null')}catch(x){}
    showBanner('');
    if(rl.dataset.act==='drop-last'||!hs){try{localStorage.removeItem('holdem-host-last')}catch(x){}return}
    if(!onlineReady()&&!cardForRestore(hs.at)&&!(await ensureOnline()))return;
    withRoom(hs.code,()=>restoreHost(hs),false,'host');
    return;
  }
  const tab=e.target.closest('.tabs [data-mode]');if(tab){setMode(tab.dataset.mode);return}
  const gb=e.target.closest('#f-game [data-game]');if(gb){setGame(gb.dataset.game);return}
  const pb=e.target.closest('[data-players]');if(pb){seatsDraft=+pb.dataset.players;renderSeg();return}
  /* a tap outside the open action panel closes it */
  if(ACTPOP&&!e.target.closest('#actions .act-pop,[data-act="raise-open"],[data-act="zpop"]'))closeActPop();
  const pr=e.target.closest('[data-preset]');if(pr){const r=$('#raise-amt');if(r){r.value=pr.dataset.preset;syncRaise()}return}
  if(chatPopOpen()&&!e.target.closest('#chat-slot,#chat-bubble'))setChatPop(false);
  if(SEATPOP&&!e.target.closest('#seat-pop,#table .seat[data-pid]'))closeSeatPop();
  const bt=e.target.closest('#table .bet[data-pid],#table .seat[data-pid]');
  if(bt){const pid=+bt.dataset.pid;if(V&&isZ(V)&&bt.classList.contains('seat'))toggleSeatPop(pid);else peekBet(pid);return}
  const vp=e.target.closest('[data-vplay]');
  if(vp){const id=vp.dataset.vplay;if(VMSG.curId===id){stopVoice();nextVoice()}else playVoice(id,true);return}
  const qb=e.target.closest('[data-quick]');if(qb){sendChat(QUICK[+qb.dataset.quick]);if(qb.closest('#chat-slot'))setChatPop(false);return}
  if(e.target.closest('[data-act="chat-toggle"]')){if(!chatPopOpen())closeSheet();setChatPop(!chatPopOpen());return}
  const sh=e.target.closest('[data-sheet]');if(sh){const n=sh.dataset.sheet;if(SHEET&&SHEET.name===n)closeSheet();else openSheet(n);return}
  const st=e.target.closest('[data-sheet-tab]');if(st&&SHEET){openSheet(SHEET.name,st.dataset.sheetTab);return}
  if(e.target.closest('[data-act="sheet-close"]')||e.target.id==='sheet-bg'){closeSheet();return}
  const sb=e.target.closest('[data-snd]');
  if(sb){const k=sb.dataset.snd;LOCAL[k]=!LOCAL[k];try{localStorage.setItem('holdem-'+k,LOCAL[k]?'1':'0')}catch(x){}
    if(k==='voice'&&!LOCAL.voice)try{speechSynthesis.cancel()}catch(x){}
    if(k==='vmsg'&&!LOCAL.vmsg){VMSG.queue=[];if(VMSG.cur&&!VMSG.manual)stopVoice()}
    if(k==='sfx'&&LOCAL.sfx)SFX.chips(2);renderMeta();return}
  const cm=e.target.closest('[data-mode-coach]');if(cm){LOCAL.mode=cm.dataset.modeCoach;try{localStorage.setItem('holdem-coach',LOCAL.mode)}catch(x){}render();return}
  const cp=e.target.closest('[data-copy],[data-copy-text]');
  if(cp){
    const v=cp.dataset.copyText||($(cp.dataset.copy)||{}).value||'';if(!v)return;
    const ok=await copyText(v);
    cp.textContent=ok?'已复制 ✓':'复制失败，请手动选中复制';
    setTimeout(()=>{cp.textContent=cp.dataset.label||'复制'},1600);
    return;
  }
  const la=e.target.closest('[data-lan-accept]');if(la){lanAccept(la.dataset.lanAccept);return}
  const b=e.target.closest('[data-act]');if(!b||b.disabled)return;
  const a=b.dataset.act;
  if(a==='fold')humanAct('fold');
  else if(a==='check')humanAct('check');
  else if(a==='call')humanAct('call');
  else if(a==='raise-open'){if(ACTPOP==='raise')closeActPop();else{ACTPOP='raise';const p=$('#actions .act-pop');if(p)p.hidden=false}}
  else if(a==='zpop'){ACTPOP=ACTPOP===b.dataset.pop?null:b.dataset.pop;renderActions()}
  else if(a==='raise'){const r=$('#raise-amt'),m=me();let v;if(r)v=+r.value;else{const ad=coachOn()&&LOCAL.mode==='live'?getAdvice():null;v=ad&&ad.rec.type==='raise'?ad.rec.to:Math.min(m.bet+m.stack,V.currentBet+V.minRaise)}humanAct('raise',v)}
  else if(a==='allin'){const m=me();if(isZ(V))humanAct('allin');else humanAct('raise',m.bet+m.stack)}
  else if(a==='zlook')humanAct('look');
  else if(a==='zraise')humanAct('raise',+b.dataset.v);
  else if(a==='zcmp'){closeSeatPop();humanAct('compare',+b.dataset.t)}
  else if(a==='ddbid')humanAct('bid',+b.dataset.v);
  else if(a==='hzdiscard'){if(HSEL!=null){const id=HSEL;HSEL=null;humanAct('discard',id)}}
  else if(a==='hzhu')humanAct('hu');
  else if(a==='hzpeng')humanAct('peng');
  else if(a==='hzmgang')humanAct('mgang');
  else if(a==='hzpass')humanAct('pass');
  else if(a==='hzgang')humanAct(b.dataset.t,+b.dataset.k);
  else if(a==='dddbl')humanAct('double',+b.dataset.v);
  else if(a==='ddplay'){const st=ddPickState();if(st.cls){const r=st.readings[+b.dataset.as||0]||st.cls,ids=[...DSEL];DSEL=new Set();humanAct('play',{cards:ids,as:{type:r.type,main:r.main,len:r.len}})}}
  else if(a==='ddpass'){DSEL=new Set();humanAct('pass')}
  else if(a==='ddhint')ddHint();
  else if(a==='ddtakeover'){if(NET.role==='host')ddTakeover(+b.dataset.pid)}
  else if(a==='ddreset'){DSEL=new Set();ddRenderHand();renderActions()}
  else if(a==='next'){if(S&&S.phase==='handover')startHand()}
  else if(a==='rebuy'){if(NET.role==='guest')NET.host.send({t:'rebuy'});else doRebuy(P()[0])}
  /* the host's doRebuy also takes 取消托管 / 下一局加入, so a guest sends the same message */
  else if(a==='untrust'||a==='rejoin'){if(NET.role==='guest')NET.host.send({t:'rebuy'});else if(S)hostBack(P()[0])}
  else if(a==='settle'){if(S)hostSettle('')}
  else if(a==='again'){const cfg=S.cfg,me0=S.players[0];show('game');startGame(cfg,[{name:me0.name,kind:'local',gender:me0.gender}])}
  else if(a==='relobby'){
    const humans=[{name:S.players[0].name,kind:'local',gender:S.players[0].gender,cid:CID}];
    for(const [seat,c] of NET.conns){const p=S.players[seat];if(p&&p.connected){c.seat=null;humans.push({name:p.name,kind:'remote',conn:c,gender:p.gender,cid:p.cid})}}
    LOBBY={cfg:S.cfg,humans:(isD(S)?ddLobbyHumans(humans):humans).slice(0,S.cfg.players)};S=null;V=null;NET.conns.clear();resetT();voiceClear();show('lobby');lobbySync();
  }
  else if(a==='host-start')hostStart();
  else if(a==='fs'){fsTipOff();toggleFS()}
  else if(a==='ddcounter'&&V&&isM(V)&&tableOrient()!=='port')openSheet('coach','coach-main');
  else if(a==='ddcounter'){DCOUNT=!DCOUNT;try{localStorage.setItem('dushen-counter',DCOUNT?'1':'0')}catch(x){}renderMeta()}
  else if(a==='wheel')openWheel();
  else if(a==='lan-new')lanNewSlot();
  /* menu exit: host and solo have unsettled results, so ask first; a guest just leaves */
  else if(a==='menu-home'&&NET.role!=='guest'&&!confirm('还没有结算，确定直接回到主页吗？本局记录不会保存。')){}
  else if(a==='leave'||a==='home'||a==='menu-home'){leaveAll();resetT();showBanner('');show('setup')}
});
/* 红中麻将 hand: a tap picks a tile, a second tap on it discards */
document.addEventListener('click',e=>{const t=e.target.closest&&e.target.closest('#dd-hand [data-hz]');if(t&&V&&isM(V))hzTap(+t.dataset.hz)});
/* 斗地主 hand: a tap picks or unpicks a card; pressing and sliding across cards sets each one like the first */
let DDRAG=null;
document.addEventListener('pointerdown',e=>{
  const c=e.target.closest&&e.target.closest('#dd-hand [data-dd]');if(!c||e.button)return;
  const id=+c.dataset.dd,on=!DSEL.has(id);DDRAG={on,seen:new Set([id]),pid:e.pointerId};ddToggle(id,on);
  /* touch pointers are captured by the first card; release so the slide reaches the others */
  try{if(c.hasPointerCapture&&c.hasPointerCapture(e.pointerId))c.releasePointerCapture(e.pointerId)}catch(x){}
  e.preventDefault();
});
document.addEventListener('pointermove',e=>{
  if(!DDRAG||e.pointerId!==DDRAG.pid)return;
  const el=document.elementFromPoint(e.clientX,e.clientY),c=el&&el.closest&&el.closest('#dd-hand [data-dd]');if(!c)return;
  const id=+c.dataset.dd;if(DDRAG.seen.has(id))return;DDRAG.seen.add(id);ddToggle(id,DDRAG.on);
});
const ddDragEnd=e=>{if(!DDRAG||e.pointerId!==DDRAG.pid)return;DDRAG=null;if(V&&isD(V)&&V.phase==='playing')renderActions()};
document.addEventListener('pointerup',ddDragEnd);document.addEventListener('pointercancel',ddDragEnd);
window.addEventListener('resize',()=>{if(V&&isD(V))ddFitHand()});
function syncRaise(){const r=$('#raise-amt'),b=$('#raise-btn');if(r&&b)b.textContent=`${V.currentBet===0?'下注':'加注到'} ${fmt(+r.value)}`}
document.addEventListener('input',e=>{
  if(e.target.id==='raise-amt')syncRaise();
  if(e.target.id==='f-stack')updateBB();
  const ans=e.target.dataset&&e.target.dataset.ans;if(ans){const s=NET.lanSlots.find(x=>x.id===ans);if(s)s.ans=e.target.value}
});
document.addEventListener('change',e=>{if(e.target.name==='f-net')syncJoinNet()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&REC.click){recStop(true);return}if(e.key==='Escape'&&SEATPOP){closeSeatPop();return}if(e.key==='Escape'&&sheetOpen())closeSheet();if(e.key==='Escape'&&chatPopOpen())setChatPop(false);const b=e.target.closest&&e.target.closest('#table .bet[data-pid],#table .seat[role="button"][data-pid]');if(b&&(e.key==='Enter'||e.key===' ')){e.preventDefault();if(b.classList.contains('seat')){if(V&&isZ(V))toggleSeatPop(+b.dataset.pid)}else peekBet(+b.dataset.pid)}});
/* push-to-talk: hold to record, release to send, release outside the button to cancel */
function pttOutside(x,y){const b=$('#ptt');if(!b)return false;const r=b.getBoundingClientRect();return x<r.left-20||x>r.right+20||y<r.top-30||y>r.bottom+20}
function pttMove(x,y){const out=pttOutside(x,y);if(out!==REC.outside){REC.outside=out;if(REC.rec)updRecBtn((Date.now()-REC.t0)/1000)}}
function pttDown(){REC.pressing=true;REC.outside=false;document.body.classList.add('recording');recStart()}
/* mouse and pen: click to start, click again to send, 取消 above the button to drop it */
document.addEventListener('pointerdown',e=>{
  if(e.pointerType==='touch')return;
  if(e.target.closest('#ptt-x')){e.preventDefault();recStop(true);return}
  if(!e.target.closest('#ptt'))return;
  e.preventDefault();
  if(REC.rec)recStop(false);else if(REC.click)recStop(true);else{REC.click=true;recStart()}
});
/* touch: preventDefault on touchstart stops the long-press text selection / copy menu */
document.addEventListener('touchstart',e=>{if(!e.target.closest('#ptt'))return;e.preventDefault();pttDown()},{passive:false});
document.addEventListener('touchmove',e=>{if(!REC.pressing)return;const t=e.touches[0];if(t)pttMove(t.clientX,t.clientY);e.preventDefault()},{passive:false});
document.addEventListener('touchend',e=>{if(!REC.pressing)return;e.preventDefault();recStop(REC.outside)},{passive:false});
document.addEventListener('touchcancel',()=>{if(REC.pressing)recStop(true)});
document.addEventListener('selectstart',e=>{if(REC.pressing||e.target.closest&&e.target.closest('#ptt'))e.preventDefault()});
document.addEventListener('contextmenu',e=>{if(e.target.closest('#ptt'))e.preventDefault()});
$('#f-blinds').addEventListener('change',updateBB);$('#f-ante').addEventListener('change',updateBB);$('#f-ddbase').addEventListener('change',()=>{$('#f-stack').value=String(100*(+$('#f-ddbase').value||20));updateBB()});
$('#setup-form').addEventListener('submit',e=>{e.preventDefault();submitSetup()});
document.addEventListener('submit',e=>{if(e.target.id!=='chat-form')return;e.preventDefault();const t=$('#chat-text');sendChat(t.value);t.value=''});
/* a turned phone or a clearly resized window lays the table out again. Small changes (a phone's address bar or keyboard)
   are left alone: everything is placed in %, and a re-render would rebuild the buttons and reset a raise slider mid-drag. */
const bigResize=()=>tableOrient()!==FRAME.o||Math.abs(innerWidth-FRAME.w)>FRAME.w*0.1||Math.abs(innerHeight-FRAME.h)>FRAME.h*0.1;
let rT;const reLayout=()=>{clearTimeout(rT);rT=setTimeout(()=>{if(V&&!$('#game-view').hidden&&bigResize()){render();placeBubble()}},150)};
window.addEventListener('resize',reLayout);window.addEventListener('orientationchange',reLayout);
window.addEventListener('beforeunload',()=>{try{NET.host&&NET.host.send({t:'leave'})}catch(e){}});
