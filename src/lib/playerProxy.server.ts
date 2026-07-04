type LockedPlayerOptions = {
  routePath: "/play.php" | "/play2.php";
  upstreamOrigin: string;
  upstreamPath: string;
};

function htmlAttr(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function playerHeaders(extra?: HeadersInit) {
  return new Headers({
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "x-frame-options": "SAMEORIGIN",
    "referrer-policy": "no-referrer",
    ...extra,
  });
}

function statusPage(title: string, message: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlAttr(title)}</title><style>html,body{margin:0;width:100%;height:100%;background:#000;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,sans-serif;overflow:hidden}.wrap{min-height:100%;display:grid;place-items:center;padding:24px;box-sizing:border-box}.box{max-width:720px;border:1px solid #2f2f2f;background:#1f1f1f;border-radius:18px;padding:28px;text-align:center;box-shadow:0 18px 48px rgba(0,0,0,.35)}h1{margin:0 0 12px;color:#ff5b63;font-size:28px}p{margin:0;color:#bdbdbd;font-size:18px;line-height:1.5}</style></head><body><main class="wrap"><section class="box"><h1>${htmlAttr(title)}</h1><p>${htmlAttr(message)}</p></section></main></body></html>`;
}

function lockedShell(request: Request, options: LockedPlayerOptions) {
  const url = new URL(request.url);
  const frameSrc = `${options.routePath}${url.search}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Player</title><style>html,body,#player{margin:0;padding:0;border:0;width:100%;height:100%;background:#000;overflow:hidden}#notice{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);display:none;max-width:calc(100% - 32px);border:1px solid #343434;background:#1f1f1f;color:#e5e7eb;border-radius:14px;padding:12px 16px;font:600 14px system-ui,-apple-system,Segoe UI,sans-serif;text-align:center;z-index:5}</style></head><body><iframe id="player" src="${htmlAttr(frameSrc)}" sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock allow-orientation-lock" allow="encrypted-media; autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe><div id="notice">Navigation blocked. Player stayed on this page.</div><script>
(function(){
  var frame = document.getElementById('player');
  var notice = document.getElementById('notice');
  var allowedPath = ${safeJson(options.routePath)};
  var allowedSrc = frame.getAttribute('src');
  var lockedHref = location.href;
  function showNotice(){ notice.style.display='block'; clearTimeout(showNotice.t); showNotice.t=setTimeout(function(){ notice.style.display='none'; }, 2400); }
  function resetFrame(){ frame.src = allowedSrc; showNotice(); }
  function inspect(){
    try {
      var u = new URL(frame.contentWindow.location.href);
      if (u.origin !== location.origin || u.pathname !== allowedPath) resetFrame();
    } catch (e) { resetFrame(); }
  }
  frame.addEventListener('load', function(){ setTimeout(inspect, 50); });
  setInterval(inspect, 700);
  try { history.replaceState(null, '', lockedHref); history.pushState(null, '', lockedHref); } catch(e) {}
  window.addEventListener('popstate', function(){ try { history.pushState(null, '', lockedHref); } catch(e) {} });
  window.addEventListener('beforeunload', function(e){ e.preventDefault(); e.returnValue=''; return ''; });
})();
</script></body></html>`;
  return new Response(html, {
    headers: playerHeaders({
      "content-security-policy": "frame-src 'self'; child-src 'self'; object-src 'none'; form-action 'none'; base-uri 'self'",
    }),
  });
}

function injectLockdown(html: string, upstreamOrigin: string, routePath: string) {
  const baseTag = `<base href="${htmlAttr(upstreamOrigin)}/">`;
  const guard = `<style>a[href*="batch"],button,[role="button"]{}</style><script>
(function(){
  var lockedPath=location.pathname;
  var lockedSearch=location.search;
  var nativeReplace=null;
  function isNavEl(el){
    var node=el;
    while(node && node!==document.documentElement){
      var tag=(node.tagName||'').toLowerCase();
      var text=(node.innerText||node.textContent||'').toLowerCase();
      var href=(node.getAttribute&&node.getAttribute('href')||'').toLowerCase();
      if(tag==='a' || tag==='button' || tag==='form' || node.getAttribute && node.getAttribute('role')==='button'){
        if(/back|batch|home|login|donate|telegram|join|open/.test(text+' '+href)) return true;
      }
      node=node.parentElement;
    }
    return false;
  }
  function hideNav(){
    var all=document.querySelectorAll('a,button,form,[role="button"]');
    for(var i=0;i<all.length;i++){
      var el=all[i];
      var text=(el.innerText||el.textContent||'').toLowerCase();
      var href=(el.getAttribute&&el.getAttribute('href')||'').toLowerCase();
      if(/back|batch|home|login|donate|telegram|join|open/.test(text+' '+href)){
        el.style.setProperty('display','none','important');
        el.setAttribute('aria-hidden','true');
        if(el.tagName==='A') el.removeAttribute('href');
      }
    }
  }
  function stay(){
    try {
      if(nativeReplace && (location.pathname!==lockedPath || location.search!==lockedSearch)) nativeReplace(null,'',lockedPath+lockedSearch+location.hash);
    } catch(e) {}
  }
  window.open=function(){ return null; };
  try {
    nativeReplace=history.replaceState.bind(history);
    history.pushState=function(){ stay(); return null; };
    history.replaceState=function(){ stay(); return null; };
  } catch(e) {}
  window.addEventListener('beforeunload', function(e){ e.preventDefault(); e.returnValue=''; return ''; });
  document.addEventListener('click', function(e){ if(isNavEl(e.target)){ e.preventDefault(); e.stopImmediatePropagation(); hideNav(); return false; } }, true);
  document.addEventListener('submit', function(e){ e.preventDefault(); e.stopImmediatePropagation(); return false; }, true);
  window.addEventListener('popstate', stay, true);
  window.addEventListener('hashchange', stay, true);
  document.addEventListener('DOMContentLoaded', hideNav);
  new MutationObserver(hideNav).observe(document.documentElement,{childList:true,subtree:true});
  setInterval(function(){ hideNav(); stay(); }, 500);
})();
</script>`;

  let out = html;
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, `<head$1>${baseTag}${guard}`);
  } else {
    out = `${baseTag}${guard}${out}`;
  }
  return out;
}

async function frameProxy(request: Request, options: LockedPlayerOptions) {
  const incoming = new URL(request.url);
  const upstreamUrl = `${options.upstreamOrigin}${options.upstreamPath}${incoming.search}`;

  const headers = new Headers();
  const forwarded = ["accept", "accept-language", "range", "user-agent"];
  for (const key of forwarded) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  headers.set("referer", `${options.upstreamOrigin}/`);
  headers.set("origin", options.upstreamOrigin);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers,
      redirect: "manual",
    });
  } catch {
    return new Response(statusPage("Video Not Available", "The player could not load this video right now."), {
      status: 200,
      headers: playerHeaders(),
    });
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    return new Response(statusPage("Video Not Available", "The player tried to leave this page, so it was blocked."), {
      status: 200,
      headers: playerHeaders(),
    });
  }

  const contentType = upstream.headers.get("content-type") || "text/html; charset=utf-8";
  const isText = /text\/|application\/(javascript|json|xml|xhtml)/i.test(contentType);

  if (!isText) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: new Headers({
        "content-type": contentType,
        "cache-control": "no-store, max-age=0",
      }),
    });
  }

  const body = await upstream.text();
  return new Response(injectLockdown(body, options.upstreamOrigin, options.routePath), {
    status: 200,
    headers: playerHeaders({
      "content-security-policy": "object-src 'none'; form-action 'none'; frame-src 'none'; child-src 'none'; frame-ancestors 'self'",
    }),
  });
}

export function createLockedPlayerResponse(request: Request, options: LockedPlayerOptions) {
  if (request.headers.get("sec-fetch-dest") === "iframe") {
    return frameProxy(request, options);
  }
  return lockedShell(request, options);
}