import { createFileRoute } from "@tanstack/react-router";

const WATERMARK = `<div class="wm"><div class="wm-main">ApexLectures</div><div class="wm-sub">Powered by MARCO</div></div>`;
const WATERMARK_CSS = `.wm{position:fixed;right:10px;bottom:10px;z-index:2147483647;pointer-events:none;text-align:right;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-shadow:0 1px 2px rgba(0,0,0,.8)}.wm-main{color:rgba(255,255,255,.85);font-weight:700;font-size:14px;letter-spacing:.3px}.wm-sub{color:rgba(255,255,255,.65);font-size:10px;margin-top:2px}`;

export const Route = createFileRoute("/play.php")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const target = `/vidcloud/play.php${url.search}`;
        const safeTarget = target.replace(/"/g, "&quot;");
        const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Player</title><style>html,body{margin:0;padding:0;background:#000;overflow:hidden;width:100%;height:100%}iframe{margin:0;padding:0;border:0;width:100%;height:100%;background:#000;display:block}${WATERMARK_CSS}</style></head><body><iframe id="player" src="${safeTarget}" allow="encrypted-media; autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>${WATERMARK}<script>
(function(){
  var lockedHref = location.href;
  window.addEventListener('beforeunload', function(e){ e.preventDefault(); e.returnValue=''; return ''; });
  try {
    history.pushState(null, '', lockedHref);
    window.addEventListener('popstate', function(){ history.pushState(null, '', lockedHref); });
  } catch(e) {}
  try { window.open = function(){ return null; }; } catch(e){}
})();
</script></body></html>`;
        return new Response(html, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
    },
  },
});
