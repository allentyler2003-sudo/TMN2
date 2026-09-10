import { useEffect, useRef, useState } from "react";

/* Animated holographic background — full-bleed looping video with a soft
   paper tint (and a CSS gradient fallback if autoplay is blocked).
   Used on the home page and the colour visualiser. */
export default function HoloBackground() {
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
