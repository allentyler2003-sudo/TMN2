import { SITE } from "@/constants/site";

export default function Footer() {
    return (
        <footer data-testid="footer" className="relative border-t border-ink/10 pb-24 pt-14 sm:pb-10">
            <div className="mx-auto max-w-[1600px] px-5 sm:px-8 lg:px-12">
                <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
                    <a href="#top" data-testid="footer-brand-logo" className="flex items-center gap-4">
                        <img
                            src="/logo-dark.png"
                            alt="TMN Decorating & Maintenance logo"
                            className="h-16 w-16 object-contain"
                        />
                        <span className="font-display text-sm font-bold uppercase tracking-[0.18em] text-[#C6A55C]">
                            TMN
                            <span className="mt-0.5 block text-[10px] font-semibold tracking-[0.3em] text-ink/60">
                                DECORATING &amp; MAINTENANCE
                            </span>
                        </span>
                    </a>

                    <div className="flex flex-col gap-2 font-mono text-xs font-medium uppercase tracking-[0.2em] text-ink/80 sm:items-end">
                        <span className="text-ink/60">Based in Plymouth, UK</span>
                        <a href={SITE.phoneHref} data-testid="footer-phone-link" className="transition-colors hover:text-ink">
                            {SITE.phoneDisplay}
                        </a>
                        <a href={SITE.emailHref} data-testid="footer-email-link" className="transition-colors hover:text-ink">
                            {SITE.email}
                        </a>
                        <a
                            href={`https://wa.me/${SITE.whatsappNumber}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="footer-whatsapp-link"
                            className="transition-colors hover:text-ink"
                        >
                            WhatsApp
                        </a>
                    </div>
                </div>

                <div className="mt-12 border-t border-ink/10 pt-6">
                    <div className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-ink/55 sm:justify-end">
                        <a href="/privacy-policy.html" data-testid="footer-privacy-link" className="transition-colors hover:text-ink">
                            Privacy Policy
                        </a>
                        <a href="/cookie-policy.html" data-testid="footer-cookie-link" className="transition-colors hover:text-ink">
                            Cookie Policy
                        </a>
                        <a href="/terms-and-conditions.html" data-testid="footer-terms-link" className="transition-colors hover:text-ink">
                            Terms &amp; Conditions
                        </a>
                    </div>
                    <p className="mt-4 font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-ink/55">
                        © {new Date().getFullYear()} {SITE.name} — Domestic &amp; commercial painting,
                        decorating &amp; property maintenance
                    </p>
                </div>
            </div>
        </footer>
    );
}
