import { FadeUp, MaskedLines } from "@/components/Reveal";

const CHAPTERS = [
    {
        id: "01",
        title: "Preparation",
        body: "We prep like it shows — because it does. Filling, sanding and sealing long before a tin is opened.",
    },
    {
        id: "02",
        title: "Precision",
        body: "Clean lines, even coverage, no drips and no missed corners. The details are the job, not the extra.",
    },
    {
        id: "03",
        title: "Aftercare",
        body: "We leave the place spotless and the finish protected — and we're one call away if you ever need us.",
    },
];

export default function About() {
    return (
        <section
            id="about"
            data-testid="about-section"
            className="relative overflow-hidden py-24 text-ink sm:py-36"
        >
            <div className="absolute inset-0 bg-white/40" />

            <div className="relative mx-auto max-w-[1600px] px-5 sm:px-8 lg:px-12">
                <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <FadeUp>
                            <p className="mb-6 font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-ink/70 sm:text-xs">
                                The TMN standard — Plymouth, UK
                            </p>
                        </FadeUp>
                        <h2 className="max-w-3xl font-display text-4xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
                            <MaskedLines
                                inView
                                lines={[
                                    <span key="a">A finish is only</span>,
                                    <span key="b">
                                        as good as <span className="text-outline-ink">the prep</span>
                                    </span>,
                                    <span key="c">beneath it.</span>,
                                ]}
                                testIdPrefix="about-headline"
                            />
                        </h2>
                    </div>

                    <FadeUp delay={0.25} className="shrink-0">
                        <div
                            data-cursor
                            className="flex h-40 w-40 items-center justify-center rounded-full bg-white ring-1 ring-ink/10 shadow-[0_20px_60px_rgba(10,10,10,0.14)] sm:h-52 sm:w-52"
                        >
                            <img
                                src="/logo-dark.png"
                                alt="TMN Decorating & Maintenance logo"
                                className="h-32 w-32 object-contain sm:h-40 sm:w-40"
                            />
                        </div>
                    </FadeUp>
                </div>

                <div className="mt-16 grid gap-10 sm:mt-28 md:grid-cols-3 md:gap-14">
                    {CHAPTERS.map((c, i) => (
                        <FadeUp key={c.id} delay={i * 0.12}>
                            <div
                                data-testid={`about-chapter-${c.id}`}
                                className="border-t-2 border-ink/80 pt-6"
                            >
                                <span className="font-mono text-xs font-medium tracking-[0.3em] text-ink/60">
                                    {c.id}
                                </span>
                                <h3 className="mt-4 font-display text-2xl font-bold uppercase tracking-tight sm:text-3xl">
                                    {c.title}
                                </h3>
                                <p className="mt-4 max-w-xs text-base font-medium leading-relaxed text-ink/85">
                                    {c.body}
                                </p>
                            </div>
                        </FadeUp>
                    ))}
                </div>
            </div>
        </section>
    );
}
