import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import ColourStudio from "@/components/ColourStudio";
import HoloBackground from "@/components/HoloBackground";
import QuoteCta from "@/components/QuoteCta";

export default function Visualiser() {
    return (
        <div className="relative z-10 min-h-screen">
            <HoloBackground />
            <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/85 backdrop-blur-md">
                <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-8 lg:px-12">
                    <Link
                        to="/"
                        data-testid="visualiser-back-home"
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-ink/25 px-3.5 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper sm:px-5 sm:py-2.5 sm:text-[10px] sm:tracking-[0.2em]"
                    >
                        <ArrowLeft className="h-3.5 w-3.5 shrink-0" /> Back to site
                    </Link>
                    <img
                        src="/logo-dark.png"
                        alt="TMN Decorating & Maintenance"
                        data-testid="visualiser-logo"
                        className="h-9 w-auto sm:h-12"
                    />
                    <QuoteCta
                        testid="visualiser-quote"
                        className="inline-flex items-center whitespace-nowrap rounded-full bg-ink px-3.5 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-paper transition-transform hover:scale-105 active:scale-95 sm:px-6 sm:py-2.5 sm:text-[10px] sm:tracking-[0.2em]"
                    >
                        Get a quote •
                    </QuoteCta>
                </div>
            </header>
            <main>
                <ColourStudio />
            </main>
            <footer className="border-t border-ink/10 py-8 text-center">
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink/50">
                    TMN Decorating &amp; Maintenance — Plymouth · Colour results are a guide, not an exact paint match
                </p>
            </footer>
        </div>
    );
}
