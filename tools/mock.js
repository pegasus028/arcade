// Mock of the Apps Script web app for tests: runs the real apps-script/Code.gs in a vm.
// node tools/mock.js [port]   → static files from the repo root, backend at /exec, clock control at /__time?add=<ms>
const http=require('http'),fs=require('fs'),path=require('path'),vm=require('vm');
function makeBackend(){
  const store={}; let skew=0; const cache={};
  const RealDate=Date;
  class FakeDate extends RealDate{ constructor(...a){ if(a.length) super(...a); else super(RealDate.now()+skew); } static now(){ return RealDate.now()+skew; } }
  const ctx={ Date:FakeDate, Math, JSON, String, Number, Object, Array, console,
    PropertiesService:{getScriptProperties:()=>({
      getProperties:()=>Object.assign({},store), getProperty:k=>k in store?store[k]:null,
      setProperty:(k,v)=>{ if(String(v).length>9000) throw new Error('property too large: '+k); store[k]=String(v); },
      setProperties:(o,del)=>{ if(del) for(const k in store) delete store[k]; Object.assign(store,o); },
      deleteProperty:k=>{ delete store[k]; }, deleteAllProperties:()=>{ for(const k in store) delete store[k]; } })},
    CacheService:{getScriptCache:()=>({ get:k=>{ const c=cache[k]; return c&&c.t>FakeDate.now()?c.v:null; }, put:(k,v,s)=>{ cache[k]={v,t:FakeDate.now()+s*1000}; }, remove:k=>{ delete cache[k]; } })},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    ContentService:{MimeType:{JSON:'json'}, createTextOutput:s=>({s, setMimeType(){ return this; }})} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','apps-script','Code.gs'),'utf8'),ctx);
  return { get:(params)=>ctx.doGet({parameter:params||{}}).s, post:(body)=>ctx.doPost({postData:{contents:typeof body==='string'?body:JSON.stringify(body)}}).s,
           addTime:ms=>{ skew+=ms; }, now:()=>FakeDate.now(), store, ctx };
}
module.exports={makeBackend};
if(require.main===module){
  const be=makeBackend(), root=path.join(__dirname,'..'), port=Number(process.argv[2])||8787;
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
  http.createServer((req,res)=>{
    const u=new URL(req.url,'http://x'); res.setHeader('Access-Control-Allow-Origin','*');
    if(u.pathname==='/__time'){ be.addTime(Number(u.searchParams.get('add'))||0); res.end(String(be.now())); return; }
    if(u.pathname==='/__store'){ res.end(JSON.stringify(be.store)); return; }
    if(u.pathname==='/exec'){
      if(req.method==='POST'){ let b=''; req.on('data',d=>b+=d); req.on('end',()=>{ try{ res.setHeader('Content-Type','application/json'); res.end(be.post(b)); }catch(e){ console.error(e); res.statusCode=500; res.end(String(e)); } }); }
      else { try{ res.setHeader('Content-Type','application/json'); res.end(be.get(Object.fromEntries(u.searchParams))); }catch(e){ console.error(e); res.statusCode=500; res.end(String(e)); } }
      return; }
    let f=path.join(root,decodeURIComponent(u.pathname)); if(u.pathname.endsWith('/')) f=path.join(f,'index.html');
    if(!fs.existsSync(f)&&fs.existsSync(f+'.html')) f+='.html';
    if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){ res.statusCode=404; res.end('404'); return; }
    res.setHeader('Content-Type',types[path.extname(f)]||'application/octet-stream'); res.setHeader('Cache-Control','no-store'); res.end(fs.readFileSync(f));
  }).listen(port,()=>console.log('mock on '+port));
}
