import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Music, VolumeX } from "lucide-react";

export default function HomeMusic() {
    const audioRef = useRef(null);
    const mutedByUser = useRef(false);
    const [playing, setPlaying] = useState(false);

    useEffect(() => {
        const v = audioRef.current;
        if (!v) return;
        v.volume = 0.3;

        const start = () => {
            if (mutedByUser.current) return;
            v.play()
                .then(() => setPlaying(true))
                .catch(() => {});
        };

        // try to start straight away; browsers may block until the first gesture
        v.play()
            .then(() => setPlaying(true))
            .catch(() => {
                // first tap, scroll or keypress anywhere unmutes the music
                window.addEventListener("pointerdown", start, { passive: true });
                window.addEventListener("touchstart", start, { passive: true });
                window.addEventListener("wheel", start, { passive: true });
                window.addEventListener("scroll", start, { passive: true });
                window.addEventListener("keydown", start, { passive: true });
            });

        return () => {
            v.pause();
            window.removeEventListener("pointerdown", start);
            window.removeEventListener("touchstart", start);
            window.removeEventListener("wheel", start);
            window.removeEventListener("scroll", start);
            window.removeEventListener("keydown", start);
        };
    }, []);

    const toggle = () => {
        const v = audioRef.current;
        if (!v) return;
        if (playing) {
            mutedByUser.current = true;
            v.pause();
            setPlaying(false);
        } else {
            mutedByUser.current = false;
            v.volume = 0.3;
            v.play()
                .then(() => setPlaying(true))
                .catch(() => {});
        }
    };

    return (
        <>
            <audio
                ref={audioRef}
                data-testid="home-music-audio"
                src="/audio/homepage-music.mp3"
                loop
                preload="auto"
            />
            <motion.button
                data-testid="music-toggle-button"
                onClick={toggle}
                aria-label={playing ? "Pause background music" : "Play background music"}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.9, type: "spring", stiffness: 260, damping: 18 }}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.94 }}
                className="fixed bottom-[176px] right-5 z-[80] flex h-14 w-14 items-center justify-center rounded-full border border-ink/25 bg-paper text-ink shadow-[0_12px_30px_rgba(10,10,10,0.2)] sm:right-7"
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
        </>
    );
}
