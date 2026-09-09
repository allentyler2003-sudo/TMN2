import { useRef, useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import { Download, RefreshCw, Sparkles, Upload, Wand2 } from "lucide-react";
import { waLink } from "@/constants/site";
import { FadeUp, EASE } from "@/components/Reveal";

const PRESETS = [
    { label: "Sage green walls", prompt: "Repaint the main walls a warm sage green, keep the woodwork white" },
    { label: "Navy feature wall", prompt: "Paint the main feature wall a deep navy blue, keep other walls light" },
    { label: "Warm ivory walls", prompt: "Repaint the walls a warm ivory white, keep woodwork bright white" },
    { label: "Charcoal woodwork", prompt: "Repaint the woodwork — skirting, doors and frames — a dark charcoal grey, keep the walls as they are" },
    { label: "Soft blush walls", prompt: "Repaint the walls a soft blush pink, keep woodwork white" },
    { label: "Clean white modern", prompt: "Repaint every wall a bright clean white and all woodwork pure white" },
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
            resolve(canvas.toDataURL("image/jpeg", 0.88));
        };
        img.onerror = reject;
        img.src = url;
    });
}

export default function ColourStudio() {
    const [image, setImage] = useState(null);
    const [selected, setSelected] = useState(null);
    const [custom, setCustom] = useState("");
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const fileRef = useRef(null);

    const pick = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setError("");
        setResult(null);
        try {
            setImage(await fileToDataUrl(file));
        } catch {
            setError("That image could not be read — try a different photo.");
        }
    };

    const generate = async () => {
        if (!image) return;
        const preset = PRESETS.find((p) => p.label === selected);
        const prompt =
            custom.trim() ||
            (preset ? preset.prompt : "") ||
            "Suggest and apply tasteful, premium paint colours that suit this room — repaint the walls and woodwork in a cohesive luxury scheme";
        setBusy(true);
        setError("");
        setResult(null);
        try {
            const { data } = await axios.post(
                `${API_BASE}/ai/colour`,
                { image, prompt },
                { withCredentials: true, timeout: 240000 }
            );
            setResult({ image: data.image, prompt });
        } catch (err) {
            setError(
                err.response?.data?.detail ||
                    "Something went wrong — please try again, or WhatsApp us and we'll do it for you."
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <section id="colours" data-testid="colour-studio" className="relative py-24 sm:py-36">
            <div className="mx-auto max-w-[1600px] px-5 sm:px-8 lg:px-12">
                <div className="mb-14 flex flex-col gap-6 sm:mb-16 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <FadeUp>
                            <p className="mb-6 font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-ink/65 sm:text-xs">
                                AI colour studio — free
                            </p>
                        </FadeUp>
                        <FadeUp delay={0.1}>
                            <h2 className="font-display text-4xl font-extrabold uppercase leading-[0.95] tracking-tight text-ink sm:text-6xl lg:text-7xl">
                                Test colours on
                                <br />
                                <span className="text-outline-ink">your room.</span>
                            </h2>
                        </FadeUp>
                    </div>
                    <FadeUp delay={0.2} className="max-w-sm">
                        <p className="text-base font-medium leading-relaxed text-ink/80">
                            Upload a photo of your room, pick a look or describe your own, and
                            our AI repaints it in seconds — so you can see it before a single
                            brush is lifted.
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
                                        Upload your room
                                    </span>
                                    <span className="max-w-[240px] text-sm font-medium leading-relaxed text-ink/60">
                                        A photo of a wall, room or house exterior — tap to choose
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
                                    <div className="flex items-center gap-4">
                                        <img
                                            src={image}
                                            alt="Your room"
                                            data-testid="colour-preview"
                                            className="h-20 w-20 rounded-2xl object-cover ring-1 ring-ink/10"
                                        />
                                        <div className="flex-1">
                                            <p className="font-display text-base font-bold uppercase tracking-tight">
                                                Your photo
                                            </p>
                                            <button
                                                data-testid="colour-change-photo"
                                                onClick={() => {
                                                    setImage(null);
                                                    setResult(null);
                                                    setSelected(null);
                                                    setCustom("");
                                                    fileRef.current?.click();
                                                }}
                                                className="mt-1 inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink/60 hover:text-ink"
                                            >
                                                <RefreshCw className="h-3 w-3" /> Change photo
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/55">
                                            Pick a look
                                        </p>
                                        <div className="flex flex-wrap gap-2.5">
                                            {PRESETS.map((p) => {
                                                const active = selected === p.label && !custom.trim();
                                                return (
                                                    <button
                                                        key={p.label}
                                                        data-testid={`colour-preset-${p.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                                                        onClick={() => {
                                                            setSelected(p.label);
                                                            setCustom("");
                                                        }}
                                                        className={`rounded-full border px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] transition-all duration-300 ${
                                                            active
                                                                ? "border-ink bg-ink text-paper"
                                                                : "border-ink/25 text-ink/75 hover:border-ink hover:text-ink"
                                                        }`}
                                                    >
                                                        {p.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div>
                                        <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/55">
                                            Or customise it your way
                                        </p>
                                        <textarea
                                            data-testid="colour-custom-input"
                                            value={custom}
                                            onChange={(e) => setCustom(e.target.value)}
                                            rows={2}
                                            placeholder="e.g. sage green walls, off-black woodwork, feature wall in deep teal…"
                                            className="w-full resize-none rounded-2xl border border-ink/20 bg-transparent p-4 text-sm font-medium placeholder:text-ink/40 focus:border-ink focus:outline-none"
                                        />
                                        <p className="mt-2 text-xs font-medium text-ink/50">
                                            Not sure? Leave it empty and our AI will suggest a
                                            tasteful scheme — or{" "}
                                            <a
                                                href={waLink("Hi TMN — I'd like colour advice for my room.")}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="underline underline-offset-2 hover:text-ink"
                                            >
                                                ask us for advice
                                            </a>
                                            .
                                        </p>
                                    </div>

                                    {error && <p className="text-sm font-medium text-red-700">{error}</p>}

                                    <motion.button
                                        data-testid="colour-generate"
                                        onClick={generate}
                                        disabled={busy}
                                        whileHover={{ scale: busy ? 1 : 1.03 }}
                                        whileTap={{ scale: busy ? 1 : 0.96 }}
                                        transition={{ duration: 0.25, ease: EASE }}
                                        className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-4 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-paper disabled:opacity-50"
                                    >
                                        {busy ? (
                                            <>
                                                <RefreshCw className="h-4 w-4 animate-spin" />
                                                Painting… up to a minute
                                            </>
                                        ) : (
                                            <>
                                                <Wand2 className="h-4 w-4" />
                                                Show me this look
                                            </>
                                        )}
                                    </motion.button>
                                </div>
                            )}
                        </div>
                    </FadeUp>

                    {/* result */}
                    <FadeUp delay={0.2}>
                        <div className="rounded-3xl border border-ink/10 bg-white/85 p-6 shadow-[0_24px_70px_rgba(10,10,10,0.09)] sm:p-8">
                            {result ? (
                                <div className="space-y-5">
                                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                                        <div>
                                            <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-ink/50">
                                                Before
                                            </p>
                                            <img
                                                src={image}
                                                alt="Before"
                                                className="aspect-square w-full rounded-2xl object-cover ring-1 ring-ink/10"
                                            />
                                        </div>
                                        <div>
                                            <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-[#C6A55C]">
                                                After — AI
                                            </p>
                                            <img
                                                data-testid="colour-result-img"
                                                src={result.image}
                                                alt="After — repainted by AI"
                                                className="aspect-square w-full rounded-2xl object-cover ring-1 ring-ink/10"
                                            />
                                        </div>
                                    </div>
                                    <p className="rounded-xl bg-ink/5 p-3 font-mono text-[10px] font-medium leading-relaxed text-ink/65">
                                        {result.prompt}
                                    </p>
                                    <div className="flex flex-wrap gap-3">
                                        <a
                                            data-testid="colour-result-download"
                                            href={result.image}
                                            download="tmn-colour-idea.png"
                                            className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper transition-transform hover:scale-105 active:scale-95"
                                        >
                                            <Download className="h-4 w-4" /> Save it
                                        </a>
                                        <button
                                            data-testid="colour-try-another"
                                            onClick={() => setResult(null)}
                                            className="inline-flex items-center gap-2 rounded-full border border-ink/25 px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                                        >
                                            <Sparkles className="h-4 w-4" /> Try another colour
                                        </button>
                                        <a
                                            href={waLink("Hi TMN — I tested colours with your AI studio and I'd like a quote.")}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            data-testid="colour-quote-link"
                                            className="inline-flex items-center gap-2 rounded-full bg-[#C6A55C] px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white transition-transform hover:scale-105 active:scale-95"
                                        >
                                            Get this look — quote
                                        </a>
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
                                        Your before &amp; after appears here. Try sage walls, a
                                        navy feature wall, charcoal woodwork — or describe your
                                        own scheme.
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
