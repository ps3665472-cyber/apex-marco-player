const UPSTREAM = "https://stream.studyratna.cc";
const UPSTREAM_HOST = "stream.studyratna.cc";

const NEW_LOGO = "https://i.ibb.co/v6ZKsh53/logo.png";
const OLD_LOGO_RE =
  /https:\/\/encrypted-tbn0\.gstatic\.com\/images\?q=tbn:ANd9GcT1fXfQMfsh9IK27z-hikKlLU2h8R_A9XUaLg&s/g;

// Order matters — longer/more specific patterns first.
const TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [OLD_LOGO_RE, NEW_LOGO],
  // Swap batches JSON source to our own proxied endpoint (rarestudy-backed).
  [
    /https?:\/\/semfy-gros\.github\.io\/batches\/batcha\.json/g,
    "/api/batches.json",
  ],
  // Telegram channel/group link replacement.
  [/t\.me\/\+DGqOIShXqlYwMzhl/g, "t.me/official_marco_22"],
  [/t\.me\/mee_ratna/g, "t.me/official_marco_22"],
  [/Ratna\s*Bhai/gi, "Mr. Marco"],
  [/RatnaBhai/gi, "Mr. Marco"],
  [/Study\s*Ratna/g, "ApexLecture"],
  [/StudyRatna/g, "ApexLecture"],
  [/studyratna/g, "apexlecture"],
  [/STUDYRATNA/g, "APEXLECTURE"],
  [/Ratna/g, "Marco"],
  [/ratna/g, "marco"],
];

function rewriteText(body: string): string {
  let out = body;
  for (const [re, rep] of TEXT_REPLACEMENTS) out = out.replace(re, rep);
  // Make upstream absolute URLs relative so they route back through this proxy.
  out = out.replace(/https?:\/\/stream\.studyratna\.cc/g, "");
  return out;
}

export async function proxyRequest(request: Request, splat: string): Promise<Response> {
  const url = new URL(request.url);
  const cleanSplat = splat.replace(/^\/+/, "");
  const upstreamUrl = `${UPSTREAM}/${cleanSplat}${url.search}`;

  const headers = new Headers();
  // Forward a minimal, safe subset of headers.
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
  headers.set("referer", UPSTREAM + "/");
  headers.set("origin", UPSTREAM);
  headers.set("host", UPSTREAM_HOST);

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
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
  // Copy safe response headers.
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
  // Rewrite Location on redirects.
  const location = upstream.headers.get("location");
  if (location) {
    respHeaders.set(
      "location",
      location.replace(/^https?:\/\/stream\.studyratna\.cc/, ""),
    );
  }
  // Rewrite Set-Cookie domain.
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
    return new Response(rewriteText(body), {
      status: upstream.status,
      headers: respHeaders,
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
}
