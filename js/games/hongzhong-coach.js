/* 赌神智慧树 · 红中麻将 coach: the discard to make, ready waits, claim advice and the tile counter */
'use strict';

/* =====================================================================
   Only what this seat may see: its own hand, every discard and every shown meld (another's 暗杠 shows two tiles).
   Runs on any device from its own view V, and on the host for 托管 from viewFor(seat).
   ===================================================================== */
const hzMineOf=v=>(v.players[v.me].cards||[]).filter(c=>c!=null);
/* how many of each kind (0..27) are still unseen: 4, less my hand, the discards and the shown melds */
function hzCounter(v){
  const c=new Array(28).fill(4),see=id=>{if(id!=null)c[hzKind(id)]--};
  hzMineOf(v).forEach(see);
  const h=v.hz;Object.values(h.discards||{}).forEach(ds=>ds.forEach(see));Object.values(h.melds||{}).forEach(ms=>ms.forEach(m=>m.ids.forEach(see)));
  return c.map(x=>Math.max(0,x));
}
/* the advice for this seat now: {discard, why, waits, left} on my turn, {claim, chi, why} on a claim, {hu} when it wins */
function hzAdvise(v){
  const h=v.hz;if(!h||v.phase!=='playing')return null;
  const mine=hzMineOf(v),melds=(h.melds&&h.melds[v.me])||[],left=hzCounter(v);
  if(h.stage==='claim'){
    const c=h.claim;if(!c||!c.mine||c.answered)return null;const o=c.mine;
    if(o.includes('hu'))return {claim:'hu',why:'这张牌能胡，胡了它'};
    const now=hzShanten(mine,melds);
    const after=(ids,t)=>{const rest=mine.filter(x=>!ids.includes(x)),m=[...melds,{t,ids:[]}];return hzShanten(hzMinus1(rest,hzBestDiscard(rest,m)),m)};
    if(o.includes('mgang')&&after(hzOf(mine,hzKind(c.tile),3),'mgang')<=now)return {claim:'gang',why:'杠了不影响听牌，还能收杠分'};
    if(o.includes('peng')){const s=after(hzOf(mine,hzKind(c.tile),2),'peng');if(s<now)return {claim:'peng',why:`碰了离听牌还差 ${Math.max(0,s)} 步`}}
    if(o.includes('chi')){const opts=hzChiOpts(mine,c.tile);for(let i=0;i<opts.length;i++){const s=after(opts[i],'chi');if(s<now)return {claim:'chi',chi:i,why:`吃了离听牌还差 ${Math.max(0,s)} 步`}}}
    return {claim:'pass',why:'吃碰都不能让牌更快听，过'};
  }
  if(v.toAct!==v.me||h.stage!=='turn')return null;
  if(h.drawn!=null&&hzWin(mine,melds,{first:!!h.first}))return {hu:true,why:'已经可以胡了'};
  const d=hzBestDiscard(mine,melds),rest=hzMinus1(mine,d),s=hzShanten(rest,melds);
  const waits=s===0?hzWaits(rest,melds):[];
  const lw=Object.fromEntries(waits.map(k=>[k,left[k]]));
  const why=s===0?`打${hzName(hzKind(d))}就听牌了，听 ${waits.map(k=>hzName(k)+'（剩 '+left[k]+'）').join('、')||'红中'}`:`打${hzName(hzKind(d))}，离听牌还差 ${s} 步`;
  return {discard:d,why,waits,left:lw,shanten:s};
}
/* 托管 with the coach on a claim (the host side) */
function hzAdviseClaim(p){
  const a=hzAdvise(viewFor(p.id));
  if(!a||!a.claim||a.claim==='pass')return hzAct(p,'pass');
  hzAct(p,a.claim==='gang'?'mgang':a.claim,a.claim==='chi'?a.chi:undefined);
}
/* the coach panel */
function hzCoachHTML(v,toggle){
  const a=myTurn()||v.hz&&v.hz.claim&&v.hz.claim.mine?hzAdvise(v):null,live=LOCAL.mode==='live';
  const body=!a?'<p class="muted">轮到你，或者别人打出的牌你能吃、碰、杠、胡时，这里给出建议。</p>'
    :!live?'<p class="muted">练习模式：先自己决定，打完再看这里的建议。</p>'
    :`<div class="dd-advice"><b>${a.hu?'胡牌':a.claim?{hu:'胡',peng:'碰',chi:'吃',gang:'杠',pass:'过'}[a.claim]:'打 '+esc(hzName(hzKind(a.discard)))}</b><p>${esc(a.why)}</p></div>`;
  return `<div class="coach-head"><h2>教练</h2>${toggle}</div>${body}<h3 class="dd-sub">记牌器</h3>${hzCounterHTML(v)}
    <p class="note">记牌器只算公开的信息：你的手牌、所有人打出的牌和亮出的吃碰杠，数字是还没出现过的张数。</p>`;
}
const HZ_SHORT=k=>k===HZ_RED?'中':HZ_NUM[k%9];
function hzCounterHTML(v){
  const c=hzCounter(v),cell=k=>`<span class="${c[k]?'':'zero'}${k===HZ_RED?' lzc':''}">${HZ_SHORT(k)}<b>${c[k]}</b></span>`;
  return `<div class="hz-counter" role="table" aria-label="记牌器：每种牌还有几张没出现">${['万','条','筒'].map((s,i)=>`<div class="hz-crow"><em>${s}</em>${Array.from({length:9},(_,n)=>cell(i*9+n)).join('')}${i===0?cell(HZ_RED):''}</div>`).join('')}</div>`;
}
const hzCounterStripHTML=v=>`<div class="dd-scells hz-scells">${hzCounterHTML(v)}</div>`;
