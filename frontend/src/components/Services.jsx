import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ArrowUpRight } from "lucide-react";
import { SERVICES, waLink } from "@/constants/site";
import { FadeUp, EASE } from "@/components/Reveal";

export default function Services() {
    const [open, setOpen] = useState(0);

    return (
        <section id="services" data-testid="services-section" className="relative py-24 sm:py-36">
            <div className="mx-auto max-w-[1600px] px-5 sm:px-8 lg:px-12">
                <div className="mb-16 flex flex-col gap-6 sm:mb-24 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <FadeUp>
                            <p className="mb-6 font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-ink/65 sm:text-xs">
                                What we do — 01/04
                            </p>
                        </FadeUp>
                        <FadeUp delay={0.1}>
                            <h2 className="font-display text-4xl font-extrabold uppercase leading-[0.95] tracking-tight text-ink sm:text-6xl lg:text-7xl">
                                The trade,
                                <br />
                                <span className="text-outline-ink">done properly.</span>
                            </h2>
                        </FadeUp>
                    </div>
                    <FadeUp delay={0.2} className="max-w-sm">
                        <p className="text-base font-medium leading-relaxed text-ink/80">
                            Four things, done to one standard. Pick a chapter — every job gets the
                            same preparation, the same finish and the same clean-up.
                        </p>
                    </FadeUp>
                </div>

                <div data-testid="service-chapters">
                    {SERVICES.map((s, i) => {
                        const isOpen = open === i;
                        return (
                            <FadeUp key={s.id} delay={i * 0.06}>
                                <div className="border-t border-ink/15 last:border-b">
                                    <button
                                        data-testid={`service-chapter-${s.id}-toggle`}
                                        onClick={() => setOpen(isOpen ? null : i)}
                                        className="group flex w-full items-center gap-5 py-7 text-left transition-colors duration-300 hover:bg-ink/[0.04] sm:gap-10 sm:py-9"
                                    >
                                        <span className="font-mono text-xs tracking-[0.25em] text-ink/55 sm:text-sm">
                                            {s.id}
                                        </span>
                                        <span
                                            className={`flex-1 font-display text-2xl font-bold uppercase tracking-tight transition-all duration-500 sm:text-4xl lg:text-5xl ${
                                                isOpen
                                                    ? "translate-x-2 text-ink"
                                                    : "text-ink group-hover:translate-x-2"
                                            }`}
                                        >
                                            {s.title}
                                        </span>
                                        <motion.span
                                            animate={{ rotate: isOpen ? 45 : 0 }}
                                            transition={{ duration: 0.4, ease: EASE }}
                                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-ink/25 text-ink transition-colors duration-300 group-hover:border-ink group-hover:bg-ink group-hover:text-paper"
                                        >
                                            <Plus className="h-5 w-5" strokeWidth={1.5} />
                                        </motion.span>
                                    </button>

                                    <AnimatePresence initial={false}>
                                        {isOpen && (
                                            <motion.div
                                                key="content"
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.55, ease: EASE }}
                                                className="overflow-hidden"
                                                data-testid={`service-chapter-${s.id}-content`}
                                            >
                                                <div className="grid gap-8 pb-10 pl-9 pr-2 sm:grid-cols-[1fr_1.2fr] sm:gap-16 sm:pl-[4.5rem]">
                                                    <p className="max-w-md text-base font-medium leading-relaxed text-ink/80 sm:text-lg">
                                                        {s.blurb}
                                                    </p>
                                                    <div>
                                                        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                            {s.points.map((p) => (
                                                                <li
                                                                    key={p}
                                                                    className="flex items-start gap-3 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-ink/85"
                                                                >
                                                                    <span className="mt-1.5 block h-1 w-1 shrink-0 rounded-full bg-ink/60" />
                                                                    {p}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                        <a
                                                            href={waLink(
                                                                `Hi TMN — I'd like a quote for ${s.title.toLowerCase()}.`
                                                            )}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            data-testid={`service-chapter-${s.id}-quote-link`}
                                                            className="mt-8 inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-ink underline-offset-4 hover:underline"
                                                        >
                                                            Quote this on WhatsApp
                                                            <ArrowUpRight className="h-4 w-4" />
                                                        </a>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </FadeUp>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
