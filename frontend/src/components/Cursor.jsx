import { useEffect, useRef } from "react";

export default function Cursor() {
    const dotRef = useRef(null);
    const ringRef = useRef(null);

    useEffect(() => {
        if (!window.matchMedia("(pointer: fine)").matches) return;
        const dot = dotRef.current;
        const ring = ringRef.current;
        if (!dot || !ring) return;

        let x = -100;
        let y = -100;
        let rx = -100;
        let ry = -100;
        let scale = 1;
        let raf;

        const onMove = (e) => {
            x = e.clientX;
            y = e.clientY;
            if (!document.body.classList.contains("cursor-ready")) {
                document.body.classList.add("cursor-ready");
            }
        };
        const onOver = (e) => {
            const hit = e.target.closest("a, button, textarea, input, [data-cursor]");
            scale = hit ? 2.1 : 1;
        };
        const loop = () => {
            rx += (x - rx) * 0.18;
            ry += (y - ry) * 0.18;
            dot.style.transform = `translate(${x}px, ${y}px)`;
            ring.style.transform = `translate(${rx}px, ${ry}px) scale(${scale})`;
            raf = requestAnimationFrame(loop);
        };

        window.addEventListener("mousemove", onMove, { passive: true });
        window.addEventListener("mouseover", onOver, { passive: true });
        raf = requestAnimationFrame(loop);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseover", onOver);
            cancelAnimationFrame(raf);
            document.body.classList.remove("cursor-ready");
        };
    }, []);

    return (
        <>
            <div ref={dotRef} className="cursor-dot hidden md:block" aria-hidden="true" />
            <div
                ref={ringRef}
                data-testid="custom-cursor-ring"
                className="cursor-ring hidden md:block"
                aria-hidden="true"
            />
        </>
    );
}
