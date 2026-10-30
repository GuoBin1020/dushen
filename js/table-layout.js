/* 赌神智慧树 · where things sit on the pseudo-3D table. Pure functions, no DOM: every x / y is a percentage of the table area.
   The viewer sits at the near end (slot 0, bottom left); the others go clockwise from the left side, over the far edge, to the right side. */
'use strict';

/* the only reader of the window size: a square or wider window is 'land' */
const tableOrient=()=>window.innerWidth>=window.innerHeight?'land':'port';
/* the path the other seats are spread along, following the trapezoid table's left side, far edge and right side */
const SEAT_PATH={
  land:[[5,60],[7,40],[13,25],[26,15.5],[50,12],[74,15.5],[87,25],[93,40],[95,60]],
  port:[[9,52],[10,41],[12,27],[22,16.5],[50,13],[78,16.5],[88,27],[90,41],[91,52]]
};
const ME_XY={land:{x:8,y:84},port:{x:12,y:75}};
/* the middle (德州 board and pot, 炸金花 pot) sits lower than the old 36 / 34, further from the far seats; upright it is below the
   side seats too, so their bet chips (on the line to the middle) run down past the board instead of into it */
const CENTER_XY={land:{x:50,y:42},port:{x:50,y:60}};
/* lengths are measured with y squashed by 0.6, the same way seat spacing is judged, so the far edge and the sides share the seats fairly */
const SQ=0.6;
function pathAt(o,t){
  const pts=SEAT_PATH[o],seg=[];let total=0;
  for(let i=1;i<pts.length;i++){const l=Math.hypot(pts[i][0]-pts[i-1][0],(pts[i][1]-pts[i-1][1])*SQ);seg.push(l);total+=l}
  let d=t*total;
  for(let i=0;i<seg.length;i++){
    if(d<=seg[i]||i===seg.length-1){const k=seg[i]?Math.min(1,d/seg[i]):0,a=pts[i],b=pts[i+1];return {x:a[0]+(b[0]-a[0])*k,y:a[1]+(b[1]-a[1])*k}}
    d-=seg[i];
  }
}
/* far seats are drawn a little smaller: 1 at the lowest side seat, 0.8 at the far edge */
function seatScale(o,y){const lo=SEAT_PATH[o][0][1],hi=SEAT_PATH[o][4][1];return Math.round((0.8+0.2*Math.max(0,Math.min(1,(y-hi)/(lo-hi))))*100)/100}
/* the n-1 others sit at equal steps along the path. A few seats keep half a step free at each end (斗地主's two sit
   high on the sides); a full table keeps only a tenth, so nine seats still clear each other */
function seatXY(slot,n,o){
  o=o||tableOrient();
  if(!slot)return {...ME_XY[o],s:1};
  const m=n-1,a=Math.min(0.5,Math.max(0.1,(7-n)/4)),t=m===1?0.5:(slot-1+a)/(m-1+2*a),p=pathAt(o,t);
  return {x:p.x,y:p.y,s:seatScale(o,p.y)};
}
const centerXY=o=>({...CENTER_XY[o||tableOrient()]});
/* 斗地主's three bottom cards (with the stage line and 倍数): centred at the far edge of the table; sideways a little lower,
   in one row below the card counter strip */
const BOTTOM_XY={land:{x:50,y:29},port:{x:50,y:19}};
const bottomXY=o=>({...BOTTOM_XY[o||tableOrient()]});
/* bet chips: 35% of the way from the seat to the middle of the table (the starting guess; betClear puts them just clear of the seat) */
function betXY(slot,n,o){const s=seatXY(slot,n,o),c=centerXY(o);return {x:s.x+(c.x-s.x)*0.35,y:s.y+(c.y-s.y)*0.35}}
/* a bet chip on the line from the seat's centre s toward the middle c, as close to the seat as it can be without touching it:
   box is how far the drawn seat (scale included, with its cards) reaches left / right / up / down from its centre, w and h
   the chip's size and m the gap, all in px. The chip leaves the seat where the line crosses the seat's edge grown by half
   the chip plus the gap; t is how far along the line that is (1 = the middle). */
function betClear(s,c,box,w,h,m){
  const dx=c.x-s.x,dy=c.y-s.y;
  const tx=dx?((dx>0?box.r:box.l)+w/2+m)/Math.abs(dx):Infinity,ty=dy?((dy>0?box.b:box.t)+h/2+m)/Math.abs(dy):Infinity;
  const t=Math.min(tx,ty);
  return t===Infinity?{x:s.x,y:s.y,t:0}:{x:s.x+dx*t,y:s.y+dy*t,t};
}
/* 斗地主's side plays start no higher than this (the old middle plus a gap), so moving the 德州 middle leaves them alone */
const DD_MID={land:44,port:46};
/* 斗地主 plays lie on the felt in front of the seat: mine above the button row; a side seat's run out toward the middle
   (al: which end the row is anchored by), a far seat's drop toward me */
function playXY(slot,n,o){
  o=o||tableOrient();
  if(!slot)return {x:50,y:o==='land'?49:56,al:'c'};
  const s=seatXY(slot,n,o),al=s.x<35?'l':s.x>65?'r':'c';
  if(al==='c')return {x:s.x,y:s.y+12,al};
  /* below the middle (board / bottom cards and pot), which stands taller when upright; sideways 斗地主's two (n=3) start
     their big cards under the seat itself, so a long run stays clear of my own play in the middle */
  const dx=o==='land'?(n===3?-3:11):12;
  return {x:s.x+(al==='l'?dx:-dx),y:Math.max(s.y+4,DD_MID[o]),al};
}
