import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/play.php")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const target = `https://vidcloud.eu.org/play.php${url.search}`;
        const safeTarget = target.replace(/"/g, "&quot;");
        const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Player</title><style>html,body,iframe{margin:0;padding:0;border:0;width:100%;height:100%;background:#000;overflow:hidden}</style></head><body><iframe id="player" src="${safeTarget}" sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock allow-orientation-lock" allow="encrypted-media; autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe><script>
(function(){
  // Block any attempt to navigate the top window away from this page.
  var lockedHref = location.href;
  window.addEventListener('beforeunload', function(e){ e.preventDefault(); e.returnValue=''; return ''; });
  try {
    history.pushState(null, '', lockedHref);
    window.addEventListener('popstate', function(){ history.pushState(null, '', lockedHref); });
  } catch(e) {}
  // Neutralize programmatic redirects on this top page.
  try { Object.defineProperty(window, 'location', { configurable:false, get:function(){ return document.location; } }); } catch(e) {}
})();
</script></body></html>`;
        return new Response(html, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
    },
  },
});
