/* 赌神智慧树 · 红中麻将: tiles, winning shapes, claims, scoring, the hand flow, bots and table pieces */
'use strict';

/* =====================================================================
   红中麻将 (Hunan style): 112 tiles, 万 条 筒 1-9 ×4 plus four 红中, which are wild. 4 players, counter-clockwise.
   Tile ids: 0..107 are suited (id>>2 = kind 0..26: 万 0-8, 条 9-17, 筒 18-26), 108..111 are 红中 (kind 27).
   ===================================================================== */
const isM=st=>!!(st&&st.cfg&&st.cfg.game==='hz');
const HZ_RED=27;
const hzKind=id=>id>=108?HZ_RED:id>>2;
const HZ_NUM=['一','二','三','四','五','六','七','八','九'];
const hzName=k=>k===HZ_RED?'红中':HZ_NUM[k%9]+'万条筒'[Math.floor(k/9)];
function hzDeck(){const d=[];for(let i=0;i<112;i++)d.push(i);for(let i=111;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]]}return d}
const hzSort=ids=>ids.slice().sort((a,b)=>hzKind(a)-hzKind(b)||a-b);
/* counts by kind (0..26) and the number of 红中 */
function hzCount(ids){const c=new Array(27).fill(0);let red=0;ids.forEach(id=>{const k=hzKind(id);if(k===HZ_RED)red++;else c[k]++});return {c,red}}
const hzSuit=k=>Math.floor(k/9);

/* can `c` (counts) plus `w` wild tiles form only sets (and one pair when `pair`)? */
function hzSets(c,w,pair,memo){
  let i=0;while(i<27&&!c[i])i++;
  if(i===27)return pair?(w>=2&&(w-2)%3===0):w%3===0;
  const key=c.join('')+'|'+w+'|'+(pair?1:0);if(memo.has(key))return memo.get(key);
  let res=false;const t=(need,fn)=>{if(!res&&need<=w){fn();}};
  /* triplet of kind i, filling with wilds */
  const n=c[i];
  for(const use of [Math.min(3,n)])t(3-use,()=>{c[i]-=use;res=hzSets(c,w-(3-use),pair,memo);c[i]+=use});
  /* a run starting at i inside one suit: missing tiles come from wilds */
  if(!res&&i%9<=6){const a=c[i+1]>0,b=c[i+2]>0,need=(a?0:1)+(b?0:1);
    t(need,()=>{c[i]--;if(a)c[i+1]--;if(b)c[i+2]--;res=hzSets(c,w-need,pair,memo);c[i]++;if(a)c[i+1]++;if(b)c[i+2]++})}
  /* a run with i as its middle or last tile, the lower tiles supplied by wilds (only when they are absent) */
  if(!res&&i%9>=1&&i%9<=7){const b=c[i+1]>0,need=1+(b?0:1);
    t(need,()=>{c[i]--;if(b)c[i+1]--;res=hzSets(c,w-need,pair,memo);c[i]++;if(b)c[i+1]++})}
  if(!res&&i%9>=2)t(2,()=>{c[i]--;res=hzSets(c,w-2,pair,memo);c[i]++});
  /* the pair */
  if(!res&&pair){const use=Math.min(2,n);t(2-use,()=>{c[i]-=use;res=hzSets(c,w-(2-use),false,memo);c[i]+=use})}
  memo.set(key,res);return res;
}
/* 七对: 7 pairs from 14 tiles, four alike count as two pairs, 红中 make up singles */
function hzQidui(c,red,n){if(n!==14)return false;let singles=0;c.forEach(x=>{singles+=x%2});return singles<=red}
/* The winning shape of `hand` (14 tiles incl. the winning tile, less 3 per meld), or null.
   o.first: the player's first action of the hand, when four 红中 win by themselves. */
function hzWin(hand,melds,o={}){
  const {c,red}=hzCount(hand),n=hand.length;
  if(n%3!==2)return null;
  if(!melds.length&&hzQidui(c,red,n))return {type:'qidui',red};
  if(o.first&&red===4&&!melds.length)return {type:'sihz',red};
  if(hzSets(c.slice(),red,true,new Map()))return {type:'ping',red};
  return null;
}
/* 向听数: tiles still to change before a winning hand (-1 = already won, 0 = ready). Regular shape counted on the
   suited tiles (8 - 2·sets - partials - pair, partials capped by the sets still needed); each 红中 fills one gap. */
function hzShantenReg(c,need){
  let best=8;
  const go=(i,m,t,p)=>{
    while(i<27&&!c[i])i++;
    if(i===27){const tt=Math.min(t,need-m);best=Math.min(best,2*(need-m)-tt-(p?1:0));return}
    if(c[i]>=3){c[i]-=3;go(i,m+1,t,p);c[i]+=3}
    if(i%9<=6&&c[i+1]&&c[i+2]){c[i]--;c[i+1]--;c[i+2]--;go(i,m+1,t,p);c[i]++;c[i+1]++;c[i+2]++}
    if(c[i]>=2&&!p){c[i]-=2;go(i,m,t,true);c[i]+=2}
    if(c[i]>=2){c[i]-=2;go(i,m,t+1,p);c[i]+=2}
    if(i%9<=7&&c[i+1]){c[i]--;c[i+1]--;go(i,m,t+1,p);c[i]++;c[i+1]++}
    if(i%9<=6&&c[i+2]){c[i]--;c[i+2]--;go(i,m,t+1,p);c[i]++;c[i+2]++}
    c[i]--;go(i+1,m,t,p);c[i]++;
  };
  go(0,0,0,false);return best;
}
function hzShanten(hand,melds){
  const {c,red}=hzCount(hand),n=hand.length;
  if(n%3===2&&hzWin(hand,melds))return -1;
  const need=4-melds.length;
  let s=Math.max(0,hzShantenReg(c.slice(),need)-red);
  if(!melds.length&&n>=13){let pairs=0,singles=0;c.forEach(x=>{pairs+=x>>1;singles+=x%2});const fill=Math.min(red,singles);pairs+=fill+((red-fill)>>1);s=Math.min(s,Math.max(0,6-Math.min(7,pairs)))}
  return s;
}
/* the kinds (0..26) that complete a 13-tile hand; any ready hand also wins on a drawn 红中 */
function hzWaits(hand,melds){const have=new Set(hand),out=[];for(let k=0;k<27;k++){const id=[0,1,2,3].map(j=>k*4+j).find(x=>!have.has(x));if(id!=null&&hzWin([...hand,id],melds))out.push(k)}return out}
/* 吃 / 碰 / 杠 never use 红中 and 红中 can never be claimed */
const hzOf=(hand,k,n)=>hand.filter(id=>hzKind(id)===k).slice(0,n);
function hzChiOpts(hand,tile){
  const t=hzKind(tile);if(t===HZ_RED)return [];
  const out=[];
  for(const [a,b] of [[-2,-1],[-1,1],[1,2]]){const x=t+a,y=t+b;if(x<0||y>26||hzSuit(x)!==hzSuit(t)||hzSuit(y)!==hzSuit(t))continue;
    const ix=hzOf(hand,x,1),iy=hzOf(hand,y,1);if(ix.length&&iy.length)out.push([ix[0],iy[0]])}
  return out;
}
const hzCanPeng=(hand,tile)=>hzKind(tile)!==HZ_RED&&hzOf(hand,hzKind(tile),2).length===2;
const hzCanMGang=(hand,tile)=>hzKind(tile)!==HZ_RED&&hzOf(hand,hzKind(tile),3).length===3;
function hzAGangKinds(hand){const {c}=hzCount(hand);return c.map((x,k)=>x===4?k:-1).filter(k=>k>=0)}
function hzBGangKinds(hand,melds){const ks=new Set(hand.map(hzKind));return melds.filter(m=>m.t==='peng').map(m=>hzKind(m.ids[0])).filter(k=>k!==HZ_RED&&ks.has(k))}
