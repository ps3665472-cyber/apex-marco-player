import { createFileRoute } from "@tanstack/react-router";

const WATERMARK = ``;
const WATERMARK_CSS = ``;

export const Route = createFileRoute("/play.php")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const target = `/vidcloud/play.php${url.search}`;
        const safeTarget = target.replace(/"/g, "&quot;");
        const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Player</title><link rel="preconnect" href="https://vidcloud.eu.org" crossorigin><link rel="dns-prefetch" href="https://vidcloud.eu.org"><style>html,body{margin:0;padding:0;background:#000;overflow:hidden;width:100%;height:100%}iframe{margin:0;padding:0;border:0;width:100%;height:100%;background:#000;display:block}${WATERMARK_CSS}</style></head><body><iframe id="player" src="${safeTarget}" allow="encrypted-media; autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>${WATERMARK}<script>
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
