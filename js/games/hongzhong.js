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
  S.hz={wall,stage:'turn',drawn:P()[dl].cards[P()[dl].cards.length-1],discards:{0:[],1:[],2:[],3:[]},melds:{0:[],1:[],2:[],3:[]},
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
      else if(p.trust)at(q=>hzAutoMove(q,S.cfg.coachAuto!==false),delay());
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
/* who may take a discard, and how: 胡 (点炮 allowed, or a 抢杠), 明杠, 碰, 吃 (the next player only) */
function hzClaimOpts(tile,from,qiang){
  const h=S.hz,out={},cfg=S.cfg;
  for(let k=1;k<HZ_N;k++){const q=P()[(from+k)%HZ_N],o=[];
    const canHu=(qiang?cfg.hzQiangGang:cfg.hzDianpao)&&!(cfg.hzRedSelf&&hzRed(q))&&hzWin([...q.cards,tile],h.melds[q.id]);
    if(canHu)o.push('hu');
    if(!qiang){
      if(h.wall.length&&hzCanMGang(q.cards,tile))o.push('mgang');
      if(hzCanPeng(q.cards,tile))o.push('peng');
      if(q.id===hzNext(from)&&hzChiOpts(q.cards,tile).length)o.push('chi');
    }
    if(o.length)out[q.id]=o;
  }
  return out;
}
/* everyone asked has answered: 胡 (nearest in turn order) > 杠 / 碰 > 吃, else the game goes on */
function hzResolve(){
  const h=S.hz,c=h.claim,order=[1,2,3].map(k=>(c.from+k)%HZ_N),got=t=>order.find(i=>c.ans[i]&&c.ans[i].type===t);
  let i=got('hu');
  if(i!=null){const p=P()[i];p.cards=hzSort([...p.cards,c.tile]);return hzEnd(i,c.from,c.qiang?'qiang':'pao')}
  if(c.qiang){const g=c.qiang;h.claim=null;return hzFinishBGang(P()[g.by],g.kind)}
  for(const t of ['mgang','peng','chi']){i=got(t);if(i==null)continue;
    const p=P()[i],a=c.ans[i],from=P()[c.from];
    from.lastAction='';h.discards[c.from]=h.discards[c.from].filter(x=>x!==c.tile);h.claim=null;h.first[i]=false;
    let ids;
    if(t==='chi'){const opts=hzChiOpts(p.cards,c.tile);ids=opts[Math.max(0,Math.min(opts.length-1,+a.arg||0))]}
    else ids=hzOf(p.cards,hzKind(c.tile),t==='mgang'?3:2);
    p.cards=p.cards.filter(x=>!ids.includes(x));
    h.melds[i].push({t,ids:hzSort([...ids,c.tile]),from:c.from});
    p.lastAction={chi:'吃',peng:'碰',mgang:'杠'}[t];log(`${p.name}：${p.lastAction} ${hzName(hzKind(c.tile))}`);hzEv(p,{type:t,tile:c.tile});
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
/* every move goes through here: the player on turn (discard / hu / agang / bgang), or a claim answer (hu / mgang / peng / chi / pass) */
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
  p.cards=p.cards.filter(x=>x!==id);h.discards[p.id].push(id);h.first[p.id]=false;h.last={pid:p.id,id};h.drawn=null;
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
  return {stage:h.stage,wallLeft:h.wall.length,drawn:S.toAct===seat?h.drawn:null,discards:JSON.parse(JSON.stringify(h.discards)),
    melds:Object.fromEntries(Object.entries(h.melds).map(([k,ms])=>[k,ms.map(m=>({t:m.t,from:m.from,ids:m.t==='agang'&&+k!==seat&&h.stage!=='over'?m.ids.map((x,i)=>i===1||i===2?x:null):m.ids.slice()}))])),
    claim:h.claim?{tile:h.claim.tile,from:h.claim.from,mine:h.claim.opts[seat]||null,answered:h.claim.ans[seat]!=null,qiang:!!h.claim.qiang,
      chi:h.claim.opts[seat]&&h.claim.opts[seat].includes('chi')?hzChiOpts(P()[seat].cards,h.claim.tile):null}:null,
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
  if(hzWin(p.cards,h.melds[p.id],{first:h.first[p.id]}))return hzAct(p,'hu');
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
  if(o.includes('chi')){const opts=hzChiOpts(p.cards,c.tile);const i=opts.findIndex(ids=>after(ids,'chi')<now);if(i>=0)return hzAct(p,'chi',i)}
  hzAct(p,'pass');
}
/* 托管 / 出牌超时: the coach's move, or the default: win when it can, else discard the tile just drawn (the rightmost
   non-红中 when that was a 红中); a claim passes unless it wins */
function hzAutoMove(p,coach){
  const h=S.hz;
  if(h.stage==='claim'){const o=h.claim.opts[p.id]||[];if(o.includes('hu'))return hzAct(p,'hu');return coach&&typeof hzAdvise==='function'?hzAdviseClaim(p):hzAct(p,'pass')}
  if(hzWin(p.cards,h.melds[p.id],{first:h.first[p.id]}))return hzAct(p,'hu');
  if(coach)return hzBotTurn(p);
  const d=h.drawn!=null&&hzCanDiscard(p,h.drawn)?h.drawn:[...p.cards].reverse().find(x=>hzCanDiscard(p,x));
  hzAct(p,'discard',d);
}
