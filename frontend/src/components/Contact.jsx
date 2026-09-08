import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, MessageCircle, Phone, Mail } from "lucide-react";
import { SITE, waLink } from "@/constants/site";
import { FadeUp, MaskedLines, EASE } from "@/components/Reveal";

const CHANNELS = [
    {
        id: "whatsapp",
        label: "WhatsApp us",
        value: SITE.phoneDisplay,
        href: waLink("Hi TMN Decorating & Maintenance — I'd like a quote."),
        icon: MessageCircle,
        testid: "contact-whatsapp-direct-link",
    },
    {
        id: "phone",
        label: "Call us",
        value: SITE.phoneDisplay,
        href: SITE.phoneHref,
        icon: Phone,
        testid: "contact-phone-direct-link",
    },
    {
        id: "email",
        label: "Email us",
        value: SITE.email,
        href: SITE.emailHref,
        icon: Mail,
        testid: "contact-email-direct-link",
    },
];

const QUICK_SERVICES = ["Interior", "Exterior", "Commercial", "Maintenance"];

export default function Contact() {
    const [service, setService] = useState(null);
    const [note, setNote] = useState("");

    const message = `Hi TMN Decorating & Maintenance — I'd like a quote for ${
        (service || "a project").toLowerCase()
    }.${note ? ` ${note}` : ""}`;

    const send = () => {
        window.open(waLink(message), "_blank", "noopener,noreferrer");
    };

    return (
        <section id="contact" data-testid="contact-section" className="relative py-24 sm:py-36">
            <div className="mx-auto max-w-[1600px] px-5 sm:px-8 lg:px-12">
                <FadeUp>
                    <p className="mb-6 font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-ink/65 sm:text-xs">
                        Get in touch
                    </p>
                </FadeUp>

                <h2 className="mb-16 font-display text-4xl font-extrabold uppercase leading-[0.95] tracking-tight text-ink sm:mb-24 sm:text-6xl lg:text-8xl">
                    <MaskedLines
                        inView
                        lines={[
                            <span key="a">Have a project</span>,
                            <span key="b" className="text-outline-ink">
                                in mind?
                            </span>,
                        ]}
                        testIdPrefix="contact-headline"
                    />
                </h2>

                <div className="grid gap-16 lg:grid-cols-[1.2fr_1fr] lg:gap-24">
                    <div>
                        {CHANNELS.map((c, i) => (
                            <FadeUp key={c.id} delay={i * 0.08}>
                                <a
                                    href={c.href}
                                    target={c.id === "phone" ? undefined : "_blank"}
                                    rel="noopener noreferrer"
                                    data-testid={c.testid}
                                    className="group flex items-center justify-between gap-6 border-t border-ink/15 py-7 transition-colors duration-300 last:border-b hover:bg-ink/[0.04] sm:py-9"
                                >
                                    <span className="flex items-center gap-5 sm:gap-8">
                                        <c.icon
                                            className="h-6 w-6 text-ink/75 transition-colors group-hover:text-ink"
                                            strokeWidth={1.5}
                                        />
                                        <span className="flex flex-col">
                                            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-ink/65">
                                                {c.label}
                                            </span>
                                            <span className="mt-1 font-display text-xl font-bold tracking-tight text-ink sm:text-3xl">
                                                {c.value}
                                            </span>
                                        </span>
                                    </span>
                                    <ArrowUpRight className="h-7 w-7 shrink-0 text-ink/50 transition-all duration-300 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-ink" />
                                </a>
                            </FadeUp>
                        ))}
                    </div>

                    <FadeUp delay={0.15}>
                        <div
                            data-testid="quick-quote-card"
                            className="rounded-3xl border border-ink/10 bg-white/80 p-7 shadow-[0_24px_70px_rgba(10,10,10,0.10)] backdrop-blur-xl sm:p-10"
                        >
                            <h3 className="font-display text-2xl font-bold uppercase tracking-tight text-ink sm:text-3xl">
                                Quick quote
                            </h3>
                            <p className="mt-3 text-sm font-medium leading-relaxed text-ink/75">
                                Pick a service, add a line about the job, and we'll open WhatsApp
                                with your message ready to send.
                            </p>

                            <div className="mt-7 flex flex-wrap gap-2.5">
                                {QUICK_SERVICES.map((s) => {
                                    const active = service === s;
                                    return (
                                        <button
                                            key={s}
                                            data-testid={`quote-service-pill-${s.toLowerCase()}`}
                                            onClick={() => setService(active ? null : s)}
                                            className={`rounded-full border px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] transition-all duration-300 ${
                                                active
                                                    ? "border-ink bg-ink text-paper"
                                                    : "border-ink/30 text-ink/85 hover:border-ink hover:text-ink"
                                            }`}
                                        >
                                            {s}
                                        </button>
                                    );
                                })}
                            </div>

                            <textarea
                                data-testid="quote-message-input"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Tell us about the job — rooms, walls, timings, anything."
                                rows={3}
                                className="mt-5 w-full resize-none rounded-2xl border border-ink/20 bg-transparent p-4 text-sm font-medium text-ink placeholder:text-ink/50 focus:border-ink/60 focus:outline-none"
                            />

                            <p
                                data-testid="quote-message-preview"
                                className="mt-4 min-h-[2.5rem] rounded-xl bg-ink/5 p-3 font-mono text-[11px] font-medium leading-relaxed text-ink/80"
                            >
                                {message}
                            </p>

                            <motion.button
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.96 }}
                                transition={{ duration: 0.25, ease: EASE }}
                                onClick={send}
                                data-testid="quote-whatsapp-submit"
                                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-4 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-paper"
                            >
                                <MessageCircle className="h-4 w-4" />
                                Send on WhatsApp
                            </motion.button>
                        </div>
                    </FadeUp>
                </div>
            </div>
        </section>
    );
}
