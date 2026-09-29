import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { Converter } from "@/components/Converter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "3GP Converter — Turn Any Video Into 3GP In Your Browser" },
      {
        name: "description",
        content:
          "Convert MP4, MKV, MOV, AVI, WEBM and more into 3GP right in your browser. No uploads, no signup, three quality presets.",
      },
      { property: "og:title", content: "3GP Converter — Any Video To 3GP" },
      {
        property: "og:description",
        content:
          "Private, in-browser video to 3GP conversion with old-phone-safe quality presets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-10 sm:px-6 sm:py-16">
      <header>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" />
          runs offline in your browser
        </span>
        <h1 className="mt-5 font-display text-4xl leading-[1.05] font-bold sm:text-5xl">
          Any video format,
          <br />
          <span className="text-signal-gradient">converted to 3GP.</span>
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted-foreground">
          Drop in an MP4, MKV, MOV, AVI, WEBM, FLV or almost anything else. Pick a size, and get a
          ready-to-play .3gp file — no uploads, no accounts, no waiting in a queue.
        </p>
      </header>

      <section className="mt-8">
        <ClientOnly
          fallback={
            <div className="panel h-72 animate-pulse" aria-hidden="true" />
          }
        >
          <Converter />
        </ClientOnly>
      </section>

      <section className="mt-10 grid gap-3 sm:grid-cols-3">
        {[
          {
            title: "Fully private",
            body: "Transcoding happens on your device, so nothing ever leaves your browser.",
          },
          {
            title: "Old-phone ready",
            body: "The classic 176×144 preset matches what feature phones and MMS expect.",
          },
          {
            title: "Any input format",
            body: "If a player can open it, the converter can almost certainly read it.",
          },
        ].map((item) => (
          <div key={item.title} className="rounded-xl border border-border bg-secondary/30 p-4">
            <h2 className="font-display text-sm font-semibold">{item.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
          </div>
        ))}
      </section>

      <footer className="mt-10 font-mono text-xs text-muted-foreground">
        3GP output: MPEG-4 video + AAC mono audio in a 3GPP container.
      </footer>
    </main>
  );
}
