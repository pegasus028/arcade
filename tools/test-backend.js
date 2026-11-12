// node tools/test-backend.js — rotation, timers, scoring, history against the real Code.gs
const {makeBackend}=require('./mock.js'); const assert=require('assert');
const PIN='arcade2026'; let n=0; const ok=(c,m)=>{ n++; if(!c){ console.log('FAIL '+m); process.exitCode=1; } };
const g=(be,p)=>JSON.parse(be.get(p)), po=(be,b)=>JSON.parse(be.post(b)), T=(be,a,x)=>po(be,Object.assign({action:a,pin:PIN},x||{}));
function mk(N,date){ const be=makeBackend(); T(be,'new',{date:date||'2026-11-13'}); for(let i=1;i<=N;i++) po(be,{action:'register',name:'S'+i}); return be; }
function tick(be,sec){ be.addTime(sec*1000+50); return g(be); }

// 1. rotation for every class size: no repeated opponent, no repeated station where avoidable
for(let N=4;N<=30;N++){
  const be=mk(N); let s=g(be); const A=s.players.filter(p=>p.g==='A').length; ok(Math.abs(2*A-N)<=1,'balanced groups N='+N);
  T(be,'config',{stationSec:300,moveSec:60,sessionSec:60+360*Math.ceil(N/2)}); ok(T(be,'start').ok,'start N='+N);
  const M=Math.ceil(N/2), opp={}, sts={}, byes={}; let rounds=0;
  s=tick(be,61);
  while(s.status==='live'){
    ok(s.sched[0].ph==='play','play phase N='+N+' r='+s.r); rounds++;
    const seen=new Set();
    s.cur.forEach(x=>{ ok(!seen.has(x[0]),'station used once'); seen.add(x[0]); });
    s.players.forEach(p=>{ ok(p.st>=0,'everyone has a station N='+N+' '+p.name);
      (sts[p.name]=sts[p.name]||[]).push(p.st); if(p.opp) (opp[p.name]=opp[p.name]||[]).push(p.opp); else byes[p.name]=(byes[p.name]||0)+1;
      if(p.opp){ const o=s.players.find(q=>q.name===p.opp); ok(o.opp===p.name&&o.st===p.st&&o.g!==p.g,'pair symmetric'); } });
    s=tick(be,300); s=tick(be,60);
  }
  ok(rounds===M,'rounds = M ('+rounds+' vs '+M+') N='+N);
  let repO=0,repS=0; for(const k in opp){ repO+=opp[k].length-new Set(opp[k]).size; } for(const k in sts){ repS+=sts[k].length-new Set(sts[k]).size; }
  if(M>2){ ok(repO===0,'no repeated opponent N='+N+' ('+repO+')'); ok(repS<=(M%2===0?M:0),'station repeats N='+N+' ('+repS+')'); }
  if(N%2) ok(Math.max(...Object.values(byes))<=Math.ceil(M/((N+1)/2))+1,'byes shared N='+N+' '+JSON.stringify(byes));
}

// 2. timeline, scoring, flags, declare, pause, adjust, podium, history
{ const be=mk(6); let s=g(be); ok(s.status==='lobby'&&s.players.length===6,'lobby');
  ok(T(be,'start',{pin:'x'}).error==='pin','wrong pin refused');
  s=T(be,'start'); ok(s.status==='live'&&s.sched[0].ph==='ready'&&s.rounds===6,'ready, 6 rounds in 40 min: '+s.rounds);
  ok(s.players.every(p=>p.nst>=0),'first station shown while getting ready');
  s=tick(be,60); ok(s.r===0&&s.sched[0].ph==='play','round 1 play');
  const pair=s.cur[0], a=pair[1], b=pair[2], c=s.cur[1][1], d=s.cur[1][2], e=s.cur[2][1], f=s.cur[2][2];
  po(be,{action:'report',name:a,epoch:s.epoch,r:0,res:'W'}); s=g(be,{}); be.addTime(2100); s=g(be);
  ok(s.players.find(p=>p.name===a).pts===10&&s.players.find(p=>p.name===b).l===1,'win counted from one report');
  po(be,{action:'report',name:b,epoch:s.epoch,r:0,res:'W'}); be.addTime(2100); s=g(be);
  ok(s.flags.length===1&&s.flags[0].type==='clash'&&s.players.find(p=>p.name===a).pts===0,'both say win → clash, no points');
  s=T(be,'declare',{r:0,p:0,win:'B'}); ok(s.flags.length===0&&s.players.find(p=>p.name===b).pts===10,'teacher declares');
  po(be,{action:'report',name:c,epoch:s.epoch,r:0,ask:1}); be.addTime(2100); s=g(be); ok(s.flags.some(x=>x.type==='ask'&&x.a===c),'ask teacher flag');
  s=T(be,'declare',{r:0,p:1,win:'T'}); ok(s.players.find(p=>p.name===d).pts===5,'tie declared');
  s=tick(be,300); ok(s.sched[0].ph==='move'&&s.r===0,'move phase');
  po(be,{action:'report',name:e,epoch:s.epoch,r:0,res:'T',q:3}); po(be,{action:'report',name:f,epoch:s.epoch,r:0,res:'T',q:1}); be.addTime(2100); s=g(be);
  ok(s.players.find(p=>p.name===e).pts===11&&s.players.find(p=>p.name===f).pts===7,'tie + questions');
  ok(s.players.find(p=>p.name===e).nst>=0,'next station known in move phase');
  s=T(be,'pause'); const rem=s.sched[0].e-s.now; be.addTime(120000); s=g(be); ok(s.paused&&Math.abs((s.sched[0].e-s.now)-rem)<200,'pause holds the clock');
  s=T(be,'adjust',{sec:60}); ok(Math.abs((s.sched[0].e-s.now)-rem-60000)<200,'+1 min while paused');
  s=T(be,'resume'); ok(!s.paused&&Math.abs((s.sched[0].e-s.now)-rem-60000)<200,'resume');
  s=T(be,'adjust',{sec:-60}); ok(Math.abs((s.sched[0].e-s.now)-rem)<200,'-1 min');
  s=T(be,'skip'); be.addTime(100); s=g(be,{}); be.addTime(2100); s=g(be); ok(s.r===1&&s.sched[0].ph==='play','skip → round 2');
  ok(po(be,{action:'report',name:a,epoch:s.epoch,r:0,res:'W'}).late!==true,'grace for last round report');
  be.addTime(30000); ok(po(be,{action:'report',name:a,epoch:s.epoch,r:0,res:'L'}).late===true,'late report refused');
  s=T(be,'config',{stationSec:120,moveSec:30,sessionSec:2400}); ok(s.cfg.stationSec===120,'timers changed live');
  s=T(be,'bonus',{name:a,delta:1}); ok(s.players.find(p=>p.name===a).adj===1,'bonus');
  // late joiner
  po(be,{action:'register',name:'Late'}); be.addTime(2100); s=g(be); const lt=s.players.find(p=>p.name==='Late'); ok(lt&&lt.st===-1&&lt.nst>=0,'late joiner waits for next round');
  s=T(be,'end'); ok(s.status==='ended','end');
  const h=g(be,{action:'history'}); ok(h.sessions.length===1&&h.sessions[0].players.length===7&&h.sessions[0].matches.length>=3,'history saved');
  ok(g(be,{action:'names'}).names.length===7,'names kept');
  s=T(be,'new',{date:'2026-11-27'}); ok(s.status==='lobby'&&s.players.length===0&&s.date==='2026-11-27','new session clears players');
  ok(g(be,{action:'names'}).names.length===7&&g(be,{action:'history'}).sessions.length===1,'names and history survive');
  ok(po(be,{action:'report',name:a,epoch:s.epoch-1,r:0,res:'W'}).stale,'stale epoch');
}
// 3. session runs out by itself → ended; practice not saved; remove; odd bye points
{ const be=mk(5,'practice'); T(be,'config',{stationSec:60,moveSec:20,sessionSec:200}); let s=T(be,'start'); ok(s.rounds===2,'2 rounds fit: '+s.rounds);
  s=tick(be,21); const bye=s.players.find(p=>!p.opp); ok(bye&&bye.pts===5,'bye = 5 points');
  s=tick(be,60); s=tick(be,20); s=tick(be,60); ok(s.status==='live','last move'); s=tick(be,21); ok(s.status==='ended','auto end'); 
  ok(s.flags.length>=1&&s.flags[0].type==='missing','missing results flagged');
  ok(g(be,{action:'history'}).sessions.length===0,'practice not archived');
}
{ const be=mk(8); let s=T(be,'remove',{name:'S8'}); ok(s.players.length===7,'remove in lobby'); s=T(be,'start'); s=tick(be,61);
  s=T(be,'remove',{name:'S1'}); s=tick(be,300); ok(s.players.find(p=>p.name==='S1').nst===-1,'removed player has no next station');
  s=T(be,'stations',{off:[0]}); ok(s.error==='live','stations locked when live'); }
{ const be=mk(0); let s=T(be,'stations',{off:[0,1]}); ok(s.open.length===13&&s.open[0]===2,'stations closed'); for(let i=1;i<=27;i++) ok(po(be,{action:'register',name:'Q'+i}).ok===(i<=26),'cap at 26 with 13 stations i='+i); }
console.log(n+' checks'+(process.exitCode?' — FAILURES':' — all passed'));
