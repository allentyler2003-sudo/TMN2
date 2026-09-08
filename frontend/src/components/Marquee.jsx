const ITEMS = [
    "Interior Painting",
    "Exterior Decorating",
    "Commercial Projects",
    "Property Maintenance",
];

function Sequence({ hidden }) {
    return (
        <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
            {ITEMS.map((item, i) => (
                <span key={i} className="flex items-center">
                    <span
                        className={`whitespace-nowrap px-8 font-display text-4xl font-bold uppercase tracking-tight sm:px-12 sm:text-6xl ${
                            i % 2 === 0 ? "text-ink" : "text-outline-faint"
                        }`}
                    >
                        {item}
                    </span>
                    <span className="h-2.5 w-2.5 rounded-full bg-ink/70 sm:h-3 sm:w-3" />
                </span>
            ))}
        </div>
    );
}

export default function Marquee() {
    return (
        <section
            data-testid="marquee-section"
            className="marquee-mask overflow-hidden border-y border-ink/10 py-8 sm:py-10"
        >
            <div className="animate-marquee flex w-max">
                <Sequence />
                <Sequence hidden />
            </div>
        </section>
    );
}
