// node tools/test-e2e.js — full session in real browsers against the mock backend (the real Code.gs in a vm)
const {chromium}=require('playwright'); const {spawn}=require('child_process'); const fs=require('fs'); const path=require('path');
const PORT=8791, BASE='http://127.0.0.1:'+PORT, SHOTS=path.join(__dirname,'..','..','shots'); fs.mkdirSync(SHOTS,{recursive:true});
let n=0, fails=0; const ok=(c,m)=>{ n++; if(!c){ fails++; console.log('FAIL '+m); } };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const srv=spawn('node',[path.join(__dirname,'mock.js'),PORT],{stdio:['ignore','pipe','inherit']}); await new Promise(r=>srv.stdout.once('data',r));
  const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
  const errors=[];
  async function mk(w,h){ const ctx=await browser.newContext({viewport:{width:w,height:h}});
    await ctx.route('**/config.js*',async route=>{ const r=await route.fetch(); const b=(await r.text()).replace(/window\.API_URL\s*=\s*"[^"]*"/,'window.API_URL = "'+BASE+'/exec"'); route.fulfill({response:r,body:b}); });
    const p=await ctx.newPage(); p.on('pageerror',e=>errors.push(String(e))); p.on('console',m=>{ if(m.type()==='error'&&!/fonts|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); }); return p; }
  const time=async sec=>{ await fetch(BASE+'/__time?add='+(sec*1000)); };
  const board=await mk(1366,700); await board.goto(BASE+'/leaderboard'); await sleep(600);
  const studs=[]; const NAMES=['4/1 Mint','4/1 Ploy','4/2 Fern','4/2 Bam','4/3 Pim','4/3 Namtan','4/4 Jaja'];
  const to=async(ph,r,left)=>{ for(let i=0;i<12;i++){ await sync(); const c=await board.evaluate(()=>{ const x=phase(); return x?{r:x.r,ph:x.ph,rem:(S.paused?x.e-S.now:x.e-now())/1000}:null; });
      if(!c) return; if(c.ph===ph&&c.r===r){ if(left==null||c.rem<=left+1) return; await time(c.rem-left); } else await time(c.rem+0.6); } await sync(); };
  const sync=async()=>{ for(let k=0;k<2;k++){ await Promise.all([board,...studs.map(s=>s.p)].map(p=>p.evaluate(()=>poll()))); await sleep(450); } };
  const modalOk=async(val)=>{ await board.waitForSelector('#modal.show'); const want=val!=null; await board.waitForFunction(w=>(document.getElementById('mInput').style.display!=='none')===w,want,{timeout:5000}).catch(()=>{});
    const t=await board.textContent('#mTitle'); if(val!=null) await board.fill('#mInput',val); await board.click('#mOk');
    await board.waitForFunction(t=>!document.getElementById('modal').classList.contains('show')||document.getElementById('mTitle').textContent!==t,t,{timeout:5000}).catch(()=>{}); await sleep(200); };

  // ---- set-up: wrong passcode, new session, timers, stations ----
  ok((await board.textContent('#status')).includes('Sign-in open'),'board connects');
  await board.click('[data-tab=setup]'); await sleep(300);
  const dates=await board.$$eval('#dateSel option',o=>o.map(x=>x.value));
  ok(dates[0]==='2026-11-13'&&dates[1]==='2026-11-27'&&!dates.includes('2026-11-20')&&dates.includes('practice'),'date list: 13 Nov first, 20 Nov skipped: '+dates.slice(0,3));
  ok(await board.inputValue('#tStM')==='5'&&await board.inputValue('#tMvM')==='1'&&await board.inputValue('#tSeM')==='40','default timers 5 / 1 / 40');
  ok((await board.textContent('#planNote')).startsWith('6 rounds'),'plan note: '+await board.textContent('#planNote'));
  await board.click('#newBtn'); await modalOk(); await modalOk('wrong'); await modalOk();   // confirm, bad pin, "wrong passcode" notice
  ok(await board.evaluate(()=>S.date)==='' ,'wrong passcode changes nothing');
  await board.click('#newBtn'); await modalOk(); await modalOk('arcade2026'); await sleep(300);
  ok(await board.evaluate(()=>S.date)==='2026-11-13','new session for 13 Nov');
  await board.fill('#tStM','2'); await board.fill('#tStS','0'); await board.fill('#tMvM','1'); await board.fill('#tMvS','30'); await board.fill('#tSeM','12'); await board.click('#saveTimers'); await sleep(300);
  ok(await board.evaluate(()=>S.cfg.stationSec===120&&S.cfg.moveSec===90&&S.cfg.sessionSec===720),'timers saved (2:00 / 1:30 / 12 min)');
  await board.click('#stChk input[data-st="1"]'); await sleep(300);
  ok(await board.evaluate(()=>S.open.length===14&&S.open[1]===2),'station 2 unticked');
  await board.click('#stChk input[data-st="1"]'); await sleep(300);
  ok(await board.evaluate(()=>S.open.length===15),'station 2 ticked again');

  // ---- students sign in (all new names) ----
  for(const nm of NAMES){ const p=await mk(390,780); await p.goto(BASE+'/'); await p.waitForSelector('#selName'); await sleep(250);
    await p.selectOption('#selName','__new'); await p.fill('#newName',nm); await p.click('#joinBtn'); await p.waitForSelector('.big'); studs.push({p,name:nm}); }
  ok((await studs[0].p.textContent('#app')).includes('Group'),'student sees her group in the lobby');
  { const p=await mk(390,780); await p.goto(BASE+'/'); await p.waitForSelector('#selName'); await sleep(400);
    const opts=await p.$$eval('#selName option',o=>o.map(x=>x.textContent)); ok(NAMES.every(x=>opts.includes(x)),'registered names appear in the drop-down'); 
    await p.click('#joinBtn'); ok((await p.textContent('#jerr')).includes('Choose'),'join needs a name'); await p.context().close(); }
  await board.click('[data-tab=live]'); await sync();
  ok(await board.evaluate(()=>S.players.length)===7,'board shows 7 students');
  ok((await board.textContent('#stList')).includes('will be used today'),'lobby station preview');
  await board.screenshot({path:SHOTS+'/board-lobby.png'});
  await studs[0].p.screenshot({path:SHOTS+'/student-lobby.png'});

  // ---- start ----
  await board.click('#startBtn'); await sleep(400); await sync();
  ok(await board.evaluate(()=>S.status)==='live','session live');
  ok(await board.evaluate(()=>S.rounds)===3,'3 rounds fit in 12 min: '+await board.evaluate(()=>S.rounds));
  ok((await studs[0].p.textContent('#app')).includes('Go to your first station'),'student told where to go');
  ok((await board.textContent('#stTitle')).includes('Go to'),'board shows where to go');
  await studs[0].p.screenshot({path:SHOTS+'/student-ready.png'});
  const info=async()=>board.evaluate(()=>({r:S.r,ph:phase()&&phase().ph,cur:S.cur,players:S.players,flags:S.flags}));
  const byName=nm=>studs.find(s=>s.name===nm);
  const QB=await studs[0].p.evaluate(()=>window.QUESTIONS);
  const answerAll=async(s,right)=>{ for(let i=0;i<3;i++){ const b=await s.p.$('.opts button'); if(!b) return i; const stem=await s.p.textContent('.stem');
      let q=null; for(const g in QB){ q=QB[g].find(x=>x.q===stem)||q; } const k=right?q.a:(q.a+1)%4; await s.p.click('.opts button[data-k="'+k+'"]'); await sleep(right?800:1450); } return 3; };

  let totalBuzz=0;
  for(let round=0;round<3;round++){
    // ---- play ----
    await to('play',round);
    let st=await info(); ok(st.r===round&&st.ph==='play','round '+(round+1)+' play (r='+st.r+' ph='+st.ph+')');
    ok(await board.evaluate(()=>chimeCount)===round+1,'start chime '+(round+1));
    ok(await board.evaluate(()=>!!music),'music playing in game time');
    for(const row of st.cur){ for(const nm of [row[1],row[2]]) if(nm){ const t=await byName(nm).p.textContent('#app'); ok(t.includes(String(row[0]+1))&&t.toLowerCase().includes((await board.evaluate(i=>ST[i].name,row[0])).toLowerCase()),nm+' sees station '+(row[0]+1));
        const opp=nm===row[1]?row[2]:row[1]; ok(opp?t.includes(opp):t.includes('No opponent'),nm+' sees opponent'); } }
    if(round===0){ await board.screenshot({path:SHOTS+'/board-play.png'}); await studs[0].p.screenshot({path:SHOTS+'/student-play.png'});
      // pause / +1 / -1 / resume reach the student clock
      const rem=async p=>p.evaluate(()=>{ const x=phase(); return (S.paused?x.e-S.now:x.e-now())/1000; });
      const r0=await rem(studs[1].p); await board.click('#plusBtn'); await sleep(300); await sync(); const r1=await rem(studs[1].p); ok(Math.abs(r1-r0-60)<4,'+1 min reaches students ('+r0.toFixed(0)+' → '+r1.toFixed(0)+')');
      await board.click('#minusBtn'); await sleep(300); await sync(); const r2=await rem(studs[1].p); ok(Math.abs(r2-r0)<5,'−1 min reaches students');
      await board.click('#pauseBtn'); await sleep(300); await sync(); await time(30); await sync(); const r3=await rem(studs[1].p); ok(Math.abs(r3-r2)<5,'pause holds student clock');
      ok((await studs[1].p.textContent('#app')).includes('Paused'),'student sees Paused'); ok(await board.evaluate(()=>!music),'music stops while paused');
      await board.click('#pauseBtn'); await sleep(300); await sync(); ok(await board.evaluate(()=>!S.paused),'resumed'); }
    const pairs=st.cur.filter(x=>x[1]&&x[2]), solo=st.cur.find(x=>!x[1]||!x[2]);
    if(solo){ const nm=solo[1]||solo[2]; ok((await byName(nm).p.textContent('#app')).includes('No opponent'),'bye player told'); }
    // pair 0: finished early, win/lose agree
    { const [_,a,b]=pairs[0]; await byName(a).p.click('[data-act=early]'); await byName(a).p.click('[data-res=W]'); await sleep(200);
      ok(!!(await byName(a).p.$('.opts button')),'questions open after an early result'); }
    // into the last 30 s
    await to('play',round,25);
    ok((await board.getAttribute('#clock','class')).includes('danger'),'board clock red in last 30 s');
    ok((await studs[0].p.getAttribute('#clock','class')).includes('danger'),'student clock red in last 30 s');
    // ---- move ----
    await to('move',round); await sleep(300); await sync();
    st=await info(); ok(st.ph==='move'&&st.r===round,'round '+(round+1)+' move (ph='+st.ph+')');
    totalBuzz++; ok(await board.evaluate(()=>buzzCount)===totalBuzz,'buzzer at the end of game time');
    ok(await board.evaluate(()=>!music),'music stops in moving time');
    const last=round===2;
    if(!last) ok((await board.textContent('#stTitle')).includes('Go to → Round '+(round+2)),'board shows next stations');
    { const [_,a,b]=pairs[0]; await byName(b).p.click('[data-res=L]'); }
    if(pairs[1]){ const [_,a,b]=pairs[1]; if(round===0){ await byName(a).p.click('[data-res=W]'); await byName(b).p.click('[data-res=W]'); }       // clash
                  else { await byName(a).p.click('[data-res=T]'); await byName(b).p.click('[data-res=T]'); } }
    if(pairs[2]){ const [_,a,b]=pairs[2]; if(round===0) await byName(a).p.click('[data-act=ask]'); else if(round===1){ await byName(a).p.click('[data-res=L]'); } /* round 3: nobody reports → missing */ }
    await sleep(300);
    if(round===0) await studs[0].p.screenshot({path:SHOTS+'/student-move.png',fullPage:true});
    for(const s of studs){ const t=await s.p.textContent('#app'); if(!last) ok(t.includes('Go now to station'),s.name+' sees next station'); else ok(t.includes('last game'),s.name+' told it was the last game'); }
    // questions: first student all right, second all wrong, others right
    for(let i=0;i<3;i++){ const done=await answerAll(studs[i],i!==1); if(i===0&&round===0) await studs[0].p.screenshot({path:SHOTS+'/student-qdone.png',fullPage:true}); }
    await sleep(400); await sync();
    st=await info();
    if(round===0){
      ok(st.flags.some(f=>f.type==='clash')&&st.flags.some(f=>f.type==='ask'),'board has a clash and an ask-teacher: '+JSON.stringify(st.flags.map(f=>f.type)));
      ok(await board.isVisible('#callsPanel'),'"Needs your call" panel shown'); await board.screenshot({path:SHOTS+'/board-calls.png'});
      ok((await byName(pairs[2][1]).p.textContent('#app')).includes('teacher will decide'),'student told teacher will decide');
      await board.click('#callList button[data-dec=A]'); await sleep(400); await board.click('#callList button[data-dec=T]'); await sleep(400); await sync();
      st=await info(); ok(st.flags.length===0,'teacher decisions clear the list');
      const P=nm=>st.players.find(p=>p.name===nm);
      ok(P(pairs[0][1]).pts===10+P(pairs[0][1]).q,'winner: 10 + questions = '+P(pairs[0][1]).pts);
      ok(P(pairs[0][2]).w===0&&P(pairs[0][2]).l===1,'loser recorded');
      ok(P(studs[1].name).q===0,'all-wrong student gets 0 quiz points'); ok(P(studs[0].name).q===6,'all-right student gets 6 quiz points');
      if(solo) ok(P(solo[1]||solo[2]).pts===5+P(solo[1]||solo[2]).q,'bye: 5 + questions');
      const top=await board.textContent('#podStrip'); ok(top.includes(st.players.slice().sort((a,b)=>b.pts-a.pts)[0].name),'top-3 strip shows the leader');
      // reload a student mid-phase: same screen, nothing lost
      const s=studs[2]; await s.p.reload(); await s.p.waitForSelector('.clock'); await sleep(500); const t=await s.p.textContent('#app'); ok(t.includes('Go now to station')&&t.includes('+')&&t.includes('points'),'reload keeps result and questions');
    }
  }
  // ---- late joiner check happened? add one before the end: (skipped in final round) ----
  // ---- end of session: auto podium ----
  { const c=await board.evaluate(()=>(phase().e-now())/1000); await time(c+1); } await sync(); await sleep(1300);
  ok(await board.evaluate(()=>S.status)==='ended','session ended by itself');
  ok(await board.evaluate(()=>document.getElementById('podium').classList.contains('show')),'podium opens by itself');
  ok(await board.evaluate(()=>S.flags.some(f=>f.type==='missing')),'unreported last game is flagged for the teacher');
  await sleep(1600); await board.screenshot({path:SHOTS+'/podium-1366.png'});
  const dancers=await board.$$eval('.dancer',els=>els.map(e=>{ const r=e.getBoundingClientRect(); return r.top>=0&&r.bottom<=innerHeight; })); ok(dancers.length===3&&dancers.every(Boolean),'3 mascots fully visible at 1366×700');
  await board.setViewportSize({width:1920,height:1080}); await sleep(500); await board.screenshot({path:SHOTS+'/podium-1920.png'});
  await board.click('#muteBtn'); await board.click('#closePodium'); ok(await board.evaluate(()=>!document.getElementById('podium').classList.contains('show')),'podium closes');
  await board.setViewportSize({width:1366,height:700});
  ok((await studs[0].p.textContent('#app')).includes('Session over'),'student sees session over'); await studs[0].p.screenshot({path:SHOTS+'/student-over.png'});
  // teacher settles the missing game after the end
  await board.click('#callList button[data-dec=B]'); await sleep(400); ok(await board.evaluate(()=>S.flags.length===0),'missing game settled after the end');
  await board.screenshot({path:SHOTS+'/board-ended.png'});
  // ---- history tabs ----
  await board.click('[data-tab=totals]'); await sleep(500);
  ok((await board.$$('#totWrap tbody tr')).length===7,'totals table has 7 students'); ok((await board.textContent('#totWrap')).includes('13 Nov'),'totals has the 13 Nov column');
  const live=await board.evaluate(()=>latest.map(p=>[p.name,p.pts])), tot=await board.$$eval('#totWrap tbody tr',rs=>rs.map(r=>[r.children[1].textContent,Number(r.children[2].textContent)]));
  ok(JSON.stringify(live.slice().sort())===JSON.stringify(tot.slice().sort()),'saved totals equal the live scores');
  await board.screenshot({path:SHOTS+'/board-totals.png'});
  await board.click('[data-tab=matches]'); await sleep(400);
  const mrows=(await board.$$('#mWrap tbody tr')).length; ok(mrows===12,'matchups: 4 stations × 3 rounds = '+mrows);
  await board.selectOption('#mWho',NAMES[0]); await sleep(200); ok((await board.$$('#mWrap tbody tr')).length===3,'filter by student: 3 games'); await board.screenshot({path:SHOTS+'/board-matches.png'});
  // ---- next week: new session; names kept; students choose from the list; late joiner; remove; bonus ----
  await board.click('[data-tab=setup]'); await sleep(300); await board.selectOption('#dateSel','2026-11-27'); await board.click('#newBtn'); await modalOk(); await sleep(400); await sync();
  ok(await board.evaluate(()=>S.status==='lobby'&&S.players.length===0&&S.date==='2026-11-27'),'new session 27 Nov, board cleared');
  ok((await board.$$('#nmList .prow')).length===7,'7 registered names listed');
  for(const s of studs.slice(0,4)){ await s.p.waitForSelector('#selName'); await sleep(300); await s.p.selectOption('#selName',s.name); await s.p.click('#joinBtn'); await s.p.waitForSelector('.big'); }
  await sync(); ok(await board.evaluate(()=>S.players.length)===4,'4 students back by choosing their names');
  await board.screenshot({path:SHOTS+'/board-setup.png'});
  await board.click('#plList button[data-bonus="1"]'); await sleep(300); ok(await board.evaluate(()=>S.players.some(p=>p.adj===1&&p.pts===1)),'bonus +1');
  await board.click('#plList button[data-rm]'); await modalOk(); await sleep(300); ok(await board.evaluate(()=>S.players.length)===3,'remove a player in the lobby');
  await board.click('#nmList button[data-del="'+NAMES[6]+'"]'); await modalOk(); await sleep(300); ok((await board.$$('#nmList .prow')).length===6,'misspelt name removed from the list');
  await board.click('[data-tab=live]'); await board.click('#startBtn'); await sleep(300); await to('play',0);
  { const s=studs[4]; await s.p.waitForSelector('#selName'); await s.p.selectOption('#selName',s.name); await s.p.click('#joinBtn'); await sleep(600); await sync();
    ok((await s.p.textContent('#app')).includes('join in the next round'),'late joiner waits for the next round'); await s.p.screenshot({path:SHOTS+'/student-late.png'}); }
  await board.click('#skipBtn'); await sleep(400); await sync(); ok(await board.evaluate(()=>phase().ph)==='move','Next phase ▸ skips to moving');
  await board.click('#endBtn'); await modalOk(); await sleep(1500); ok(await board.evaluate(()=>S.status==='ended'&&document.getElementById('podium').classList.contains('show')),'End session & podium');
  await board.click('#closePodium');
  await board.click('[data-tab=totals]'); await sleep(500); ok((await board.textContent('#totWrap')).includes('27 Nov'),'second session in the totals'); await board.screenshot({path:SHOTS+'/board-totals2.png'});
  await board.click('[data-tab=matches]'); await sleep(400); await board.selectOption('#mDate','2026-11-27'); await board.click('#delSess'); await modalOk(); await sleep(600);
  await board.click('[data-tab=totals]'); await sleep(500); ok(!(await board.textContent('#totWrap')).includes('27 Nov')&&(await board.textContent('#totWrap')).includes('13 Nov'),'saved session deleted from the totals');
  // passcode change
  await board.click('[data-tab=setup]'); await board.fill('#newPin','club9999'); await board.click('#pinBtn'); await modalOk(); ok(await board.evaluate(()=>pin)==='club9999','passcode changed');
  await board.click('[data-tab=live]'); await board.click('#musicBtn'); ok((await board.textContent('#musicBtn')).includes('off'),'music off button'); await board.click('#musicBtn');
  // phone layout
  for(const s of studs.slice(0,2)){ const o=await s.p.evaluate(()=>document.documentElement.scrollWidth-innerWidth); ok(o<=0,'no sideways scroll on phone ('+o+')'); }
  ok(errors.length===0,'no page errors: '+errors.slice(0,3).join(' | '));
  console.log(n+' checks, '+fails+' failed');
  await browser.close(); srv.kill(); process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
