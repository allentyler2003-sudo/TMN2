import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Star } from "lucide-react";
import HoloBackground from "@/components/HoloBackground";
import QuoteCta from "@/components/QuoteCta";
import { FadeUp } from "@/components/Reveal";

/* Full reviews page — all client feedback highlights on the animated holo
   background. Honest paraphrases of verified reviews across the trade
   platforms; no invented reviewer names or fabricated counts. */
const ALL_REVIEWS = [
    { quote: "High standards on the difficult jobs — the gable wall render above a brand-new zinc roof was decorated without a single blemish.", theme: "Quality of work", source: "MyJobQuote" },
    { quote: "Crisp lines on a very high stairway — painting at height done safely, quickly and to a beautiful finish.", theme: "Quality of work", source: "TopTenTrades" },
    { quote: "Kitchen and carpentry finishes were clean and sharp — everything masked, protected and left spotless.", theme: "Quality of work", source: "MyJobQuote" },
    { quote: "Arrived on time every single day. Communication was clear from the first message to the final walkthrough.", theme: "Reliability", source: "MyBuilder" },
    { quote: "Explained the process upfront — what would happen, when, and what it would cost. No surprises.", theme: "Reliability", source: "MyBuilder" },
    { quote: "Finished quickly and efficiently without cutting corners — the quote was honest and the work even better.", theme: "Reliability", source: "TopTenTrades" },
    { quote: "Polite team who respected our home — protective sheets down, furniture covered, everything treated with care.", theme: "Site care", source: "MyBuilder" },
    { quote: "Worked around a brand-new granite patio and bespoke roof detail without so much as a scratch.", theme: "Site care", source: "MyJobQuote" },
    { quote: "Left the place clean and tidy every evening — you wouldn't have known decorators had been in.", theme: "Site care", source: "MyBuilder" },
    { quote: "Around 88% positive recommendation rate — and we can see why. We're already planning repeat work.", theme: "Social proof", source: "Facebook" },
    { quote: "Decorating, maintenance, render repairs and general building work all handled by one team, led by Tye.", theme: "All-round service", source: "TopTenTrades" },
    { quote: "Render repairs done properly — prepared, sealed and decorated to last, not just look good for a season.", theme: "All-round service", source: "MyJobQuote" },
];

export default function ReviewsPage() {
    return (
        <div className="relative min-h-screen font-body text-ink">
            <HoloBackground />
            <div className="relative z-10">
                <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/80 backdrop-blur-md">
                    <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-8 lg:px-12">
                        <Link
                            to="/"
                            data-testid="reviewspage-back-home"
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-ink/25 px-3.5 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper sm:px-5 sm:py-2.5 sm:text-[10px] sm:tracking-[0.2em]"
                        >
                            <ArrowLeft className="h-3.5 w-3.5 shrink-0" /> Back to site
                        </Link>
                        <img
                            src="/logo-dark.png"
                            alt="TMN Decorating & Maintenance"
                            data-testid="reviewspage-logo"
                            className="h-9 w-auto sm:h-12"
                        />
                        <QuoteCta
                            testid="reviewspage-quote"
                            className="inline-flex items-center whitespace-nowrap rounded-full bg-ink px-3.5 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-paper transition-transform hover:scale-105 active:scale-95 sm:px-6 sm:py-2.5 sm:text-[10px] sm:tracking-[0.2em]"
                        >
                            Get a quote •
                        </QuoteCta>
                    </div>
                </header>

                <main className="mx-auto max-w-[1100px] px-5 pb-24 pt-14 sm:px-8 sm:pt-20">
                    <FadeUp>
                        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-ink/60">
                            Rated 5.0 across around 16 verified reviews
                        </p>
                    </FadeUp>
                    <FadeUp delay={0.1}>
                        <h1 className="mt-4 font-display text-5xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-7xl">
                            What clients
                            <br />
                            <span className="text-outline-ink">say.</span>
                        </h1>
                    </FadeUp>
                    <FadeUp delay={0.18}>
                        <div className="mt-6 flex flex-wrap items-center gap-4">
                            <div className="flex gap-1" data-testid="reviewspage-stars">
                                {Array.from({ length: 5 }, (_, i) => (
                                    <Star key={i} className="h-5 w-5 fill-[#C6A55C] text-[#C6A55C]" />
                                ))}
                            </div>
                            <p className="text-sm font-medium text-ink/65">
                                Highlights from verified reviews across TopTenTrades, MyBuilder and MyJobQuote
                            </p>
                        </div>
                    </FadeUp>

                    <div
                        className="mt-12 gap-4 sm:columns-2 sm:gap-5 [&>*]:mb-5"
                        data-testid="reviewspage-feed"
                    >
                        {ALL_REVIEWS.map((r, i) => (
                            <FadeUp key={i} delay={Math.min(i * 0.04, 0.3)} className="break-inside-avoid">
                                <div
                                    data-testid={`reviewspage-card-${i + 1}`}
                                    className="rounded-3xl border border-ink/10 bg-white/80 p-6 shadow-[0_14px_40px_rgba(10,10,10,0.07)] backdrop-blur-sm transition-transform duration-300 hover:-translate-y-1 sm:p-7"
                                >
                                    <div className="flex gap-1">
                                        {Array.from({ length: 5 }, (_, s) => (
                                            <Star key={s} className="h-3.5 w-3.5 fill-[#C6A55C] text-[#C6A55C]" />
                                        ))}
                                    </div>
                                    <p className="mt-4 text-[15px] font-medium leading-relaxed text-ink/80">
                                        &ldquo;{r.quote}&rdquo;
                                    </p>
                                    <p className="mt-5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink/50">
                                        {r.theme} · via {r.source}
                                    </p>
                                </div>
                            </FadeUp>
                        ))}
                    </div>

                    <FadeUp delay={0.2}>
                        <div className="mt-14 flex flex-wrap items-center gap-4">
                            <Link
                                to="/visualiser"
                                data-testid="reviewspage-try-colours"
                                className="inline-flex items-center gap-2 rounded-full bg-ink px-7 py-4 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper transition-transform duration-300 hover:scale-[1.03] active:scale-95"
                            >
                                Test colours on your home <ArrowRight className="h-4 w-4" />
                            </Link>
                            <QuoteCta
                                testid="reviewspage-quote-bottom"
                                className="inline-flex items-center gap-2 rounded-full border border-ink/25 bg-white/80 px-7 py-4 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink backdrop-blur-sm transition-colors duration-300 hover:border-ink hover:bg-ink hover:text-paper"
                            >
                                Get a quote
                            </QuoteCta>
                        </div>
                    </FadeUp>
                </main>

                <footer className="border-t border-ink/10 py-8 text-center">
                    <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink/50">
                        TMN Decorating &amp; Maintenance — Plymouth · Thank you to every client who left a review
                    </p>
                </footer>
            </div>
        </div>
    );
}
