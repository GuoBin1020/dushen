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
