import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/play.php")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { createLockedPlayerResponse } = await import("../lib/playerProxy.server");
        return createLockedPlayerResponse(request, {
          routePath: "/play.php",
          upstreamOrigin: "https://vidcloud.eu.org",
          upstreamPath: "/play.php",
        });
      },
    },
  },
});
