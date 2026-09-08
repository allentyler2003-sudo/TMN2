import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { PROJECTS, waLink } from "@/constants/site";
import { FadeUp } from "@/components/Reveal";

function WorkCard({ project, index }) {
    const ref = useRef(null);
    const { scrollYProgress } = useScroll({
        target: ref,
        offset: ["start end", "end start"],
    });
    const y = useTransform(scrollYProgress, [0, 1], ["-7%", "7%"]);

    return (
        <FadeUp delay={(index % 2) * 0.12} className={index % 2 === 1 ? "sm:mt-28" : ""}>
            <a
                href={waLink(`Hi TMN — I saw your work and I'd like something like "${project.title}".`)}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`work-card-${index + 1}`}
                className="group block"
            >
                <div ref={ref} className="relative aspect-[4/5] overflow-hidden bg-ink/5 shadow-[0_24px_70px_rgba(10,10,10,0.12)]">
                    <motion.img
                        style={{ y }}
                        src={project.img}
                        alt={project.title}
                        loading="lazy"
                        className="h-full w-full scale-[1.16] object-cover transition-transform duration-700 ease-out group-hover:scale-[1.22]"
                    />
                    <span className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-ink text-paper opacity-0 transition-all duration-500 group-hover:opacity-100">
                        <ArrowUpRight className="h-5 w-5" />
                    </span>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-5">
                    <span className="font-display text-xl font-bold uppercase tracking-tight text-ink sm:text-2xl">
                        {project.title}
                    </span>
                    <span className="whitespace-nowrap font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-ink/65">
                        {project.label}
                    </span>
                </div>
            </a>
        </FadeUp>
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
                                Recent work — selected
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
                            A look at the standard we work to. See something you like? Tap it and
                            tell us on WhatsApp.
                        </p>
                    </FadeUp>
                </div>

                <div className="grid grid-cols-1 gap-x-10 gap-y-14 sm:grid-cols-2 sm:gap-y-8">
                    {PROJECTS.map((p, i) => (
                        <WorkCard key={i} project={p} index={i} />
                    ))}
                </div>
            </div>
        </section>
    );
}
