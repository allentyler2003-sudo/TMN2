import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { ChevronsLeftRight, Download, Mail, Paintbrush, RefreshCw, Sparkles, Upload, Wand2, Undo2, Eraser } from "lucide-react";
import { waLink } from "@/constants/site";
import { FadeUp, EASE } from "@/components/Reveal";

const SWATCHES = [
    { name: "Sage green", hex: "#9CAF88" },
    { name: "Dark royal blue", hex: "#1F3A93" },
    { name: "Deep navy", hex: "#1B2A4A" },
    { name: "Charcoal", hex: "#36454F" },
    { name: "Soft blush", hex: "#E8C4C4" },
    { name: "Warm ivory", hex: "#F5F0E1" },
    { name: "Slate grey", hex: "#708090" },
    { name: "Heritage white", hex: "#F0EBE0" },
    { name: "Anthracite", hex: "#3D3D3D" },
    { name: "Forest green", hex: "#2C4A3B" },
    { name: "Terracotta", hex: "#C1613B" },
    { name: "Sky blue", hex: "#7EB6D9" },
];

const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const max = 1024;
            const scale = Math.min(1, max / Math.max(img.width, img.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL("image/jpeg", 0.92));
        };
        img.onerror = reject;
        img.src = url;
    });
}

/* ---- paint-true colour maths: keep the photo's lightness and shading,
       replace the hue/saturation with the chosen paint colour ---- */
function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToLab(r, g, b) {
    const lin = (c) => {
        c /= 255;
        return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
    };
    const R = lin(r), G = lin(g), B = lin(b);
    const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
    const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

function labToRgb(L, a, b) {
    const fy = (L + 16) / 116;
    const fx = fy + a / 500;
    const fz = fy - b / 200;
    const fi = (t) => {
        const t3 = t * t * t;
        return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
    };
    const X = 0.95047 * fi(fx);
    const Y = 1.0 * fi(fy);
    const Z = 1.08883 * fi(fz);
    const back = (v) => {
        const c = v > 0.04045 ? 1.055 * Math.pow(v, 1 / 2.4) - 0.055 : 12.92 * v;
        return Math.max(0, Math.min(255, Math.round(c * 255)));
    };
    const r = back(3.2406 * X - 1.5372 * Y - 0.4986 * Z);
    const g = back(-0.9689 * X + 1.8758 * Y + 0.0415 * Z);
    const bl = back(0.0557 * X - 0.204 * Y + 1.057 * Z);
    return [r, g, bl];
}

function recolourImage(baseImg, maskCanvas, targetHex, onDone) {
    const w = baseImg.naturalWidth;
    const h = baseImg.naturalHeight;
    const base = document.createElement("canvas");
    base.width = w;
    base.height = h;
    const bctx = base.getContext("2d");
    bctx.drawImage(baseImg, 0, 0, w, h);
    const baseData = bctx.getImageData(0, 0, w, h);
    const maskData = maskCanvas.getContext("2d").getImageData(0, 0, w, h);

    const [tr, tg, tb] = hexToRgb(targetHex);
    const [tL, ta, tbb] = rgbToLab(tr, tg, tb);

    // average lightness of the brushed area, so dark paints darken and light
    // paints lift the area while every bit of shading and texture is kept
    let sumL = 0;
    let count = 0;
    for (let i = 0; i < w * h; i++) {
        if (maskData.data[i * 4] > 40) {
            const [L] = rgbToLab(baseData.data[i * 4], baseData.data[i * 4 + 1], baseData.data[i * 4 + 2]);
            sumL += L;
            count++;
        }
    }
    const avgL = count ? sumL / count : tL;
    const scale = count ? tL / avgL : 1;

    const out = bctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
        const p = i * 4;
        const m = maskData.data[p] / 255;
        const r = baseData.data[p];
        const g = baseData.data[p + 1];
        const b = baseData.data[p + 2];
        if (m < 0.04) {
            out.data[p] = r;
            out.data[p + 1] = g;
            out.data[p + 2] = b;
            out.data[p + 3] = 255;
            continue;
        }
        const [L] = rgbToLab(r, g, b);
        const newL = Math.max(0, Math.min(100, L * scale));
        const [nr, ng, nb] = labToRgb(newL, ta, tbb);
        // feathered blend at the brush edges so strokes melt into the photo
        out.data[p] = r * (1 - m) + nr * m;
        out.data[p + 1] = g * (1 - m) + ng * m;
        out.data[p + 2] = b * (1 - m) + nb * m;
        out.data[p + 3] = 255;
    }
    bctx.putImageData(out, 0, 0);
    onDone(base.toDataURL("image/jpeg", 0.92));
}

function BeforeAfter({ before, after }) {
    const ref = useRef(null);
    const [pos, setPos] = useState(50);
    const dragging = useRef(false);

    const setFromClientX = (clientX) => {
        const r = ref.current.getBoundingClientRect();
        setPos(Math.min(100, Math.max(0, ((clientX - r.x) / r.width) * 100)));
    };

    useEffect(() => {
        const move = (e) => dragging.current && setFromClientX(e.clientX);
        const up = () => (dragging.current = false);
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        return () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
    }, []);

    return (
        <div
            ref={ref}
            data-testid="colour-before-after"
            className="relative aspect-square w-full cursor-ew-resize select-none overflow-hidden rounded-2xl ring-1 ring-ink/10"
            style={{ touchAction: "none" }}
            onPointerDown={(e) => {
                dragging.current = true;
                setFromClientX(e.clientX);
            }}
        >
            <img src={before} alt="Before" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
                <img src={after} alt="After" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
            </div>
            <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
                <div className="absolute inset-y-0 -left-[1.5px] w-[3px] bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)]" />
                <div className="absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[0_8px_24px_rgba(10,10,10,0.25)]">
                    <ChevronsLeftRight className="h-5 w-5 text-ink" />
                </div>
            </div>
            <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-ink/75 px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-paper">
                Before
            </span>
            <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-[#C6A55C] px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-white">
                After
            </span>
        </div>
    );
}

export default function ColourStudio() {
    const [image, setImage] = useState(null);
    const [brushSize, setBrushSize] = useState(26);
    const [colour, setColour] = useState(SWATCHES[1]);
    const [customColour, setCustomColour] = useState("#1F3A93");
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [email, setEmail] = useState("");
    const [emailState, setEmailState] = useState(null);
    const [emailing, setEmailing] = useState(false);
    const [strokes, setStrokes] = useState(0);
    const fileRef = useRef(null);
    const canvasRef = useRef(null);
    const imgRef = useRef(null);
    const drawing = useRef(false);
    const strokesRef = useRef([]);

    const redraw = () => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img) return;
        if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
        }
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#E63946";
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const scale = canvas.width / (canvas.getBoundingClientRect().width || 1);
        for (const stroke of strokesRef.current) {
            ctx.lineWidth = Math.max(6, stroke.size * scale);
            ctx.beginPath();
            stroke.points.forEach((pt, i) => {
                const x = pt.x * canvas.width;
                const y = pt.y * canvas.height;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            if (stroke.points.length === 1) {
                ctx.lineTo(stroke.points[0].x * canvas.width + 0.1, stroke.points[0].y * canvas.height);
            }
            ctx.stroke();
        }
        setStrokes(strokesRef.current.length);
    };

    const getPos = (e) => {
        const canvas = canvasRef.current;
        const r = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - r.left) / r.width,
            y: (e.clientY - r.top) / r.height,
        };
    };

    const onPointerDown = (e) => {
        e.preventDefault();
        drawing.current = true;
        e.target.setPointerCapture?.(e.pointerId);
        strokesRef.current.push({ size: brushSize, points: [getPos(e)] });
        redraw();
    };

    const onPointerMove = (e) => {
        if (!drawing.current) return;
        e.preventDefault();
        strokesRef.current[strokesRef.current.length - 1]?.points.push(getPos(e));
        redraw();
    };

    const stopDrawing = () => {
        drawing.current = false;
    };

    const pick = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setError("");
        setResult(null);
        setEmailState(null);
        strokesRef.current = [];
        setStrokes(0);
        try {
            setImage(await fileToDataUrl(file));
        } catch {
            setError("That image could not be read — try a different photo.");
        }
    };

    const undo = () => {
        strokesRef.current.pop();
        redraw();
    };

    const clearBrush = () => {
        strokesRef.current = [];
        redraw();
    };

    const generate = () => {
        if (!image || !imgRef.current) return;
        if (!strokesRef.current.length) {
            setError("Brush over the area you'd like repainted first — walls, door, woodwork, anything.");
            return;
        }
        setError("");
        setBusy(true);
        const targetHex = (colour.name === "Custom" ? customColour : colour.hex).toUpperCase();
        recolourImage(imgRef.current, canvasRef.current, targetHex, (after) => {
            setResult({
                image: after,
                prompt: `${colour.name === "Custom" ? "Custom colour" : colour.name} (${targetHex})`,
            });
            setBusy(false);
        });
    };

    const reset = () => {
        setResult(null);
        setEmailState(null);
    };

    const sendEmail = async () => {
        if (!result) return;
        setEmailing(true);
        setEmailState(null);
        try {
            await axios.post(
                `${API_BASE}/ai/colour/email`,
                { to: email, image: result.image, prompt: result.prompt },
                { withCredentials: true, timeout: 60000 }
            );
            setEmailState({ ok: true, msg: `Sent to ${email} — check your inbox (and spam, just in case).` });
        } catch (err) {
            setEmailState({ ok: false, msg: err.response?.data?.detail || "The email couldn't be sent — please try again." });
        } finally {
            setEmailing(false);
        }
    };

    return (
        <section id="colours" data-testid="colour-studio" className="relative py-20 sm:py-28">
            <div className="mx-auto max-w-[1600px] px-5 sm:px-8 lg:px-12">
                <div className="mb-12 flex flex-col gap-6 sm:mb-14 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <FadeUp>
                            <p className="mb-5 font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-ink/65 sm:text-xs">
                                Colour visualiser — free
                            </p>
                        </FadeUp>
                        <FadeUp delay={0.1}>
                            <h2 className="font-display text-4xl font-extrabold uppercase leading-[0.95] tracking-tight text-ink sm:text-6xl">
                                Test colours on
                                <br />
                                <span className="text-outline-ink">your home.</span>
                            </h2>
                        </FadeUp>
                    </div>
                    <FadeUp delay={0.2} className="max-w-sm">
                        <p className="text-base font-medium leading-relaxed text-ink/80">
                            Upload a photo, brush over the walls, door or woodwork, pick a paint
                            colour and see it instantly — drag the slider to compare.
                        </p>
                    </FadeUp>
                </div>

                <div className="grid gap-10 lg:grid-cols-[1fr_1.25fr] lg:gap-16">
                    {/* controls */}
                    <FadeUp delay={0.1}>
                        <div className="rounded-3xl border border-ink/10 bg-white/85 p-7 shadow-[0_24px_70px_rgba(10,10,10,0.09)] sm:p-9">
                            {!image ? (
                                <label
                                    data-testid="colour-upload-zone"
                                    className="flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-ink/25 px-6 py-14 text-center transition-colors hover:border-ink hover:bg-ink/[0.03]"
                                >
                                    <Upload className="h-8 w-8 text-ink/50" strokeWidth={1.5} />
                                    <span className="font-display text-lg font-bold uppercase tracking-tight">
                                        Upload your photo
                                    </span>
                                    <span className="max-w-[240px] text-sm font-medium leading-relaxed text-ink/60">
                                        A room, wall, door or house exterior — tap to choose
                                    </span>
                                    <input
                                        ref={fileRef}
                                        data-testid="colour-upload-input"
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={pick}
                                    />
                                </label>
                            ) : (
                                <div className="space-y-6">
                                    <div className="relative select-none overflow-hidden rounded-2xl ring-1 ring-ink/10">
                                        <img
                                            ref={imgRef}
                                            src={image}
                                            alt="Your photo"
                                            data-testid="colour-preview"
                                            className="block w-full"
                                            draggable={false}
                                            onLoad={redraw}
                                        />
                                        <canvas
                                            ref={canvasRef}
                                            data-testid="colour-brush-canvas"
                                            className="absolute inset-0 h-full w-full cursor-crosshair opacity-50"
                                            style={{ touchAction: "none" }}
                                            onPointerDown={onPointerDown}
                                            onPointerMove={onPointerMove}
                                            onPointerUp={stopDrawing}
                                            onPointerLeave={stopDrawing}
                                        />
                                    </div>

                                    <div className="flex flex-wrap items-center gap-4">
                                        <button
                                            data-testid="colour-change-photo"
                                            onClick={() => {
                                                setImage(null);
                                                reset();
                                                strokesRef.current = [];
                                                setStrokes(0);
                                            }}
                                            className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink/60 hover:text-ink"
                                        >
                                            <RefreshCw className="h-3 w-3" /> Change photo
                                        </button>
                                        <button
                                            data-testid="colour-brush-undo"
                                            onClick={undo}
                                            className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink/60 hover:text-ink"
                                        >
                                            <Undo2 className="h-3 w-3" /> Undo
                                        </button>
                                        <button
                                            data-testid="colour-brush-clear"
                                            onClick={clearBrush}
                                            className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink/60 hover:text-ink"
                                        >
                                            <Eraser className="h-3 w-3" /> Clear
                                        </button>
                                        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.2em] text-ink/40">
                                            {strokes} {strokes === 1 ? "stroke" : "strokes"}
                                        </span>
                                    </div>

                                    <div>
                                        <p className="mb-3 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/55">
                                            <Paintbrush className="h-3.5 w-3.5" /> Brush size
                                        </p>
                                        <input
                                            data-testid="colour-brush-size"
                                            type="range"
                                            min="8"
                                            max="80"
                                            value={brushSize}
                                            onChange={(e) => setBrushSize(Number(e.target.value))}
                                            className="w-full accent-ink"
                                        />
                                        <p className="mt-1 text-xs font-medium text-ink/50">
                                            Brush over the walls, door or woodwork — anywhere you want
                                            the new colour. Bigger brush for walls, smaller for edges.
                                        </p>
                                    </div>

                                    <div>
                                        <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/55">
                                            Pick your paint
                                        </p>
                                        <div className="flex flex-wrap gap-2.5">
                                            {SWATCHES.map((s) => {
                                                const active = colour.name === s.name;
                                                return (
                                                    <button
                                                        key={s.name}
                                                        data-testid={`colour-swatch-${s.name.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                                                        onClick={() => setColour(s)}
                                                        title={s.name}
                                                        className={`h-10 w-10 rounded-full border-2 transition-transform duration-200 hover:scale-110 ${
                                                            active ? "scale-110 border-ink ring-2 ring-ink/30" : "border-ink/15"
                                                        }`}
                                                        style={{ backgroundColor: s.hex }}
                                                    >
                                                        <span className="sr-only">{s.name}</span>
                                                    </button>
                                                );
                                            })}
                                            <label
                                                data-testid="colour-custom-colour"
                                                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-ink/30 font-mono text-[9px] font-bold text-ink/60 hover:border-ink"
                                                title="Any custom colour"
                                            >
                                                ?
                                                <input
                                                    type="color"
                                                    data-testid="colour-custom-input"
                                                    value={customColour}
                                                    onChange={(e) => {
                                                        setCustomColour(e.target.value);
                                                        setColour({ name: "Custom", hex: e.target.value });
                                                    }}
                                                    className="h-0 w-0 opacity-0"
                                                />
                                            </label>
                                        </div>
                                        <p className="mt-2 text-sm font-bold uppercase tracking-wide text-ink/75">
                                            {colour.name === "Custom" ? `Custom ${customColour.toUpperCase()}` : colour.name}
                                        </p>
                                    </div>

                                    {error && <p className="text-sm font-medium text-red-700">{error}</p>}

                                    <button
                                        data-testid="colour-generate"
                                        onClick={generate}
                                        disabled={busy}
                                        className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-4 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-paper transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                                        style={{ transitionTimingFunction: EASE }}
                                    >
                                        {busy ? (
                                            <>
                                                <RefreshCw className="h-4 w-4 animate-spin" />
                                                Painting…
                                            </>
                                        ) : (
                                            <>
                                                <Wand2 className="h-4 w-4" />
                                                Show me this look
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    </FadeUp>

                    {/* result */}
                    <FadeUp delay={0.2}>
                        <div className="rounded-3xl border border-ink/10 bg-white/85 p-6 shadow-[0_24px_70px_rgba(10,10,10,0.09)] sm:p-8">
                            {result ? (
                                <div className="space-y-5">
                                    <BeforeAfter before={image} after={result.image} />

                                    <p className="rounded-xl bg-ink/5 p-3 font-mono text-[10px] font-medium leading-relaxed text-ink/65">
                                        Colour applied: {result.prompt} — like it? We do this for real.
                                    </p>

                                    <div className="flex flex-wrap gap-3">
                                        <a
                                            data-testid="colour-result-download"
                                            href={result.image}
                                            download="tmn-colour-idea.jpg"
                                            className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper transition-transform hover:scale-105 active:scale-95"
                                        >
                                            <Download className="h-4 w-4" /> Save it
                                        </a>
                                        <button
                                            data-testid="colour-try-another"
                                            onClick={reset}
                                            className="inline-flex items-center gap-2 rounded-full border border-ink/25 px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                                        >
                                            <Sparkles className="h-4 w-4" /> Try another colour
                                        </button>
                                        <a
                                            href={waLink("Hi TMN — I tested colours with your visualiser and I'd like a quote.")}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            data-testid="colour-quote-link"
                                            className="inline-flex items-center gap-2 rounded-full bg-[#C6A55C] px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white transition-transform hover:scale-105 active:scale-95"
                                        >
                                            Get this look — quote
                                        </a>
                                    </div>

                                    <div className="rounded-2xl border border-ink/10 bg-white/90 p-5">
                                        <p className="mb-3 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/60">
                                            <Mail className="h-3.5 w-3.5" /> Email me this look
                                        </p>
                                        {emailState && (
                                            <p
                                                className={`mb-3 rounded-xl p-3 text-sm font-medium ${
                                                    emailState.ok ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"
                                                }`}
                                                data-testid="colour-email-status"
                                            >
                                                {emailState.msg}
                                            </p>
                                        )}
                                        <div className="flex flex-wrap gap-2.5">
                                            <input
                                                data-testid="colour-email-input"
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder="your@email.co.uk"
                                                className="min-w-0 flex-1 rounded-full border border-ink/20 bg-transparent px-4 py-3 text-sm font-medium placeholder:text-ink/40 focus:border-ink focus:outline-none"
                                            />
                                            <button
                                                data-testid="colour-email-send"
                                                onClick={sendEmail}
                                                disabled={emailing || !email.trim()}
                                                className="rounded-full border border-ink/30 px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper disabled:opacity-40"
                                            >
                                                {emailing ? "Sending…" : "Email me this"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-5 rounded-2xl border-2 border-dashed border-ink/15 p-8 text-center">
                                    <div
                                        data-testid="colour-studio-placeholder"
                                        className="flex h-24 w-24 items-center justify-center rounded-full bg-white shadow-[0_15px_40px_rgba(10,10,10,0.08)] ring-1 ring-ink/10"
                                    >
                                        <Sparkles className="h-9 w-9 text-ink/40" strokeWidth={1.25} />
                                    </div>
                                    <p className="max-w-[280px] text-sm font-medium leading-relaxed text-ink/55">
                                        Your before &amp; after appears here — brush over your walls,
                                        pick a colour and drag the slider to reveal your newly painted
                                        home.
                                    </p>
                                </div>
                            )}
                        </div>
                    </FadeUp>
                </div>
            </div>
        </section>
    );
}
