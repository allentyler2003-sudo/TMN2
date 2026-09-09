import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { PROJECTS, waLink } from "@/constants/site";
import { FadeUp, EASE } from "@/components/Reveal";

const ASPECTS = ["aspect-[4/5]", "aspect-[3/4]", "aspect-[3/4]", "aspect-[4/5]"];

function WorkCard({ project, index }) {
    const ref = useRef(null);
    const { scrollYProgress } = useScroll({
        target: ref,
        offset: ["start end", "end start"],
    });
    const y = useTransform(scrollYProgress, [0, 1], ["-8%", "8%"]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 60 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 1, ease: EASE, delay: (index % 2) * 0.12 }}
            className={index % 2 === 1 ? "sm:mt-28" : ""}
        >
            <a
                href={waLink(
                    `Hi TMN — I saw your work and I'd like something like "${project.title}".`
                )}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`work-card-${index + 1}`}
                className="group block"
            >
                <div
                    ref={ref}
                    className={`relative overflow-hidden bg-ink/5 shadow-[0_30px_80px_rgba(10,10,10,0.14)] ${ASPECTS[index]}`}
                >
                    <motion.div style={{ y }} className="h-full w-full">
                        <motion.img
                            src={project.img}
                            alt={project.title}
                            loading="lazy"
                            initial={{ scale: 1.3 }}
                            whileInView={{ scale: 1.18 }}
                            viewport={{ once: true, amount: 0.15 }}
                            transition={{ duration: 1.4, ease: EASE }}
                            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.24]"
                        />
                    </motion.div>

                    <span className="absolute left-4 top-4 flex h-14 w-14 items-center justify-center rounded-full bg-paper/95 font-display text-sm font-extrabold tracking-wide text-ink shadow-[0_8px_24px_rgba(10,10,10,0.18)] transition-transform duration-500 group-hover:scale-110">
                        {String(index + 1).padStart(2, "0")}
                    </span>

                    <div className="absolute inset-x-0 bottom-0 flex translate-y-full items-center justify-between gap-3 bg-ink/90 px-5 py-3.5 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-paper transition-transform duration-500 ease-out group-hover:translate-y-0">
                        <span>Like this finish?</span>
                        <span>Tap — quote on WhatsApp</span>
                    </div>
                </div>

                <div className="mt-5 flex items-baseline justify-between gap-4 border-b-2 border-ink/15 pb-4 transition-colors duration-500 group-hover:border-ink">
                    <span className="font-display text-xl font-bold uppercase tracking-tight text-ink sm:text-2xl">
                        {project.title}
                    </span>
                    <span className="whitespace-nowrap font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-ink/65">
                        {project.label}
                    </span>
                </div>
            </a>
        </motion.div>
    );
}

export default function Work() {
    return (
        <section id="work" data-testid="work-section" className="relative py-24 sm:py-36">
            <div className="mx-auto max-w-[1600px] px-5 sm:px-8 lg:px-12">
                <div className="mb-16 flex flex-col gap-6 sm:mb-20 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <FadeUp>
                            <p className="mb-6 font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-ink/65 sm:text-xs">
                                Recent work — 04 projects, more on request
                            </p>
                        </FadeUp>
                        <FadeUp delay={0.1}>
                            <h2 className="font-display text-4xl font-extrabold uppercase leading-[0.95] tracking-tight text-ink sm:text-6xl lg:text-7xl">
                                Fresh coats,
                                <br />
                                <span className="text-outline-ink">clean lines.</span>
                            </h2>
                        </FadeUp>
                    </div>
                    <FadeUp delay={0.2} className="max-w-sm">
                        <p className="text-base font-medium leading-relaxed text-ink/80">
                            Every photo is a finish we're proud of. Tap one and tell us what
                            you'd like on WhatsApp.
                        </p>
                    </FadeUp>
                </div>

                <div className="grid grid-cols-1 gap-x-10 gap-y-16 sm:grid-cols-2 sm:gap-y-8">
                    {PROJECTS.map((p, i) => (
                        <WorkCard key={i} project={p} index={i} />
                    ))}
                </div>
            </div>
        </section>
    );
}
