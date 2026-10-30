#!/usr/bin/env node
/* Seal the online code: node tools/seal.mjs <plain net-online.js> <keys.json>
   Writes js/net-online.enc.js (NaCl secretbox with the key K from keys.json). Prints no key material. */
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {fileURLToPath} from 'node:url';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const [src,keys]=process.argv.slice(2);
if(!src||!keys){console.error('usage: node tools/seal.mjs <net-online.js> <keys.json>');process.exit(2)}
const ctx=vm.createContext({Math,Date,JSON,Object,Array,Number,String,Uint8Array,crypto:globalThis.crypto});ctx.self=ctx;
for(const f of ['js/vendor/nacl.min.js','js/card.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
const K=vm.runInContext(`unb64u(${JSON.stringify(JSON.parse(fs.readFileSync(keys,'utf8')).boxKey)})`,ctx);
if(!K||K.length!==32){console.error('keys.json: boxKey missing or wrong length');process.exit(1)}
ctx.SRC=fs.readFileSync(src,'utf8');ctx.KEY=K;
const sealed=vm.runInContext('sealMake(SRC,KEY)',ctx);
if(vm.runInContext(`sealOpen(${JSON.stringify(sealed)},KEY)`,ctx)!==ctx.SRC){console.error('self-check failed');process.exit(1)}
fs.writeFileSync(path.join(ROOT,'js/net-online.enc.js'),`/* 赌神智慧树 · the online code, sealed. It opens only with the key inside a valid card (see js/card.js). */\nwindow.DUSHEN_SEALED=${JSON.stringify(sealed)};\n`);
console.log(`sealed ${ctx.SRC.length} chars -> js/net-online.enc.js`);
