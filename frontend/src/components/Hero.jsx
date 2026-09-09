import { useEffect, useRef } from "react";
import { motion, useScroll, useTransform, useMotionValue, useMotionTemplate } from "framer-motion";
import { waLink } from "@/constants/site";
import { MaskedLines } from "@/components/Reveal";
import { scrollToHash } from "@/components/Nav";

export default function Hero() {
    const sectionRef = useRef(null);
    const badgeRef = useRef(null);
    const glowX = useMotionValue(50);
    const glowY = useMotionValue(50);
    const glowPower = useMotionValue(0);

    useEffect(() => {
        if (!window.matchMedia("(pointer: fine)").matches) return;
        const onMove = (e) => {
            const el = badgeRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            if (r.width === 0) return;
            const cx = r.x + r.width / 2;
            const cy = r.y + r.height / 2;
            const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
            glowPower.set(Math.max(0, 1 - dist / 520));
            glowX.set(((e.clientX - r.x) / r.width) * 100);
            glowY.set(((e.clientY - r.y) / r.height) * 100);
        };
        window.addEventListener("mousemove", onMove, { passive: true });
        return () => window.removeEventListener("mousemove", onMove);
    }, [glowPower, glowX, glowY]);

    const glowXpct = useTransform(glowX, (v) => `${v.toFixed(1)}%`);
    const glowYpct = useTransform(glowY, (v) => `${v.toFixed(1)}%`);
    const glowBg = useMotionTemplate`radial-gradient(circle at ${glowXpct} ${glowYpct}, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.4) 42%, rgba(255,255,255,0.08) 62%, transparent 74%)`;
    const glowOpacity = useTransform(glowPower, (v) => v * 0.95);

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
                        className="relative h-48 w-48 sm:h-64 sm:w-64 lg:h-[380px] lg:w-[380px]"
                    >
                        {/* luxury gloss glass disc + circular logo, baked into one image */}
                        <div
                            data-testid="hero-logo-badge"
                            className="relative h-full w-full"
                        >
                            <img
                                src="/logo-disc.png"
                                alt="TMN Decorating & Maintenance logo"
                                className="h-full w-full object-contain"
                            />
                            {/* cursor-following luxury glow (desktop) */}
                            <motion.div
                                style={{ background: glowBg, opacity: glowOpacity }}
                                className="pointer-events-none absolute -inset-1 rounded-full"
                                aria-hidden="true"
                            />
                            {/* periodic car-badge glint — circularly masked, opacity-only */}
                            <div className="badge-glint absolute inset-0" aria-hidden="true" />
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
