// Generic upstream proxy for player pages (vidcloud, s2-cdn, etc.).
// Rewrites absolute upstream URLs to same-origin proxied paths and
// injects a hard navigation lock so nothing inside can escape the page.

export interface UpstreamConfig {
  upstream: string; // e.g. https://vidcloud.eu.org
  host: string; // e.g. vidcloud.eu.org
  prefix: string; // path prefix on our domain, e.g. /vidcloud
}

// Hide the "Ask AI" button before it can flash on screen, and remove any late-injected instances.
const ASK_AI_HIDE = String.raw`<style id="__apex_hide_askai">
[class*="ask-ai" i],[class*="askAi" i],[class*="AskAI" i],[id*="ask-ai" i],[id*="askai" i],[data-testid*="ask-ai" i],[aria-label="Ask AI" i],button[title="Ask AI" i]{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;width:0!important;height:0!important;overflow:hidden!important}
</style><script>(function(){function isAskAi(el){try{if(!el||el.nodeType!==1)return false;var tag=(el.tagName||'').toLowerCase();if(tag!=='button'&&tag!=='a'&&el.getAttribute&&el.getAttribute('role')!=='button')return false;var t=(el.innerText||el.textContent||'').trim().toLowerCase();var al=((el.getAttribute&&(el.getAttribute('aria-label')||el.getAttribute('title')))||'').toLowerCase();var cn=(((el.className&&el.className.baseVal)||el.className||'')+' '+(el.id||'')).toLowerCase();if(t==='ask ai'||al==='ask ai'||/ask[-_]?ai/.test(cn))return true;}catch(e){}return false;}function hide(el){try{el.style.setProperty('display','none','important');}catch(e){try{el.remove();}catch(_){}}}function sweep(root){try{(root||document).querySelectorAll('button,a,[role="button"]').forEach(function(el){if(isAskAi(el))hide(el);});}catch(e){}}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){sweep(document);});}else{sweep(document);}try{var mo=new MutationObserver(function(muts){muts.forEach(function(m){m.addedNodes&&m.addedNodes.forEach(function(n){if(n.nodeType===1){if(isAskAi(n))hide(n);sweep(n);}});});});mo.observe(document.documentElement,{childList:true,subtree:true});}catch(e){}setInterval(function(){sweep(document);},1500);})();</script>`;

// Master downloader UI: sniffs HLS/DASH manifest URLs, shows a quality picker,
// downloads plain or AES-128 HLS in parallel. Widevine/SAMPLE-AES → honest error.
const DOWNLOADER_SCRIPT = String.raw`<style id="__apex_dl_css">
#__apex_dl_btn{position:fixed;top:10px;right:10px;z-index:2147483000;background:#7c3aed;color:#fff;border:0;border-radius:8px;padding:8px 12px;font:600 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.4);opacity:.85;transition:opacity .2s}
#__apex_dl_btn:hover{opacity:1}
#__apex_dl_btn[disabled]{background:#555;cursor:wait}
#__apex_dl_modal{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;font:14px system-ui,sans-serif;color:#fff}
#__apex_dl_modal .box{background:#1a1a2e;border:1px solid #7c3aed;border-radius:12px;padding:20px;max-width:420px;width:92%;max-height:80vh;overflow:auto}
#__apex_dl_modal h3{margin:0 0 12px;font-size:16px;color:#a78bfa}
#__apex_dl_modal .q{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#2a2a4e;border-radius:8px;margin-bottom:8px;cursor:pointer;transition:background .15s}
#__apex_dl_modal .q:hover{background:#3a3a6e}
#__apex_dl_modal .q .sz{color:#94a3b8;font-size:12px}
#__apex_dl_modal .err{background:#3a1a1a;border:1px solid #7c1d1d;color:#fca5a5;padding:12px;border-radius:8px;margin-bottom:12px;font-size:13px;line-height:1.5}
#__apex_dl_modal .close{margin-top:8px;background:transparent;color:#94a3b8;border:1px solid #444;border-radius:6px;padding:6px 12px;cursor:pointer;width:100%}
#__apex_dl_prog{position:fixed;top:10px;right:10px;z-index:2147483000;background:#1a1a2e;color:#fff;border:1px solid #7c3aed;border-radius:8px;padding:10px 14px;font:600 13px system-ui,sans-serif;min-width:220px;box-shadow:0 4px 12px rgba(0,0,0,.4)}
#__apex_dl_prog .bar{height:6px;background:#333;border-radius:3px;margin-top:6px;overflow:hidden}
#__apex_dl_prog .bar>span{display:block;height:100%;background:linear-gradient(90deg,#7c3aed,#a78bfa);width:0%;transition:width .2s}
</style><script>(function(){
if(window.__apex_dl_installed)return;window.__apex_dl_installed=true;
var manifests=[];
function addManifest(u){if(!u)return;try{u=new URL(u,location.href).href;}catch(e){return;}
  if(!/\.(m3u8|mpd)(\?|$)/i.test(u))return;
  if(manifests.some(function(m){return m.url===u}))return;
  manifests.push({url:u,type:/\.mpd/i.test(u)?'dash':'hls'});
}
try{var _f=window.fetch;window.fetch=function(input,init){var u=typeof input==='string'?input:(input&&input.url);addManifest(u);return _f.apply(this,arguments);};}catch(e){}
try{var _o=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){addManifest(u);return _o.apply(this,arguments);};}catch(e){}

function el(tag,attrs,txt){var e=document.createElement(tag);if(attrs)for(var k in attrs)e.setAttribute(k,attrs[k]);if(txt!=null)e.textContent=txt;return e;}
function fmtSize(b){if(!b||!isFinite(b))return '?';if(b<1024)return b+' B';if(b<1048576)return (b/1024).toFixed(1)+' KB';if(b<1073741824)return (b/1048576).toFixed(1)+' MB';return (b/1073741824).toFixed(2)+' GB';}
function safeName(s){return (s||'lecture').replace(/[\\/:*?"<>|]+/g,'_').slice(0,80);}

function showModal(inner){
  var old=document.getElementById('__apex_dl_modal');if(old)old.remove();
  var m=el('div',{id:'__apex_dl_modal'});
  var box=el('div',{class:'box'});box.innerHTML=inner;
  var close=el('button',{class:'close'},'Close');close.onclick=function(){m.remove();};
  box.appendChild(close);m.appendChild(box);document.body.appendChild(m);
  m.addEventListener('click',function(ev){if(ev.target===m)m.remove();});
  return box;
}
function showError(msg){showModal('<h3>Download</h3><div class="err">'+msg+'</div>');}

async function parseHls(url){
  var r=await fetch(url,{credentials:'include'});
  if(!r.ok)throw new Error('Manifest fetch failed ('+r.status+')');
  var txt=await r.text();
  var lines=txt.split(/\r?\n/);
  var isMaster=/#EXT-X-STREAM-INF/.test(txt);
  if(isMaster){
    var variants=[],cur=null;
    for(var i=0;i<lines.length;i++){
      var L=lines[i];
      if(L.indexOf('#EXT-X-STREAM-INF')===0){
        cur={};
        var bw=/BANDWIDTH=(\d+)/.exec(L);if(bw)cur.bandwidth=+bw[1];
        var res=/RESOLUTION=(\d+x\d+)/.exec(L);if(res)cur.resolution=res[1];
      }else if(cur && L && L[0]!=='#'){
        cur.url=new URL(L,url).href;variants.push(cur);cur=null;
      }
    }
    return {type:'master',variants:variants};
  }
  var segs=[],dur=0,key=null,initMap=null,base=url;
  for(var j=0;j<lines.length;j++){
    var Lj=lines[j];
    if(Lj.indexOf('#EXT-X-KEY')===0){
      var mth=/METHOD=([^,]+)/.exec(Lj);
      var uri=/URI="([^"]+)"/.exec(Lj);
      var iv=/IV=0x([0-9a-fA-F]+)/.exec(Lj);
      key={method:mth?mth[1]:null,uri:uri?new URL(uri[1],base).href:null,iv:iv?iv[1]:null};
    }else if(Lj.indexOf('#EXT-X-MAP')===0){
      var mu=/URI="([^"]+)"/.exec(Lj);if(mu)initMap=new URL(mu[1],base).href;
    }else if(Lj.indexOf('#EXTINF')===0){
      var d=/#EXTINF:([\d.]+)/.exec(Lj);if(d)dur+=parseFloat(d[1]);
    }else if(Lj && Lj[0]!=='#'){
      segs.push(new URL(Lj,base).href);
    }
  }
  return {type:'media',segments:segs,duration:dur,key:key,initMap:initMap};
}

async function downloadHls(mediaUrl,label){
  var info;try{info=await parseHls(mediaUrl);}catch(e){showError('Failed to load media playlist: '+e.message);return;}
  if(info.type!=='media'){showError('Unexpected manifest type.');return;}
  if(info.key && info.key.method && !/^(NONE|AES-128)$/i.test(info.key.method)){
    showError('This lecture is <b>DRM-protected</b> ('+info.key.method+'). Encrypted streams cannot be downloaded from the browser — the decryption key is held inside the secure module. Please watch it in the player.');
    return;
  }
  var aesKey=null,aesIV=null;
  if(info.key && /AES-128/i.test(info.key.method)){
    try{
      var kr=await fetch(info.key.uri,{credentials:'include'});
      var kb=await kr.arrayBuffer();
      aesKey=await crypto.subtle.importKey('raw',kb,{name:'AES-CBC'},false,['decrypt']);
      if(info.key.iv){var hex=info.key.iv;var iv=new Uint8Array(16);for(var i=0;i<16;i++)iv[i]=parseInt(hex.substr(i*2,2),16);aesIV=iv;}
    }catch(e){showError('Failed to fetch decryption key: '+e.message);return;}
  }
  var btn=document.getElementById('__apex_dl_btn');if(btn)btn.style.display='none';
  var old=document.getElementById('__apex_dl_modal');if(old)old.remove();
  var prog=el('div',{id:'__apex_dl_prog'});prog.innerHTML='Downloading '+label+'…<div class="bar"><span></span></div><div class="pct" style="margin-top:4px;font-weight:400;font-size:12px;color:#94a3b8">0 / '+info.segments.length+'</div>';
  document.body.appendChild(prog);
  var bar=prog.querySelector('.bar>span'),pct=prog.querySelector('.pct');
  var total=info.segments.length,done=0,offset=info.initMap?1:0,parts=new Array(total+offset),CONC=8;
  async function fetchSeg(idx){
    var u=info.segments[idx];
    var r=await fetch(u,{credentials:'include'});
    if(!r.ok)throw new Error('Segment '+idx+' failed ('+r.status+')');
    var ab=await r.arrayBuffer();
    if(aesKey){
      var iv=aesIV||(function(){var b=new Uint8Array(16);var v=new DataView(b.buffer);v.setUint32(12,idx);return b;})();
      ab=await crypto.subtle.decrypt({name:'AES-CBC',iv:iv},aesKey,ab);
    }
    parts[idx+offset]=new Uint8Array(ab);
    done++;bar.style.width=(done*100/total)+'%';pct.textContent=done+' / '+total;
  }
  try{
    if(info.initMap){var ir=await fetch(info.initMap,{credentials:'include'});parts[0]=new Uint8Array(await ir.arrayBuffer());}
    var idx=0;
    async function worker(){while(idx<total){var my=idx++;await fetchSeg(my);}}
    var workers=[];for(var w=0;w<CONC;w++)workers.push(worker());
    await Promise.all(workers);
    var isMp4=!!info.initMap || /\.m4s|\.mp4/i.test(info.segments[0]||'');
    var blob=new Blob(parts,{type:isMp4?'video/mp4':'video/mp2t'});
    var ext=isMp4?'mp4':'ts';
    var name=safeName(document.title||'lecture')+' ['+label+'].'+ext;
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1000);
    prog.innerHTML='<b style="color:#86efac">✓ Downloaded</b><div style="margin-top:4px;font-size:12px;color:#94a3b8">'+name+'</div>';
    setTimeout(function(){prog.remove();var b=document.getElementById('__apex_dl_btn');if(b)b.style.display='';},4000);
  }catch(e){
    prog.innerHTML='<b style="color:#fca5a5">Download failed</b><div style="margin-top:4px;font-size:12px">'+e.message+'</div>';
    setTimeout(function(){prog.remove();var b=document.getElementById('__apex_dl_btn');if(b)b.style.display='';},5000);
  }
}

async function pickQuality(){
  var hls=manifests.filter(function(m){return m.type==='hls'});
  var dash=manifests.filter(function(m){return m.type==='dash'});
  if(!hls.length && dash.length){
    showError('This lecture uses <b>DASH + Widevine DRM</b>. Encrypted streams cannot be downloaded from the browser — the decryption key stays inside the secure Content Decryption Module. Please watch it in the player.');
    return;
  }
  if(!hls.length){showError('No video stream detected yet. Please start playing the lecture, then try again.');return;}
  var url=hls[hls.length-1].url;
  var info;try{info=await parseHls(url);}catch(e){showError('Failed to read manifest: '+e.message);return;}
  if(info.type==='media'){downloadHls(url,'auto');return;}
  var box=showModal('<h3>Select quality</h3><div id="__apex_dl_list"></div>');
  var list=box.querySelector('#__apex_dl_list');
  info.variants.sort(function(a,b){return (b.bandwidth||0)-(a.bandwidth||0);});
  info.variants.forEach(function(v){
    var row=el('div',{class:'q'});
    var label=v.resolution||(v.bandwidth?Math.round(v.bandwidth/1000)+' kbps':'auto');
    row.innerHTML='<span><b>'+label+'</b></span><span class="sz">estimating…</span>';
    row.onclick=function(){downloadHls(v.url,label);};
    list.appendChild(row);
    (async function(){try{var mi=await parseHls(v.url);var bytes=(v.bandwidth||0)*mi.duration/8;row.querySelector('.sz').textContent=fmtSize(bytes)+' • '+Math.round(mi.duration)+'s';}catch(e){row.querySelector('.sz').textContent='';}})();
  });
}

function mount(){
  if(!document.body)return;
  if(document.getElementById('__apex_dl_btn'))return;
  var b=el('button',{id:'__apex_dl_btn',title:'Download this lecture'},'⬇ Download');
  b.onclick=function(){pickQuality();};
  document.body.appendChild(b);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
setInterval(function(){if(document.body && !document.getElementById('__apex_dl_btn'))mount();},2000);
})();</script>`;

const NAV_LOCK_SCRIPT = String.raw`<script>

(function(){
  try {
    // Kill window.open so player cannot spawn new tabs.
    window.open = function(){ return null; };
    // Prevent leaving the iframe.
    window.addEventListener('beforeunload', function(e){ e.preventDefault(); e.returnValue=''; return ''; });
    // Force any link/form target to stay inside the iframe (never _top/_parent/_blank).
    function fixTarget(el){
      if(!el || !el.getAttribute) return;
      var t = (el.getAttribute('target')||'').toLowerCase();
      if(t === '_top' || t === '_parent' || t === '_blank') el.setAttribute('target','_self');
    }
    document.addEventListener('click', function(ev){
      var a = ev.target && ev.target.closest ? ev.target.closest('a,button,[role="button"]') : null;
      if(!a) return;
      // Detect known "back to batch" / navigation intent and cancel it.
      var txt = (a.innerText||a.textContent||'').toLowerCase();
      var href = a.getAttribute && a.getAttribute('href') || '';
      if (/back\s*to\s*batch|go\s*back|home|batch/i.test(txt) || /batch|home|index/i.test(href)) {
        ev.preventDefault(); ev.stopPropagation();
        return false;
      }
      if (a.tagName === 'A') {
        fixTarget(a);
        // Block links that leave the current page unless they are hash / javascript / same-page.
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          try {
            var u = new URL(href, location.href);
            // Same-origin, same path: allow (query change); otherwise cancel.
            if (u.origin !== location.origin || (u.pathname !== location.pathname && !/play\.php$/i.test(u.pathname))) {
              ev.preventDefault(); ev.stopPropagation();
              return false;
            }
          } catch(e) { ev.preventDefault(); ev.stopPropagation(); return false; }
        }
      }
    }, true);
    document.addEventListener('submit', function(ev){
      fixTarget(ev.target);
    }, true);
    // Neutralize video-unavailable auto-redirects: some players call location.replace/assign.
    try {
      var _assign = location.assign.bind(location);
      var _replace = location.replace.bind(location);
      location.assign = function(u){
        try { var uu = new URL(u, location.href); if (uu.origin === location.origin && /play\.php$/i.test(uu.pathname)) return _assign(u); } catch(e){}
        console.warn('[player] blocked navigation', u);
      };
      location.replace = function(u){
        try { var uu = new URL(u, location.href); if (uu.origin === location.origin && /play\.php$/i.test(uu.pathname)) return _replace(u); } catch(e){}
        console.warn('[player] blocked navigation', u);
      };
    } catch(e){}
    // Watch DOM for injected "Back to Batch" buttons and disable them.
    var kill = function(root){
      root.querySelectorAll && root.querySelectorAll('a,button').forEach(function(el){
        var t = (el.innerText||el.textContent||'').toLowerCase();
        if (/back\s*to\s*batch|go\s*back/i.test(t)) {
          el.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); return false; }, true);
        }
      });
    };
    var mo = new MutationObserver(function(muts){ muts.forEach(function(m){ m.addedNodes && m.addedNodes.forEach(function(n){ if(n.nodeType===1) kill(n); }); }); });
    document.addEventListener('DOMContentLoaded', function(){ kill(document); mo.observe(document.documentElement,{childList:true,subtree:true}); });
  } catch(e){ console.error('[player nav-lock]', e); }
})();
</script>`;

function rewriteText(body: string, cfg: UpstreamConfig): string {
  const abs = new RegExp(
    `https?://${cfg.host.replace(/\./g, "\\.")}`,
    "g",
  );
  let out = body.replace(abs, cfg.prefix);
  // Rewrite protocol-relative //host references too.
  const proto = new RegExp(`//${cfg.host.replace(/\./g, "\\.")}`, "g");
  out = out.replace(proto, cfg.prefix);
  if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `${ASK_AI_HIDE}</head>`);
  }
  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${NAV_LOCK_SCRIPT}</body>`);
  }
  return out;
}

export async function proxyUpstream(
  request: Request,
  splat: string,
  cfg: UpstreamConfig,
): Promise<Response> {
  const url = new URL(request.url);
  const cleanSplat = splat.replace(/^\/+/, "");
  const upstreamUrl = `${cfg.upstream}/${cleanSplat}${url.search}`;

  const headers = new Headers();
  const forward = [
    "accept",
    "accept-language",
    "content-type",
    "range",
    "user-agent",
    "cookie",
  ];
  for (const h of forward) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("referer", cfg.upstream + "/");
  headers.set("origin", cfg.upstream);
  headers.set("host", cfg.host);

  const init: RequestInit = { method: request.method, headers, redirect: "manual" };
  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, init);
  } catch (err) {
    return new Response(`Upstream fetch failed: ${(err as Error).message}`, {
      status: 502,
    });
  }

  const respHeaders = new Headers();
  const passThrough = [
    "content-type",
    "cache-control",
    "etag",
    "last-modified",
    "expires",
    "accept-ranges",
    "content-range",
  ];
  for (const h of passThrough) {
    const v = upstream.headers.get(h);
    if (v) respHeaders.set(h, v);
  }
  // Strip frame-blocking headers so the player embeds inside our iframe wrapper.
  respHeaders.delete("x-frame-options");
  respHeaders.delete("content-security-policy");

  const location = upstream.headers.get("location");
  if (location) {
    respHeaders.set(
      "location",
      location
        .replace(new RegExp(`^https?://${cfg.host.replace(/\./g, "\\.")}`), cfg.prefix),
    );
  }

  const setCookies = upstream.headers.getSetCookie?.() ?? [];
  for (const c of setCookies) {
    respHeaders.append(
      "set-cookie",
      c.replace(/;\s*Domain=[^;]+/gi, "").replace(/;\s*Secure/gi, ""),
    );
  }

  const ct = upstream.headers.get("content-type") || "";
  const isText =
    /text\/|application\/(json|javascript|xml|xhtml|manifest\+json|ld\+json)/i.test(
      ct,
    );

  if (isText) {
    const body = await upstream.text();
    return new Response(rewriteText(body, cfg), {
      status: upstream.status,
      headers: respHeaders,
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
}
