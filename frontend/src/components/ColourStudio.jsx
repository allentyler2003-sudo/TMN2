import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import { Building2, ChevronsLeftRight, Download, Home, Mail, RefreshCw, Sparkles, Upload, Wand2 } from "lucide-react";
import { waLink } from "@/constants/site";
import { getVisitorId } from "@/constants/visitor";
import { FadeUp, EASE } from "@/components/Reveal";

const PRESETS = {
    interior: [
        { label: "Sage green walls", prompt: "warm sage green painted walls" },
        { label: "Navy feature wall", prompt: "one deep navy blue painted feature wall, light neutral walls" },
        { label: "Warm ivory walls", prompt: "warm ivory white painted walls" },
        { label: "Charcoal woodwork", prompt: "dark charcoal grey painted woodwork, skirting boards and doors" },
        { label: "Soft blush walls", prompt: "soft blush pink painted walls" },
        { label: "Clean white modern", prompt: "bright clean white painted walls, pure white woodwork" },
    ],
    exterior: [
        { label: "Slate grey render", prompt: "slate grey painted render walls" },
        { label: "White painted brick", prompt: "heritage white painted brickwork" },
        { label: "Charcoal woodwork", prompt: "deep charcoal grey painted exterior woodwork, doors and window frames" },
        { label: "Sage front door", prompt: "heritage sage green painted front door" },
        { label: "Cream & stone", prompt: "warm cream painted outside walls, anthracite grey woodwork" },
        { label: "Full exterior refresh", prompt: "freshly painted warm white exterior walls, anthracite grey woodwork and doors" },
    ],
};

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
                After — AI
            </span>
        </div>
    );
}

export default function ColourStudio() {
    const [image, setImage] = useState(null);
    const [mode, setMode] = useState("interior");
    const [selected, setSelected] = useState(null);
    const [custom, setCustom] = useState("");
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [email, setEmail] = useState("");
    const [emailState, setEmailState] = useState(null);
    const [emailing, setEmailing] = useState(false);
    const fileRef = useRef(null);

    const pick = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setError("");
        setResult(null);
        setEmailState(null);
        try {
            setImage(await fileToDataUrl(file));
        } catch {
            setError("That image could not be read — try a different photo.");
        }
    };

    const reset = () => {
        setResult(null);
        setEmailState(null);
    };

    const generate = async () => {
        if (!image) return;
        const preset = PRESETS[mode].find((p) => p.label === selected);
        const prompt =
            custom.trim() ||
            (preset ? preset.prompt : "") ||
            (mode === "exterior"
                ? "Suggest and apply tasteful, premium exterior paint colours that suit this property — repaint the outside walls and woodwork in a cohesive luxury scheme"
                : "Suggest and apply tasteful, premium paint colours that suit this room — repaint the walls and woodwork in a cohesive luxury scheme");
        setBusy(true);
        setError("");
        setResult(null);
        setEmailState(null);
        try {
            const { data: start } = await axios.post(
                `${API_BASE}/ai/colour`,
                { image, prompt, mode },
                { withCredentials: true, timeout: 60000, headers: { "X-Visitor-Id": getVisitorId() } }
            );
            // generation runs server-side for a couple of minutes — poll for the result
            const deadline = Date.now() + 600000;
            let doneImage = null;
            while (Date.now() < deadline) {
                await new Promise((r) => setTimeout(r, 3000));
                const { data: st } = await axios.get(
                    `${API_BASE}/ai/colour/result/${start.job_id}`,
                    { withCredentials: true, timeout: 30000 }
                );
                if (st.status === "done") {
                    doneImage = st.image;
                    break;
                }
                if (st.status === "failed" || st.status === "unknown") {
                    throw new Error("The colour studio is busy right now — please try again in a moment");
                }
            }
            if (!doneImage) {
                throw new Error("The colour studio is busy right now — please try again in a moment");
            }
            setResult({ image: doneImage, prompt });
        } catch (err) {
            setError(
                err.response?.data?.detail ||
                    err.message ||
                    "Something went wrong — please try again, or WhatsApp us and we'll do it for you."
            );
        } finally {
            setBusy(false);
        }
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
                                AI colour studio — free
                            </p>
                        </FadeUp>
                        <FadeUp delay={0.1}>
                            <h2 className="font-display text-4xl font-extrabold uppercase leading-[0.95] tracking-tight text-ink sm:text-6xl">
                                Test colours on
                                <br />
                                <span className="text-outline-ink">your room.</span>
                            </h2>
                        </FadeUp>
                    </div>
                    <FadeUp delay={0.2} className="max-w-sm">
                        <p className="text-base font-medium leading-relaxed text-ink/80">
                            Upload a photo of your room, pick a look or describe your own, and
                            our AI repaints it in seconds — drag the slider to compare.
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
                                                    reset();
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
                                            What are we painting?
                                        </p>
                                        <div className="grid grid-cols-2 gap-2.5">
                                            {[
                                                { id: "interior", label: "Interior", sub: "Rooms & indoor woodwork" },
                                                { id: "exterior", label: "Exterior", sub: "Walls, doors & trims" },
                                            ].map((m) => {
                                                const active = mode === m.id;
                                                const Icon = m.id === "interior" ? Home : Building2;
                                                return (
                                                    <button
                                                        key={m.id}
                                                        data-testid={`colour-mode-${m.id}`}
                                                        onClick={() => {
                                                            setMode(m.id);
                                                            setSelected(null);
                                                            reset();
                                                        }}
                                                        className={`flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all duration-300 ${
                                                            active
                                                                ? "border-ink bg-ink/[0.04]"
                                                                : "border-ink/15 hover:border-ink/40"
                                                        }`}
                                                    >
                                                        <Icon
                                                            className={`mt-0.5 h-5 w-5 shrink-0 ${active ? "text-ink" : "text-ink/50"}`}
                                                            strokeWidth={1.75}
                                                        />
                                                        <span>
                                                            <span
                                                                className={`block font-display text-sm font-bold uppercase tracking-tight ${
                                                                    active ? "text-ink" : "text-ink/70"
                                                                }`}
                                                            >
                                                                {m.label}
                                                            </span>
                                                            <span className="mt-0.5 block text-xs font-medium text-ink/55">
                                                                {m.sub}
                                                            </span>
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div>
                                        <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/55">
                                            Pick a look
                                        </p>
                                        <div className="flex flex-wrap gap-2.5">
                                            {PRESETS[mode].map((p) => {
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
                                            placeholder={
                                                mode === "exterior"
                                                    ? "e.g. slate grey render, black front door, white fascias and soffits…"
                                                    : "e.g. sage green walls, off-black woodwork, feature wall in deep teal…"
                                            }
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
                                                Painting… this can take a couple of minutes
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
                                    <BeforeAfter before={image} after={result.image} />

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
                                            onClick={reset}
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
                                        Your before &amp; after appears here — drag the slider to
                                        reveal your repainted room. Try sage walls, a navy feature
                                        wall, charcoal woodwork, or your own scheme.
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
