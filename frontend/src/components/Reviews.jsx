import { Star } from "lucide-react";
import { FadeUp } from "@/components/Reveal";

/* Real 5.0/5 rating across ~16 reviews (TopTenTrades 5.0, plus high praise on
   MyBuilder and MyJobQuote) — shown as theme cards, paraphrased from the
   clients' reviews. No invented reviewer names. */
const HIGHLIGHTS = [
    {
        theme: "Quality of work",
        quote:
            "High standards on the difficult jobs — gable wall render above a new zinc roof, crisp high-stairway painting and clean kitchen and carpentry finishes.",
        source: "MyJobQuote",
    },
    {
        theme: "Reliability",
        quote:
            "Arrives on time, explains the process upfront, and finishes quickly and efficiently.",
        source: "MyBuilder",
    },
    {
        theme: "Site care",
        quote:
            "Polite, careful teams — granite patios and bespoke roofs protected, and homes left clean and tidy.",
        source: "MyBuilder",
    },
    {
        theme: "Repeat work",
        quote:
            "Around 88% positive recommendation rate, with clients planning their next project.",
        source: "Facebook",
    },
];

const PLATFORMS = ["TopTenTrades", "MyBuilder", "MyJobQuote"];

export default function Reviews() {
    return (
        <section id="reviews" className="relative overflow-x-hidden py-24 sm:py-32">
            <div className="mx-auto max-w-[1500px] px-5 sm:px-8">
                <div className="grid items-start gap-12 lg:grid-cols-[minmax(320px,5fr)_7fr] lg:gap-20">
                    <div className="lg:sticky lg:top-28">
                        <FadeUp>
                            <p className="mb-6 font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-ink/70 sm:text-xs">
                                Rated on TopTenTrades, MyBuilder &amp; MyJobQuote
                            </p>
                            <h2 className="max-w-xl font-display text-4xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
                                Five stars,
                                <br />
                                time after time.
                            </h2>
                        </FadeUp>
                        <FadeUp delay={0.1}>
                            <div className="mt-8 flex items-center gap-5" data-testid="reviews-rating-summary">
                                <span className="font-display text-7xl font-extrabold leading-none tracking-tight sm:text-8xl">
                                    5.0
                                </span>
                                <div>
                                    <div className="flex gap-1" data-testid="reviews-stars">
                                        {Array.from({ length: 5 }, (_, i) => (
                                            <Star key={i} className="h-5 w-5 fill-[#C6A55C] text-[#C6A55C]" />
                                        ))}
                                    </div>
                                    <p className="mt-2 text-sm font-medium text-ink/65">
                                        from around 16 client reviews
                                    </p>
                                </div>
                            </div>
                            <div className="mt-6 flex flex-wrap gap-2.5">
                                {PLATFORMS.map((p) => (
                                    <span
                                        key={p}
                                        data-testid={`reviews-platform-${p.toLowerCase()}`}
                                        className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-white/80 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-ink/75 backdrop-blur-sm"
                                    >
                                        <Star className="h-3 w-3 fill-[#C6A55C] text-[#C6A55C]" /> {p}
                                    </span>
                                ))}
                            </div>
                        </FadeUp>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        {HIGHLIGHTS.map((h, i) => (
                            <FadeUp key={h.theme} delay={0.08 * i} className="h-full">
                                <div
                                    data-testid={`reviews-highlight-${i + 1}`}
                                    className="flex h-full flex-col rounded-3xl border border-ink/10 bg-white/80 p-7 shadow-[0_18px_50px_rgba(10,10,10,0.07)] backdrop-blur-sm"
                                >
                                    <div className="flex gap-1">
                                        {Array.from({ length: 5 }, (_, s) => (
                                            <Star key={s} className="h-3.5 w-3.5 fill-[#C6A55C] text-[#C6A55C]" />
                                        ))}
                                    </div>
                                    <p className="mt-4 flex-1 text-[15px] font-medium leading-relaxed text-ink/80">
                                        &ldquo;{h.quote}&rdquo;
                                    </p>
                                    <p className="mt-5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink/50">
                                        {h.theme} · via {h.source}
                                    </p>
                                </div>
                            </FadeUp>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
