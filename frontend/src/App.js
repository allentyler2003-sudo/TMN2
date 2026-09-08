import { Component, useEffect, useRef } from "react";
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

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        const tryPlay = () => v.play().catch(() => {});
        tryPlay();
        v.addEventListener("canplay", tryPlay);
        return () => v.removeEventListener("canplay", tryPlay);
    }, []);

    return (
        <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
            <video
                ref={videoRef}
                data-testid="holo-background-video"
                className="h-full w-full object-cover"
                muted
                loop
                playsInline
                preload="auto"
            >
                <source src="/videos/bg-hq.webm" type="video/webm" />
                <source src="/videos/bg-hq.mp4" type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-paper/70" />
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
