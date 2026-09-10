import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Heart } from "lucide-react";
import axios from "axios";
import HoloBackground from "@/components/HoloBackground";
import { FadeUp } from "@/components/Reveal";
import { waLink } from "@/constants/site";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/* Public "Clients' favourite colours" — a ranked top ten that starts as a
   curated preset list and re-ranks as clients heart colours in the visualiser.
   Counts and client details are never shown here. */
export default function Favourites() {
    const [colours, setColours] = useState(null);

    useEffect(() => {
        axios
            .get(`${API}/favourites/top`)
            .then(({ data }) => setColours(data))
            .catch(() => setColours([]));
    }, []);

    return (
        <div className="relative min-h-screen font-body text-ink">
            <HoloBackground />
            <div className="relative z-10">
                <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/80 backdrop-blur-md">
                    <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-8 lg:px-12">
                        <Link
                            to="/"
                            data-testid="favourites-back-home"
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-ink/25 px-3.5 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper sm:px-5 sm:py-2.5 sm:text-[10px] sm:tracking-[0.2em]"
                        >
                            <ArrowLeft className="h-3.5 w-3.5 shrink-0" /> Back to site
                        </Link>
                        <img
                            src="/logo-dark.png"
                            alt="TMN Decorating & Maintenance"
                            data-testid="favourites-logo"
                            className="h-9 w-auto sm:h-12"
                        />
                        <a
                            href={waLink("Hi TMN — I'd love a quote for painting in one of your favourite colours.")}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="favourites-quote"
                            className="inline-flex items-center whitespace-nowrap rounded-full bg-ink px-3.5 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-paper transition-transform hover:scale-105 active:scale-95 sm:px-6 sm:py-2.5 sm:text-[10px] sm:tracking-[0.2em]"
                        >
                            Get a quote •
                        </a>
                    </div>
                </header>

                <main className="mx-auto max-w-[1100px] px-5 pb-24 pt-14 sm:px-8 sm:pt-20">
                    <FadeUp>
                        <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-ink/60">
                            <Heart className="h-3.5 w-3.5 fill-[#C6A55C] text-[#C6A55C]" />
                            Live from the colour visualiser
                        </p>
                    </FadeUp>
                    <FadeUp delay={0.1}>
                        <h1 className="mt-4 font-display text-5xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-7xl">
                            Clients&rsquo; favourite
                            <br />
                            <span className="text-outline-ink">colours.</span>
                        </h1>
                    </FadeUp>
                    <FadeUp delay={0.18}>
                        <p className="mt-6 max-w-xl text-base font-medium leading-relaxed text-ink/65 sm:text-lg">
                            The TMN ten — ranked by the shades clients heart in our visualiser.
                            No numbers, just the colours Plymouth is loving right now.
                        </p>
                    </FadeUp>

                    <div className="mt-12 space-y-3" data-testid="favourites-ranked-list">
                        {(colours === null
                            ? Array.from({ length: 10 }, (_, i) => null)
                            : colours
                        ).map((c, i) => (
                            <FadeUp key={c ? c.hex : `sk-${i}`} delay={Math.min(i * 0.05, 0.4)}>
                                <div
                                    data-testid={`favourites-rank-row-${i + 1}`}
                                    className="flex items-center gap-5 rounded-3xl border border-ink/10 bg-white/80 px-5 py-4 shadow-[0_12px_36px_rgba(10,10,10,0.06)] backdrop-blur-sm transition-transform duration-300 hover:translate-x-1.5 sm:gap-7 sm:px-8 sm:py-5"
                                >
                                    <span className="w-10 shrink-0 font-display text-2xl font-extrabold tracking-tight text-ink/30 sm:w-14 sm:text-3xl">
                                        {String(i + 1).padStart(2, "0")}
                                    </span>
                                    {c ? (
                                        <>
                                            <span
                                                data-testid={`favourites-colour-swatch-${i + 1}`}
                                                className="h-12 w-12 shrink-0 rounded-full shadow-inner ring-2 ring-white sm:h-16 sm:w-16"
                                                style={{ backgroundColor: c.hex }}
                                            />
                                            <div className="min-w-0">
                                                <p
                                                    data-testid={`favourites-colour-name-${i + 1}`}
                                                    className="truncate font-display text-lg font-bold uppercase tracking-tight sm:text-2xl"
                                                >
                                                    {c.name}
                                                </p>
                                                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-ink/45 sm:text-xs">
                                                    {c.hex}
                                                </p>
                                            </div>
                                            {i === 0 && (
                                                <span className="ml-auto hidden shrink-0 items-center gap-1.5 rounded-full bg-[#C6A55C]/15 px-4 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-ink/75 sm:inline-flex">
                                                    <Heart className="h-3 w-3 fill-[#C6A55C] text-[#C6A55C]" /> Most loved
                                                </span>
                                            )}
                                        </>
                                    ) : (
                                        <span className="h-12 w-40 animate-pulse rounded-full bg-ink/10 sm:h-16" />
                                    )}
                                </div>
                            </FadeUp>
                        ))}
                    </div>

                    <FadeUp delay={0.2}>
                        <div className="mt-14 flex flex-wrap items-center gap-4">
                            <Link
                                to="/visualiser"
                                data-testid="favourites-try-colours"
                                className="inline-flex items-center gap-2 rounded-full bg-ink px-7 py-4 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper transition-transform duration-300 hover:scale-[1.03] active:scale-95"
                            >
                                Test these on your home <ArrowRight className="h-4 w-4" />
                            </Link>
                            <p className="max-w-xs text-xs font-medium leading-relaxed text-ink/55">
                                Heart a colour in the visualiser and watch it climb this list.
                            </p>
                        </div>
                    </FadeUp>
                </main>

                <footer className="border-t border-ink/10 py-8 text-center">
                    <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink/50">
                        TMN Decorating &amp; Maintenance — Plymouth · Ranked by clients, loved by us
                    </p>
                </footer>
            </div>
        </div>
    );
}
