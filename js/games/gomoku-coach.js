/* 赌神智慧树 · 五子棋 coach: the best three points with their reasons and how they were worked out, the rings on the board,
   the coach panel, the review of my own moves and the settlement */
'use strict';
/* the last advice on this device, keyed by the position (game, move count, seat, last move) */
let GM_ADV={key:'',r:null,busy:'',cbs:[]};
const gmAdvKey=v=>[v.handNo,v.gm.moves.length,v.me,v.gm.moves[v.gm.moves.length-1]].join('|');
const gmLocalAI=()=>GM_AI||(GM_AI=gmAiModule());
const gmScoreTxt=s=>s>=5e6?'必胜':s<=-5e6?'必输':String(Math.round(s));
/* the coach always uses the strongest engine (地狱), whatever the other side plays at */
function gmAdviseBoard(board,color,forbid,cb,maxMs){
  gmThink(board,color,{level:'hell',maxMs:maxMs||2000,forbid},r=>{
    const ai=gmLocalAI();
    const best=(r.cands||[]).slice(0,3).map(c=>{const e=ai.explain(board,color,c.i,forbid);return {i:c.i,pos:gmPos(c.i),score:c.score,why:e.text,lose:e.lose}});
    const text=r.depth?`往后推算了 ${r.depth} 步（双方各 ${r.depth/2} 步），检查了 ${r.nodes} 个局面，用时 ${(r.ms/1000).toFixed(1)} 秒。`
      :'这一步是必下的（自己能成五，或者必须挡住对方的四），不用往后推算，只比较了当前局面里的候选点。';
    cb({best,depth:r.depth,nodes:r.nodes,ms:r.ms,text});
  });
}
function gmAdvise(v,cb){
  const key=gmAdvKey(v);
  if(GM_ADV.key===key&&GM_ADV.r)return cb(GM_ADV.r);
  if(GM_ADV.busy===key){GM_ADV.cbs.push(cb);return}
  GM_ADV={key:'',r:null,busy:key,cbs:[cb]};
  gmAdviseBoard(v.gm.board,gmColorV(v,v.me),!!v.cfg.gmForbid,r=>{const cbs=GM_ADV.busy===key?GM_ADV.cbs:[cb];GM_ADV={key,r,busy:'',cbs:[]};cbs.forEach(f=>f(r))});
}
/* a move I made: was it the coach's first choice, and did it lose on the spot (the other side can win at once, or a
   four of theirs was left open) */
function gmReview(board,color,i,forbid){const e=gmLocalAI().explain(board,color,i,forbid);return {bad:e.lose,text:e.text}}
let GM_REV=null;
function gmRecordMine(v,ev){
  const g=v.gm,before=g.board.slice(),color=gmColorV(v,v.me);before[ev.i]=0;
  const T0=T.gm||(T.gm={n:0,match:0,bad:0}),rv=gmReview(before,color,ev.i,!!v.cfg.gmForbid);
  T0.n++;if(rv.bad)T0.bad++;
  const key=[v.handNo,g.moves.length-1,v.me,g.moves[g.moves.length-2]].join('|');
  const done=r=>{const top=r.best[0],hit=!!top&&top.i===ev.i;if(hit)T0.match++;
    GM_REV={pos:gmPos(ev.i),hit,bad:rv.bad,why:rv.text,best:top?top.pos:'',bestWhy:top?top.why:''};if(V&&isG(V))renderCoach()};
  /* the coach's own answer when it has one (or is working it out now); otherwise a short look, so the review never keeps
     the other side's reply waiting behind a 2-second job */
  if(GM_ADV.key===key&&GM_ADV.r)done(GM_ADV.r);else if(GM_ADV.busy===key)GM_ADV.cbs.push(done);else gmAdviseBoard(before,color,!!v.cfg.gmForbid,done,300);
}
const gmCoachLive=v=>coachOn()&&LOCAL.mode==='live'&&v.phase==='playing'&&v.gm&&v.toAct===v.me&&!v.gm.over&&!v.gm.undo;
/* ask for the advice on this position; when it arrives (and the position is still this one) draw it */
function gmAskCoach(v){const key=gmAdvKey(v);gmAdvise(v,()=>{if(V&&isG(V)&&V.gm&&gmAdvKey(V)===key){renderTable();renderActions();renderCoach()}})}
function gmCoachTip(v){
  if(!coachOn()||v.toAct!==v.me||v.phase!=='playing')return '';
  if(LOCAL.mode!=='live')return '练习模式：先自己决定，落子后教练面板显示点评。';
  if(!gmCoachLive(v))return '';
  const r=GM_ADV.key===gmAdvKey(v)&&GM_ADV.r;if(!r){gmAskCoach(v);return '教练正在计算……'}
  const b=r.best[0];return b?`教练建议：下在 <b>①（${b.pos}）</b>，${esc(b.why)}`:'';
}
function gmCandSVG(v){
  if(!gmCoachLive(v))return '';const r=GM_ADV.key===gmAdvKey(v)&&GM_ADV.r;if(!r)return '';
  return r.best.map((b,k)=>{const [x,y]=gmXY(b.i);return `<g class="gm-cand"><circle cx="${x}" cy="${y}" r="8.6" class="gm-cand-c"/><text x="${x}" y="${y+3.2}" class="gm-cand-t">${k+1}</text></g>`}).join('');
}
const GM_NUM=['①','②','③'];
function gmCoachHTML(v,toggle){
  const head=`<div class="coach-head"><h2>教练</h2>${toggle}</div>`,ai=gmLocalAI();
  const table=`<h3 class="dd-sub">棋型评分表</h3><table class="ptbl gm-scores"><tbody>${ai.RANK.map(n=>`<tr><td>${n}</td><td class="r num">${ai.SCORES[n]}</td></tr>`).join('')}</tbody></table>
    <p class="note">每个空位看横、竖、两条斜线四个方向：落子后自己能连成什么棋型就加多少分，同时能堵掉对方的棋型再加对方那份分数的 0.9 倍。一步同时形成双四、四三这类挡不住的杀棋，按活四算。困难、地狱和教练还会往后推算双方的应手，选对自己最有利的一步。</p>`;
  const rev=GM_REV?`<h3 class="dd-sub">上一步点评</h3><p>你下在 ${GM_REV.pos}：${GM_REV.hit?'和教练的第一推荐一致。':`教练的第一推荐是 ${GM_REV.best}（${esc(GM_REV.bestWhy)}）。`}${GM_REV.bad?' <b class="neg">这一步是大失误：</b>'+esc(GM_REV.why)+'。':''}</p>`:'';
  if(!v.gm||v.phase!=='playing'||v.toAct!==v.me)return head+'<p class="muted">轮到你落子时，这里给出最好的 3 个点、每个点的评分和理由。</p>'+rev+table;
  if(LOCAL.mode!=='live')return head+'<p class="muted">练习模式：先自己决定，落子后这里显示点评。</p>'+rev+table;
  const r=GM_ADV.key===gmAdvKey(v)&&GM_ADV.r;if(!r){gmAskCoach(v);return head+'<p class="muted">教练正在计算……</p>'+rev+table}
  const b=r.best[0];
  return head+`<div class="dd-advice"><b>下在 ①（${b?b.pos:'—'}）</b><p>${b?esc(b.why):''}</p></div>
    <table class="ptbl gm-cands"><thead><tr><th>候选</th><th class="r">评分</th><th>理由</th></tr></thead><tbody>${r.best.map((c,k)=>`<tr><td>${GM_NUM[k]} ${c.pos}</td><td class="r num">${gmScoreTxt(c.score)}</td><td>${esc(c.why)}</td></tr>`).join('')}</tbody></table>
    <h3 class="dd-sub">怎么算的</h3><p>${esc(r.text)}评分是「自己的分减去对方的分」，越高越好。</p>${rev}${table}`;
}
/* the settlement: the score, each game, and how my moves compared with the coach */
function gmRenderSettle(){
  const m=SETTLE,mine=m.standings.find(x=>x.id===m.seat)||m.standings[0],opp=m.standings.find(x=>x!==mine)||{name:'对手',gw:0};
  const nm=id=>(m.standings.find(x=>x.id===id)||{name:'?'}).name,games=m.gmGames||[],R=T.gm||{n:0,match:0,bad:0};
  const again=NET.role==='solo'?'<button class="btn primary" data-act="again">同样设置再来一场</button><button class="btn" data-act="home">修改设置</button>'
    :NET.role==='host'?'<button class="btn primary" data-act="relobby">回到大厅再来一场</button><button class="btn" data-act="leave">解散房间</button>'
    :'<span class="muted">等待房主开新一场，或</span><button class="btn" data-act="leave">离开房间</button>';
  $('#settle-view').innerHTML=`<div class="panel">
    <div class="hero-res"><div><div class="muted">五子棋 · 本场比分</div><div class="big">${mine.gw||0} : ${opp.gw||0}</div>
      <div class="sub">${esc(mine.name)} 对 ${esc(opp.name)}${mine.gd?` · 和 ${mine.gd} 盘`:''}</div></div></div>
    ${m.note?`<p class="note">${esc(m.note)}</p>`:''}
    <h3>每盘结果</h3>${games.length?`<ol class="gm-games">${games.map(g=>`<li>第 ${g.n} 盘：${esc(nm(g.black))} 执黑，${g.winner<0?'和棋':esc(nm(g.winner))+' 赢'+(g.why==='resign'?'（对方认输）':'（五连）')}</li>`).join('')}</ol>`:'<p class="muted">这一场还没有下完一盘。</p>'}
    <h3>复盘</h3><p>你一共下了 ${R.n} 步，其中 ${R.match} 步和教练第一推荐一致${R.n?`（${Math.round(R.match/R.n*100)}%）`:''}；大失误 ${R.bad} 步（下完后对方能直接取胜，或者漏堵了对方的活四、冲四）。</p>
    <div class="setup-actions">${again}</div></div>`;
}
