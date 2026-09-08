import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { waLink } from "@/constants/site";
import { EASE } from "@/components/Reveal";

const LINKS = [
    { label: "Services", hash: "#services", testid: "nav-link-services" },
    { label: "Work", hash: "#work", testid: "nav-link-work" },
    { label: "About", hash: "#about", testid: "nav-link-about" },
    { label: "Contact", hash: "#contact", testid: "nav-link-contact" },
];

export const scrollToHash = (hash) => {
    const el = document.querySelector(hash);
    if (!el) return;
    if (window.__lenis) window.__lenis.scrollTo(hash, { offset: -72 });
    else el.scrollIntoView({ behavior: "smooth" });
};

export default function Nav() {
    const { user } = useAuth();
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 40);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    const go = (e, hash) => {
        e.preventDefault();
        scrollToHash(hash);
    };

    const accountHref = user
        ? user.role === "admin"
            ? "/admin"
            : "/account"
        : "/login";

    return (
        <motion.header
            initial={{ y: -90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.15 }}
            className={`fixed inset-x-0 top-0 z-50 bg-paper/85 backdrop-blur-xl transition-shadow duration-500 ${
                scrolled ? "shadow-[0_1px_0_rgba(10,10,10,0.12),0_12px_40px_rgba(10,10,10,0.06)]" : ""
            }`}
        >
            <nav className="mx-auto flex h-24 max-w-[1600px] items-center justify-between px-5 sm:px-8 lg:px-12">
                <a
                    href="/"
                    data-testid="nav-brand-logo"
                    onClick={(e) => go(e, "#top")}
                    className="flex items-center gap-3"
                >
                    <img
                        src="/logo-dark.png"
                        alt="TMN Decorating & Maintenance logo"
                        className="h-16 w-16 object-contain sm:h-[4.5rem] sm:w-[4.5rem]"
                    />
                    <span className="hidden font-display text-sm font-bold uppercase tracking-[0.18em] text-ink sm:block">
                        TMN <span className="text-ink/65">Decorating &amp; Maintenance</span>
                    </span>
                </a>

                <div className="hidden items-center gap-8 lg:flex">
                    {LINKS.map((l) => (
                        <a
                            key={l.hash}
                            href={l.hash}
                            data-testid={l.testid}
                            onClick={(e) => go(e, l.hash)}
                            className="link-sweep font-mono text-[11px] font-medium uppercase tracking-[0.25em] text-ink/85 transition-colors hover:text-ink"
                        >
                            {l.label}
                        </a>
                    ))}
                </div>

                <div className="flex items-center gap-5">
                    <a
                        href={accountHref}
                        data-testid={user ? "nav-account-link" : "nav-login-link"}
                        className="link-sweep font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-ink/70 transition-colors hover:text-ink"
                    >
                        {user
                            ? user.role === "admin"
                                ? "Admin"
                                : "My account"
                            : "Customer login"}
                    </a>
                    <a
                        href={waLink("Hi TMN Decorating & Maintenance — I'd like a quote.")}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="nav-whatsapp-button"
                        className="group flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-paper transition-transform duration-300 hover:scale-[1.04] active:scale-95"
                    >
                        Get a quote
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-paper transition-transform duration-300 group-hover:scale-150" />
                    </a>
                </div>
            </nav>
        </motion.header>
    );
}
