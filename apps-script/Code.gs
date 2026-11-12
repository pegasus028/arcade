/* Arcade (Play and Learn club) backend — Apps Script web app (Execute as: Me, Access: Anyone).
   No Sheet: everything lives in Script Properties.
     names        registered student names (kept for ever, served to the sign-in list)
     cfg          timers {stationSec, moveSec, sessionSec}
     S            the current session (date, status, timeline, open stations)
     P:<name>     one per signed-in student: group, slot, her own reports
     L:<round>    the matchups of a round, frozen when the round begins
     D:<r>:<p>    a result declared by the teacher
     X:<name>     bonus points given by the teacher
     H:<date>, HM:<date>   archived totals and matchups of a finished session
   Students write only their own P: key, so nobody queues on a lock (only sign-in takes one). */
var VERSION = '2026-11-12b';
var P = PropertiesService.getScriptProperties();
var NST = 15, DEFAULT_PIN = 'arcade2026';

function out(o){ return ContentService.createTextOutput(typeof o === 'string' ? o : JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function J(s, d){ try { return s ? JSON.parse(s) : d; } catch (e) { return d; } }
function nm_(n){ return String(n || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24); }
function k_(n){ return nm_(n).toLowerCase(); }
function cfg_(all){ var c = J(all.cfg, {}); return {stationSec: c.stationSec || 300, moveSec: c.moveSec || 60, sessionSec: c.sessionSec || 2400}; }
function sess_(all){ var s = J(all.S, null); return s || {epoch: 1, date: '', status: 'lobby', off: []}; }
function open_(S){ var off = S.off || [], o = []; for (var i = 0; i < NST; i++) if (off.indexOf(i) < 0) o.push(i); return o; }
function players_(all){ var a = []; for (var k in all) if (k.indexOf('P:') === 0) { var p = J(all[k], null); if (p) a.push(p); }
  a.sort(function(x, y){ return (x.t || 0) - (y.t || 0); }); return a; }
function bust_(){ try { CacheService.getScriptCache().remove('st'); } catch (e) {} }

/* ---------- timeline: every phase still to come, worked out from one anchor ---------- */
function sched_(S, cfg, now){
  if (S.status !== 'live' || !S.tl) return {list: [], cur: null, done: S.status === 'ended'};
  var tl = S.tl;
  if (S.paused) { var c = {r: tl.r, ph: tl.ph, s: now - ((tl.e - tl.s) - S.remainMs), e: now + S.remainMs}; return {list: [c], cur: c, done: false, last: tl.r}; }
  var r = tl.r, ph = tl.ph, s = tl.s, e = tl.e, list = [], cur = null, last = Math.max(r, 0), guard = 0;
  while (guard++ < 400) {
    if (now < e) { var it = {r: r, ph: ph, s: s, e: e}; if (!cur) cur = it; list.push(it); }
    if (r >= 0) last = r;
    if (ph === 'play') { ph = 'move'; s = e; e = s + cfg.moveSec * 1000; }
    else if (e + (cfg.stationSec + cfg.moveSec) * 1000 <= S.endMs + 1000) { r = r + 1; ph = 'play'; s = e; e = s + cfg.stationSec * 1000; }
    else return {list: list, cur: cur, done: !cur, doneAt: e, last: last};
  }
  return {list: list, cur: cur, done: !cur, doneAt: e, last: last};
}
/* move the anchor to the phase that is running now, so a change applies to it */
function anchor_(S, cfg, now){ if (S.status !== 'live' || S.paused) return; var sc = sched_(S, cfg, now); if (sc.cur) S.tl = {r: sc.cur.r, ph: sc.cur.ph, s: sc.cur.s, e: sc.cur.e}; }

/* ---------- rotation: Group A goes up the station numbers, Group B goes down ---------- */
function Mat_(S, r){ var m = 1; (S.mh || []).forEach(function(x){ if (x[0] <= r) m = x[1]; }); return m; }
function layout_(S, players, r){
  var M = Mat_(S, r), open = open_(S), L = [], i;
  for (i = 0; i < M; i++) L.push([open[i], '', '']);
  /* With an even number of stations A-up / B-down would bring the same two students together again
     half-way round, so Group B steps one extra station at that point. */
  var extra = (M % 2 === 0) ? (M === 2 ? Math.floor(r / 2) : Math.floor(2 * r / M)) : 0;
  players.forEach(function(pl){
    if (pl.x || pl.j > r || pl.slot >= M) return;
    var pos = pl.g === 'A' ? (pl.slot + r) % M : (((pl.slot - r - extra) % M) + M) % M;
    L[pos][pl.g === 'A' ? 1 : 2] = pl.name;
  });
  return L;
}
function outcome_(ra, rb, d){
  if (d) return d;
  var a = (ra && ra.res) || '', b = (rb && rb.res) || '';
  if ((ra && ra.ask && !a) || (rb && rb.ask && !b)) return '?';
  if (!a && !b) return '';
  if (a === 'W' && (b === 'L' || !b)) return 'A';
  if (b === 'W' && (a === 'L' || !a)) return 'B';
  if (a === 'L' && !b) return 'B';
  if (b === 'L' && !a) return 'A';
  if (a === 'T' && (b === 'T' || !b)) return 'T';
  if (b === 'T' && !a) return 'T';
  return '!';
}

/* ---------- everything the screens need ---------- */
function build_(){
  var now = Date.now(), all = P.getProperties(), cfg = cfg_(all), S = sess_(all), players = players_(all);
  var sc = sched_(S, cfg, now);
  if (S.status === 'live' && sc.done) { S.status = 'ended'; S.endedMs = sc.doneAt; S.lastR = sc.last; P.setProperty('S', JSON.stringify(S)); all.S = JSON.stringify(S); sc = {list: [], cur: null, done: true}; }
  var curR = S.status === 'ended' ? (S.lastR == null ? -1 : S.lastR) : (sc.cur ? sc.cur.r : -1);
  var by = {}, stats = {};
  players.forEach(function(p){ by[p.name] = p; stats[p.name] = {name: p.name, g: p.g, pts: 0, w: 0, t: 0, l: 0, q: 0, bye: 0, adj: Number(all['X:' + k_(p.name)]) || 0,
    st: -1, opp: '', nst: -1, nopp: '', res: '', qd: 0, x: p.x ? 1 : 0}; });
  var flags = [], matches = [], curL = null, r;
  for (r = 0; r <= curR; r++) {
    var L = J(all['L:' + r], null);
    if (!L) { L = layout_(S, players, r); P.setProperty('L:' + r, JSON.stringify(L)); }
    if (r === curR) curL = L;
    var closed = r < curR || S.status === 'ended' || (sc.cur && sc.cur.r === r && false);
    for (var p = 0; p < L.length; p++) {
      var st = L[p][0], a = L[p][1], b = L[p][2];
      if (!a && !b) continue;
      var ra = a && by[a] && by[a].rr ? by[a].rr[r] : null, rb = b && by[b] && by[b].rr ? by[b].rr[r] : null;
      if (a && stats[a] && ra) stats[a].q += 2 * Math.max(0, Math.min(3, Number(ra.q) || 0));
      if (b && stats[b] && rb) stats[b].q += 2 * Math.max(0, Math.min(3, Number(rb.q) || 0));
      if (!a || !b) { var solo = a || b; if (stats[solo]) { stats[solo].bye++; stats[solo].pts += 5; } matches.push([r, st, a, b, 'bye']); continue; }
      var o = outcome_(ra, rb, all['D:' + r + ':' + p] || '');
      if (o === 'A' || o === 'B') { var wn = o === 'A' ? a : b, ls = o === 'A' ? b : a; if (stats[wn]) { stats[wn].w++; stats[wn].pts += 10; } if (stats[ls]) stats[ls].l++; }
      else if (o === 'T') { if (stats[a]) { stats[a].t++; stats[a].pts += 5; } if (stats[b]) { stats[b].t++; stats[b].pts += 5; } }
      if (o === '?' || o === '!' || (o === '' && closed)) flags.push({r: r, p: p, st: st, a: a, b: b, type: o === '?' ? 'ask' : o === '!' ? 'clash' : 'missing',
        ra: (ra && ra.res) || '', rb: (rb && rb.res) || ''});
      matches.push([r, st, a, b, o]);
    }
  }
  function place(L, cur){ if (!L) return; for (var p = 0; p < L.length; p++) { var a = L[p][1], b = L[p][2];
    if (a && stats[a]) { if (cur) { stats[a].st = L[p][0]; stats[a].opp = b; } else { stats[a].nst = L[p][0]; stats[a].nopp = b; } }
    if (b && stats[b]) { if (cur) { stats[b].st = L[p][0]; stats[b].opp = a; } else { stats[b].nst = L[p][0]; stats[b].nopp = a; } } } }
  var nextL = null, hasNext = false;
  if (S.status === 'live') {
    hasNext = sc.list.some(function(x){ return x.r === curR + 1; });
    place(curL, true);
    if (hasNext) { nextL = layout_(S, players, curR + 1); place(nextL, false); }
  }
  var list = [];
  players.forEach(function(p){ var s = stats[p.name]; s.pts += s.q + s.adj;
    var rec = p.rr && curR >= 0 ? p.rr[curR] : null; if (rec) { s.res = rec.res || (rec.ask ? '?' : ''); s.qd = rec.qn ? 1 : 0; }
    list.push(s); });
  var rounds = S.status === 'ended' ? curR + 1 : (sc.list.length ? sc.list[sc.list.length - 1].r + 1 : Math.max(0, curR + 1));
  var res = {ok: true, v: VERSION, epoch: S.epoch, date: S.date || '', status: S.status, cfg: cfg, open: open_(S), off: S.off || [],
    M: S.status === 'lobby' ? 0 : Mat_(S, Math.max(curR, 0)), r: curR, rounds: rounds, sched: sc.list, paused: !!S.paused,
    endMs: S.paused ? now + (S.sessRemain || 0) : (S.endMs || 0), endedMs: S.endedMs || 0,
    players: list, flags: flags, cur: curL || [], next: nextL || []};
  if (S.status === 'ended') archive_(S, list, matches, all);
  return res;
}
function archive_(S, list, matches, all){
  if (!S.date || S.date === 'practice' || S.noSave) return;
  var pl = list.map(function(s){ return [s.name, s.g, s.pts, s.w, s.t, s.l, s.q, s.bye]; });
  var a = JSON.stringify({date: S.date, players: pl}), m = JSON.stringify(matches);
  if (all['H:' + S.date] !== a) P.setProperty('H:' + S.date, a);
  if (all['HM:' + S.date] !== m && m.length < 9000) P.setProperty('HM:' + S.date, m);
}
function state_(fresh){
  var c = CacheService.getScriptCache(), body = fresh ? null : c.get('st');
  if (!body) { body = JSON.stringify(build_()); try { c.put('st', body, 2); } catch (e) {} }
  return '{"now":' + Date.now() + ',' + body.slice(1);
}

function doGet(e){
  var a = e && e.parameter && e.parameter.action;
  if (a === 'names') return out({ok: true, names: J(P.getProperty('names'), []), status: sess_({S: P.getProperty('S')}).status});
  if (a === 'history') { var all = P.getProperties(), ss = [];
    for (var k in all) if (k.indexOf('H:') === 0) { var h = J(all[k], null); if (h) { h.matches = J(all['HM:' + h.date], []); ss.push(h); } }
    ss.sort(function(x, y){ return x.date < y.date ? -1 : 1; });
    return out({ok: true, sessions: ss}); }
  return out(state_(false));
}

function doPost(e){
  var b = {}; try { b = JSON.parse(e.postData.contents); } catch (err) { return out({ok: false, error: 'bad json'}); }
  var a = b.action, now = Date.now(), r;
  if (a === 'register') r = register_(b, now);
  else if (a === 'report') r = report_(b, now);
  else { if (String(b.pin || '') !== (P.getProperty('pin') || DEFAULT_PIN)) return out({ok: false, error: 'pin'}); r = teacher_(a, b, now); }
  bust_();
  if (r && r.ok && !r.noState) { var st = J(state_(true), {}); for (var k in r) st[k] = r[k]; return out(st); }
  return out(r || {ok: false, error: 'unknown action'});
}

/* ---------- students ---------- */
function register_(b, now){
  var name = nm_(b.name); if (!name) return {ok: false, error: 'no name'};
  var lock = LockService.getScriptLock(); try { lock.waitLock(15000); } catch (e) { return {ok: false, error: 'busy'}; }
  try {
    var all = P.getProperties(), names = J(all.names, []), S = sess_(all), cfg = cfg_(all), key = 'P:' + k_(name);
    var known = names.filter(function(n){ return n.toLowerCase() === name.toLowerCase(); })[0];
    if (known) name = known; else { names.push(name); names.sort(function(x, y){ return x.toLowerCase() < y.toLowerCase() ? -1 : 1; }); P.setProperty('names', JSON.stringify(names)); }
    if (b.only) return {ok: true, noState: true, names: names};
    if (S.status === 'ended') return {ok: true, me: name};
    var players = players_(all), me = J(all[key], null);
    if (me && !me.x) return {ok: true, me: name};
    var act = players.filter(function(p){ return !p.x && p.name !== name; });
    var nA = act.filter(function(p){ return p.g === 'A'; }).length, nB = act.length - nA, open = open_(S);
    var g = nA < nB ? 'A' : nB < nA ? 'B' : (Math.random() < 0.5 ? 'A' : 'B'), slot, j = 0;
    function free(grp, M){ var used = {}; act.forEach(function(p){ if (p.g === grp) used[p.slot] = 1; }); for (var i = 0; i < M; i++) if (!used[i]) return i; return -1; }
    if (S.status === 'lobby') {
      if (act.length >= open.length * 2) return {ok: false, error: 'full'};
      slot = free(g, NST);
    } else {
      var sc = sched_(S, cfg, now), curR = sc.cur ? sc.cur.r : 0; j = sc.cur && sc.cur.ph === 'ready' ? 0 : curR + 1;
      var M = Mat_(S, j); slot = free(g, M);
      if (slot < 0) { var og = g === 'A' ? 'B' : 'A', s2 = free(og, M);
        if (s2 >= 0) { g = og; slot = s2; }
        else { if (M + 1 > open.length) return {ok: false, error: 'full'}; S.mh.push([j, M + 1]); slot = M; P.setProperty('S', JSON.stringify(S)); } }
    }
    var rec = me || {name: name, rr: {}, t: now}; rec.g = g; rec.slot = slot; rec.j = j; delete rec.x;
    P.setProperty(key, JSON.stringify(rec));
    return {ok: true, me: name};
  } finally { lock.releaseLock(); }
}
function report_(b, now){
  var all = P.getProperties(), S = sess_(all), cfg = cfg_(all), key = 'P:' + k_(b.name), me = J(all[key], null);
  if (String(b.epoch) !== String(S.epoch) || !me) return {ok: true, stale: true};
  var r = Number(b.r), sc = sched_(S, cfg, now), c = sc.cur, okr = false;
  if (S.status === 'live' && c) okr = (r === c.r && c.ph !== 'ready') || (c.ph === 'play' && r === c.r - 1 && now - c.s < 20000);
  else if (S.status === 'live' && sc.done) okr = r === sc.last;
  else if (S.status === 'ended') okr = r === S.lastR && now - (S.endedMs || 0) < 180000;
  if (!okr || !(r >= 0)) return {ok: true, late: true};
  me.rr = me.rr || {}; var x = me.rr[r] || {};
  if (b.res === 'W' || b.res === 'T' || b.res === 'L') { x.res = b.res; delete x.ask; }
  if (b.ask) { x.ask = 1; delete x.res; }
  if (b.q != null) { x.q = Math.max(0, Math.min(3, Number(b.q) || 0)); x.qn = 1; }
  me.rr[r] = x; P.setProperty(key, JSON.stringify(me));
  return {ok: true};
}

/* ---------- teacher (passcode checked in doPost) ---------- */
function teacher_(a, b, now){
  var all = P.getProperties(), S = sess_(all), cfg = cfg_(all), save = function(){ P.setProperty('S', JSON.stringify(S)); };
  if (a === 'check') return {ok: true};
  if (a === 'config') {
    var n = {stationSec: Math.max(30, Math.min(3600, Number(b.stationSec) || cfg.stationSec)), moveSec: Math.max(10, Math.min(900, Number(b.moveSec) || cfg.moveSec)),
             sessionSec: Math.max(120, Math.min(14400, Number(b.sessionSec) || cfg.sessionSec))};
    if (S.status === 'live') { anchor_(S, cfg, now); var d = (n.sessionSec - cfg.sessionSec) * 1000; if (S.paused) S.sessRemain = Math.max(0, (S.sessRemain || 0) + d); else S.endMs += d; save(); }
    P.setProperty('cfg', JSON.stringify(n)); return {ok: true};
  }
  if (a === 'stations') { if (S.status !== 'lobby') return {ok: false, error: 'live'};
    S.off = (b.off || []).map(Number).filter(function(i){ return i >= 0 && i < NST; }); if (S.off.length >= NST) S.off = []; save(); return {ok: true}; }
  if (a === 'date') { if (S.status !== 'lobby') return {ok: false, error: 'live'}; S.date = String(b.date || '').slice(0, 10); save(); return {ok: true}; }
  if (a === 'new') {
    var keep = {}; for (var k in all) if (!/^(P:|L:|D:|X:)/.test(k) && k !== 'S') keep[k] = all[k];
    keep.S = JSON.stringify({epoch: (Number(S.epoch) || 1) + 1, date: String(b.date || '').slice(0, 10), status: 'lobby', off: S.off || []});
    P.setProperties(keep, true); return {ok: true};
  }
  if (a === 'start') {
    if (S.status !== 'lobby') return {ok: false, error: 'live'};
    var pl = players_(all).filter(function(p){ return !p.x; }); if (pl.length < 2) return {ok: false, error: 'few'};
    var nA = 0, nB = 0; pl.forEach(function(p){ if (p.g === 'A') nA = Math.max(nA, p.slot + 1); else nB = Math.max(nB, p.slot + 1); });
    var M = Math.max(nA, nB, 1); if (M > open_(S).length) return {ok: false, error: 'stations'};
    S.status = 'live'; S.startMs = now; S.endMs = now + cfg.sessionSec * 1000; S.mh = [[0, M]]; S.paused = false;
    S.tl = {r: -1, ph: 'ready', s: now, e: now + cfg.moveSec * 1000}; save(); return {ok: true};
  }
  if (a === 'pause') { if (S.status !== 'live' || S.paused) return {ok: true}; var sc = sched_(S, cfg, now); if (!sc.cur) return {ok: true};
    S.tl = {r: sc.cur.r, ph: sc.cur.ph, s: sc.cur.s, e: sc.cur.e}; S.paused = true; S.remainMs = sc.cur.e - now; S.sessRemain = S.endMs - now; save(); return {ok: true}; }
  if (a === 'resume') { if (S.status !== 'live' || !S.paused) return {ok: true}; var len = S.tl.e - S.tl.s;
    S.tl.e = now + S.remainMs; S.tl.s = S.tl.e - len; S.endMs = now + S.sessRemain; S.paused = false; save(); return {ok: true}; }
  if (a === 'adjust') { if (S.status !== 'live') return {ok: true}; var ms = (Number(b.sec) || 0) * 1000;
    if (b.what === 'session') { if (S.paused) S.sessRemain = Math.max(0, S.sessRemain + ms); else { anchor_(S, cfg, now); S.endMs = Math.max(now, S.endMs + ms); } }
    else if (S.paused) { var nr = Math.max(1000, S.remainMs + ms); S.tl.e += nr - S.remainMs; S.remainMs = nr; }
    else { anchor_(S, cfg, now); S.tl.e = Math.max(now + 1000, S.tl.e + ms); }
    save(); return {ok: true}; }
  if (a === 'skip') { if (S.status !== 'live') return {ok: true};
    if (S.paused) { S.tl.s = now - 1; S.tl.e = now; S.endMs = now + S.sessRemain; S.paused = false; } else { anchor_(S, cfg, now); S.tl.e = now; }
    save(); return {ok: true}; }
  if (a === 'end') { if (S.status !== 'live') return {ok: true}; var s2 = sched_(S, cfg, now);
    S.status = 'ended'; S.endedMs = now; S.lastR = s2.cur ? s2.cur.r : s2.last; S.paused = false; save(); return {ok: true}; }
  if (a === 'declare') { var key = 'D:' + Number(b.r) + ':' + Number(b.p);
    if (b.win === 'A' || b.win === 'B' || b.win === 'T') P.setProperty(key, b.win); else P.deleteProperty(key); return {ok: true}; }
  if (a === 'bonus') { var xk = 'X:' + k_(b.name), v = (Number(all[xk]) || 0) + (Number(b.delta) || 0); if (v) P.setProperty(xk, String(v)); else P.deleteProperty(xk); return {ok: true}; }
  if (a === 'remove') { var pk = 'P:' + k_(b.name), me = J(all[pk], null); if (!me) return {ok: true};
    if (S.status === 'lobby') P.deleteProperty(pk); else { me.x = 1; P.setProperty(pk, JSON.stringify(me)); } return {ok: true}; }
  if (a === 'delName') { var nn = J(all.names, []).filter(function(x){ return x.toLowerCase() !== k_(b.name); }); P.setProperty('names', JSON.stringify(nn)); return {ok: true, noState: true, names: nn}; }
  if (a === 'delHistory') { P.deleteProperty('H:' + b.date); P.deleteProperty('HM:' + b.date);
    if (S.date === b.date && S.status === 'ended') { S.noSave = 1; save(); }   /* or the session still on the board would be saved again */
    return {ok: true, noState: true}; }
  if (a === 'setPin') { var np = String(b.newPin || '').trim(); if (np.length < 4) return {ok: false, error: 'short'}; P.setProperty('pin', np); return {ok: true, noState: true}; }
  return null;
}
