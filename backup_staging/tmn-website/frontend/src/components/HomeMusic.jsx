import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Music, VolumeX } from "lucide-react";

/* ONE audio element for the whole app, created once at module level — the
   music keeps playing continuously across every page and can never double
   up (every mount shares the same Audio object). */
let sharedAudio = null;
function getAudio() {
    if (!sharedAudio) {
        sharedAudio = new Audio("/audio/homepage-music.mp3");
        sharedAudio.loop = true;
        sharedAudio.preload = "auto";
        sharedAudio.volume = 0.3;
        // a full page load kills audio no matter what (browser law) — so we
        // remember the position and continue from there instead of restarting
        try {
            const saved = parseFloat(localStorage.getItem("tmn-music-pos") || "0");
            if (saved > 1) sharedAudio.currentTime = saved;
        } catch {}
        let lastSaved = 0;
        sharedAudio.addEventListener("timeupdate", () => {
            if (sharedAudio.currentTime - lastSaved < 1) return;
            lastSaved = sharedAudio.currentTime;
            try { localStorage.setItem("tmn-music-pos", String(sharedAudio.currentTime)); } catch {}
        });
    }
    return sharedAudio;
}

let started = false; // survives hot reloads / remounts: never auto-restart after pause

function userMutedStored() {
    try {
        return localStorage.getItem("tmn-music-muted") === "1";
    } catch {
        return false;
    }
}

export default function HomeMusic() {
    const mutedByUser = useRef(userMutedStored());
    const [playing, setPlaying] = useState(false);

    useEffect(() => {
        const v = getAudio();

        const sync = () => setPlaying(!v.paused);
        const start = () => {
            if (mutedByUser.current || started) {
                sync();
                return;
            }
            started = true;
            v.play()
                .then(() => setPlaying(true))
                .catch(() => {
                    started = false;
                });
        };

        if (!started) {
            // browsers may block autoplay until the first gesture anywhere
            window.addEventListener("pointerdown", start, { passive: true });
            window.addEventListener("touchstart", start, { passive: true });
            window.addEventListener("wheel", start, { passive: true });
            window.addEventListener("scroll", start, { passive: true });
            window.addEventListener("keydown", start, { passive: true });
        }
        v.addEventListener("play", sync);
        v.addEventListener("pause", sync);
        sync();

        // NOTE: no pause on unmount — the singleton keeps playing across pages
        return () => {
            window.removeEventListener("pointerdown", start);
            window.removeEventListener("touchstart", start);
            window.removeEventListener("wheel", start);
            window.removeEventListener("scroll", start);
            window.removeEventListener("keydown", start);
            v.removeEventListener("play", sync);
            v.removeEventListener("pause", sync);
        };
    }, []);

    const toggle = () => {
        const v = getAudio();
        if (v.paused) {
            mutedByUser.current = false;
            started = true;
            try { localStorage.removeItem("tmn-music-muted"); } catch {}
            v.play()
                .then(() => setPlaying(true))
                .catch(() => {});
        } else {
            mutedByUser.current = true;
            try { localStorage.setItem("tmn-music-muted", "1"); } catch {}
            v.pause();
            setPlaying(false);
        }
    };

    return (
        <motion.button
            data-testid="music-toggle-button"
            onClick={toggle}
            aria-label={playing ? "Pause background music" : "Play background music"}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.9, type: "spring", stiffness: 260, damping: 18 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            className="fixed bottom-[176px] right-5 z-[80] flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-ink/25 bg-paper text-ink shadow-[0_12px_30px_rgba(10,10,10,0.2)] sm:right-7"
        >
            {playing ? (
                <>
                    <Music className="h-5 w-5" />
                    <span className="absolute inset-0 animate-ping rounded-full border-2 border-ink/20" />
                </>
            ) : (
                <VolumeX className="h-5 w-5 text-ink/60" />
            )}
        </motion.button>
    );
}
