import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Heart, Sparkles } from "lucide-react";
import { FadeUp, EASE } from "@/components/Reveal";

export default function ColourTeaser() {
    return (
        <section id="colours" data-testid="colour-teaser" className="relative py-16 sm:py-24">
            <div className="mx-auto max-w-[1600px] px-5 sm:px-8 lg:px-12">
                <FadeUp>
                    <div className="relative overflow-hidden rounded-3xl border border-ink/10 bg-ink px-7 py-10 text-paper shadow-[0_30px_80px_rgba(10,10,10,0.25)] sm:px-12 sm:py-12">
                        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#C6A55C]/25 blur-[90px]" />
                        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-[#4A67D6]/20 blur-[90px]" />
                        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
                            <div className="max-w-2xl">
                                <p className="mb-4 flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-paper/70 sm:text-xs">
                                    <Sparkles className="h-3.5 w-3.5 text-[#C6A55C]" />
                                    Colour visualiser — free
                                </p>
                                <h2 className="font-display text-3xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-5xl">
                                    Test colours on your
                                    <br />
                                    <span className="text-[#C6A55C]">own home.</span>
                                </h2>
                                <p className="mt-4 max-w-md text-sm font-medium leading-relaxed text-paper/75 sm:text-base">
                                    Upload a photo, brush over your walls, door or woodwork and see
                                    the true paint colour instantly — instant results, no sign-up.
                                </p>
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
                                <a
                                    href="/visualiser"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    data-testid="colour-open-visualiser"
                                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#C6A55C] px-8 py-4 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-white transition-transform hover:scale-105 active:scale-95"
                                    style={{ transitionTimingFunction: EASE }}
                                >
                                    Open the visualiser
                                    <ArrowUpRight className="h-4 w-4" />
                                </a>
                            </div>
                        </div>
                    </div>
                </FadeUp>
                <FadeUp delay={0.12}>
                    <div className="mt-5 flex justify-center">
                        <Link
                            to="/favourites"
                            data-testid="colour-top10-link"
                            className="group inline-flex items-center gap-2.5 rounded-full border border-ink/20 bg-white/80 px-7 py-3.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink shadow-[0_10px_30px_rgba(10,10,10,0.08)] backdrop-blur-sm transition-colors duration-300 hover:border-ink hover:bg-ink hover:text-paper"
                        >
                            <Heart className="h-3.5 w-3.5 fill-[#C6A55C] text-[#C6A55C] transition-transform duration-300 group-hover:scale-125" />
                            See the top 10 favourite colours
                            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                        </Link>
                    </div>
                </FadeUp>
            </div>
        </section>
    );
}
