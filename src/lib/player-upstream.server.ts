// Generic upstream proxy for player pages (vidcloud, s2-cdn, etc.).
// Rewrites absolute upstream URLs to same-origin proxied paths and
// injects a hard navigation lock so nothing inside can escape the page.

export interface UpstreamConfig {
  upstream: string; // e.g. https://vidcloud.eu.org
  host: string; // e.g. vidcloud.eu.org
  prefix: string; // path prefix on our domain, e.g. /vidcloud
}

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
