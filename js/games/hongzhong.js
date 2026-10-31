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
/* 碰 / 杠 never use 红中 and 红中 can never be claimed; this game has no 吃 */
const hzOf=(hand,k,n)=>hand.filter(id=>hzKind(id)===k).slice(0,n);
const hzCanPeng=(hand,tile)=>hzKind(tile)!==HZ_RED&&hzOf(hand,hzKind(tile),2).length===2;
const hzCanMGang=(hand,tile)=>hzKind(tile)!==HZ_RED&&hzOf(hand,hzKind(tile),3).length===3;
function hzAGangKinds(hand){const {c}=hzCount(hand);return c.map((x,k)=>x===4?k:-1).filter(k=>k>=0)}
function hzBGangKinds(hand,melds){const ks=new Set(hand.map(hzKind));return melds.filter(m=>m.t==='peng').map(m=>hzKind(m.ids[0])).filter(k=>k!==HZ_RED&&ks.has(k))}

/* ---------- scoring ---------- */
/* 胡牌分: 2, doubled for 七对 and (with 「无红中加倍」) for a hand without any 红中; 四红中 scores as a plain 自摸 */
const hzPoints=(type,red,cfg)=>2*(type==='qidui'?2:1)*(cfg.hzNoRed&&!red&&type!=='sihz'?2:1);
/* 中鸟: a 1, 5, 9 or 红中 */
const hzBird=id=>{const k=hzKind(id);return k===HZ_RED||k%9===0||k%9===4||k%9===8};
/* a payer never goes below 0; what they cannot pay is not paid */
const hzTake=(stacks,pid,amt)=>{const x=Math.max(0,Math.min(amt,stacks[pid]));stacks[pid]-=x;return x};
/* the win: 自摸 every other seat pays (胡牌分 + 中鸟) × 底分; 点炮 / 抢杠 the one who gave it pays three shares */
function hzPayout({w,from,pts,birds,base,ids,stacks}){
  const d={},st={...stacks},per=(pts+birds)*base;ids.forEach(i=>{d[i]=0});
  if(from==null)ids.forEach(i=>{if(i!==w){const x=hzTake(st,i,per);d[i]-=x;d[w]+=x}});
  else{const x=hzTake(st,from,per*3);d[from]-=x;d[w]+=x}
  return d;
}
/* 杠分 at the moment of the kong: 明杠 the discarder pays 3, 暗杠 everyone pays 2, 补杠 everyone pays 1 */
function hzGangPay({t,by,from,base,ids,stacks}){
  const d={},st={...stacks};ids.forEach(i=>{d[i]=0});
  if(t==='mgang'){const x=hzTake(st,from,3*base);d[from]-=x;d[by]+=x}
  else ids.forEach(i=>{if(i!==by){const x=hzTake(st,i,(t==='agang'?2:1)*base);d[i]-=x;d[by]+=x}});
  return d;
}

/* ---------- the hand flow (host only): S.hz ---------- */
const HZ_N=4;
const hzNext=id=>(id+1)%HZ_N;
const hzRed=p=>p.cards.some(id=>hzKind(id)===HZ_RED);
/* a 红中 never goes out, except when the hand holds nothing else */
/* 自摸 only on a tile just drawn: after a 碰 there is none (that would dodge 「只能自摸」); the dealer's 14th counts */
const hzCanZimo=p=>S.hz.drawn!=null&&p.cards.includes(S.hz.drawn);
const hzCanDiscard=(p,id)=>p.cards.includes(id)&&(hzKind(id)!==HZ_RED||p.cards.every(x=>hzKind(x)===HZ_RED));
let HZ_TIMERS=[];
const hzClear=()=>{HZ_TIMERS.forEach(t=>clearTimeout(t));HZ_TIMERS=[]};
function hzDeal(live){
  S.handNo++;S.board=[];S.msg='';hzClear();
  if(S.hzNext!=null&&P()[S.hzNext])S.dealer=S.hzNext;
  const wall=hzDeck(),dl=S.dealer,order=[0,1,2,3].map(k=>(dl+k)%HZ_N);
  P().forEach(p=>{p.cards=[];p.lastAction='';p.shown=false;p.handName=''});
  for(let k=0;k<13;k++)order.forEach(i=>P()[i].cards.push(wall.shift()));
  P()[dl].cards.push(wall.shift());
  P().forEach(p=>{p.cards=hzSort(p.cards)});
  S.hz={wall,stage:'turn',drawn:P()[dl].cards[P()[dl].cards.length-1],discards:{0:[],1:[],2:[],3:[]},river:[],melds:{0:[],1:[],2:[],3:[]},
    claim:null,first:{0:true,1:true,2:true,3:true},delta:{0:0,1:0,2:0,3:0},gangs:[],birds:[],result:null,last:null,seq:0};
  Object.assign(S,{phase:'playing',toAct:dl,street:'hz',currentBet:0,minRaise:0,raises:0,preRaisers:[],sbId:-1,bbId:-1});
  log(`第 ${S.handNo} 局，${P()[dl].name} 坐庄`,'sep');
  hzProceed();
}
const hzEv=(p,o)=>{S.ev={seq:(S.ev?S.ev.seq:0)+1,pid:p.id,...o}};
const hzStacks=()=>Object.fromEntries(P().map(p=>[p.id,p.stack]));
function hzApply(d){for(const [k,x] of Object.entries(d)){if(!x)continue;const p=P()[+k];p.stack+=x;S.hz.delta[k]+=x}}
/* whoever acts next: the player on turn, or the open claim; bots and timers are scheduled here */
function hzProceed(){
  if(S.phase!=='playing'||!S.hz)return;
  const h=S.hz,mark=++h.seq,hn=S.handNo;
  clearTimeout(timer);hzClear();
  if(h.stage==='turn'){
    const p=P()[S.toAct],id=p.id;
    const still=()=>S&&S.phase==='playing'&&S.hz===h&&h.seq===mark&&S.handNo===hn&&S.toAct===id;
    turnTimer(p,still,hzBotTurn,hzBotTurn,Math.max(400,(p.discAt||0)+DISC_GRACE-Date.now()));
  }else if(h.stage==='claim'){
    S.toAct=-1;S.turnEnd=0;
    const c=h.claim,ms=turnMs();if(ms)S.turnEnd=Date.now()+ms;
    for(const k of Object.keys(c.opts)){const p=P()[+k];if(c.ans[k]!=null)continue;
      const still=()=>S&&S.phase==='playing'&&S.hz===h&&h.seq===mark&&h.claim===c&&c.ans[k]==null;
      const at=(f,t)=>HZ_TIMERS.push(setTimeout(()=>{if(still())f(p)},t));
      if(isBot(p))at(hzBotClaim,delay());
      else if(!present(p))at(hzTimeoutClaim,Math.max(400,(p.discAt||0)+DISC_GRACE-Date.now()));
      else if(p.trust)at(q=>hzAutoMove(q,true),delay());
      else if(ms)at(hzTimeoutClaim,ms);
    }
  }
  sync();
}
/* a claim nobody answered in time: 过, unless it wins */
function hzTimeoutClaim(p){const o=S.hz.claim.opts[p.id]||[];hzAct(p,o.includes('hu')?'hu':'pass')}
function hzDraw(p,tail){
  const h=S.hz;
  if(!h.wall.length)return hzEnd(-1);
  const id=tail?h.wall.pop():h.wall.shift();
  p.cards=hzSort([...p.cards,id]);h.drawn=id;h.stage='turn';S.toAct=p.id;h.claim=null;
  hzProceed();
}
/* who may take a discard, and how: 胡 (点炮 allowed, or a 抢杠), 明杠, 碰 */
function hzClaimOpts(tile,from,qiang){
  const h=S.hz,out={},cfg=S.cfg;
  for(let k=1;k<HZ_N;k++){const q=P()[(from+k)%HZ_N],o=[];
    const canHu=(qiang?cfg.hzQiangGang:cfg.hzDianpao)&&!(cfg.hzRedSelf&&hzRed(q))&&hzWin([...q.cards,tile],h.melds[q.id]);
    if(canHu)o.push('hu');
    if(!qiang){
      if(h.wall.length&&hzCanMGang(q.cards,tile))o.push('mgang');
      if(hzCanPeng(q.cards,tile))o.push('peng');
    }
    if(o.length)out[q.id]=o;
  }
  return out;
}
/* everyone asked has answered: 胡 (nearest in turn order) > 杠 / 碰, else the game goes on */
function hzResolve(){
  const h=S.hz,c=h.claim,order=[1,2,3].map(k=>(c.from+k)%HZ_N),got=t=>order.find(i=>c.ans[i]&&c.ans[i].type===t);
  let i=got('hu');
  if(i!=null){const p=P()[i];p.cards=hzSort([...p.cards,c.tile]);return hzEnd(i,c.from,c.qiang?'qiang':'pao')}
  if(c.qiang){const g=c.qiang;h.claim=null;return hzFinishBGang(P()[g.by],g.kind)}
  for(const t of ['mgang','peng']){i=got(t);if(i==null)continue;
    const p=P()[i],a=c.ans[i],from=P()[c.from];
    from.lastAction='';h.discards[c.from]=h.discards[c.from].filter(x=>x!==c.tile);h.river=h.river.filter(x=>x!==c.tile);h.claim=null;h.first[i]=false;
    const ids=hzOf(p.cards,hzKind(c.tile),t==='mgang'?3:2);
    p.cards=p.cards.filter(x=>!ids.includes(x));
    h.melds[i].push({t,ids:hzSort([...ids,c.tile]),from:c.from});
    p.lastAction={peng:'碰',mgang:'杠'}[t];log(`${p.name}：${p.lastAction} ${hzName(hzKind(c.tile))}`);hzEv(p,{type:t,tile:c.tile});
    if(t==='mgang'){hzApply(hzGangPay({t,by:i,from:c.from,base:S.cfg.base,ids:[0,1,2,3],stacks:hzStacks()}));h.gangs.push({t,by:i,from:c.from});return hzDraw(p,true)}
    h.stage='turn';h.drawn=null;S.toAct=i;return hzProceed();
  }
  h.claim=null;return hzDraw(P()[hzNext(c.from)]);
}
function hzFinishBGang(p,k){
  const h=S.hz,m=h.melds[p.id].find(x=>x.t==='peng'&&hzKind(x.ids[0])===k),id=hzOf(p.cards,k,1)[0];
  p.cards=p.cards.filter(x=>x!==id);m.t='bgang';m.ids=hzSort([...m.ids,id]);
  p.lastAction='补杠';log(`${p.name}：补杠 ${hzName(k)}`);hzEv(p,{type:'bgang',tile:id});
  hzApply(hzGangPay({t:'bgang',by:p.id,from:null,base:S.cfg.base,ids:[0,1,2,3],stacks:hzStacks()}));h.gangs.push({t:'bgang',by:p.id});
  return hzDraw(p,true);
}
/* every move goes through here: the player on turn (discard / hu / agang / bgang), or a claim answer (hu / mgang / peng / pass) */
function hzAct(p,type,arg){
  if(!S||S.phase!=='playing'||!S.hz)return;
  const h=S.hz;
  if(h.stage==='claim'){
    const c=h.claim,o=c.opts[p.id];
    if(!o||c.ans[p.id]!=null)return sync();
    if(type!=='pass'&&!o.includes(type))return sync();
    c.ans[p.id]={type,arg};
    if(type==='pass'){p.lastAction='过'}
    if(Object.keys(c.opts).every(k=>c.ans[k]!=null))return hzResolve();
    return sync();
  }
  if(h.stage!=='turn'||S.toAct!==p.id)return;
  const first=h.first[p.id];
  if(type==='hu'){
    if(!hzCanZimo(p))return sync();
    const r=hzWin(p.cards,h.melds[p.id],{first});
    if(!r)return sync();
    return hzEnd(p.id,null,'zimo');
  }
  if(type==='agang'){
    const k=+arg;if(!h.wall.length||!hzAGangKinds(p.cards).includes(k))return sync();
    const ids=hzOf(p.cards,k,4);p.cards=p.cards.filter(x=>!ids.includes(x));h.melds[p.id].push({t:'agang',ids,from:null});h.first[p.id]=false;
    p.lastAction='暗杠';log(`${p.name}：暗杠`);hzEv(p,{type:'agang'});
    hzApply(hzGangPay({t:'agang',by:p.id,from:null,base:S.cfg.base,ids:[0,1,2,3],stacks:hzStacks()}));h.gangs.push({t:'agang',by:p.id});
    return hzDraw(p,true);
  }
  if(type==='bgang'){
    const k=+arg;if(!h.wall.length||!hzBGangKinds(p.cards,h.melds[p.id]).includes(k))return sync();
    h.first[p.id]=false;
    const tile=hzOf(p.cards,k,1)[0],opts=hzClaimOpts(tile,p.id,true);
    if(Object.keys(opts).length){h.stage='claim';h.claim={tile,from:p.id,opts,ans:{},qiang:{by:p.id,kind:k}};return hzProceed()}
    return hzFinishBGang(p,k);
  }
  if(type!=='discard')return sync();
  const id=+arg;if(!hzCanDiscard(p,id))return sync();
  p.cards=p.cards.filter(x=>x!==id);h.discards[p.id].push(id);h.river.push(id);h.first[p.id]=false;h.last={pid:p.id,id};h.drawn=null;
  p.lastAction='';log(`${p.name}：打 ${hzName(hzKind(id))}`);hzEv(p,{type:'discard',tile:id});
  const opts=hzClaimOpts(id,p.id,false);
  if(Object.keys(opts).length){h.stage='claim';h.claim={tile:id,from:p.id,opts,ans:{},qiang:null};return hzProceed()}
  return hzDraw(P()[hzNext(p.id)]);
}
/* the end of a hand: w = winner (-1 for 流局), from = who gave the tile, how = zimo / pao / qiang */
function hzEnd(w,from=null,how=''){
  const h=S.hz;hzClear();clearTimeout(timer);
  if(w>=0){
    const p=P()[w],r=hzWin(p.cards,h.melds[w],{first:how==='zimo'&&h.first[w]})||{type:'ping',red:0};
    const n=S.cfg.hzBirds||0;h.birds=h.wall.splice(0,Math.min(n,h.wall.length));
    const hits=h.birds.filter(hzBird).length,pts=hzPoints(r.type,r.red,S.cfg);
    hzApply(hzPayout({w,from,pts,birds:hits,base:S.cfg.base,ids:[0,1,2,3],stacks:hzStacks()}));
    h.result={w,from,how,type:r.type,red:r.red,pts,hits};
    const word=r.type==='qidui'?'七对':r.type==='sihz'?'四红中':'平胡';
    p.shown=true;p.handName=word;
    S.msg=`${p.name} ${how==='zimo'?'自摸':how==='qiang'?'抢杠胡':'胡了'}（${word}${S.cfg.hzNoRed&&!r.red&&r.type!=='sihz'?'，无红中':''}${n?`，中 ${hits} 只鸟`:''}）${from!=null?`，${P()[from].name} 点炮`:''}`;
    S.hzNext=w;hzEv(p,{type:'hu',how});
  }else{h.result={w:-1};S.msg='牌摸完了，流局';S.hzNext=S.dealer}
  log(S.msg,'win-l');
  P().forEach(p=>{const x=h.delta[p.id]||0;if(x>0)p.won=x;else if(x<0)p.total=-x;
    const s=p.st;s.hz=(s.hz||0)+1;if(h.result.w===p.id)s.hzW=(s.hzW||0)+1;if(h.result.from===p.id)s.hzP=(s.hzP||0)+1});
  h.stage='over';S.toAct=-1;S.turnEnd=0;
  endHand();
}
/* what each seat may see: no wall (only how many are left), other hands as counts; the winner's hand once it is over */
function hzPublic(h,seat){
  return {stage:h.stage,wallLeft:h.wall.length,drawn:S.toAct===seat?h.drawn:null,discards:JSON.parse(JSON.stringify(h.discards)),river:h.river.slice(),
    melds:Object.fromEntries(Object.entries(h.melds).map(([k,ms])=>[k,ms.map(m=>({t:m.t,from:m.from,ids:m.t==='agang'&&+k!==seat&&h.stage!=='over'?m.ids.map((x,i)=>i===1||i===2?x:null):m.ids.slice()}))])),
    claim:h.claim?{tile:h.claim.tile,from:h.claim.from,mine:h.claim.opts[seat]||null,answered:h.claim.ans[seat]!=null,qiang:!!h.claim.qiang}:null,
    first:!!h.first[seat],last:h.last?{...h.last}:null,birds:h.stage==='over'?h.birds.slice():[],result:h.result?{...h.result}:null,delta:{...h.delta},dealer:S.dealer};
}

/* ---------- bots and 托管 ---------- */
/* the discard that leaves the fewest steps to a ready hand; among equals the most isolated tile goes first. Never a 红中. */
function hzBestDiscard(hand,melds){
  let best=null;
  const iso=id=>{const k=hzKind(id),near=hand.filter(x=>x!==id&&hzKind(x)!==HZ_RED&&hzSuit(hzKind(x))===hzSuit(k)&&Math.abs(hzKind(x)-k)<=2).length;return near*10+(k%9===0||k%9===8?0:3)};
  const seen=new Set();
  for(const id of hand){const k=hzKind(id);if(k===HZ_RED||seen.has(k))continue;seen.add(k);
    const rest=hand.filter(x=>x!==id),s=hzShanten(rest,melds),sc=s*100+iso(id);
    if(!best||sc<best.sc)best={id,sc,s}}
  return best?best.id:hand[hand.length-1];
}
function hzBotTurn(p){
  const h=S.hz,seq=h.seq;
  if(h.stage==='claim')return hzBotClaim(p);
  if(hzCanZimo(p)&&hzWin(p.cards,h.melds[p.id],{first:h.first[p.id]}))return hzAct(p,'hu');
  const s0=hzShanten(hzMinus1(p.cards,hzBestDiscard(p.cards,h.melds[p.id])),h.melds[p.id]);
  for(const k of hzAGangKinds(p.cards)){const rest=p.cards.filter(x=>hzKind(x)!==k);if(h.wall.length&&hzShanten(rest,[...h.melds[p.id],{t:'agang',ids:[]}])<=s0)return hzAct(p,'agang',k)}
  for(const k of hzBGangKinds(p.cards,h.melds[p.id]))if(h.wall.length)return hzAct(p,'bgang',k);
  hzAct(p,'discard',hzBestDiscard(p.cards,h.melds[p.id]));
  if(S&&S.hz===h&&h.seq===seq&&S.toAct===p.id)hzAct(p,'discard',p.cards.find(x=>hzCanDiscard(p,x)));
}
const hzMinus1=(hand,id)=>{const i=hand.indexOf(id);return i<0?hand.slice():hand.slice(0,i).concat(hand.slice(i+1))};
/* a claim is taken when it wins, or when it brings the hand closer to ready */
function hzBotClaim(p){
  const h=S.hz,c=h.claim,o=c.opts[p.id]||[],melds=h.melds[p.id];
  if(o.includes('hu'))return hzAct(p,'hu');
  const now=hzShanten(p.cards,melds);
  const after=(ids,t)=>{const rest=p.cards.filter(x=>!ids.includes(x)),m=[...melds,{t,ids:[]}];return hzShanten(hzMinus1(rest,hzBestDiscard(rest,m)),m)};
  if(o.includes('mgang')&&after(hzOf(p.cards,hzKind(c.tile),3),'mgang')<=now)return hzAct(p,'mgang');
  if(o.includes('peng')&&after(hzOf(p.cards,hzKind(c.tile),2),'peng')<now)return hzAct(p,'peng');
  hzAct(p,'pass');
}
/* 托管 / 出牌超时: the coach's move, or the default: win when it can, else discard the tile just drawn (the rightmost
   non-红中 when that was a 红中); a claim passes unless it wins */
function hzAutoMove(p,coach){
  const h=S.hz;
  if(h.stage==='claim'){const o=h.claim.opts[p.id]||[];if(o.includes('hu'))return hzAct(p,'hu');return coach&&typeof hzAdvise==='function'?hzAdviseClaim(p):hzAct(p,'pass')}
  if(hzCanZimo(p)&&hzWin(p.cards,h.melds[p.id],{first:h.first[p.id]}))return hzAct(p,'hu');
  if(coach&&typeof hzAdvise==='function'){const a=hzAdvise(viewFor(p.id));if(a&&a.discard!=null)return hzAct(p,'discard',a.discard);return hzBotTurn(p)}
  if(coach)return hzBotTurn(p);
  const d=h.drawn!=null&&hzCanDiscard(p,h.drawn)?h.drawn:[...p.cards].reverse().find(x=>hzCanDiscard(p,x));
  hzAct(p,'discard',d);
}

/* the rules panel */
function hzRulesHTML(){
  return `<h2>红中麻将规则</h2><p class="lead">湖南红中玩法，四人一局。万、条、筒各 1 到 9，每种 4 张，加 4 张红中，一共 112 张。红中是赖子。</p>
  <h3>一局的流程</h3>
  <ol><li>每人 13 张，庄家 14 张，庄家先打。</li><li>按逆时针轮流：摸一张、打一张。我打完轮到右边的下家。</li>
  <li>别人打出的牌，任何人都可以<b>碰</b>（组成三张一样的）或<b>杠</b>；这个玩法<b>不能吃</b>。</li>
  <li>凑成能胡的牌就可以<b>胡</b>。牌堆摸完还没人胡就是<b>流局</b>。</li></ol>
  <h3>红中</h3>
  <dl class="terms"><div><dt>赖子：</dt><dd>红中可以当任意一张万、条、筒。</dd></div>
  <div><dt>限制：</dt><dd>红中不能打出（手里只剩红中时除外），也不能用来碰、杠；四张红中也不能杠。</dd></div></dl>
  <h3>怎么算胡</h3>
  <dl class="terms"><div><dt>平胡：</dt><dd>4 组顺子或刻子，加 1 对将。任何对子都能做将。</dd></div>
  <div><dt>七对：</dt><dd>7 个对子（没有碰、杠），四张一样的算两对。</dd></div>
  <div><dt>四红中：</dt><dd>起手摸到 4 张红中，第一次行动时可以直接胡，按自摸算。</dd></div>
  <div><dt>自摸和点炮：</dt><dd>默认只能自摸。开局勾选「允许点炮」后，别人打出的牌也能胡；勾选「手里有红中只能自摸」时，手里有红中的人不能胡别人打的牌。</dd></div>
  <div><dt>抢杠胡：</dt><dd>别人补杠的那张牌正好能让你胡，可以抢过来胡（开局可选，默认开启，不受「允许点炮」影响）。</dd></div></dl>
  <h3>算分（都乘以底分）</h3>
  <dl class="terms"><div><dt>胡牌分：</dt><dd>2 分；七对 ×2；开启「无红中加倍」时，手里没有红中再 ×2。</dd></div>
  <div><dt>抓鸟：</dt><dd>胡牌后从牌堆翻开几张（开局选 0 / 2 / 4 / 6），翻到 1、5、9 或红中算中鸟，每只鸟每个付分的人多付 1 分（鸟分不翻倍）。</dd></div>
  <div><dt>自摸：</dt><dd>其他三家每家付「胡牌分 + 中鸟数」。</dd></div>
  <div><dt>点炮、抢杠胡：</dt><dd>打出那张牌（或被抢杠）的人一个人付「(胡牌分 + 中鸟数) × 3」。被抢的补杠不算杠分。</dd></div>
  <div><dt>杠分：</dt><dd>杠的当时就结算：明杠由打出那张牌的人付 3 分；暗杠每家付 2 分；补杠每家付 1 分。流局时杠分照算。</dd></div>
  <div><dt>庄家：</dt><dd>谁胡谁下一局坐庄，流局时庄家连庄。</dd></div></dl>
  <p class="muted" style="font-size:12.5px">谁都只输到自己的筹码为止。积分只是游戏里的数字，没有任何价值。</p>`;
}

/* =====================================================================
   TABLE PIECES — run on every device from its own view V (ui.js calls these when isM(V)).
   ===================================================================== */
/* a tile: its picture, or the back for null; 红中 carries the 「赖」 mark */
function hzTileHTML(id,o={}){
  if(id==null)return `<div class="mj back" ${faceStyle(MJ_BACK)}></div>`;
  const k=hzKind(id),cls=(o.sel?' sel':'')+(o.rec?' rec':'')+(o.hi?' hi':'')+(o.cls||'');
  return `<div class="mj${cls}"${o.pick?` data-hz="${id}"`:''} ${faceStyle(mjFile(k))} aria-label="${hzName(k)}"><span class="vh">${hzName(k)}</span>${k===HZ_RED&&o.pick?'<i class="lzt">赖</i>':''}</div>`;
}
const hzMeldHTML=m=>`<div class="hz-meld">${m.ids.map(id=>hzTileHTML(id)).join('')}</div>`;
/* a 碰 or 杠 on the table is one tile of its kind with 碰 / 杠 on it (another's 暗杠 shows one face, so its kind is known) */
const HZ_MTAG={peng:'碰',mgang:'杠',bgang:'杠',agang:'暗杠',chi:'吃'};
const hzMeld1HTML=m=>`<div class="hz-m1" aria-label="${HZ_MTAG[m.t]||''}${hzName(hzKind(m.ids.find(x=>x!=null)))}">${hzTileHTML(m.ids.find(x=>x!=null))}<i aria-hidden="true">${HZ_MTAG[m.t]||''}</i></div>`;
/* every discard lies in one river in the middle of the felt, in the order played; the rows are as wide as the box
   (table %: x0, y0, x1, y1) allows. Sideways the box sits between the side seats' melds and below the far seat's;
   upright it is the felt between the top seats and mine. The tile is the biggest that fits the river (at least 48 tiles). */
const HZ_RIVER={land:[23,31,77,57],port:[2,31.5,98,68.5]};
const HZ_GAP=2;
function hzRiverStyle(o,n){
  const [x0,y0,x1,y1]=HZ_RIVER[o],T=$('#table').getBoundingClientRect(),W=(x1-x0)*T.width/100,H=(y1-y0)*T.height/100;let b=0;
  for(let c=1;c<=n;c++)b=Math.max(b,Math.min((W+HZ_GAP)/c-HZ_GAP,((H+HZ_GAP)/Math.ceil(n/c)-HZ_GAP)*.75));
  const w=Math.max(12,Math.floor(Math.min(o==='land'?40:30,b))),cols=Math.max(1,Math.floor((W+HZ_GAP)/(w+HZ_GAP)));
  return `left:${(x0+x1)/2}%;top:${y0}%;transform:translateX(-50%);--cols:${cols};--mjr:${w}px`;
}
/* this device's picked tile in its own hand */
let HSEL=null;
function hzRenderTable(){
  const h=V.hz,n=V.players.length,o=tableOrient(),over=V.phase!=='playing';
  tableFrame(o,'hz');
  let html='';
  V.players.forEach((p,i)=>{
    const slot=slotOf(i),s=seatXY(slot,n,o);
    const cls=['seat',i===V.me?'me':'',(V.toAct===i||h&&h.stage==='claim'&&h.claim&&h.claim.from===i)&&V.phase==='playing'?'active':'',p.won>0&&over?'win':''].join(' ');
    const tg=(p.kind==='remote'&&!p.connected||p.trust)&&p.inHand;
    const status=[tg?'托管中':'',p.lastAction||''].filter(Boolean).join(' · ');
    const act=p.won>0&&over?`<div class="pact won">+${fmt(p.won)}${p.handName?' · '+p.handName:''}</div>`:p.total>0&&over?`<div class="pact">−${fmt(p.total)}</div>`:`<div class="pact${tg?' tg':''}">${esc(status)}</div>`;
    const ms=h?(h.melds[i]||[]):[],left=p.cards.length;
    /* others: a back with the count; their melds beside the seat on the felt side (CSS: right of a left seat, left of a
       right seat, under the far one); my own melds sit above my hand */
    const cards=i===V.me||!p.inHand?'':`<div class="dd-count">${hzTileHTML(null)}<b>${left}</b></div>`;
    const mx=i!==V.me&&p.inHand&&ms.length?`<div class="hz-melds">${ms.map(hzMeld1HTML).join('')}</div>`:'';
    html+=`<div class="${cls}${seatCls(s,i===V.me,i)}" data-pid="${i}" style="${seatStyle(s)}">
      <div class="stop">${avatarHTML(p)}<div class="cards">${cards}</div></div>
      <div class="plate">${h&&h.dealer===i?'<span class="dd-lord" title="庄家">庄</span>':''}
        <div class="pname">${esc(p.name)}${i===V.me&&NET.role!=='solo'?'（你）':''}</div>
        <div class="ptag">${esc(seatTag(p))||'&nbsp;'}</div>
        <div class="pstack">${fmt(p.stack)}</div>${act}
      </div>${mx}</div>`;
  });
  /* the river, newest last and lit */
  const rv=h?(h.river||Object.values(h.discards).flat()):[],last=h&&h.last?h.last.id:null;
  if(rv.length)html+=`<div class="hz-river" style="${hzRiverStyle(o,Math.max(48,rv.length))}">${rv.map(id=>hzTileHTML(id,{hi:id===last})).join('')}</div>`;
  /* the middle box only at the end: who won and how, their hand, the birds; the wall count rides in the corner */
  if(h&&over){
    const c=centerXY(o),r=h.result,w=r&&r.w>=0?V.players[r.w]:null;
    const hand=w&&w.cards.length&&w.cards[0]!=null?`<div class="hz-whand">${(h.melds[r.w]||[]).map(hzMeldHTML).join('')}${hzSort(w.cards).map(id=>hzTileHTML(id)).join('')}</div>`:'';
    const birds=h.birds.length?`<div class="hz-birds" aria-label="抓鸟"><span>抓鸟</span>${h.birds.map(id=>hzTileHTML(id,{cls:hzBird(id)?' bird':''})).join('')}</div>`:'';
    html+=`<div class="center hz-center" style="left:${c.x}%;top:${c.y}%"><div class="street">${w?'本局结束':'流局'}</div>${hand}${birds}${V.msg?`<div class="msg">${esc(V.msg)}</div>`:''}</div>`;
  }
  $('#table').innerHTML=html;
  $('#table').classList.add('ddz','hz');$('#table').classList.remove('zjh');
  $('#table').dataset.n=String(n);
  hzRenderHand();
}
function hzRenderHand(){
  const el=$('#dd-hand');if(!el)return;
  const h=V.hz,m=V.players[V.me],ids=m&&m.inHand?m.cards.filter(c=>c!=null):[];
  el.hidden=false;
  if(HSEL!=null&&!ids.includes(HSEL))HSEL=null;
  /* the tile just drawn stands a little apart at the right */
  const drawn=h&&h.drawn!=null&&ids.includes(h.drawn)?h.drawn:null,rest=hzSort(ids.filter(id=>id!==drawn));
  const rec=hzRecTile(),tile=id=>hzTileHTML(id,{pick:true,sel:id===HSEL,rec:id===rec});
  const ms=h?(h.melds[V.me]||[]):[];
  el.innerHTML=`<div class="hz-row" role="group" aria-label="我的手牌，点一张选中，再点一次打出">${ms.length?`<div class="hz-melds mine" aria-label="我的碰杠">${ms.map(hzMeld1HTML).join('')}</div>`:''}${rest.map(tile).join('')}${drawn!=null?`<span class="hz-gap"></span>${tile(drawn)}`:''}</div>${ids.length?trustVeil():''}`;
  /* --mjh holds a percentage, which an absolutely placed box can't resolve: the melds take 0.8 of a hand tile in px */
  const mx=el.querySelector('.hz-melds.mine'),t=el.querySelector('.hz-row > .mj');
  if(mx&&t)mx.style.setProperty('--mjw',Math.round(t.getBoundingClientRect().width*.8)+'px');
}
/* the coach's discard to mark in my hand (hzAdvise comes with the coach) */
function hzRecTile(){if(!(coachOn()&&LOCAL.mode==='live'&&myTurn()&&typeof hzAdvise==='function'))return null;const a=hzAdvise(V);return a&&a.discard!=null?a.discard:null}
const hzMine=()=>{const m=V.players[V.me];return m?m.cards.filter(c=>c!=null):[]};
function hzRenderActions(el,m){
  const h=V.hz;if(!h)return el.innerHTML=actWait('…');
  const live=coachOn()&&LOCAL.mode==='live',a=live&&typeof hzAdvise==='function'?hzAdvise(V):null;
  const tip=a&&a.why?`教练：${esc(a.why)}`:'';
  if(h.stage==='claim'&&h.claim&&h.claim.mine&&!h.claim.answered){
    const c=h.claim,o=c.mine,nm=hzName(hzKind(c.tile)),mark=t=>a&&a.claim===t?' is-rec':'';
    el.innerHTML=actHTML(tip||`${esc(V.players[c.from].name)} ${c.qiang?'补杠':'打出'}${nm}`,
      `<button class="btn hzc b-gray${mark('pass')}" data-act="hzpass">过</button>${o.includes('peng')?`<button class="btn hzc b-green${mark('peng')}" data-act="hzpeng">碰</button>`:''}${o.includes('mgang')?`<button class="btn hzc b-green${mark('gang')}" data-act="hzmgang">杠</button>`:''}${o.includes('hu')?`<button class="btn hzc b-red${mark('hu')}" data-act="hzhu">胡</button>`:''}`);
    return;
  }
  if(!myTurn()){
    const p=V.players[V.toAct];
    return el.innerHTML=actWait(h.stage==='claim'?'等待其他人选择吃、碰、杠、胡…':p?(p.kind==='remote'&&!p.connected?`${esc(p.name)} 掉线了，稍后由电脑代打…`:`等待 ${esc(p.name)} 出牌…`):'…');
  }
  const mine=hzMine(),melds=h.melds[V.me]||[],win=h.drawn!=null&&hzWin(mine,melds,{first:h.first});
  const gangs=h.wallLeft?[...hzAGangKinds(mine).map(k=>['agang',k]),...hzBGangKinds(mine,melds).map(k=>['bgang',k])]:[];
  const sel=HSEL!=null&&mine.includes(HSEL)&&hzCanDiscard({cards:mine},HSEL);
  el.innerHTML=actHTML(tip||(sel?`打出 ${hzName(hzKind(HSEL))}？再点一次这张牌也可以打出`:'点一张牌选中，再点一次打出'),
    `${gangs.map(([t,k])=>`<button class="btn b-green" data-act="hzgang" data-t="${t}" data-k="${k}">${t==='agang'?'暗杠':'补杠'} ${hzName(k)}</button>`).join('')}${win?`<button class="btn b-red" data-act="hzhu">${win.type==='sihz'?'四红中 胡':'自摸'}</button>`:''}<button class="btn b-green" data-act="hzdiscard"${sel?'':' disabled'}>出牌</button>`);
}
/* a tap on a tile in my hand: select it, or discard it on the second tap */
function hzTap(id){
  if(!myTurn()||!V.hz||V.hz.stage!=='turn')return;
  if(HSEL===id){if(hzCanDiscard({cards:hzMine()},id)){HSEL=null;humanAct('discard',id)}return}
  HSEL=id;hzRenderHand();renderActions();
}
/* effects and the spoken word for each move */
function hzFx(v,ev){
  const p=v.players[ev.pid],g=p?p.gender:'m';
  if(ev.type==='discard'){SFX.flip();if(typeof say==='function'&&ev.tile!=null)say(hzName(hzKind(ev.tile)),g)}
  else if(ev.type==='peng'){SFX.check();say('碰',g)}
  else if(ev.type==='mgang'||ev.type==='agang'||ev.type==='bgang'){SFX.chips(3);say('杠',g)}
  else if(ev.type==='hu'){say(ev.how==='zimo'?'自摸':'胡了',g)}
}
/* stats panels */
function hzStatsHTML(st,s){
  const n=st.hz||0;
  return `<div class="stat"><div class="k">盈亏</div><div class="v ${s.pr>0?'pos':s.pr<0?'neg':''}">${sgn(s.pr)}</div><div class="s">共 ${n} 局</div></div>
    <div class="stat"><div class="k">胡牌</div><div class="v">${st.hzW||0}</div><div class="s">${n?pct0((st.hzW||0)/n):'—'}</div></div>
    <div class="stat"><div class="k">点炮</div><div class="v">${st.hzP||0}</div><div class="s">${n?pct0((st.hzP||0)/n):'—'}</div></div>`;
}
const hzProfileRow=p=>{const s=p.st||{},n=s.hz||0;return `<td class="r num">${n}</td><td class="r num">${s.hzW||0}</td><td class="r num">${s.hzP||0}</td>`};
