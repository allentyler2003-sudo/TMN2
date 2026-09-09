import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { waLink } from "@/constants/site";
import { MaskedLines } from "@/components/Reveal";
import { scrollToHash } from "@/components/Nav";

export default function Hero() {
    const sectionRef = useRef(null);
    const { scrollYProgress } = useScroll({
        target: sectionRef,
        offset: ["start start", "end start"],
    });
    const badgeY = useTransform(scrollYProgress, [0, 1], [0, -90]);
    const contentY = useTransform(scrollYProgress, [0, 1], [0, 120]);
    const contentOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

    return (
        <section
            ref={sectionRef}
            id="top"
            data-testid="hero-section"
            className="relative flex min-h-[100svh] items-center overflow-hidden pb-16 pt-28 sm:pt-32"
        >
            <div className="mx-auto grid w-full max-w-[1600px] grid-cols-1 items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1.35fr_1fr] lg:gap-8 lg:px-12">
                <motion.div style={{ y: contentY, opacity: contentOpacity }}>
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1, delay: 0.4 }}
                        className="mb-5 max-w-xl font-mono text-[10px] uppercase leading-relaxed tracking-[0.3em] text-ink/70 sm:text-xs"
                    >
                        Domestic &amp; Commercial — Painting, Decorating &amp; Property Maintenance
                    </motion.p>

                    <h1 className="font-display text-[16vw] font-extrabold uppercase leading-[0.86] tracking-tight text-ink sm:text-[12vw] lg:text-[8.5vw]">
                        <MaskedLines
                            delay={0.25}
                            lines={[
                                <span key="a">Prepared.</span>,
                                <span key="b">Painted.</span>,
                                <span key="c" className="text-outline-ink">
                                    Protected.
                                </span>,
                            ]}
                            testIdPrefix="hero-headline"
                        />
                    </h1>

                    <motion.p
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 1 }}
                        className="mt-8 max-w-md text-base font-medium leading-relaxed text-ink/80 sm:text-lg"
                    >
                        {`Flawless finishes and honest upkeep for homes and businesses — by TMN
                        Decorating & Maintenance, based in Plymouth, UK.`}
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 1.15 }}
                        className="mt-10 flex flex-wrap items-center gap-4"
                    >
                        <a
                            href={waLink(
                                "Hi TMN Decorating & Maintenance — I'd like a quote for a project."
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="hero-cta-quote-button"
                            className="rounded-full bg-ink px-7 py-4 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-paper transition-transform duration-300 hover:scale-[1.05] active:scale-95"
                        >
                            Get a quote
                        </a>
                        <a
                            href="#work"
                            data-testid="hero-cta-work-button"
                            onClick={(e) => {
                                e.preventDefault();
                                scrollToHash("#work");
                            }}
                            className="rounded-full border border-ink/30 px-7 py-4 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-ink transition-colors duration-300 hover:border-ink hover:bg-ink/5"
                        >
                            See our work
                        </a>
                    </motion.div>
                </motion.div>

                <motion.div
                    style={{ y: badgeY }}
                    className="flex justify-center lg:justify-end lg:pr-6"
                >
                    <motion.div
                        data-testid="hero-logo-badge"
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1, y: [0, -16, 0] }}
                        transition={{
                            opacity: { duration: 1, delay: 0.6 },
                            scale: { duration: 1, delay: 0.6 },
                            y: { duration: 6, repeat: Infinity, ease: "easeInOut" },
                        }}
                        className="relative h-56 w-56 sm:h-72 sm:w-72 lg:h-[420px] lg:w-[420px]"
                    >
                        {/* iridescent rainbow holofoil halo — circular mask, fades out round */}
                        <div
                            className="halo-iridescent absolute -inset-4 rounded-full"
                            aria-hidden="true"
                        />
                        {/* thin bright ring at the disc edge */}
                        <div
                            className="halo-ring absolute inset-0 rounded-full"
                            aria-hidden="true"
                        />
                        {/* frosted glass disc — gradient glass, no backdrop-filter
                            (Android WebView renders backdrop blur as a square) */}
                        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(244,243,252,0.9)_55%,rgba(250,242,250,0.93))] shadow-[0_30px_70px_rgba(140,140,190,0.4)] ring-1 ring-white/80">
                            <div
                                className="pointer-events-none absolute inset-[5.5%] rounded-full border border-white/50"
                                aria-hidden="true"
                            />
                            <div
                                className="pointer-events-none absolute inset-0 shadow-[inset_0_14px_34px_rgba(255,255,255,0.9),inset_0_-22px_44px_rgba(125,125,170,0.25)]"
                                aria-hidden="true"
                            />
                            <div
                                className="pointer-events-none absolute -top-[24%] -left-[18%] h-[70%] w-[85%] rounded-full bg-white/80 blur-2xl"
                                aria-hidden="true"
                            />
                            <img
                                src="/logo-circle.png?v=3"
                                alt="TMN Decorating & Maintenance logo"
                                className="relative h-[92%] w-[92%] object-contain"
                            />
                            {/* light sweep across the glass */}
                            <div
                                className="glass-sheen pointer-events-none absolute inset-y-[-30%] w-[45%] bg-[linear-gradient(100deg,transparent_10%,rgba(255,255,255,0.65)_50%,transparent_90%)]"
                                aria-hidden="true"
                            />
                        </div>
                    </motion.div>
                </motion.div>
            </div>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.6, duration: 1 }}
                className="absolute bottom-8 right-6 hidden items-center gap-3 rotate-90 font-mono text-[10px] uppercase tracking-[0.4em] text-ink/40 lg:flex"
            >
                Scroll
                <span className="block h-px w-14 bg-ink/40" />
            </motion.div>
        </section>
    );
}
