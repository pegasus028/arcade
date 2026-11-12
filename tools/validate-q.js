// node tools/validate-q.js [gameId ...]   — checks q/<id>.json files
const fs=require('fs'),path=require('path');
const IDS=['fussball','spotit','jenga','chess','hippos','uno','pool','scrabble','slingpuck','dice','crocodile','dobble','basketball','mathscrabble','sudoku'];
const want=process.argv.slice(2).length?process.argv.slice(2):IDS;
let errs=0; const E=(m)=>{errs++;console.log('ERROR '+m);};
const wc=s=>String(s).trim().split(/\s+/).length;
for(const g of want){
  if(!IDS.includes(g)){E('unknown game '+g);continue;}
  const f=path.join(__dirname,'..','q',g+'.json');
  if(!fs.existsSync(f)){E(g+': file missing');continue;}
  let a; try{a=JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){E(g+': bad JSON '+e.message);continue;}
  if(!Array.isArray(a)||a.length!==15)E(g+': need 15 questions, got '+(a&&a.length));
  const seen=new Set(); const lv={1:0,2:0,3:0}; let longest=0;
  for(const q of a){
    const t=g+' '+q.id+': ';
    if(!/^[a-z]+-[123][a-e]$/.test(q.id||'')||!String(q.id).startsWith(g+'-'))E(t+'bad id');
    if(seen.has(q.id))E(t+'duplicate id'); seen.add(q.id);
    if(![1,2,3].includes(q.lv))E(t+'bad lv'); else {lv[q.lv]++; if(String(q.id).split('-')[1][0]!=String(q.lv))E(t+'id level does not match lv');}
    if(typeof q.q!=='string'||!q.q.trim())E(t+'no stem'); else {
      if(wc(q.q)>14)E(t+'stem over 14 words ('+wc(q.q)+')');
      const gaps=(q.q.match(/_{2,}/g)||[]); if(gaps.length>1||gaps.some(x=>x!=='___'))E(t+'gap must be one ___');
    }
    if(typeof q.key!=='string'||!q.key.trim())E(t+'no key');
    if(!Array.isArray(q.wrong)||q.wrong.length!==3)E(t+'need 3 wrong options');
    const opts=[q.key].concat(q.wrong||[]).map(x=>String(x).trim());
    if(new Set(opts.map(x=>x.toLowerCase())).size!==4)E(t+'duplicate options');
    for(const o of opts){ if(wc(o)>4)E(t+'option over 4 words: '+o); if(/[.]$/.test(o))E(t+'option ends with full stop: '+o);
      if(/all of the above|none of|both /i.test(o))E(t+'position-style option: '+o); }
    const kl=String(q.key).trim().length; if((q.wrong||[]).every(w=>String(w).trim().length<kl))longest++;
    const maxw=Math.max(...opts.map(o=>o.length)), minw=Math.min(...opts.map(o=>o.length));
    if(maxw>minw*3+6)E(t+'option lengths too uneven');
  }
  for(const l of [1,2,3]) if(lv[l]!==5)E(g+': level '+l+' has '+lv[l]+' (need 5)');
  if(longest>4)E(g+': key is the longest option in '+longest+' of 15 (max 4)');
  console.log(g+': '+a.length+' questions, key longest '+longest+'/15');
}
console.log(errs?errs+' error(s)':'OK'); process.exit(errs?1:0);
