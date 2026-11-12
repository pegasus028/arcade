// node tools/build-questions.js — q/*.json → questions.js (key positions balanced, never 3 the same in a row)
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..'); const ctx={window:{}}; vm.runInNewContext(fs.readFileSync(path.join(root,'config.js'),'utf8'),ctx);
let seed=20261113; const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
const out={}; let total=0; const pos=[0,0,0,0];
for(const st of ctx.window.STATIONS){
  const a=JSON.parse(fs.readFileSync(path.join(root,'q',st.id+'.json'),'utf8')); let bag=[],last=[-1,-1];
  out[st.id]=a.map(q=>{
    if(!bag.length){ bag=[0,1,2,3]; for(let i=3;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [bag[i],bag[j]]=[bag[j],bag[i]]; } }
    let k=bag.pop(); if(k===last[0]&&k===last[1]&&bag.length){ bag.unshift(k); k=bag.pop(); } last=[k,last[0]];
    const w=q.wrong.slice(); for(let i=2;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [w[i],w[j]]=[w[j],w[i]]; }
    const o=w.slice(); o.splice(k,0,q.key); pos[k]++; total++;
    return {id:q.id,lv:q.lv,q:q.q,o:o,a:k};
  });
}
fs.writeFileSync(path.join(root,'questions.js'),'/* Built by tools/build-questions.js from q/*.json — edit those files, then rebuild. */\nwindow.QUESTIONS = '+JSON.stringify(out,null,0).replace(/\],"/g,'],\n"').replace(/\},\{"id"/g,'},\n {"id"')+';\n');
console.log(total+' questions; key positions '+pos.join('/'));
