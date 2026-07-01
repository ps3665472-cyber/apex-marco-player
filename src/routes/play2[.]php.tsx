import { createFileRoute } from "@tanstack/react-router";

type PlaySearch = Record<string, string>;

const UPSTREAM = "https://stream.studyratna.cc/play.php";

export const Route = createFileRoute("/play2.php")({
  validateSearch: (search: Record<string, unknown>): PlaySearch => {
    const out: PlaySearch = {};
    for (const [k, v] of Object.entries(search)) {
      if (v === undefined || v === null) continue;
      out[k] = String(v);
    }
    return out;
  },
  head: ({ match }) => {
    const s = match.search as PlaySearch;
    const name = s?.title || s?.video_name || "Video Player";
    return {
      meta: [
        { title: name },
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { name: "description", content: `Playing: ${name}` },
      ],
    };
  },
  component: PlayPage,
});

function PlayPage() {
  const search = Route.useSearch();
  const qs = new URLSearchParams(search as Record<string, string>).toString();
  const src = qs ? `${UPSTREAM}?${qs}` : UPSTREAM;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        margin: 0,
        padding: 0,
        background: "#000",
        overflow: "hidden",
      }}
    >
      <iframe
        src={src}
        title="Video Player"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture; accelerometer; gyroscope"
        allowFullScreen
        referrerPolicy="no-referrer"
        style={{
          width: "100%",
          height: "100%",
          border: 0,
          display: "block",
        }}
      />
    </div>
  );
}
