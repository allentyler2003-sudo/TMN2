import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Music, VolumeX } from "lucide-react";

export default function HomeMusic() {
    const audioRef = useRef(null);
    const [playing, setPlaying] = useState(false);

    useEffect(() => {
        const v = audioRef.current;
        if (!v) return;
        v.volume = 0.3;
        // try to autoplay; browsers may block until first tap — the button covers that
        v.play()
            .then(() => setPlaying(true))
            .catch(() => setPlaying(false));
        return () => {
            v.pause();
        };
    }, []);

    const toggle = () => {
        const v = audioRef.current;
        if (!v) return;
        if (playing) {
            v.pause();
            setPlaying(false);
        } else {
            v.volume = 0.3;
            v.play()
                .then(() => setPlaying(true))
                .catch(() => setPlaying(false));
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
