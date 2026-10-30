/* 赌神智慧树 · asset file names (cards, chips, sounds) and the URL resolver */
'use strict';

const SUIT_LETTER=['S','H','D','C'];
const cardFaceFile=(rank,suit)=>'cards/'+rank+SUIT_LETTER[suit]+'.webp';
const SUIT_NAME=['黑桃','红桃','方块','梅花'];
/* holdem / zjh card code (rank*4+suit) -> face file */
const cardImgFor=c=>cardFaceFile(RL[c>>2],c&3);
const jokerFile=big=>big?'cards/joker-big.webp':'cards/joker-small.webp';
const BACK_FILE='cards/back.webp';
const CHIP_COLORS=['red','blue','green','black','white'];
const chipFile=i=>'chips/'+CHIP_COLORS[((i%CHIP_COLORS.length)+CHIP_COLORS.length)%CHIP_COLORS.length]+'.png';
const sfxList=(name,n)=>Array.from({length:n},(_,i)=>'sfx/'+name+'-'+(i+1)+'.mp3');
const SFX_FILES={
  shuffle:['sfx/card-shuffle.mp3'],
  slide:sfxList('card-slide',4),
  place:sfxList('card-place',4),
  shove:sfxList('card-shove',2),
  chipLay:sfxList('chip-lay',3),
  chipStack:sfxList('chips-stack',3),
  collide:sfxList('chips-collide',2),
  handle:sfxList('chips-handle',3)
};
/* inline style carrying a card image; a url() inside a custom property resolves against the stylesheet, so make it absolute first */
const absURL=f=>{let u=assetURL(f);if(typeof document!=='undefined'&&document.baseURI&&!/^(data:|blob:|[a-z]+:)/i.test(u))u=new URL(u,document.baseURI).href;return u};
const faceStyle=f=>`style="--face:url('${absURL(f)}')"`;
/* chip art for bet chips and flying chips, one colour per index */
const chipURL=i=>absURL(chipFile(i));
const chipStyle=i=>`style="background-image:url('${chipURL(i)}')"`;
/* A bundled single-file build puts every asset into window.ASSET_DATA as a data URI. */
const assetURL=path=>{const d=typeof window!=='undefined'&&window.ASSET_DATA;return d&&d[path]?d[path]:'assets/'+path};
