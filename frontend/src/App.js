import { Component, useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import "@/App.css";
import Cursor from "@/components/Cursor";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Marquee from "@/components/Marquee";
import Services from "@/components/Services";
import Work from "@/components/Work";
import About from "@/components/About";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="flex min-h-screen items-center justify-center bg-paper p-8 text-center">
                    <p className="font-display text-2xl font-bold uppercase tracking-tight text-ink">
                        Something went wrong — please refresh the page.
                    </p>
                </div>
            );
        }
        return this.props.children;
    }
}

function HoloBackground() {
    const videoRef = useRef(null);
    const [dead, setDead] = useState(false);

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        const tryPlay = () => {
            if (v.paused) v.play().catch(() => {});
        };
        const onCanPlay = () => {
            if (v.readyState >= 2) setDead(false);
            tryPlay();
        };
        const onError = () => setDead(true);
        const kick = () => tryPlay();
        v.addEventListener("canplay", onCanPlay);
        v.addEventListener("error", onError, true);
        window.addEventListener("pointerdown", kick, { passive: true });
        window.addEventListener("wheel", kick, { passive: true });
        window.addEventListener("touchstart", kick, { passive: true });
        const probe = setInterval(() => {
            if (v.readyState === 0 && v.networkState === 3) setDead(true);
            else tryPlay();
        }, 3000);
        tryPlay();
        return () => {
            v.removeEventListener("canplay", onCanPlay);
            v.removeEventListener("error", onError, true);
            window.removeEventListener("pointerdown", kick);
            window.removeEventListener("wheel", kick);
            window.removeEventListener("touchstart", kick);
            clearInterval(probe);
        };
    }, []);

    return (
        <div
            className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
            aria-hidden="true"
        >
            {dead && <div className="holo-fallback absolute inset-0" />}
            <video
                ref={videoRef}
                data-testid="holo-background-video"
                className="h-full w-full object-cover saturate-[1.25] contrast-[1.05]"
                muted
                loop
                playsInline
                preload="auto"
                poster="/videos/bg-poster.jpg"
            >
                <source src="/videos/bg-hq.webm" type="video/webm" />
                <source src="/videos/bg-hq.mp4" type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-paper/55" />
        </div>
    );
}

function App() {
    useEffect(() => {
        const lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
        window.__lenis = lenis;
        let raf;
        const loop = (t) => {
            lenis.raf(t);
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => {
            cancelAnimationFrame(raf);
            lenis.destroy();
            window.__lenis = undefined;
        };
    }, []);

    return (
        <ErrorBoundary>
            <div
                data-testid="site-root"
                className="grain relative min-h-screen bg-paper font-body text-ink antialiased"
            >
                <HoloBackground />
                <div className="relative z-10">
                    <Cursor />
                    <Nav />
                    <main>
                        <Hero />
                        <Marquee />
                        <Services />
                        <Work />
                        <About />
                        <Contact />
                    </main>
                    <Footer />
                    <FloatingWhatsApp />
                </div>
            </div>
        </ErrorBoundary>
    );
}

export default App;
