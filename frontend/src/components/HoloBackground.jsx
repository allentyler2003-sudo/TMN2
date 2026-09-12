import { useEffect, useRef, useState } from "react";

export default function HoloBackground() {
    const videoRef = useRef(null);
    const retryTimerRef = useRef(null);
    const retryCountRef = useRef(0);
    const mountedRef = useRef(false);

    const [videoReady, setVideoReady] = useState(false);
    const [videoFailed, setVideoFailed] = useState(false);

    useEffect(() => {
        mountedRef.current = true;

        const video = videoRef.current;

        if (!video) {
            return undefined;
        }

        const clearRetry = () => {
            if (retryTimerRef.current) {
                clearTimeout(retryTimerRef.current);
                retryTimerRef.current = null;
            }
        };

        const tryPlay = () => {
            if (!mountedRef.current) {
                return;
            }

            const currentVideo = videoRef.current;

            if (!currentVideo) {
                return;
            }

            const playPromise = currentVideo.play();

            if (playPromise && typeof playPromise.catch === "function") {
                playPromise
                    .then(() => {
                        if (!mountedRef.current) {
                            return;
                        }

                        retryCountRef.current = 0;
                        setVideoReady(true);
                        setVideoFailed(false);
                    })
                    .catch(() => {
                        scheduleRetry();
                    });
            }
        };

        const scheduleRetry = () => {
            if (!mountedRef.current || retryTimerRef.current) {
                return;
            }

            const attempt = retryCountRef.current;
            const delay = Math.min(1000 * Math.pow(2, attempt), 10000);

            retryTimerRef.current = setTimeout(() => {
                retryTimerRef.current = null;

                if (!mountedRef.current) {
                    return;
                }

                retryCountRef.current = Math.min(attempt + 1, 5);

                const currentVideo = videoRef.current;

                if (!currentVideo) {
                    return;
                }

                if (
                    currentVideo.readyState === 0 ||
                    currentVideo.networkState ===
                        HTMLMediaElement.NETWORK_NO_SOURCE
                ) {
                    currentVideo.load();
                }

                tryPlay();
            }, delay);
        };

        const markReady = () => {
            if (!mountedRef.current) {
                return;
            }

            retryCountRef.current = 0;
            clearRetry();

            setVideoReady(true);
            setVideoFailed(false);

            tryPlay();
        };

        const handlePlaying = () => {
            if (!mountedRef.current) {
                return;
            }

            retryCountRef.current = 0;
            clearRetry();

            setVideoReady(true);
            setVideoFailed(false);
        };

        const handleWaiting = () => {
            scheduleRetry();
        };

        const handleStalled = () => {
            scheduleRetry();
        };

        const handleSuspend = () => {
            if (video.paused) {
                scheduleRetry();
            }
        };

        const handleError = () => {
            if (!mountedRef.current) {
                return;
            }

            setVideoReady(false);
            setVideoFailed(true);

            scheduleRetry();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                retryCountRef.current = 0;
                tryPlay();
            }
        };

        const handleInteraction = () => {
            tryPlay();
        };

        video.addEventListener("loadstart", markReady);
        video.addEventListener("loadeddata", markReady);
        video.addEventListener("canplay", markReady);
        video.addEventListener("canplaythrough", markReady);
        video.addEventListener("playing", handlePlaying);

        video.addEventListener("waiting", handleWaiting);
        video.addEventListener("stalled", handleStalled);
        video.addEventListener("suspend", handleSuspend);
        video.addEventListener("error", handleError);

        document.addEventListener(
            "visibilitychange",
            handleVisibilityChange
        );

        window.addEventListener("pointerdown", handleInteraction, {
            passive: true,
        });

        window.addEventListener("touchstart", handleInteraction, {
            passive: true,
        });

        window.addEventListener("wheel", handleInteraction, {
            passive: true,
        });

        video.load();
        tryPlay();

        const initialRetry = setTimeout(() => {
            if (mountedRef.current) {
                tryPlay();
            }
        }, 1500);

        return () => {
            mountedRef.current = false;

            clearTimeout(initialRetry);
            clearRetry();

            video.removeEventListener("loadstart", markReady);
            video.removeEventListener("loadeddata", markReady);
            video.removeEventListener("canplay", markReady);
            video.removeEventListener("canplaythrough", markReady);
            video.removeEventListener("playing", handlePlaying);

            video.removeEventListener("waiting", handleWaiting);
            video.removeEventListener("stalled", handleStalled);
            video.removeEventListener("suspend", handleSuspend);
            video.removeEventListener("error", handleError);

            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange
            );

            window.removeEventListener("pointerdown", handleInteraction);
            window.removeEventListener("touchstart", handleInteraction);
            window.removeEventListener("wheel", handleInteraction);
        };
    }, []);

    return (
        <div
            className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
            aria-hidden="true"
        >
            {(!videoReady || videoFailed) && (
                <div className="holo-fallback absolute inset-0" />
            )}

            <video
                ref={videoRef}
                data-testid="holo-background-video"
                className="h-full w-full object-cover saturate-[1.25] contrast-[1.05]"
                muted
                autoPlay
                loop
                playsInline
                preload="auto"
                poster="/videos/bg-poster.jpg"
            >
                <source
                    src="/videos/bg-hq.webm"
                    type="video/webm"
                />
                <source
                    src="/videos/bg-hq.mp4"
                    type="video/mp4"
                />
            </video>

            <div className="absolute inset-0 bg-paper/55" />
        </div>
    );
}