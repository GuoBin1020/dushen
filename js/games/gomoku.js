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
  g.over={winner:w,line:line||[],why};g.undo=null;
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
