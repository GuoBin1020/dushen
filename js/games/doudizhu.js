/* 赌神智慧树 · 斗地主: cards, hand types, legal plays, bidding, payouts, bots, host game flow and table pieces */
'use strict';

/* =====================================================================
   DOU DI ZHU (斗地主): 3 players, 54 cards, 17 each and 3 left for the landlord.
   Rules used: 抢地主 bidding (each rob doubles), then one 加倍 choice each, then play.
   The first player to empty their hand wins; the two farmers win or lose together.
   Bombs, the rocket and spring / anti-spring each double; a farmer's result is
   base × multiplier × their own double × the landlord's double, capped at ddcap × base.
   The rules part below never touches the page, so tools/ddz-test.js runs it in Node.
   ===================================================================== */
const isD=st=>!!(st&&st.cfg&&st.cfg.game==='ddz');
/* own card ids, separate from hold'em / 炸金花: id = rank*4 + suit for rank 0..12 (3 … A, 2); 52 small joker, 53 big joker */
const DR=['3','4','5','6','7','8','9','10','J','Q','K','A','2','小王','大王'];
const DD_TOP_SEQ=11;   // sequences (straights, pairs, planes) stop at A
const ddRank=id=>id<52?id>>2:id-39;
function ddDeck(){const d=[];for(let c=0;c<54;c++)d.push(c);for(let i=53;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]]}return d}
const ddSort=ids=>ids.slice().sort((a,b)=>ddRank(b)-ddRank(a)||b-a);
const DD_TYPE_CN={single:'单张',pair:'对子',triple:'三张',triple1:'三带一',triple2:'三带二',straight:'顺子',pairs:'连对',plane:'飞机',plane1:'飞机带翅膀',plane2:'飞机带翅膀',four2:'四带二',four22:'四带两对',bomb:'炸弹',rocket:'王炸'};
const ddTypeName=cls=>cls?DD_TYPE_CN[cls.type]||'':'';
function ddCounts(ids){const c=new Array(15).fill(0);ids.forEach(id=>c[ddRank(id)]++);return c}
/* the longest-first run of `k` consecutive ranks (up to A) that each hold at least `need` cards; highest such run */
function ddRun(cnt,k,need){for(let lo=DD_TOP_SEQ-k+1;lo>=0;lo--){let ok=true;for(let r=lo;r<lo+k;r++)if(cnt[r]<need){ok=false;break}if(ok)return lo}return -1}
/* what one play is, or null. When cards could be read several ways the order below decides:
   rocket, bomb, four-with-two, plane, three-with, straight / pairs, then single / pair / three.
   `laizi` is the wild rank in 赖子 mode (step 4); -1 means none. */
function ddClassify(ids,laizi=-1){
  if(laizi>=0)return ddReadings(ids,laizi)[0]||null;
  return ddPlain(ids);
}
function ddPlain(ids){
  const n=ids.length;if(!n)return null;
  const cnt=ddCounts(ids),mk=(type,main,len=1)=>type==='bomb'?{type,main,len,n,bk:'hard',as:[]}:{type,main,len,n,as:[]};
  const ranks=[];cnt.forEach((c,r)=>{if(c)ranks.push(r)});
  if(n===2&&cnt[13]&&cnt[14])return mk('rocket',14);
  if(n===4&&ranks.length===1)return mk('bomb',ranks[0]);
  /* four with two singles or two pairs (another four counts as two pairs); the jokers never pair */
  const fours=ranks.filter(r=>cnt[r]===4).sort((a,b)=>b-a);
  if(n===6&&fours.length&&!(cnt[13]&&cnt[14]))return mk('four2',fours[0]);
  if(n===8)for(const f of fours){if(ranks.every(r=>r===f||(r<13&&(cnt[r]===2||cnt[r]===4))))return mk('four22',f)}
  /* planes: the most triples first, so 555666777888 is four triples, not three with wings */
  for(let k=Math.floor(n/3);k>=2;k--){
    if(n===3*k){const lo=ddRun(cnt,k,3);if(lo>=0&&ranks.every(r=>r>=lo&&r<lo+k&&cnt[r]===3))return mk('plane',lo,k)}
    if(n===4*k){const lo=ddRun(cnt,k,3);if(lo>=0&&!(cnt[13]&&cnt[14]))return mk('plane1',lo,k)}
    if(n===5*k){const lo=ddRun(cnt,k,3);if(lo>=0){const rest=cnt.slice();for(let r=lo;r<lo+k;r++)rest[r]-=3;if(rest.every((c,r)=>c===0||(r<13&&c%2===0)))return mk('plane2',lo,k)}}
  }
  const t=ranks.find(r=>cnt[r]===3);
  if(t!=null){
    if(n===3)return mk('triple',t);
    if(n===4)return mk('triple1',t);
    if(n===5&&ranks.length===2&&ranks.some(r=>r!==t&&cnt[r]===2&&r<13))return mk('triple2',t);
  }
  const seq=c=>ranks.length===n/c&&ranks.every(r=>cnt[r]===c&&r<=DD_TOP_SEQ)&&ranks[ranks.length-1]-ranks[0]===ranks.length-1;
  if(n>=5&&seq(1))return mk('straight',ranks[0],n);
  if(n>=6&&n%2===0&&seq(2))return mk('pairs',ranks[0],n/2);
  if(n===1)return mk('single',ranks[0]);
  if(n===2&&ranks.length===1)return mk('pair',ranks[0]);
  return null;
}
/* ---------- 赖子: every way a play can be read ----------
   The four cards of the wild rank may stand for any rank from 3 to 2 (never a joker) when played with other cards;
   a play made only of wild cards keeps their own rank. Rather than trying every rank for every wild card, each shape
   is tried once: count what each rank of the shape still lacks and fill it with wild cards. Wild cards used as
   wings (kickers) keep their own rank and are not listed in `as`. */
const DD_ORDER=['rocket','bomb','four2','four22','plane','plane1','plane2','triple1','triple2','straight','pairs','single','pair','triple'];
function ddReadings(ids,laizi){
  const wild=id=>laizi>=0&&id<52&&ddRank(id)===laizi;
  const W=ids.filter(wild),k=W.length,n=ids.length;
  if(!n)return [];
  if(laizi<0||!k){const c=ddPlain(ids);return c?[c]:[]}
  if(k===n){
    const t=['single','pair','triple','bomb'][n-1];if(!t)return [];
    return [t==='bomb'?{type:'bomb',main:laizi,len:1,n,bk:'pure',as:[]}:{type:t,main:laizi,len:1,n,as:[]}];
  }
  const cnt=ddCounts(ids.filter(id=>!wild(id))),out=[];
  /* body: rank -> how many; wings: 0, or m singles ('s') or m pairs ('p') */
  const tryShape=(type,main,len,body,wings,m)=>{
    const left=cnt.slice();let w=k;const as=[];let wi=0;
    for(const [r,need] of body){
      const nat=Math.min(left[r],need);left[r]-=nat;const fill=need-nat;
      if(fill>0){if(r>=13||fill>w)return;w-=fill;for(let j=0;j<fill;j++){const id=W[wi++];if(r!==laizi)as.push({id,rank:r})}}
    }
    const rest=left.reduce((a,x)=>a+x,0);
    if(!wings){if(rest||w)return}
    else if(wings==='s'){if(rest+w!==m||(left[13]&&left[14]))return}
    else{
      if(left[13]||left[14])return;
      const odd=left.reduce((a,x,r)=>a+(r<13?x%2:0),0);
      if(odd>w||(w-odd)%2||rest+w!==2*m)return;
      /* a wild card that pairs a lone natural card in the wings stands for that rank */
      for(let r=0;r<13;r++)if(left[r]%2){const id=W[wi++];if(r!==laizi)as.push({id,rank:r})}
    }
    const c={type,main,len,n,as};
    if(type==='bomb')c.bk=as.length?'soft':'hard';
    out.push(c);
  };
  for(let r=0;r<13;r++){
    if(n===2)tryShape('pair',r,1,[[r,2]]);
    if(n===3)tryShape('triple',r,1,[[r,3]]);
    if(n===4){tryShape('bomb',r,1,[[r,4]]);tryShape('triple1',r,1,[[r,3]],'s',1)}
    if(n===5)tryShape('triple2',r,1,[[r,3]],'p',1);
    if(n===6)tryShape('four2',r,1,[[r,4]],'s',2);
    if(n===8)tryShape('four22',r,1,[[r,4]],'p',2);
  }
  const seqBody=(lo,len,each)=>{const b=[];for(let r=lo;r<lo+len;r++)b.push([r,each]);return b};
  for(let lo=0;lo<=DD_TOP_SEQ;lo++){
    if(n>=5&&lo+n-1<=DD_TOP_SEQ)tryShape('straight',lo,n,seqBody(lo,n,1));
    if(n>=6&&n%2===0&&lo+n/2-1<=DD_TOP_SEQ)tryShape('pairs',lo,n/2,seqBody(lo,n/2,2));
    for(let m=2;3*m<=n&&lo+m-1<=DD_TOP_SEQ;m++){
      if(n===3*m)tryShape('plane',lo,m,seqBody(lo,m,3));
      if(n===4*m)tryShape('plane1',lo,m,seqBody(lo,m,3),'s',m);
      if(n===5*m)tryShape('plane2',lo,m,seqBody(lo,m,3),'p',m);
    }
  }
  /* one reading per type / main / len, in the usual priority order, higher main first */
  const seen=new Set(),res=[];
  out.sort((a,b)=>DD_ORDER.indexOf(a.type)-DD_ORDER.indexOf(b.type)||b.main-a.main||b.len-a.len);
  for(const c of out){const key=c.type+'|'+c.main+'|'+c.len;if(!seen.has(key)){seen.add(key);res.push(c)}}
  return res;
}
const DD_BK={soft:0,hard:1,pure:2};
/* can `cls` be played over `prev`? (prev null: leading, anything goes). Bombs: pure 赖子 > any hard > any soft, then rank. */
function ddBeats(cls,prev){
  if(!cls)return false;if(!prev)return true;
  if(cls.type==='rocket')return true;if(prev.type==='rocket')return false;
  if(cls.type==='bomb'){if(prev.type!=='bomb')return true;const a=DD_BK[cls.bk||'hard'],b=DD_BK[prev.bk||'hard'];return a!==b?a>b:cls.main>prev.main}
  if(prev.type==='bomb')return false;
  return cls.type===prev.type&&cls.len===prev.len&&cls.n===prev.n&&cls.main>prev.main;
}

/* ---------- legal plays ----------
   Built from the shape of the hand rather than every subset. Kickers are the smallest spare cards
   (true singles / pairs first, so a pair is not broken for a wing), one variant per main part. */
function ddByRank(hand){const g=[];for(let r=0;r<15;r++)g.push([]);ddSort(hand).reverse().forEach(id=>g[ddRank(id)].push(id));return g}
function ddKickers(g,used,k,size){
  const main=new Set(used);
  /* `size` 1: singles, 2: pairs; take from ranks with exactly that many cards first, then larger ones; never the jokers as a pair */
  const out=[];
  for(const pass of [0,1])for(let r=0;r<15&&out.length<k;r++){
    if(used.has(r))continue;const c=g[r].length;
    if(size===2&&r>=13)continue;
    if(pass===0?c!==size:c<=size)continue;
    out.push(g[r].slice(0,size));used.add(r);
  }
  /* still short of single wings: the second card of a pair (never a joker, never the main part) can be one too */
  if(size===1&&out.length<k){const taken=new Set(out.flat());for(let r=0;r<13&&out.length<k;r++){if(main.has(r))continue;for(const id of g[r])if(out.length<k&&!taken.has(id)){out.push([id]);taken.add(id)}}}
  return out.length===k?out.flat():null;
}
function ddMoves(hand,prev,laizi=-1){
  const g=ddByRank(hand),cnt=g.map(x=>x.length),cand=[];
  const run=(need,minLen)=>{const out=[];for(let lo=0;lo<=DD_TOP_SEQ;lo++)for(let hi=lo;hi<=DD_TOP_SEQ&&cnt[hi]>=need;hi++)if(hi-lo+1>=minLen)out.push([lo,hi]);return out};
  const take=(lo,hi,need)=>{const ids=[];for(let r=lo;r<=hi;r++)ids.push(...g[r].slice(0,need));return ids};
  for(let r=0;r<15;r++){
    const c=cnt[r];if(!c)continue;
    cand.push([g[r][0]]);
    if(c>=2&&r<13)cand.push(g[r].slice(0,2));
    if(c>=3){
      const tri=g[r].slice(0,3);cand.push(tri);
      const k1=ddKickers(g,new Set([r]),1,1);if(k1)cand.push(tri.concat(k1));
      const k2=ddKickers(g,new Set([r]),1,2);if(k2)cand.push(tri.concat(k2));
    }
    if(c===4){
      cand.push(g[r].slice());
      const s=ddKickers(g,new Set([r]),2,1);if(s)cand.push(g[r].concat(s));
      const p=ddKickers(g,new Set([r]),2,2);if(p)cand.push(g[r].concat(p));
    }
  }
  run(1,5).forEach(([lo,hi])=>cand.push(take(lo,hi,1)));
  run(2,3).forEach(([lo,hi])=>cand.push(take(lo,hi,2)));
  run(3,2).forEach(([lo,hi])=>{
    const k=hi-lo+1,body=take(lo,hi,3),used=new Set();for(let r=lo;r<=hi;r++)used.add(r);
    cand.push(body);
    const k1=ddKickers(g,new Set(used),k,1);if(k1)cand.push(body.concat(k1));
    const k2=ddKickers(g,new Set(used),k,2);if(k2)cand.push(body.concat(k2));
  });
  if(cnt[13]&&cnt[14])cand.push([g[13][0],g[14][0]]);
  if(laizi>=0)ddWildMoves(hand,laizi).forEach(m=>cand.push(m));
  const seen=new Set(),out=[];
  for(const m of cand){
    const key=m.slice().sort((a,b)=>a-b).join(',');if(seen.has(key))continue;seen.add(key);
    const cls=ddPlayReading(m,prev,laizi);if(cls)out.push({m,cls});
  }
  const tier=c=>c.type==='rocket'?4:c.type==='bomb'?1+DD_BK[c.bk||'hard']:0;
  out.sort((a,b)=>tier(a.cls)-tier(b.cls)||a.cls.main-b.cls.main||a.cls.n-b.cls.n);
  return out.map(x=>x.m);
}

/* the reading a play is made with: the first of its readings that beats `prev` (null when none does) */
function ddPlayReading(cards,prev,laizi=-1){
  if(!cards||!cards.length)return null;
  if(laizi<0){const c=ddPlain(cards);return c&&ddBeats(c,prev)?c:null}
  /* the same cards can often be a bomb or something cheaper (9 9 9 赖: bomb or 三带一); the cheaper one comes first */
  const r=ddReadings(cards,laizi).filter(c=>ddBeats(c,prev));
  return r.find(c=>c.type!=='bomb'&&c.type!=='rocket')||r[0]||null;
}
/* the readings a player chooses between: one per type (the highest rank of that type, the hardest to beat), non-bombs first */
function ddChoices(cards,prev,laizi=-1){
  if(laizi<0){const c=ddPlayReading(cards,prev,-1);return c?[c]:[]}
  const seen=new Set(),out=[];
  for(const c of ddReadings(cards,laizi))if(ddBeats(c,prev)&&!seen.has(c.type)){seen.add(c.type);out.push(c)}
  const bomb=c=>c.type==='bomb'||c.type==='rocket';
  return out.filter(c=>!bomb(c)).concat(out.filter(bomb));
}
const ddChoiceLabel=c=>ddPlayText(c)+(c.as&&c.as.length?' · 赖→'+c.as.map(x=>DR[x.rank]).join('、'):'');
/* 赖子 plays: for each shape, take the natural cards it can and fill what is missing with wild cards
   (shapes that need no wild card are already among the plain moves). Wings come from spare natural cards first. */
function ddWildMoves(hand,laizi){
  const W=hand.filter(id=>id<52&&ddRank(id)===laizi);if(!W.length)return [];
  const nat=hand.filter(id=>!W.includes(id)),gn=ddByRank(nat),out=[];
  const fill=body=>{
    const ids=[],ranks=new Set();let w=0;
    for(const [r,need] of body){const have=gn[r].slice(0,need);if(r>=13&&have.length<need)return null;ids.push(...have);w+=need-have.length;ranks.add(r)}
    if(!w||w>W.length)return null;
    return {ids:ids.concat(W.slice(0,w)),w,ranks};
  };
  const wings=(f,m,size)=>{
    const k=ddKickers(gn,new Set(f.ranks),m,size);if(k)return f.ids.concat(k);
    const spare=W.slice(f.w);if(spare.length>=m*size)return f.ids.concat(spare.slice(0,m*size));
    return null;
  };
  const add=x=>{if(x)out.push(x)};
  for(let r=0;r<13;r++){
    for(const need of [2,3,4]){const f=fill([[r,need]]);if(f)add(f.ids)}
    let f=fill([[r,3]]);if(f){add(wings(f,1,1));add(wings(f,1,2))}
    f=fill([[r,4]]);if(f){add(wings(f,2,1));add(wings(f,2,2))}
  }
  const seq=(lo,len,each)=>{const b=[];for(let r=lo;r<lo+len;r++)b.push([r,each]);return b};
  for(let lo=0;lo<=DD_TOP_SEQ;lo++){
    for(let len=5;lo+len-1<=DD_TOP_SEQ;len++){const f=fill(seq(lo,len,1));if(f)add(f.ids)}
    for(let m=3;lo+m-1<=DD_TOP_SEQ;m++){const f=fill(seq(lo,m,2));if(f)add(f.ids)}
    for(let m=2;lo+m-1<=DD_TOP_SEQ&&3*m<=hand.length;m++){const f=fill(seq(lo,m,3));if(f){add(f.ids);add(wings(f,m,1));add(wings(f,m,2))}}
  }
  return out;
}

/* ---------- splitting a hand into as few plays as possible ----------
   Rocket and bombs stand alone; then a small memoised search over sequences (straights, pair runs, planes),
   with whatever is left counted as threes (each carrying a single or a pair), pairs and singles. */
function ddRestHands(cnt){
  let t=0,p=0,s=0;for(let r=0;r<15;r++){const c=cnt[r];if(c===3)t++;else if(c===2)p++;else if(c===1)s++}
  const cs=Math.min(t,s),cp=Math.min(t-cs,p);return t+(s-cs)+(p-cp);
}
function ddSeqOptions(cnt){
  const out=[];
  for(const [need,minLen,type] of [[1,5,'straight'],[2,3,'pairs'],[3,2,'plane']])
    for(let lo=0;lo<=DD_TOP_SEQ;lo++)for(let hi=lo;hi<=DD_TOP_SEQ&&cnt[hi]>=need;hi++)if(hi-lo+1>=minLen)out.push({type,lo,hi,need});
  return out;
}
/* with 赖子: each wild card in turn is tried as every other rank (as a stand-in card of that rank), keeping whatever
   needs the fewest plays; the stand-ins are swapped back for the wild cards in the groups returned */
function ddSplit(hand,laizi=-1){
  const W=laizi>=0?hand.filter(id=>id<52&&ddRank(id)===laizi):[];
  if(!W.length)return ddSplitPlain(hand);
  let cur=hand.slice(),best=ddSplitPlain(cur);const back=new Map();
  for(const w of W){
    let pick=null;
    for(let r=0;r<13;r++){
      if(r===laizi)continue;
      const used=new Set(cur),s=[0,1,2,3].find(x=>!used.has(r*4+x));if(s==null)continue;
      const stand=r*4+s,trial=cur.map(id=>id===w?stand:id),sp=ddSplitPlain(trial);
      if(sp.hands<best.hands){best=sp;pick={stand,trial}}
    }
    if(pick){cur=pick.trial;back.set(pick.stand,w)}
  }
  const groups=best.groups.map(g=>g.map(id=>back.has(id)?back.get(id):id));
  return {groups,hands:groups.length};
}
function ddSplitPlain(hand){
  const g=ddByRank(hand),groups=[];
  if(g[13].length&&g[14].length){groups.push([g[13].shift(),g[14].shift()])}
  for(let r=0;r<13;r++)if(g[r].length===4){groups.push(g[r].splice(0))}
  const cnt=g.map(x=>x.length),memo=new Map();
  const best=c=>{
    const key=c.join('');if(memo.has(key))return memo.get(key);
    let res={h:ddRestHands(c),seqs:[]};
    for(const o of ddSeqOptions(c)){
      const n=c.slice();for(let r=o.lo;r<=o.hi;r++)n[r]-=o.need;
      const sub=best(n);if(sub.h+1<res.h)res={h:sub.h+1,seqs:[o,...sub.seqs]};
    }
    memo.set(key,res);return res;
  };
  const plan=best(cnt);
  for(const o of plan.seqs){const ids=[];for(let r=o.lo;r<=o.hi;r++)ids.push(...g[r].splice(0,o.need));groups.push(ids)}
  /* what is left: threes take the smallest singles, then the smallest pairs */
  const left=r=>g[r].length,tri=[],pairs=[],singles=[];
  for(let r=0;r<15;r++){if(left(r)===3)tri.push(g[r].splice(0));else if(left(r)===2)pairs.push(g[r].splice(0));else if(left(r)===1)singles.push(g[r].splice(0))}
  tri.forEach(t=>{if(singles.length)groups.push(t.concat(singles.shift()));else if(pairs.length)groups.push(t.concat(pairs.shift()));else groups.push(t)});
  pairs.forEach(p=>groups.push(p));singles.forEach(s=>groups.push(s));
  return {groups,hands:groups.length};
}

/* ---------- 抢地主 bidding: a queue of who answers next ----------
   Everyone in turn may call; after a call, the players behind the caller who have not passed may rob (each rob doubles);
   if anyone robbed, the caller gets one last rob. The last to call or rob is the landlord; nobody calling means a redeal. */
function ddBidNew(order,forced){
  return {order:order.slice(),forced:!!forced,log:[],caller:-1,last:forced?order[0]:-1,robs:0,final:false,
    queue:forced?[]:order.map(pid=>({pid,kind:'call'}))};
}
const ddBidAsk=b=>b.queue.length?{...b.queue[0]}:null;
function ddBidStep(b,pid,yes){
  if(!b.queue.length||b.queue[0].pid!==pid)return b;
  const n={...b,log:b.log.concat({pid,kind:b.queue[0].kind,yes:!!yes}),queue:b.queue.slice(1)};
  const kind=b.queue[0].kind;
  if(kind==='call'&&yes){n.caller=pid;n.last=pid;n.queue=n.queue.map(q=>({pid:q.pid,kind:'rob'}))}
  if(kind==='rob'&&yes){n.robs++;n.last=pid}
  if(!n.queue.length&&n.caller>=0&&n.robs>0&&!n.final&&pid!==n.caller){n.final=true;n.queue=[{pid:n.caller,kind:'rob'}]}
  return n;
}
function ddBidResult(b){
  if(b.queue.length)return {landlord:-1,robs:b.robs,redeal:false};
  return b.last<0?{landlord:-1,robs:0,redeal:true}:{landlord:b.last,robs:b.robs,redeal:false};
}

/* ---------- hand end: spring and chips ---------- */
function ddSpring(played,landlord,winner){
  const farmers=Object.keys(played).map(Number).filter(p=>p!==landlord);
  if(winner===landlord)return farmers.every(f=>!played[f])?'spring':'';
  return played[landlord]===1?'anti':'';
}
/* each farmer: base × mult × own double × landlord double, capped; nobody pays more than they hold;
   a landlord who cannot cover both farmers splits what they have in proportion (rounding leftovers to the larger claim) */
function ddPayout({base,mult,cap,landlordWon,landlord,farmers,dbl,stacks}){
  const amt=f=>Math.min(base*mult*(dbl[f]?2:1)*(dbl[landlord]?2:1),cap*base);
  const d={[landlord]:0};
  if(landlordWon){farmers.forEach(f=>{const pay=Math.min(amt(f),stacks[f]);d[f]=-pay;d[landlord]+=pay});return d}
  const owe=farmers.map(amt),total=owe.reduce((a,x)=>a+x,0),have=stacks[landlord];
  let pay=owe.slice();
  if(have<total){
    pay=owe.map(o=>Math.floor(have*o/total));
    let rem=have-pay.reduce((a,x)=>a+x,0);
    const order=farmers.map((f,i)=>i).sort((a,b)=>owe[b]-owe[a]||a-b);
    for(let k=0;rem>0;k++,rem--)pay[order[k%order.length]]++;
  }
  farmers.forEach((f,i)=>{d[f]=pay[i];d[landlord]-=pay[i]});
  return d;
}

/* ---------- bots ----------
   Each bot gets one personality. `bid` / `rob` / `dbl` are hand-strength thresholds (ddStrength),
   `bomb` how readily it bombs without being pressed, `team` how readily a farmer steps aside for the partner. */
const DD_ARCH={
  aggro:{name:'激进',desc:'手牌一般也愿意抢地主，炸弹出得早',bid:3.5,rob:6,dbl:8,bomb:0.6,team:0.3},
  safe:{name:'保守',desc:'只在手牌好时叫地主，炸弹留到最后',bid:6,rob:8.5,dbl:11,bomb:0.15,team:0.5},
  team:{name:'配合',desc:'当农民时优先帮队友，很少和队友抢牌',bid:5,rob:7.5,dbl:10,bomb:0.35,team:0.9}
};
const ddPickArch=()=>rand(Object.keys(DD_ARCH));
/* big cards and bombs count up; a hand that needs many plays to get rid of counts down */
function ddStrength(hand,laizi=-1){
  const cnt=ddCounts(hand);let s=0;
  if(laizi>=0)s+=1.5*hand.filter(id=>id<52&&ddRank(id)===laizi).length;
  if(cnt[14])s+=4;if(cnt[13])s+=3;if(cnt[13]&&cnt[14])s+=2;
  s+=cnt[12]*2+cnt[11];
  for(let r=0;r<13;r++)if(cnt[r]===4)s+=4;
  return s-0.8*Math.max(0,ddSplit(hand,laizi).hands-6);
}
function ddBotBid(hand,kind,arch,laizi=-1){return ddStrength(hand,laizi)>=(kind==='rob'?arch.rob:arch.bid)}
function ddBotDouble(hand,isLandlord,arch,laizi=-1){return ddStrength(hand,laizi)>=arch.dbl}
const DD_SEQ_TYPES=new Set(['straight','pairs','plane','plane1','plane2']);
const ddIsBomb=cls=>cls.type==='bomb'||cls.type==='rocket';
const ddMinus=(hand,m)=>{const s=new Set(m);return hand.filter(id=>!s.has(id))};
/* one decision from what a seat can see: the best-scored move (doudizhu-coach.js) */
function ddBotPlay(info){
  const best=ddEvalMoves(info)[0];
  if(!best||!best.cards)return null;
  /* the reading it was scored with travels along (a 赖子 play may be a bomb or something cheaper) */
  const m=best.cards.slice();Object.defineProperty(m,'cls',{value:best.cls});return m;
}

/* =====================================================================
   HOST GAME FLOW — runs on the host (or solo), on S like the other games.
   S.dealer is the first to bid: random for the first hand, then the next seat each hand; a redeal keeps it.
   ===================================================================== */
const ddNext=id=>(id+1)%3;
function ddPlayText(cls){
  const r=DR[cls.main];
  return cls.type==='single'?r:cls.type==='pair'?'对'+r:cls.type==='triple'?'三个'+r:ddTypeName(cls);
}
function ddDeal(live){
  S.handNo++;S.board=[];S.msg='';
  S.dealer=nextIdx(S.dealer,p=>p.inHand);
  log(`第 ${S.handNo} 局`,'sep');
  ddShuffleDeal(0);
}
function ddShuffleDeal(redeals){
  const deck=ddDeck(),order=[0,1,2].map(k=>(S.dealer+k)%3);
  P().forEach(p=>{p.cards=[];p.lastAction='';p.shown=false;p.handName=''});
  for(let k=0;k<51;k++)P()[order[k%3]].cards.push(deck[k]);
  P().forEach(p=>{p.cards=ddSort(p.cards)});
  S.dd={stage:'bid',order,bid:ddBidNew(order,redeals>=3),landlord:-1,bottom:deck.slice(51),mult:1,robs:0,bombs:0,rockets:0,
    dbl:{},dblAsk:[],lead:null,passes:0,shown:{},played:{0:0,1:0,2:0},out:[],redeals,spring:'',
    /* 赖子 mode: one rank (3 … 2) is drawn after the deal, before bidding, and shown to everyone */
    laizi:S.cfg.laizi?Math.floor(Math.random()*13):-1,soft:0,hard:0,pure:0};
  Object.assign(S,{phase:'playing',toAct:-1,street:'ddz',currentBet:0,minRaise:0,raises:0,preRaisers:[],sbId:-1,bbId:-1});
  if(S.dd.laizi>=0)log(`翻出赖子：${DR[S.dd.laizi]}`,'board-l');
  if(S.dd.bid.forced){log(`连续 ${redeals} 次没人叫地主，这次由 ${P()[order[0]].name} 当地主`);return ddLandlord(ddBidResult(S.dd.bid))}
  ddProceed();
}
function ddLandlord(r){
  const d=S.dd,L=r.landlord,lp=P()[L];
  d.landlord=L;d.robs=r.robs;d.mult=2**r.robs;
  lp.cards=ddSort(lp.cards.concat(d.bottom));
  d.stage='double';d.dblAsk=[ddNext(L),ddNext(ddNext(L)),L];
  P().forEach(p=>{p.lastAction=p.id===L?'地主':''});
  log(`${lp.name} 当地主，底牌 ${ddSort(d.bottom).map(id=>DR[ddRank(id)]).join(' ')}`,'win-l');
  S.ev={seq:(S.ev?S.ev.seq:0)+1,pid:L,type:'landlord'};
  ddProceed();
}
function ddProceed(){
  if(S.phase!=='playing'||!S.dd)return;
  const d=S.dd;
  if(d.stage==='bid'){
    const a=ddBidAsk(d.bid);
    if(!a){
      const r=ddBidResult(d.bid);
      if(r.redeal){S.msg='没人叫地主，重新发牌';log(S.msg);return ddShuffleDeal(d.redeals+1)}
      return ddLandlord(r);
    }
    S.toAct=a.pid;
  }else if(d.stage==='double'){
    if(d.dblAsk.length)S.toAct=d.dblAsk[0];
    else{d.stage='play';S.toAct=d.landlord;P().forEach(p=>{p.lastAction=p.id===d.landlord?'地主':''})}
  }
  const p=P()[S.toAct],id=p.id,hn=S.handNo,mark=S.ddseq=(S.ddseq||0)+1;
  sync();clearTimeout(timer);
  const still=()=>S&&S.phase==='playing'&&S.toAct===id&&S.handNo===hn&&S.ddseq===mark;
  /* a seat that dropped off is played by the bot logic once the grace period is over */
  if(isBot(p))timer=setTimeout(()=>{if(still())ddBotTurn(p)},delay());
  else if(!present(p))timer=setTimeout(()=>{if(still())ddBotTurn(p)},ddGraceFor(p));
}
/* how long a dropped seat waits before the bot plays it: nothing for someone who left for good */
const ddGraceFor=p=>p.left?0:Math.max(400,(p.discAt||0)+DISC_GRACE-Date.now());
function ddAct(p,type,arg){
  if(!S||S.phase!=='playing'||!S.dd||S.toAct!==p.id)return;
  const d=S.dd,ev=o=>{S.ev={seq:(S.ev?S.ev.seq:0)+1,pid:p.id,...o}};
  if(d.stage==='bid'){
    if(type!=='bid')return sync();
    const a=ddBidAsk(d.bid),yes=!!+arg;
    d.bid=ddBidStep(d.bid,p.id,yes);
    if(a.kind==='rob'&&yes){d.robs++;d.mult*=2}
    const word=a.kind==='call'?(yes?'叫地主':'不叫'):(yes?'抢地主':'不抢');
    p.lastAction=word;log(`${p.name}：${word}`);ev({type:'bid',kind:a.kind,yes});
    return ddProceed();
  }
  if(d.stage==='double'){
    if(type!=='double')return sync();
    const yes=!!+arg;d.dbl[p.id]=yes;d.dblAsk.shift();
    p.lastAction=yes?'加倍':'不加倍';log(`${p.name}：${p.lastAction}`);ev({type:'double',yes});
    return ddProceed();
  }
  if(d.stage!=='play')return sync();
  const prev=d.lead&&d.lead.pid!==p.id?d.lead.cls:null;
  if(type==='pass'){
    if(!prev)return sync();
    d.shown[p.id]='pass';d.passes++;p.lastAction='不要';log(`${p.name}：不要`);ev({type:'pass'});
    /* both others passed: whoever played last leads again on a clean table */
    if(d.passes>=2){S.toAct=d.lead.pid;d.lead=null;d.passes=0;d.shown={}}
    else S.toAct=ddNext(p.id);
    return ddProceed();
  }
  if(type!=='play')return sync();
  /* arg: the card ids, or {cards, as} where as = {type, main, len} picks one reading of a 赖子 play */
  const spec=Array.isArray(arg)?{cards:arg}:arg&&typeof arg==='object'?arg:{};
  const ids=Array.isArray(spec.cards)?spec.cards.map(Number):[],want=spec.as&&typeof spec.as==='object'?spec.as:null;
  if(!ids.length||new Set(ids).size!==ids.length||!ids.every(id=>p.cards.includes(id)))return sync();
  const cls=want?ddReadings(ids,d.laizi).find(c=>c.type===want.type&&c.main===want.main&&c.len===(want.len||1)&&ddBeats(c,prev)):ddPlayReading(ids,prev,d.laizi);
  if(!cls)return sync();
  p.cards=p.cards.filter(id=>!ids.includes(id));d.played[p.id]++;d.out.push(...ids);
  /* bombs: ×2 without 赖子; in 赖子 mode soft ×2, hard ×4, pure 赖子 ×4 */
  if(cls.type==='bomb'){d.bombs++;const k=cls.bk||'hard';d[k]=(d[k]||0)+1;d.mult*=d.laizi>=0&&k!=='soft'?4:2}
  if(cls.type==='rocket'){d.rockets++;d.mult*=2}
  if(ddIsBomb(cls))p.st.ddB=(p.st.ddB||0)+1;
  const cards=ddSort(ids),text=ddPlayText(cls);
  d.lead={pid:p.id,cls,cards};d.passes=0;d.shown[p.id]={cards,cls};
  p.lastAction=text;log(`${p.name}：${text}（${cards.map(id=>DR[ddRank(id)]).join(' ')}）`);
  ev({type:'play',cls,left:p.cards.length});
  if(isBot(p)){
    if(ddIsBomb(cls)&&Math.random()<0.5)botChat(p,cls.type==='rocket'?['王炸！','就问你怕不怕']:['炸！','炸你没商量']);
    else if(p.cards.length===1||p.cards.length===2)botChat(p,[p.cards.length===1?'我只剩 1 张了':'我只剩 2 张了']);
  }
  if(!p.cards.length)return ddEnd(p.id);
  S.toAct=ddNext(p.id);
  ddProceed();
}
function ddBotTurn(p){
  const d=S.dd,A=DD_ARCH[p.ddArch]||DD_ARCH.safe;
  if(d.stage==='bid')return ddAct(p,'bid',ddBotBid(p.cards,ddBidAsk(d.bid).kind,A,d.laizi)?1:0);
  if(d.stage==='double')return ddAct(p,'double',ddBotDouble(p.cards,p.id===d.landlord,A,d.laizi)?1:0);
  const counts={};P().forEach(q=>{counts[q.id]=q.cards.length});
  const prev=d.lead&&d.lead.pid!==p.id?{cls:d.lead.cls,pid:d.lead.pid}:null;
  let m=ddBotPlay({hand:p.cards,prev,me:p.id,landlord:d.landlord,counts,arch:A,out:d.out,laizi:d.laizi});
  if(!m&&!prev)m=ddMoves(p.cards,null,d.laizi)[0];
  const seq=S.ev&&S.ev.seq;
  /* the reading is picked here too, so a 赖子 play goes out the way the bot meant it */
  const asOf=c=>{const r=c.cls||ddPlayReading(c,prev&&prev.cls,d.laizi);return r?{type:r.type,main:r.main,len:r.len}:null};
  if(m)ddAct(p,'play',{cards:m,as:asOf(m)});else ddAct(p,'pass');
  /* the host refused it (it should never happen): pass, or lead the first legal play, so the hand cannot stall */
  if(S&&S.phase==='playing'&&S.dd===d&&S.toAct===p.id&&(S.ev&&S.ev.seq)===seq){
    if(prev)ddAct(p,'pass');else ddAct(p,'play',ddMoves(p.cards,null,d.laizi)[0]);
  }
}
function ddEnd(w){
  const d=S.dd,L=d.landlord,lp=P()[L],landlordWon=w===L,farmers=[0,1,2].filter(x=>x!==L);
  d.spring=ddSpring(d.played,L,w);if(d.spring)d.mult*=2;
  const stacks={};P().forEach(p=>{stacks[p.id]=p.stack});
  const delta=ddPayout({base:S.cfg.base,mult:d.mult,cap:S.cfg.ddcap,landlordWon,landlord:L,farmers,dbl:d.dbl,stacks});
  P().forEach(p=>{
    const x=delta[p.id]||0;p.stack+=x;if(x>0)p.won=x;else p.total=-x;
    p.shown=true;p.handName=p.id===L?'地主':'农民';
    const s=p.st;s.dd=(s.dd||0)+1;s.ddM=(s.ddM||0)+d.mult;if(p.id===L)s.ddL=(s.ddL||0)+1;
    if((p.id===L)===landlordWon){s.ddW=(s.ddW||0)+1;if(p.id===L)s.ddLW=(s.ddLW||0)+1;if(d.spring)s.ddS=(s.ddS||0)+1}
  });
  d.stage='over';S.toAct=-1;
  const sp=d.spring==='spring'?'（春天）':d.spring==='anti'?'（反春）':'';
  S.msg=`${landlordWon?`地主 ${lp.name} 赢了`:'农民赢了'}${sp}，倍数 ×${d.mult}（${ddMultText(d,P().map(p=>p.name))}）`;log(S.msg,'win-l');
  endHand();
}
/* how the multiplier came about, for the end-of-hand message */
function ddMultText(d,names){
  const parts=[];
  if(d.robs)parts.push(`抢地主 ${d.robs} 次 ×${2**d.robs}`);
  if(d.laizi>=0){
    if(d.soft)parts.push(`软炸 ${d.soft} 个 ×${2**d.soft}`);
    if(d.hard)parts.push(`硬炸 ${d.hard} 个 ×${4**d.hard}`);
    if(d.pure)parts.push(`纯赖子炸 ${d.pure} 个 ×${4**d.pure}`);
  }else if(d.bombs)parts.push(`炸弹 ${d.bombs} 个 ×${2**d.bombs}`);
  if(d.rockets)parts.push('王炸 ×2');
  if(d.spring)parts.push((d.spring==='spring'?'春天':'反春')+' ×2');
  const dbl=Object.keys(d.dbl).filter(k=>d.dbl[k]).map(k=>names[k]);
  return (parts.join('、')||'没有翻倍')+(dbl.length?'；加倍：'+dbl.join('、'):'');
}
/* 斗地主 needs all three seats. Whoever leaves a seat (bot or human) moves to S.gone with its own chip flow,
   so the settlement still shows it and the newcomer starts clean. */
function ddRetire(p){
  const gid=100+S.gone.length;
  S.gone.push({...p,id:gid,out:true});
  for(const k of Object.keys(S.flow)){const [a,b]=k.split('>').map(Number);if(a!==p.id&&b!==p.id)continue;S.flow[(a===p.id?gid:a)+'>'+(b===p.id?gid:b)]=S.flow[k];delete S.flow[k]}
}
function ddNewBot(seat){
  const taken=new Set(P().concat(S.gone).map(q=>q.name));
  let k=0,nm;do{nm=NAMES[k%NAMES.length]+(k>=NAMES.length?'·'.repeat(Math.floor(k/NAMES.length)):'');k++}while(taken.has(nm));
  const bp=mkPlayer(seat,nm,'ai',null,S.cfg,FEMALE_BOTS.has(nm.replace(/·+$/,''))?'f':'m');
  bp.ai=genAI(pickArch());bp.ddArch=ddPickArch();
  return bp;
}
/* a bot that is out of chips with rebuys off */
function ddReplaceBot(p){
  ddRetire(p);const bp=ddNewBot(p.id);bp.style=p.style;if(p.ai)bp.ai=p.ai;S.players[p.id]=bp;
  log(`${p.name} 输光离桌，${bp.name} 入座`,'board-l');
}
/* a human who left for good, or one the host let a bot replace */
function ddReplaceHuman(p){
  ddRetire(p);const c=NET.conns.get(p.id);
  if(c){NET.conns.delete(p.id);c.seat=null;c.onclose=null;setTimeout(()=>{try{c.close()}catch(e){}},300)}
  const bp=ddNewBot(p.id);S.players[p.id]=bp;
  log(`${p.name} ${p.left?'离开了':'离开座位'}，${bp.name}（电脑）顶上`,'board-l');
}
/* someone joining mid-game waits for the next hand. The connection is kept off JSON (the host save serialises S). */
const ddWaitMsg=extra=>({t:'lobby',hostCard:typeof myCard==='function'?myCard():null,cards:[],game:'ddz',laizi:!!S.cfg.laizi,players:P().filter(p=>p.kind!=='ai').map(p=>p.name),seats:3,aiFill:S.cfg.aiFill,coach:S.cfg.coach,host:P()[0].name,wait:true,...extra});
function ddSeatWaiting(w,{name,gender,cid}){
  /* the same person again (a reconnect while waiting): keep one place in the queue, on the new connection */
  const same=cid&&S.ddWait.find(x=>x.cid===cid);
  if(same){const old=same.conn;same.conn=w;if(old&&old!==w){old.onclose=null;try{old.close()}catch(e){}}}
  else{
    /* a seat opens only where a bot sits or someone has left for good; otherwise say so at once */
    const free=P().filter(p=>p.kind==='ai'||(p.kind==='remote'&&p.left)).length-S.ddWait.length;
    if(free<=0){w.send({t:'full'});setTimeout(()=>{try{w.close()}catch(e){}},300);return}
    const e={name,gender,cid};Object.defineProperty(e,'conn',{value:w,enumerable:false,writable:true});S.ddWait.push(e);
  }
  w.send(ddWaitMsg());
}
/* back to the lobby after a settlement: the people still waiting come along while there are seats */
function ddLobbyHumans(humans){
  const out=humans.slice(),cap=S.cfg.players;
  for(const e of S.ddWait){
    if(!e.conn||e.conn.closed)continue;
    if(out.length<cap){e.conn.seat=null;out.push({name:uniqueName(e.name,out.map(h=>h.name)),kind:'remote',conn:e.conn,gender:e.gender,cid:e.cid})}
    else{e.conn.send({t:'full'});setTimeout(()=>{try{e.conn.close()}catch(x){}},300)}
  }
  S.ddWait=[];return out;
}
/* before each hand: leavers become bots, then waiting players take bots' seats (lowest seat first) */
function ddSeatChanges(){
  P().forEach(p=>{if(p.kind==='remote'&&p.left)ddReplaceHuman(p)});
  while(S.ddWait.length){
    const w=S.ddWait.shift(),bot=P().find(p=>p.kind==='ai');
    if(!w.conn||w.conn.closed)continue;
    if(!bot){w.conn.send({t:'full'});setTimeout(()=>{try{w.conn.close()}catch(e){}},300);continue}
    ddRetire(bot);
    const p=mkPlayer(bot.id,uniqueName(w.name,P().concat(S.gone).map(q=>q.name)),'remote',null,S.cfg,w.gender);p.cid=w.cid;
    S.players[bot.id]=p;w.conn.seat=bot.id;NET.conns.set(bot.id,w.conn);
    log(`${p.name} 入座，替换了 ${bot.name}（电脑）`,'board-l');
  }
}
/* the host's 「让电脑顶上」 for a human who is out of chips and not rebuying */
function ddTakeover(pid){
  const p=S&&isD(S)?P()[pid]:null;
  if(!p||p.kind!=='remote'||p.stack>0||p.inHand)return;
  const c=NET.conns.get(pid);if(c)c.send({t:'full',reason:'takeover'});
  ddReplaceHuman(p);startHand();
}
/* a host save from before these fields existed */
function ddNormalizeSave(st){
  if(st.dd&&!Array.isArray(st.dd.out))st.dd.out=[];
  if(!Array.isArray(st.gone))st.gone=[];
  st.ddWait=[];   // waiting players' connections do not survive a reload; they rejoin by themselves
}
/* what every seat may see of S.dd: the bottom cards only once there is a landlord */
function ddPublic(d){
  return {stage:d.stage,order:d.order.slice(),landlord:d.landlord,bottom:d.landlord>=0?d.bottom.slice():d.bottom.map(()=>null),
    mult:d.mult,robs:d.robs,bombs:d.bombs,rockets:d.rockets,dbl:{...d.dbl},dblAsk:d.dblAsk.slice(),passes:d.passes,
    lead:d.lead?{pid:d.lead.pid,cls:{...d.lead.cls},cards:d.lead.cards.slice()}:null,
    shown:Object.fromEntries(Object.entries(d.shown).map(([k,v])=>[k,v==='pass'?'pass':{cards:v.cards.slice(),cls:{...v.cls}}])),
    played:{...d.played},out:d.out.slice(),spring:d.spring,laizi:d.laizi>=0?d.laizi:-1,soft:d.soft||0,hard:d.hard||0,pure:d.pure||0,redeals:d.redeals,ask:d.stage==='bid'?ddBidAsk(d.bid):null,bidLog:d.bid.log.slice()};
}

/* =====================================================================
   TABLE PIECES — run on every device from its own view V (ui.js calls these when isD(V)).
   ===================================================================== */
/* cards this device has picked in its own hand; cleared on a new hand, after a play and on 重选 */
let DSEL=new Set(),DSEL_KEY='';
function ddCardHTML(id,o={}){
  if(id==null)return `<div class="card back" ${faceStyle(BACK_FILE)}></div>`;
  const r=ddRank(id),wild=o.lz>=0&&id<52&&r===o.lz,sel=(o.sel?' sel':'')+(o.rec?' rec':'')+(wild?' lz':''),data=o.pick?` data-dd="${id}"`:'';
  /* a 赖子 card: a 「赖」 tag, or 「→K」 once played as another rank; bottom-left, so it shows on stacked cards */
  const tag=o.stand!=null?`<i class="lzt ast">→${DR[o.stand]}</i>`:wild?'<i class="lzt">赖</i>':'';
  if(r>=13)return `<div class="card joker${r===14?' red':''}${sel}"${data} ${faceStyle(jokerFile(r===14))} aria-label="${DR[r]}"><span class="vh">${DR[r]}</span></div>`;
  const red=(id&3)===1||(id&3)===2;
  return `<div class="card${red?' red':''}${sel}"${data} ${faceStyle(cardFaceFile(DR[r],id&3))} aria-label="${SUIT_NAME[id&3]}${DR[r]}"><span class="vh">${DR[r]}${SU[id&3]}</span>${tag}</div>`;
}
/* a row of cards; `cls` (a played reading) marks the wild cards it used as other ranks */
const ddCardsHTML=(ids,lz=-1,cls=null)=>{const st=new Map(((cls&&cls.as)||[]).map(a=>[a.id,a.rank]));return ids.map(id=>ddCardHTML(id,{lz,stand:st.has(id)?st.get(id):null})).join('')};
const ddStageText=d=>d.stage==='bid'?(d.ask&&d.ask.kind==='rob'?'抢地主':'叫地主'):d.stage==='double'?'加倍':d.stage==='play'?'出牌中':'本局结束';
const ddRole=(v,pid)=>!v.dd||v.dd.landlord<0?'':pid===v.dd.landlord?'地主':'农民';
/* where each seat's last play lies on the felt: the two opponents' in front of them, toward the middle; mine above the buttons */
function ddPlaySpot(slot){return playXY(slot,V?V.players.length:3,tableOrient())}
function ddRenderTable(){
  const d=V.dd,n=V.players.length,o=tableOrient(),over=V.phase!=='playing';
  tableFrame(o,'ddz');
  let html='';
  V.players.forEach((p,i)=>{
    const slot=(i-V.me+n)%n,s=seatXY(slot,n,o);
    const cls=['seat',i===V.me?'me':'',V.toAct===i&&V.phase==='playing'?'active':'',p.won>0&&over?'win':''].join(' ');
    /* a dropped player's turns are played by the bot until they reconnect */
    const tg=p.kind==='remote'&&!p.connected&&p.inHand;
    const status=(tg?'托管中 · ':'')+(p.busted&&!p.inHand?'筹码输光':p.lastAction||'');
    const act=p.won>0&&over?`<div class="pact won">+${fmt(p.won)} · ${ddRole(V,i)}</div>`:p.total>0&&over?`<div class="pact">−${fmt(p.total)}</div>`:`<div class="pact${tg?' tg':''}">${esc(status)}</div>`;
    const left=p.cards.length,warn=left>0&&left<=2&&d&&d.stage==='play';
    const cards=i===V.me||!p.inHand?'':`<div class="dd-count${warn?' warn':''}">${ddCardHTML(null)}<b>${left}</b></div>`;
    html+=`<div class="${cls}" data-pid="${i}" style="${seatStyle(s)}">
      ${avatarHTML(p)}<div class="cards">${cards}</div>
      <div class="plate">${ddRole(V,i)==='地主'?'<span class="dd-lord" title="地主">地主</span>':''}
        <div class="pname">${esc(p.name)}${i===V.me&&NET.role!=='solo'?'（你）':''}</div>
        <div class="ptag">${esc(seatTag(p))||'&nbsp;'}</div>
        <div class="pstack">${fmt(p.stack)}</div>${act}
      </div></div>`;
    /* last play, or at the end what the others still held */
    const sp=playXY(slot,n,o),shown=d&&d.shown[i],rest=over&&i!==V.me&&left&&p.cards[0]!=null;
    if(rest||shown){
      const lz=d?d.laizi:-1;
      const inner=rest?`<span class="dd-tag">剩余</span>${ddCardsHTML(p.cards,lz)}`:shown==='pass'?'<span class="dd-pass">不要</span>':ddCardsHTML(shown.cards,lz,shown.cls);
      html+=`<div class="dd-play ${sp.al}${rest?' rest':''}" style="left:${sp.x}%;top:${sp.y}%">${inner}</div>`;
    }
  });
  if(d){
    /* the 赖子 rank rides on the stage line: no extra height in the middle of the table */
    const c=bottomXY(o);
    html+=`<div class="center dd-center" style="left:${c.x}%;top:${c.y}%"><div class="street">${V.phase==='playing'?ddStageText(d):'本局结束'}${d.laizi>=0?` <b class="dd-lz" aria-label="赖子是 ${DR[d.laizi]}">赖子 ${DR[d.laizi]}</b>`:''}</div>
      <div class="dd-bottom" aria-label="底牌">${d.bottom.map(id=>ddCardHTML(id,{lz:d.laizi})).join('')}</div>
      <div class="pot">倍数 <span>×${d.mult}</span></div></div>`;
  }
  $('#table').innerHTML=html;
  $('#table').classList.add('ddz');$('#table').classList.remove('zjh');
  ddLandTip();
  $('#table').dataset.n=String(n);
  ddRenderHand();
}
/* once per device: 斗地主 holds up to 20 cards, which read better sideways */
function ddLandTip(){
  if(!isNarrow()||!isTouch())return;
  let seen=false;try{seen=!!localStorage.getItem('dushen-ddz-tip');localStorage.setItem('dushen-ddz-tip','1')}catch(e){seen=true}
  /* a floating toast, not the banner: the banner would push the one-screen upright layout down */
  if(!seen)toast('横屏体验更好：把手机横过来，或者点上方的「横屏全屏」。',6000);
}
function ddRenderHand(){
  const el=$('#dd-hand');if(!el)return;
  const m=V.players[V.me],ids=m&&m.inHand?m.cards.filter(c=>c!=null):[];
  el.hidden=false;
  const key=V.handNo+'|'+(V.dd?V.dd.redeals:0);
  if(key!==DSEL_KEY){DSEL=new Set();DSEL_KEY=key}
  DSEL.forEach(id=>{if(!ids.includes(id))DSEL.delete(id)});
  const a=coachOn()&&LOCAL.mode==='live'&&myTurn()&&V.dd&&V.dd.stage==='play'?ddGetAdvice():null,rec=new Set(a&&a.rec.type==='play'?a.rec.cards:[]);
  el.innerHTML=`<div class="dd-row" role="group" aria-label="我的手牌，点选要出的牌">${ids.map(id=>ddCardHTML(id,{sel:DSEL.has(id),pick:true,rec:rec.has(id),lz:V.dd?V.dd.laizi:-1})).join('')}</div>`;
  ddFitHand();
}
/* overlap the cards just enough to fit the row */
function ddFitHand(){
  const row=document.querySelector('#dd-hand .dd-row');if(!row)return;
  const cs=row.querySelectorAll('.card'),k=cs.length;if(!k)return;
  const cw=cs[0].getBoundingClientRect().width||40,w=row.clientWidth;
  const step=k>1?Math.min(cw*0.62,(w-cw)/(k-1)):cw;
  row.style.setProperty('--step',step.toFixed(1)+'px');
}
function ddToggle(id,on){if(on)DSEL.add(id);else DSEL.delete(id);const c=document.querySelector(`#dd-hand [data-dd="${id}"]`);if(c)c.classList.toggle('sel',on)}
/* what the play button would do with the picked cards: {cls} or {why} */
function ddPickState(){
  const d=V.dd,prev=d&&d.lead&&d.lead.pid!==V.me?d.lead.cls:null,sel=[...DSEL];
  if(!sel.length)return {why:'先点选要出的牌',prev};
  const lz=d&&d.laizi>=0?d.laizi:-1,all=lz>=0?ddReadings(sel,lz):[ddClassify(sel)].filter(Boolean);
  if(!all.length)return {why:'选的牌不成牌型',prev};
  const readings=ddChoices(sel,prev,lz);
  if(!readings.length)return {why:`压不过上家的${ddTypeName(prev)}`,prev};
  return {cls:readings[0],readings,prev};
}
function ddWaitText(){
  const d=V.dd,p=V.players[V.toAct];if(!d||!p)return '…';
  const verb=d.stage==='bid'?(d.ask&&d.ask.kind==='rob'?'选择抢不抢地主':'选择叫不叫地主'):d.stage==='double'?'选择加不加倍':'出牌';
  return p.kind==='remote'&&!p.connected?`${esc(p.name)} 掉线了，稍后由电脑代打…`:`等待 ${esc(p.name)} ${verb}…`;
}
function ddRenderActions(el,m){
  const d=V.dd,live=coachOn()&&LOCAL.mode==='live',a=live?ddGetAdvice():null;
  /* the coach's pick gets the usual highlight; the advice and short tips go in the label above the row */
  const mark=(t,yes)=>a&&a.rec.type===t&&(yes==null||a.rec.yes===yes)?' is-rec':'';
  const tip=a?`教练建议：<b>${esc(ddRecLabel(a.rec))}</b>`:coachOn()?'练习模式：先自己决定，行动后教练面板显示点评':'';
  const hint=(...xs)=>xs.filter(Boolean).join(' · ');
  if(d.stage==='bid'){
    const rob=d.ask&&d.ask.kind==='rob';
    el.innerHTML=actHTML(hint(tip,rob?'有人叫了地主，每抢一次倍数 ×2':'叫了就当地主，一个人对两个农民'),
      `<button class="btn b-gray${mark('bid',false)}" data-act="ddbid" data-v="0">${rob?'不抢':'不叫'}</button><button class="btn b-green${mark('bid',true)}" data-act="ddbid" data-v="1">${rob?'抢地主':'叫地主'}</button>`);return;
  }
  if(d.stage==='double'){
    const lord=d.landlord===V.me;
    el.innerHTML=actHTML(hint(tip,lord?'你是地主，加倍对两个农民都生效':'你是农民，加倍只影响你和地主之间的输赢'),
      `<button class="btn b-gray${mark('double',false)}" data-act="dddbl" data-v="0">不加倍</button><button class="btn b-green${mark('double',true)}" data-act="dddbl" data-v="1">加倍</button>`);return;
  }
  const st=ddPickState(),who=st.prev?V.players[d.lead.pid]:null,hints=coachOn()?ddHintList().length:0;
  const recPlay=a&&a.rec.type==='play'&&ddSameCards([...DSEL],a.rec.cards)?' is-rec':'';
  const info=st.prev?`${esc(who.name)} 出了 <b>${ddPlayText(st.prev)}</b>`:'你先出，可以出任意牌型';
  el.innerHTML=actHTML(`${coachOn()?ddWarnHTML(V).replace(/<p /g,'<span ').replace(/<\/p>/g,'</span>'):''}${hint(tip,info,coachOn()&&!hints?'没有能压过上家的牌，只能「不要」':st.why?esc(st.why):'')}`,
    `<button class="btn b-gray${mark('pass')}" data-act="ddpass"${st.prev?'':' disabled'}>不要</button>
      <button class="btn b-yellow" data-act="ddreset"${DSEL.size?'':' disabled'}>重选</button>
      ${coachOn()?`<button class="btn b-yellow" data-act="ddhint"${hints?'':' disabled'} title="${hints?'每按一次换一手能出的牌':'没有能压过上家的牌'}">提示</button>`:''}
      ${st.readings&&st.readings.length>1?st.readings.map((r,i)=>`<button class="btn b-green" data-act="ddplay" data-as="${i}">出牌 · ${esc(ddChoiceLabel(r))}</button>`).join(''):
        `<button class="btn b-green${recPlay}" data-act="ddplay"${st.cls?'':' disabled'}>出牌${st.cls?' · '+ddTypeName(st.cls):''}</button>`}`);
}
/* sounds and voices for one event of the view */
function ddFx(v,ev){
  const p=v.players[ev.pid],g=p?p.gender:'m',human=p&&p.kind!=='ai';
  if(ev.type==='bid'){SFX.check();say(ev.kind==='call'?(ev.yes?'叫地主':'不叫'):(ev.yes?'抢地主':'不抢'),g)}
  else if(ev.type==='double'){SFX.check();say(ev.yes?'加倍':'不加倍',g)}
  else if(ev.type==='landlord'){SFX.flip()}
  else if(ev.type==='pass'){SFX.fold();say('不要',g)}
  else if(ev.type==='play'){
    if(ev.cls.type==='bomb'||ev.cls.type==='rocket'){const t=ev.cls.type==='rocket'?'王炸':v.dd&&v.dd.laizi>=0?{soft:'软炸',hard:'硬炸',pure:'纯赖子炸'}[ev.cls.bk||'hard']:'炸弹';ddBombFx(ev.pid,t);say(t,g)}
    else{SFX.flip();say(ddPlayText(ev.cls),g)}
    /* bots announce this in a chat bubble themselves */
    if(human&&(ev.left===1||ev.left===2))setTimeout(()=>say(`我只剩 ${ev.left} 张了`,g),900);
  }
}
function ddBombFx(pid,text){
  const p=V.players[pid],fx=$('#fx'),pt=seatPoint(pid,'seat');if(!p||!fx)return;
  if(pt){const r=document.createElement('i');r.className='allin-ring';r.style.left=pt.x+'px';r.style.top=pt.y+'px';fx.appendChild(r);setTimeout(()=>r.remove(),1000)}
  const b=document.createElement('div');b.className='allin-banner';b.innerHTML=`<b>${text}</b><span>${esc(p.name)}</span>`;fx.appendChild(b);setTimeout(()=>b.remove(),1700);
  const t=$('#table');t.classList.remove('shake');void t.offsetWidth;t.classList.add('shake');
  SFX.allin();
}
function ddRulesHTML(){
  const ex=[['小王 大王','王炸','最大，压一切'],['7 7 7 7','炸弹','四张同点数，压任何非炸弹的牌'],['5','单张',''],['9 9','对子',''],['J J J','三张','可以带一张（三带一）或一对（三带二）'],
    ['3 4 5 6 7','顺子','5 张及以上连续单张，到 A 为止'],['5 5 6 6 7 7','连对','3 对及以上连续对子'],['8 8 8 9 9 9','飞机','2 组及以上连续三张，可以每组带一张或一对'],['Q Q Q Q 3 4','四带二','四张带两张单牌或两对，不算炸弹']];
  const ids=s=>{const used={};return s.split(' ').map(t=>{if(t==='小王')return 52;if(t==='大王')return 53;const r=DR.indexOf(t);used[r]=(used[r]||0)+1;return r*4+((used[r]-1)%4)})};
  return `<h2>斗地主规则</h2><p class="lead">三人一局，一人当地主，另外两人是农民。谁先出完手里的牌谁赢，两个农民一起输赢。</p>
  <h3>一局的流程</h3>
  <ol><li>每人 17 张牌，留 3 张底牌。</li><li>轮流「叫地主 / 不叫」；有人叫了，后面的人可以「抢地主」，每抢一次倍数 ×2，最先叫的人最后还能再抢一次。三人都不叫就重新发牌，连续 3 次没人叫，第 4 次由第一家直接当地主。</li>
  <li>地主拿走 3 张底牌，底牌翻开给所有人看。</li><li>两个农民、然后地主，各选一次「加倍 / 不加倍」。</li><li>地主先出牌。轮到你时出一手比上家大的同类型牌，或者「不要」；另外两家都不要时，最后出牌的人重新随便出。</li></ol>
  <h3>牌的大小</h3><p>3 最小，往上 4 5 6 7 8 9 10 J Q K A 2，然后是小王、大王。花色不分大小。</p>
  <h3>牌型</h3>
  <div class="ranks">${ex.map(([s,n,dsc],i)=>`<div class="rank-row"><span class="i">${i+1}</span><span>${n}</span><span class="mini">${ids(s).map(id=>ddCardHTML(id)).join('')} <span class="muted" style="font-size:12px;margin-left:6px">${dsc}</span></span></div>`).join('')}</div>
  <p class="muted" style="font-size:12.5px">同牌型、同张数才能比，比主体的点数；炸弹压非炸弹，大炸弹压小炸弹，王炸压一切。</p>
  <h3>倍数和输赢</h3>
  <dl class="terms"><div><dt>×2 的情况：</dt><dd>每次抢地主、每个炸弹、王炸、春天（地主出完，农民一张没出）、反春（农民先出完，地主只出过第一手）。</dd></div>
  <div><dt>每个农民：</dt><dd>底分 × 倍数 × 自己加倍（×2）× 地主加倍（×2），地主的输赢是两个农民的合计。</dd></div>
  <div><dt>封顶：</dt><dd>每个农民一局最多输赢「封顶倍数 × 底分」。谁都只输到自己的筹码为止；地主筹码不够赔时，按两个农民应得的比例分掉地主的全部筹码。</dd></div></dl>
  <h3>赖子模式（创建游戏时可选）</h3>
  <dl class="terms"><div><dt>赖子：</dt><dd>发完牌后随机翻出一个点数（3 到 2，不含王），这个点数的四张牌都是赖子，所有人都看得到。</dd></div>
  <div><dt>怎么用：</dt><dd>和普通牌一起出时，赖子可以当成 3 到 2 之间的任意点数，但不能当王；单张、对子、三张、四张全是赖子时，按赖子本来的点数算。</dd></div>
  <div><dt>炸弹：</dt><dd>软炸（用了赖子）×2，硬炸（没用赖子）×4，纯赖子炸（四张赖子）×4，王炸 ×2。大小：王炸 > 纯赖子炸 > 任何硬炸 > 任何软炸，同一种比点数。</dd></div>
  <div><dt>几种理解：</dt><dd>一手牌有几种理解时（比如 9 9 9 + 赖子，可以是炸弹也可以是三带一），会出现几个按钮让你选。出牌后，赖子当成了什么会标在牌上（→K）。</dd></div></dl>
  <h3>教练怎么算</h3>
  <dl class="terms"><div><dt>手牌强度：</dt><dd>大王 4 分、小王 3 分、两张王再加 2 分，每张 2 算 2 分、每张 A 算 1 分，每个炸弹 4 分，赖子模式下每张赖子再加 1.5 分；拆完超过 6 手，每多一手扣 0.8 分。叫地主门槛 6、抢地主 8.5、加倍 10。</dd></div>
  <div><dt>手数：</dt><dd>把整手牌拆成单张、对子、顺子、飞机等，最少要出几次才能出完。手数越少越好走。</dd></div>
  <div><dt>压不住的牌：</dt><dd>根据已经出过的牌，别人手里不可能有更大的同类牌、也不可能有炸弹或王炸。剩两手时先出压不住的那手，就能保住出牌权直接走完。</dd></div>
  <div><dt>记牌器：</dt><dd>只用公开信息：你自己的牌、所有人出过的牌、亮过的底牌，不会偷看别人的牌。</dd></div></dl>`;
}
