 import { Component, useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import axios from "axios";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import "@/App.css";
import HoloBackground from "@/components/HoloBackground";
import Cursor from "@/components/Cursor";
import Favourites from "@/pages/Favourites";
import ReviewsPage from "@/pages/ReviewsPage";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Marquee from "@/components/Marquee";
import Services from "@/components/Services";
import Work from "@/components/Work";
import About from "@/components/About";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import AiChat from "@/components/AiChat";
import HomeMusic from "@/components/HomeMusic";
import ColourTeaser from "@/components/ColourTeaser";
import Reviews from "@/components/Reviews";
import Login from "@/pages/Login";
import Account from "@/pages/Account";
import Admin from "@/pages/Admin";
import Visualiser from "@/pages/Visualiser";
axios.defaults.withCredentials = true;
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

let lastTracked = { path: null, at: 0 };
function PageTracker() {
    const { pathname } = useLocation();
    useEffect(() => {
        // dev StrictMode mounts effects twice — skip the instant re-fire so
        // the preview counts read true (production builds don't double-fire)
        const now = Date.now();
        if (lastTracked.path === pathname && now - lastTracked.at < 3000) return;
        lastTracked = { path: pathname, at: now };
        let vid = localStorage.getItem("tmn-vid");
        if (!vid) {
            vid = crypto.randomUUID
                ? crypto.randomUUID()
                : "v-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
            localStorage.setItem("tmn-vid", vid);
        }
        axios
            .post(
                `${process.env.REACT_APP_BACKEND_URL}/api/track/view`,
                { visitor_id: vid, path: pathname },
                { timeout: 8000 }
            )
            .catch(() => {});
    }, [pathname]);
    return null;
}

function ScrollToTop() {
    const { pathname } = useLocation();
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);
    return null;
}

function Site() {
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
        <>
            <HoloBackground />
            <div className="relative z-10">
                <Cursor />
                <Nav />
                <main>
                    <Hero />
                    <Marquee />
                    <ColourTeaser />
                    <Services />
                    <Reviews />
                    <Work />
                    <About />
                    <Contact />
                </main>
                <Footer />
                <FloatingWhatsApp />
                <AiChat />
            </div>
        </>
    );
}

function Protected({ role, children }) {
    const { user } = useAuth();
    if (user === null) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-paper">
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ink/60">
                    Loading…
                </p>
            </div>
        );
    }
    if (!user) return <Navigate to="/login" replace />;
    if (role === "admin" && user.role !== "admin") return <Navigate to="/account" replace />;
    if (role === "customer" && user.role === "admin") return <Navigate to="/admin" replace />;
    return children;
}

function App() {
    return (
        <ErrorBoundary>
            <AuthProvider>
                <BrowserRouter>
                    <ScrollToTop />
                    <PageTracker />
                    <HomeMusic />
                    <Routes>
                        <Route path="/" element={<Site />} />
                        <Route path="/visualiser" element={<Visualiser />} />
                        <Route path="/favourites" element={<Favourites />} />
                        <Route path="/reviews" element={<ReviewsPage />} />
                        <Route path="/login" element={<Login />} />
                        <Route
                            path="/account"
                            element={
                                <Protected role="customer">
                                    <Account />
                                </Protected>
                            }
                        />
                        <Route
                            path="/admin"
                            element={
                                <Protected role="admin">
                                    <Admin />
                                </Protected>
                            }
                        />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </BrowserRouter>
            </AuthProvider>
        </ErrorBoundary>
    );
}

export default App;
