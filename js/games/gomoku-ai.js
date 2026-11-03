/* 赌神智慧树 · 五子棋 engine: 棋型 scoring, candidate points, alpha-beta search on a node or time budget, a 连续冲四 (VCF)
   search, the four levels, and the reasons the coach shows. One self-contained function, so the page can run its source
   (with the board rules from gomoku.js) in a Web Worker; tests call it directly. */
'use strict';
function gmAiModule(){
  /* what one more stone makes along one line; the coach panel shows this table */
  const SCORES={'五连':100000,'活四':10000,'冲四':1500,'活三':1000,'眠三':150,'活二':100,'眠二':15};
  const RANK=['五连','活四','冲四','活三','眠三','活二','眠二'];
  const WIN=1e7;
  /* the 9 cells along d centred on p, seen by c: 1 own (p counts as own), 0 empty, 2 the other colour or off the board */
  function lineOf(b,p,d,c){
    const L=[],x0=p%15,y0=(p/15)|0;
    for(let k=-4;k<=4;k++){const x=x0+d[0]*k,y=y0+d[1]*k;if(x<0||x>14||y<0||y>14){L.push(2);continue}const s=k?b[y*15+x]:c;L.push(s===0?0:s===c?1:2)}
    return L;
  }
  /* the best shape through the centre: five, open four (011110), four (a 5-window with 4 own and no other colour),
     open three (a 6-window 0....0 holding 3 own), three, open two, two */
  function shape(L){
    let run=1;for(let k=5;k<9&&L[k]===1;k++)run++;for(let k=3;k>=0&&L[k]===1;k--)run++;
    if(run>=5)return '五连';
    let f4=0,s3=0,s2=0,l4=0,l3=0,l2=0;
    for(let s=0;s<=4;s++){let o=0,x=0;for(let k=s;k<s+5;k++){if(L[k]===1)o++;else if(L[k]===2)x++}if(x)continue;if(o===4)f4=1;else if(o===3)s3=1;else if(o===2)s2=1}
    for(let s=0;s<=3;s++){if(L[s]||L[s+5])continue;let o=0,x=0;for(let k=s+1;k<s+5;k++){if(L[k]===1)o++;else if(L[k]===2)x++}if(x)continue;if(o===4)l4=1;else if(o===3)l3=1;else if(o===2)l2=1}
    return l4?'活四':f4?'冲四':l3?'活三':s3?'眠三':l2?'活二':s2?'眠二':'';
  }
  /* what c gets at empty p: the shape on each line and the worth, with a bonus for a double threat (四四, 四三, 三三) */
  function info(b,p,c){
    const sh=GM_DIRS.map(d=>shape(lineOf(b,p,d,c)));
    let s=0,f4=0,l3=0,five=false,l4=false;
    for(const n of sh){if(!n)continue;s+=SCORES[n];if(n==='五连')five=true;else if(n==='活四'){l4=true;f4++}else if(n==='冲四')f4++;else if(n==='活三')l3++}
    const win4=!five&&(l4||f4>=2||f4>=1&&l3>=1);
    if(win4&&!l4)s+=SCORES['活四'];else if(!five&&!f4&&l3>=2)s+=SCORES['活三']*3;
    return {sh,s,five,win4,f4,l3};
  }
  const legal=(b,p,c,forbid)=>!b[p]&&!(c===1&&forbid&&gmForbid(b,p));
  /* empty points within r (2 by default) of a stone, best first (own gain + 0.9 x what it takes from the other side),
     the first k legal */
  function cands(b,c,forbid,k,r){
    r=r||2;const near=new Uint8Array(225);let any=false;
    for(let i=0;i<225;i++){if(!b[i])continue;any=true;const x=i%15,y=(i/15)|0;
      for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const X=x+dx,Y=y+dy;if(X>=0&&X<15&&Y>=0&&Y<15&&!b[Y*15+X])near[Y*15+X]=1}}
    if(!any)return [{p:112,val:0,atk:info(b,112,c),def:info(b,112,3-c)}];
    const out=[];
    for(let p=0;p<225;p++){if(!near[p])continue;const atk=info(b,p,c),def=info(b,p,3-c);
      out.push({p,atk,def,val:atk.s+def.s*0.9+(atk.five?WIN:def.five?WIN/2:0)})}
    out.sort((a,z)=>z.val-a.val);
    if(!(c===1&&forbid))return out.slice(0,k);
    const ok=[];for(const m of out){if(ok.length>=k)break;if(legal(b,m.p,c,forbid))ok.push(m)}return ok;
  }
  /* moves that have to be played: make five; stop the other's five; make an unstoppable four; against the other's open-four
     threat only the blocks and our own fours. null when nothing is forced. */
  function forced(cs){
    const f=cs.find(m=>m.atk.five);if(f)return [f];
    const block=cs.filter(m=>m.def.five);if(block.length)return block.slice(0,1);
    const w=cs.find(m=>m.atk.win4);if(w)return [w];
    if(cs.some(m=>m.def.win4)){const r=cs.filter(m=>m.def.win4||m.atk.f4);return r.length?r:null}
    return null;
  }
  function search(b0,c,opt){
    const b=b0.slice(),t0=Date.now(),forbid=!!opt.forbid,level=opt.level||'normal',rnd=opt.rnd||Math.random;
    const maxMs=opt.maxMs||(level==='hell'?2000:level==='hard'?1000:500),maxN=opt.maxNodes||0;
    let nodes=0,depthDone=0;const STOP={};
    const tick=()=>{nodes++;if(maxN?nodes>maxN:(nodes&63)===0&&Date.now()-t0>maxMs)throw STOP};
    const done=(move,score,list)=>({move,score,cands:(list||[]).slice(0,3).map(m=>({i:m.p,score:Math.round(m.score!=null?m.score:m.val)})),depth:depthDone,nodes,ms:Date.now()-t0});
    const root=cands(b,c,forbid,level==='hell'?10:level==='hard'?12:30);
    if(!root.length)return done(null,0,[]);
    if(!b.some(Boolean))return done(112,0,root);
    const f=forced(root);
    if(f&&f.length===1)return done(f[0].p,f[0].val,f.concat(root.filter(m=>m!==f[0])));
    const list=f||root;
    /* when only some points are playable (the others lose to the other side's threat), the rest still come after them */
    const rest=f?root.filter(m=>!f.includes(m)).map(m=>({...m,score:-WIN})):[];
    if(level==='easy'){
      /* often blind to open threes (fours and fives it still sees), and often just takes one of its top few */
      const blind=rnd()<0.7,sc=list.map(m=>({...m,score:blind&&!m.def.f4&&!m.def.five?m.atk.s+Math.min(m.def.s,SCORES['眠三'])*0.9:m.val})).sort((a,z)=>z.score-a.score);
      const pick=rnd()<0.4?sc[Math.floor(rnd()*Math.min(4,sc.length))]:sc[0];return done(pick.p,pick.score,sc);
    }
    if(level==='normal')return done(list[0].p,list[0].val,list.concat(rest));
    /* hard / hell: negamax with alpha-beta */
    const K=level==='hell'?8:10;
    function nega(c,depth,alpha,beta,ply){
      tick();
      const cs=cands(b,c,forbid,K,ply>=2?1:2);if(!cs.length)return 0;
      if(cs[0].atk.five)return WIN-ply;
      /* the side to move with an unstoppable four and no five to stop has won */
      if(!cs.some(m=>m.def.five)&&cs.some(m=>m.atk.win4))return WIN/2-ply;
      /* a leaf: the two best threats each side has, the side to move's counting more (it plays next) */
      if(depth<=0){const A=cs.map(m=>m.atk.s).sort((x,y)=>y-x),D=cs.map(m=>m.def.s).sort((x,y)=>y-x);return A[0]+0.5*(A[1]||0)-0.8*D[0]-0.4*(D[1]||0)}
      const ls=forced(cs)||cs;let best=-Infinity;
      for(const m of ls){b[m.p]=c;let v;try{v=-nega(3-c,depth-1,-beta,-alpha,ply+1)}finally{b[m.p]=0}
        if(v>best)best=v;if(v>alpha)alpha=v;if(alpha>=beta)break}
      return best;
    }
    /* 连续冲四: keep making fours, each answered at its only five-point, until a five or a double four */
    function vcf(c,depth){
      tick();
      const cs=cands(b,c,forbid,30),opp=cands(b,3-c,false,30);
      if(cs.some(m=>m.atk.five))return true;
      if(opp.some(m=>m.atk.five)||depth<=0)return false;
      for(const m of cs){if(!m.atk.f4)continue;
        b[m.p]=c;
        try{
          const fp=[];for(let q=0;q<225;q++)if(!b[q]&&info(b,q,c).five)fp.push(q);
          if(fp.length>=2&&!(c===1&&forbid&&fp.every(q=>gmForbid(b,q))))return true;
          if(fp.length===1){b[fp[0]]=3-c;try{if(!gmFive(b,fp[0],3-c).win&&vcf(c,depth-1))return true}finally{b[fp[0]]=0}}
        }finally{b[m.p]=0}
      }
      return false;
    }
    let best=list[0],scored=list.map(m=>({...m,score:m.val}));
    try{
      if(level==='hell'){
        for(const m of root){if(!m.atk.f4)continue;b[m.p]=c;let w=false;
          try{const fp=[];for(let q=0;q<225;q++)if(!b[q]&&info(b,q,c).five)fp.push(q);
            if(fp.length>=2)w=true;else if(fp.length===1){b[fp[0]]=3-c;try{w=vcf(c,8)}finally{b[fp[0]]=0}}}finally{b[m.p]=0}
          if(w)return done(m.p,WIN,[m,...root.filter(x=>x!==m)])}
      }
      /* hard looks one reply ahead; hell deepens two plies at a time as far as its budget goes (odd depths play worse) */
      const depths=level==='hell'?[2,4,6,8]:[2];
      for(const D of depths){
        /* the first three get an exact score (the coach shows them); the rest only need to beat the third */
        const res=[];
        for(const m of list){const third=res.length>=3?res.map(r=>r.score).sort((a,z)=>z-a)[2]:-Infinity;
          b[m.p]=c;let v;try{v=-nega(3-c,D-1,-Infinity,-third,1)}finally{b[m.p]=0}res.push({...m,score:v})}
        res.sort((a,z)=>z.score-a.score||z.val-a.val);scored=res;best=res[0];depthDone=D;
        if(best.score>=WIN/2)break;
      }
    }catch(e){if(e!==STOP)throw e}
    return done(best.p,best.score!=null?best.score:best.val,scored.concat(rest));
  }
  /* why a point: what c makes there, what it takes from the other side, and whether the other then wins outright */
  function explain(b0,c,i,forbid){
    const b=b0.slice(),a=info(b,i,c),d=info(b,i,3-c),uniq=xs=>RANK.filter(n=>xs.includes(n));
    /* what the other side has now: the shape it would get here, one step down */
    const DOWN={'五连':'四','活四':'活三','冲四':'眠三','活三':'活二'};
    const mine=uniq(a.sh),block=[...new Set(uniq(d.sh).filter(n=>DOWN[n]).map(n=>DOWN[n]))];
    b[i]=c;let lose=false;
    if(!a.five){const mineNext=cands(b,c,forbid,40),oppNext=cands(b,3-c,false,40);
      lose=oppNext.some(m=>m.atk.five)||oppNext.some(m=>m.atk.win4)&&!mineNext.some(m=>m.atk.five||m.atk.f4)}
    const t=[];
    if(a.five)t.push('连成五子，直接获胜');
    else{if(a.win4)t.push('形成'+(a.f4>=2?'双四':a.sh.includes('活四')?'活四':'四三')+'，对方挡不住');else if(mine.length)t.push('自己形成'+mine.slice(0,2).join('、'));
      if(block.length)t.push('堵住对方的'+block.slice(0,2).join('、'));
      if(lose)t.push('但下了以后对方能直接取胜');}
    return {mine,block,lose,text:t.join('，')||'没有明显的棋型',score:Math.round(a.s+d.s*0.9)};
  }
  return {search,explain,SCORES,RANK};
}
