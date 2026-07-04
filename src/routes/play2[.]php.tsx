import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/play2.php")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { createLockedPlayerResponse } = await import("../lib/playerProxy.server");
        return createLockedPlayerResponse(request, {
          routePath: "/play2.php",
          upstreamOrigin: "https://s2-cdn.studyratna.cc",
          upstreamPath: "/play.php",
        });
      },
    },
  },
});
