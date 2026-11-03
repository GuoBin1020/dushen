/* 赌神智慧树 · 五子棋: 15x15, black first, five in a row wins; optional black forbidden points (renju 三三 / 四四 / 长连) */
'use strict';
const isG=st=>!!(st&&st.cfg&&st.cfg.game==='gm');

/* =====================================================================
   Board: 225 cells, i = y*15 + x (x left to right, y top to bottom); 0 empty, 1 black, 2 white.
   Written as plain functions on the board only, so gomoku-ai.js can paste their source into a Web Worker.
   ===================================================================== */
const GM_N=15;
const GM_DIRS=[[1,0],[0,1],[1,1],[1,-1]];
const gmIdx=(x,y)=>y*15+x;
/* F9: columns A-O left to right, rows 15-1 top to bottom */
const gmPos=i=>'ABCDEFGHIJKLMNO'[i%15]+(15-Math.floor(i/15));
/* the run of `c` through i along direction d (i itself counts as c): its length and cells */
function gmRun(b,i,c,d){
  const x0=i%15,y0=Math.floor(i/15),cells=[i];
  for(const s of [1,-1]){let x=x0+d[0]*s,y=y0+d[1]*s;while(x>=0&&x<15&&y>=0&&y<15&&b[y*15+x]===c){cells.push(y*15+x);x+=d[0]*s;y+=d[1]*s}}
  return cells;
}
/* does `c` at i make five? line: the five (an exact five first), over: only an overline (6+) */
function gmFive(b,i,c){
  let exact=null,long=null;
  for(const d of GM_DIRS){const r=gmRun(b,i,c,d);if(r.length===5&&!exact)exact=r;else if(r.length>5&&!long)long=r}
  const line=exact||long;
  return {win:!!line,line:line?line.sort((a,b2)=>a-b2):[],over:!exact&&!!long};
}
/* the empty points along d (within 4 of p) where black would make exactly five together with p */
function gmFivePoints(b,p,d){
  const out=[],x0=p%15,y0=Math.floor(p/15);
  for(let k=-4;k<=4;k++){
    if(!k)continue;const x=x0+d[0]*k,y=y0+d[1]*k;if(x<0||x>14||y<0||y>14)continue;const q=y*15+x;if(b[q])continue;
    b[q]=1;const r=gmRun(b,q,1,d);b[q]=0;if(r.length===5&&r.includes(p))out.push(k);
  }
  return out;
}
/* fours made by p along d: two five-points five apart are one straight four (.XXXX.), any others count apart */
function gmFours(b,p,d){
  const ks=gmFivePoints(b,p,d);if(ks.length<2)return ks.length;
  let n=ks.length;for(let a=0;a<ks.length;a++)for(let c=a+1;c<ks.length;c++)if(Math.abs(ks[a]-ks[c])===5)n--;
  return n;
}
/* black at i is forbidden: '' (allowed, or it makes an exact five), '长连', '四四' or '三三'. Full renju rule for threes:
   a three counts only if one of its points makes a straight four and that point is not itself forbidden (checked again,
   with p on the board). depth caps the recursion. */
function gmForbid(b,i,depth){
  depth=depth||0;if(b[i])return '';
  b[i]=1;let res='';
  try{
    const runs=GM_DIRS.map(d=>gmRun(b,i,1,d).length);
    if(runs.includes(5))return '';
    if(runs.some(n=>n>5))return res='长连';
    const fours=GM_DIRS.map(d=>gmFours(b,i,d));
    if(fours.reduce((a,n)=>a+n,0)>=2)return res='四四';
    let threes=0;
    GM_DIRS.forEach((d,k)=>{if(!fours[k]&&gmRealThree(b,i,d,depth))threes++});
    if(threes>=2)res='三三';
    return res;
  }finally{b[i]=0}
}
/* p (black, on the board) has a real three along d: some empty q near p makes a straight four through p and q is allowed */
function gmRealThree(b,p,d,depth){
  const x0=p%15,y0=Math.floor(p/15);
  for(let k=-4;k<=4;k++){
    if(!k)continue;const x=x0+d[0]*k,y=y0+d[1]*k;if(x<0||x>14||y<0||y>14)continue;const q=y*15+x;if(b[q])continue;
    b[q]=1;const ks=gmFivePoints(b,p,d),straight=ks.length>=2&&ks.some(a=>ks.some(c=>c-a===5));b[q]=0;
    if(!straight)continue;
    if(depth>=3||!gmForbid(b,q,depth+1))return true;
  }
  return false;
}
/* the result of `c` at i: 'win', 'forbid:<name>' (black only, when the rule is on) or '' */
function gmWinner(b,i,c,forbid){
  if(c===1&&forbid){const f=gmForbid(b,i);if(f)return 'forbid:'+f}
  const f5=gmFive(b,i,c);
  return f5.win&&!(c===1&&forbid&&f5.over)?'win':'';
}

/* =====================================================================
   The game: two seats, S.gm holds the board. Black alternates by the rules (the loser takes black, a draw swaps);
   the computer thinks off the page (gmThink), and a late answer is dropped by comparing S.gm.seq.
   ===================================================================== */
const gmColor=pid=>pid===S.gm.black?1:2;
const gmOther=pid=>P().find(p=>p.id!==pid).id;
const gmEv=(p,o)=>{S.ev={seq:(S.ev?S.ev.seq:0)+1,pid:p?p.id:-1,...o}};
function gmStart(live){
  S.handNo++;S.board=[];S.msg='';clearTimeout(timer);
  const prev=S.gm,ids=P().map(p=>p.id);let black;
  if(!prev){const bot=P().find(isBot);black=bot?(S.cfg.gmFirst==='ai'?bot.id:P().find(p=>!isBot(p)).id):ids[Math.random()<0.5?0:1]}
  else if(prev.over&&prev.over.winner>=0)black=gmOther(prev.over.winner);
  else black=gmOther(prev.black);
  P().forEach(p=>{p.lastAction=''});
  S.gm={board:new Array(225).fill(0),moves:[],black,over:null,undo:null,undoLeft:Object.fromEntries(ids.map(i=>[i,3])),seq:0,last:-1};
  Object.assign(S,{phase:'playing',toAct:black,street:'gm',currentBet:0,minRaise:0,raises:0,preRaisers:[],sbId:-1,bbId:-1});
  log(`第 ${S.handNo} 盘，${P()[black].name} 执黑先下`,'sep');
  gmProceed();
}
/* whoever is to move: bots and the clock are scheduled here; a pending 悔棋 request holds the clock for 15 s */
function gmProceed(resume){
  if(S.phase!=='playing'||!S.gm)return;
  const g=S.gm,mark=++g.seq;clearTimeout(timer);S.turnEnd=0;
  if(g.undo){timer=setTimeout(()=>{if(S&&S.gm===g&&g.seq===mark&&g.undo)gmAct(P()[gmOther(g.undo.by)],'undoNo')},Math.max(0,g.undo.until-Date.now()));return sync()}
  const p=P()[S.toAct],still=()=>S&&S.gm===g&&g.seq===mark&&S.phase==='playing'&&!g.undo&&S.toAct===p.id;
  turnTimer(p,still,gmBotTurn,gmAutoMove,Math.max(400,(p.discAt||0)+DISC_GRACE-Date.now()));
  /* back from a refused 悔棋: the clock goes on from where it stopped */
  if(resume>0&&S.turnEnd&&!isBot(p)&&present(p)&&!p.trust){clearTimeout(timer);S.turnEnd=Date.now()+resume;
    timer=setTimeout(()=>{if(still())turnOut(p)},resume)}
  sync();
}
/* the engine off the page: a Worker built from the rule and engine sources (works from file:// and the one-file build);
   no Worker, or it fails: the same search here and now */
let GM_AI=null,GM_W=null,GM_WID=0;const GM_CB={};
function gmWorker(){
  if(GM_W!==null)return GM_W;
  try{
    const src=`'use strict';const GM_DIRS=${JSON.stringify(GM_DIRS)};${[gmRun,gmFive,gmFivePoints,gmFours,gmForbid,gmRealThree,gmAiModule].map(f=>f.toString()).join('\n')}
      const AI=gmAiModule();onmessage=e=>{const d=e.data;postMessage({id:d.id,r:AI.search(d.board,d.color,d.opt)})};`;
    GM_W=new Worker(URL.createObjectURL(new Blob([src],{type:'text/javascript'})));
    GM_W.onmessage=e=>{const cb=GM_CB[e.data.id];delete GM_CB[e.data.id];if(cb)cb(e.data.r)};
    GM_W.onerror=()=>{GM_W=false};
  }catch(e){GM_W=false}
  return GM_W;
}
function gmThink(board,color,opt,cb){
  const w=typeof Worker!=='undefined'&&typeof Blob!=='undefined'&&typeof URL!=='undefined'?gmWorker():false;
  if(w){const id=++GM_WID;GM_CB[id]=cb;w.postMessage({id,board:board.slice(),color,opt});return}
  if(!GM_AI)GM_AI=gmAiModule();cb(GM_AI.search(board,color,opt));
}
/* a computer seat, or 托管 (the coach's own engine); the answer counts only if nothing moved in between */
function gmMoveFor(p,opt){
  const g=S.gm;if(!g||g.over||S.toAct!==p.id)return;
  const mark=g.seq;g.thinking=p.id;
  gmThink(g.board,gmColor(p.id),{forbid:!!S.cfg.gmForbid,...opt},r=>{
    if(!S||S.gm!==g||g.seq!==mark||g.over||S.toAct!==p.id||g.undo)return;
    g.thinking=-1;if(r&&r.move!=null)gmPlace(p,r.move);
  });
}
const gmBotTurn=p=>gmMoveFor(p,{level:S.cfg.gmLevel||'normal'});
const gmAutoMove=p=>gmMoveFor(p,{level:'hell',maxMs:2000});
const gmFull=b=>!b.includes(0);
/* black to move with the rule on and only forbidden points left (checked once few are left) */
function gmBlackStuck(g){
  if(!S.cfg.gmForbid||gmColor(S.toAct)!==1)return false;
  const empty=[];g.board.forEach((v,i)=>{if(!v)empty.push(i)});
  return empty.length<=40&&empty.every(i=>gmForbid(g.board,i));
}
function gmPlace(p,i){
  const g=S.gm;
  if(S.phase!=='playing'||!g||g.over||g.undo||S.toAct!==p.id||!Number.isInteger(i)||i<0||i>=225||g.board[i])return sync();
  const c=gmColor(p.id),res=gmWinner(g.board,i,c,!!S.cfg.gmForbid);
  if(res.startsWith('forbid:')){gmEv(p,{type:'forbid',forbid:res.slice(7)});return sync()}
  g.board[i]=c;g.moves.push(i);g.last=i;g.thinking=-1;
  p.lastAction=`落子 ${gmPos(i)}`;log(`${p.name}（${c===1?'黑':'白'}）：${gmPos(i)}`);gmEv(p,{type:'place',i});
  if(res==='win')return gmEnd(p.id,'five',gmFive(g.board,i,c).line);
  S.toAct=gmOther(p.id);
  if(gmFull(g.board)||gmBlackStuck(g))return gmEnd(-1,'draw',[]);
  gmProceed();
}
function gmEnd(w,why,line){
  const g=S.gm;clearTimeout(timer);
  g.over={winner:w,line:line||[],why};g.undo=null;(S.gmGames||(S.gmGames=[])).push({n:S.handNo,winner:w,why,black:g.black});
  if(w>=0){const W=P()[w],L=P()[gmOther(w)];W.gw=(W.gw||0)+1;L.gl=(L.gl||0)+1;
    S.msg=why==='resign'?`${L.name} 认输，${W.name} 赢了这一盘`:`${W.name} 连成五子，赢了这一盘`;gmEv(W,{type:'win',why})}
  else{P().forEach(p=>{p.gd=(p.gd||0)+1});S.msg='和棋';gmEv(null,{type:'draw'})}
  log(S.msg,'win-l');
  S.toAct=-1;S.turnEnd=0;
  endHand();
}
/* 悔棋. Alone: on my turn, back to before my last move (the computer's reply goes too). Against a person: right after
   my move, ask; the other answers 同意 / 不同意 (15 s, then 不同意); 3 asks a game; not while they are on 托管 or away. */
function gmUndo(p){
  const g=S.gm,opp=P()[gmOther(p.id)],c=gmColor(p.id),lastC=g.moves.length?g.board[g.moves[g.moves.length-1]]:0;
  if(isBot(opp)){
    if(S.toAct!==p.id||!g.moves.some(i=>g.board[i]===c))return sync();
    while(g.moves.length){const i=g.moves.pop();const was=g.board[i];g.board[i]=0;if(was===c)break}
    g.last=g.moves.length?g.moves[g.moves.length-1]:-1;log(`${p.name} 悔棋`);gmEv(p,{type:'undo'});return gmProceed();
  }
  if(S.toAct!==opp.id||lastC!==c||g.undo||!(g.undoLeft[p.id]>0))return sync();
  if(opp.trust||!present(opp)){log(`${opp.name} ${opp.trust?'托管中':'不在线'}，不能同意悔棋`);gmEv(p,{type:'undoNo',auto:true});return sync()}
  g.undoLeft[p.id]--;
  const left=S.turnEnd?Math.max(0,S.turnEnd-Date.now()):0;
  g.undo={by:p.id,until:Date.now()+15000,left};log(`${p.name} 申请悔棋`);gmEv(p,{type:'undoAsk'});
  gmProceed();
}
function gmUndoAnswer(p,yes){
  const g=S.gm,u=g.undo;if(!u||p.id===u.by)return sync();
  g.undo=null;
  if(yes){const i=g.moves.pop();g.board[i]=0;g.last=g.moves.length?g.moves[g.moves.length-1]:-1;S.toAct=u.by;
    log(`${p.name} 同意悔棋`);gmEv(p,{type:'undoYes'});return gmProceed()}
  log(`${p.name} 不同意悔棋`);gmEv(p,{type:'undoNo'});gmProceed(u.left);
}
function gmAct(p,type,arg){
  const g=S.gm;if(!g||S.phase!=='playing'||g.over||!p)return sync();
  if(type==='place')return gmPlace(p,arg);
  if(type==='undo')return gmUndo(p);
  if(type==='undoYes'||type==='undoNo')return gmUndoAnswer(p,type==='undoYes');
  if(type==='resign'){log(`${p.name} 认输`);return gmEnd(gmOther(p.id),'resign',[])}
  sync();
}
/* everything is public in 五子棋 */
function gmPublic(g){
  return {board:g.board.slice(),moves:g.moves.slice(),black:g.black,over:g.over?{...g.over,line:g.over.line.slice()}:null,last:g.last,
    undo:g.undo?{by:g.undo.by,left:Math.max(0,g.undo.until-Date.now())}:null,undoLeft:{...g.undoLeft},thinking:g.thinking!=null?g.thinking:-1};
}
/* the rules panel */
function gmRulesHTML(){
  return `<h2>五子棋规则</h2><p class="lead">15×15 的棋盘，黑棋先下，黑白轮流在交叉点上落子。横、竖、斜任意方向先连成五个同色棋子的一方赢。</p>
  <h3>一盘棋</h3>
  <ul><li>落下的棋子不能移动。点一个空位先出现预览，再点一次才落下。</li>
  <li>棋盘下满还没人连成五个，算和棋。</li>
  <li>不开禁手时，连成六个或更多也算赢。</li>
  <li>可以认输，认输算对方赢一盘。</li></ul>
  <h3>谁执黑</h3>
  <ul><li>第一盘：单机时开局前自己选；联机时随机。</li><li>之后每盘：上一盘输的一方执黑；和棋就交换黑白。</li></ul>
  <h3>黑棋禁手（开关）</h3>
  <p>黑棋先下优势很大，打开「黑棋禁手」后黑棋不能下这三种点：</p>
  <dl class="terms"><div><dt>三三：</dt><dd style="display:inline">一步同时形成两个活三。</dd></div><div><dt>四四：</dt><dd style="display:inline">一步同时形成两个四。</dd></div><div><dt>长连：</dt><dd style="display:inline">连成六个或更多。</dd></div></dl>
  <p class="muted" style="font-size:12.5px">一步同时连成五个照样算赢，不算禁手。白棋没有禁手。下到禁手点时会提示，这一步不算。</p>
  <h3>悔棋</h3>
  <ul><li>单机：轮到你时随时可以悔棋，连同电脑的应手一起撤回。</li><li>联机：自己刚下完、对方还没落子时可以申请，对方同意才悔；15 秒不回应算不同意；每人每盘最多 3 次。</li></ul>
  <h3>计分</h3><p>不用筹码，只记每个人赢、输、和了几盘，结算时显示比分。</p>`;
}

/* =====================================================================
   The board on this device: a flat wooden square (no 3D table), the two players beside it. Tap a point for a preview
   stone, tap it again to place (GM_SEL is the preview). gmLayout sizes everything from the room actually left, after
   the corner buttons and the action bar are drawn.
   ===================================================================== */
let GM_SEL=null,GM_RESIGN=0;
const GM_M=22,GM_C=20,GM_V=GM_M*2+GM_C*14;/* SVG units: margin, cell, whole board */
const gmXY=i=>[GM_M+(i%15)*GM_C,GM_M+Math.floor(i/15)*GM_C];
function gmBoardSVG(v){
  const g=v.gm,win=new Set(g.over?g.over.line:[]),mine=v.toAct===v.me&&v.phase==='playing'&&!g.over&&!g.undo;
  let s=`<svg viewBox="0 0 ${GM_V} ${GM_V}" role="grid" aria-label="五子棋棋盘">`;
  for(let k=0;k<15;k++){const p=GM_M+k*GM_C,e=GM_M+14*GM_C;
    s+=`<line x1="${GM_M}" y1="${p}" x2="${e}" y2="${p}" class="gm-line"/><line x1="${p}" y1="${GM_M}" x2="${p}" y2="${e}" class="gm-line"/>`;
    s+=`<text x="${p}" y="${GM_M-9}" class="gm-lab">${'ABCDEFGHIJKLMNO'[k]}</text><text x="${GM_M-12}" y="${p+3}" class="gm-lab">${15-k}</text>`}
  for(const i of [48,56,112,168,176]){const [x,y]=gmXY(i);s+=`<circle cx="${x}" cy="${y}" r="2.6" class="gm-star"/>`}
  g.board.forEach((c,i)=>{if(!c)return;const [x,y]=gmXY(i);
    s+=`<circle cx="${x}" cy="${y}" r="8.8" class="gm-stone ${c===1?'b':'w'}${win.has(i)?' gm-win':''}" data-at="${i}"/>`;
    if(i===g.last&&!win.size)s+=`<circle cx="${x}" cy="${y}" r="2.6" class="gm-last"/>`});
  if(GM_SEL!=null&&mine&&!g.board[GM_SEL]){const [x,y]=gmXY(GM_SEL);s+=`<circle cx="${x}" cy="${y}" r="8.8" class="gm-ghost ${gmColorV(v,v.me)===1?'b':'w'}" data-gi="${GM_SEL}"/>`}
  s+=typeof gmCandSVG==='function'?gmCandSVG(v):'';
  /* the tap targets go last, on top */
  for(let i=0;i<225;i++){const [x,y]=gmXY(i);s+=`<rect x="${x-GM_C/2}" y="${y-GM_C/2}" width="${GM_C}" height="${GM_C}" class="gm-hit" data-gi="${i}"${mine&&!g.board[i]?'':' aria-disabled="true"'}/>`}
  return s+'</svg>';
}
const gmColorV=(v,pid)=>pid===v.gm.black?1:2;
function gmSeatHTML(v,p){
  const g=v.gm,c=g?gmColorV(v,p.id):0,tg=(p.kind==='remote'&&!p.connected)||p.trust;
  const st=v.phase==='playing'&&g&&!g.over?(g.thinking===p.id?'思考中…':v.toAct===p.id?'轮到落子':''):'';
  const cls=['seat','gm-seat',p.id===v.me?'me':'',v.toAct===p.id&&v.phase==='playing'?'active':'',g&&g.over&&g.over.winner===p.id?'win':''].join(' ');
  return `<div class="${cls}${seatCls({x:50,y:50},true,p.id)}" data-pid="${p.id}">
    <div class="stop">${avatarHTML(p)}<span class="gm-mark ${c===1?'b':'w'}" title="${c===1?'执黑':'执白'}"></span></div>
    <div class="plate"><div class="pname">${esc(p.name)}${p.id===v.me&&NET.role!=='solo'?'（你）':''}</div>
      <div class="ptag">${c===1?'执黑':'执白'}${seatTag(p)?' · '+esc(seatTag(p)):''}</div>
      <div class="pstack">${p.gw||0} 胜 ${p.gl||0} 负${p.gd?` ${p.gd} 和`:''}</div>
      <div class="pact${tg?' tg':''}">${esc([tg?'托管中':'',st||p.lastAction||''].filter(Boolean).join(' · '))}</div></div></div>`;
}
function gmRenderTable(){
  const v=V,o=tableOrient();tableFrame(o,'gm');
  const T=$('#table'),hand=$('#dd-hand');if(hand)hand.hidden=true;
  T.classList.add('gm');T.classList.remove('ddz','hz','zjh');
  if(!v.gm){T.innerHTML='';return}
  if(GM_SEL!=null&&(v.toAct!==v.me||v.gm.board[GM_SEL]))GM_SEL=null;
  /* the other player first (top / left), me second (bottom / right) */
  const ps=[...v.players].sort((a,b)=>(a.id===v.me)-(b.id===v.me));
  T.innerHTML=`${ps.map(p=>gmSeatHTML(v,p)).join('')}<div class="gm-board">${gmBoardSVG(v)}</div>`;
  T.dataset.n='2';
  gmLayout();
}
/* sizes from what is free: upright the board fills the width between the other player (top) and me (bottom, above the
   buttons); sideways it fills the height, the other player on the left, me and the buttons on the right */
function gmLayout(){
  const T=$('#table'),bd=T&&T.querySelector('.gm-board');if(!bd||!V||!isG(V))return;
  const gv=$('#game-view'),tr=T.getBoundingClientRect(),W=tr.width,H=tr.height,o=tableOrient();
  const seats=[...T.querySelectorAll('.gm-seat')],opp=seats[0],me=seats[1];if(!opp||!me)return;
  const corners=[...document.querySelectorAll('.corner > *')].filter(e=>e.offsetWidth).map(e=>{const r=e.getBoundingClientRect();return {x:r.left-tr.left,y:r.top-tr.top,w:r.width,h:r.height}});
  const ov=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
  const put=(el,x,y)=>{el.style.left=Math.round(x)+'px';el.style.top=Math.round(y)+'px'};
  if(o==='port'){
    gv.style.removeProperty('--gm-side-w');
    const top0=Math.max(8,...corners.map(c=>c.y+c.h+6)),act=$('#actions'),ar=act&&act.offsetHeight?act.getBoundingClientRect():null;
    const hint=act&&act.querySelector('.act-hint'),hr=hint&&hint.offsetHeight?hint.getBoundingClientRect():null;
    const bot0=(hr?Math.min(hr.top,ar.top):ar?ar.top:tr.bottom)-tr.top-6;
    const oh=opp.offsetHeight,mh=me.offsetHeight,avail=bot0-top0-oh-mh-16,size=Math.max(180,Math.min(W-12,avail));
    const by=top0+oh+8+Math.max(0,(avail-size)/2);
    put(opp,(W-opp.offsetWidth)/2,by-oh-8);put(me,(W-me.offsetWidth)/2,by+size+8);
    bd.style.width=bd.style.height=Math.round(size)+'px';put(bd,(W-size)/2,by);
  }else{
    let top0=8,size=Math.min(H-16,W-2*150);
    for(let k=0;k<2;k++){const box={x:(W-size)/2,y:top0,w:size,h:size};const hit=corners.filter(c=>ov(c,box));if(!hit.length)break;
      top0=Math.max(...hit.map(c=>c.y+c.h+6));size=Math.min(H-top0-8,W-2*150)}
    const bx=(W-size)/2,side=Math.max(120,bx-24);
    gv.style.setProperty('--gm-side-w',Math.round(side)+'px');
    bd.style.width=bd.style.height=Math.round(size)+'px';put(bd,bx,top0+(H-top0-8-size)/2);
    put(opp,(bx-opp.offsetWidth)/2,Math.max(top0,H*0.32-opp.offsetHeight/2));
    put(me,bx+size+(W-bx-size-me.offsetWidth)/2,Math.max(top0,H*0.32-me.offsetHeight/2));
  }
  if(typeof placeBubble==='function')placeBubble();
}
/* a tap on the board: preview, then place */
function gmTap(i){
  const v=V;if(!v||!isG(v)||!v.gm||v.phase!=='playing'||v.toAct!==v.me||v.gm.over||v.gm.undo||v.gm.board[i])return;
  if(GM_SEL===i){GM_SEL=null;humanAct('place',i);return}
  GM_SEL=i;gmRenderTable();
}
function gmRenderActions(el,m){
  const v=V,g=v.gm;if(!g)return el.innerHTML=actWait('…');
  const opp=v.players.find(p=>p.id!==v.me),myC=gmColorV(v,v.me),bot=opp&&opp.kind==='ai';
  const last=g.moves.length?g.board[g.moves[g.moves.length-1]]:0;
  const canUndo=bot?v.toAct===v.me&&g.moves.some(i=>g.board[i]===myC):v.toAct===opp.id&&last===myC&&!g.undo&&g.undoLeft[v.me]>0;
  const resign=`<button class="btn b-gray" data-act="gmresign">${GM_RESIGN>Date.now()?'确认认输？':'认输'}</button>`;
  const undoBtn=`<button class="btn b-yellow" data-act="gmundo"${canUndo?'':' disabled'}>悔棋${bot?'':`（剩 ${g.undoLeft[v.me]||0} 次）`}</button>`;
  if(g.undo&&g.undo.by!==v.me){const p=v.players[g.undo.by];
    el.innerHTML=actHTML(`${esc(p.name)} 想悔棋（撤回刚下的那一步），同意吗？${Math.ceil(g.undo.left/1000)} 秒内不回应算不同意。`,
      `<button class="btn b-gray" data-act="gmno">不同意</button><button class="btn b-green" data-act="gmyes">同意</button>`);return gmLayout()}
  if(g.undo){el.innerHTML=actHTML('已申请悔棋，等对方同意……',resign);return gmLayout()}
  const tip=typeof gmCoachTip==='function'?gmCoachTip(v):'';
  if(v.toAct===v.me)el.innerHTML=actHTML(tip||(GM_SEL!=null?`再点一次 ${gmPos(GM_SEL)} 落子，点别处换位置`:'点一个空位出现预览，再点一次落子'),`${undoBtn}${resign}`);
  else{const p=v.players[v.toAct],wait=p&&p.kind==='remote'&&!p.connected?`${esc(p.name)} 掉线了，等他重连…`:p?`等 ${esc(p.name)} 落子…`:'…';
    el.innerHTML=actHTML('',`<span class="act-wait">${wait}</span>${bot?'':undoBtn}${resign}`)}
  gmLayout();
}
/* the end of a game in the action bar */
function gmOverText(v){
  const o=v.gm&&v.gm.over;if(!o)return '';
  return o.winner<0?'这盘和棋。':o.winner===v.me?`你赢了这一盘${o.why==='resign'?'（对方认输）':''}！`:`这盘你输了${o.why==='resign'?'（认输）':''}。`;
}
/* sounds and tips from the host's events */
function gmFx(v,ev){
  const p=v.players[ev.pid],g=p?p.gender:'m';
  if(ev.type==='place'){SFX.chips(1);if(ev.pid===v.me&&typeof gmRecordMine==='function')gmRecordMine(v,ev)}
  else if(ev.type==='forbid'){if(ev.pid===v.me){SFX.check();toast(`禁手：${ev.forbid}，这一步不能下`,2200)}}
  else if(ev.type==='win'){if(ev.pid===v.me)SFX.win();else SFX.fold();say(ev.why==='resign'?'认输':'五连',g)}
  else if(ev.type==='undoAsk'&&ev.pid!==v.me){SFX.ding();toast(`${p?p.name:'对方'} 想悔棋`,2000)}
  else if(ev.type==='undoNo'&&ev.pid!==v.me&&!ev.auto)toast('对方不同意悔棋',1800);
  else if(ev.type==='undoNo'&&ev.auto&&ev.pid===v.me)toast('对方托管中或不在线，不能悔棋',2000);
  else if(ev.type==='undoYes')toast('悔棋了',1400);
}
