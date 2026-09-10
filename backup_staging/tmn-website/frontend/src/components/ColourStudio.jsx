import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import {
    ChevronsLeftRight, Download, Layers, Mail, Paintbrush, RefreshCw, Share2, Sparkles,
    Upload, Wand2, Undo2, Eraser, Bookmark, Trash2, X, MousePointerClick, Pipette, Heart,
} from "lucide-react";
import { waLink } from "@/constants/site";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FadeUp, EASE } from "@/components/Reveal";
import {
    recolourLayers, drawColourWheel, hexToHsv, hsvToHex,
    hexToRgb, rgbToHex, rgbToLab, regionFromPoint, isValidHex, normaliseHex, makeThumb,
} from "@/lib/colour";

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

const FARROW_BALL = [
    { name: "Hague Blue", code: "No. 30", hex: "#33485D" },
    { name: "Railings", code: "No. 31", hex: "#373F44" },
    { name: "Pigeon", code: "No. 25", hex: "#9BA089" },
    { name: "Mole's Breath", code: "No. 276", hex: "#5E5B54" },
    { name: "Ammonite", code: "No. 274", hex: "#C0B3AB" },
    { name: "Elephant's Breath", code: "No. 229", hex: "#A39C91" },
    { name: "Card Room Green", code: "No. 79", hex: "#435B51" },
    { name: "Dead Salmon", code: "No. 28", hex: "#B1A289" },
    { name: "Inchyra Blue", code: "No. 289", hex: "#47526E" },
    { name: "Charlotte's Locks", code: "No. 268", hex: "#BE5B2F" },
];

const DULUX = [
    { name: "Egyptian Cotton", code: "Dulux", hex: "#E9E1D2" },
    { name: "Goose Down", code: "Dulux", hex: "#DDD9CB" },
    { name: "Nutmeg White", code: "Dulux", hex: "#F3EBDC" },
    { name: "Polished Pebble", code: "Dulux", hex: "#DAD7CD" },
    { name: "Denim Drift", code: "Dulux", hex: "#A3B7CD" },
    { name: "Sapphire Salute", code: "Dulux", hex: "#3F6089" },
    { name: "Emerald Glade", code: "Dulux", hex: "#9CBB99" },
    { name: "Cherry Blossom", code: "Dulux", hex: "#F3D7D8" },
];

const BRANDS = {
    popular: { label: "Popular", list: SWATCHES },
    farrow: { label: "Farrow & Ball", list: FARROW_BALL },
    dulux: { label: "Dulux", list: DULUX },
};

const SURFACES = {
    walls: { label: "Walls", stroke: "#E63946" },
};;

const SHEENS = ["matte", "silk", "gloss"];
const LOOKS_KEY = "tmn-saved-looks";

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

function loadSavedLooks() {
    try {
        return JSON.parse(localStorage.getItem(LOOKS_KEY) || "[]");
    } catch {
        return [];
    }
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

function ColourWheel({ hex, onChange }) {
    const wheelRef = useRef(null);
    const [hsv, setHsv] = useState(() => hexToHsv(hex));
    const dragging = useRef(false);

    useEffect(() => {
        const c = wheelRef.current;
        if (c) drawColourWheel(c);
    }, []);

    useEffect(() => {
        setHsv(hexToHsv(hex));
    }, [hex]);

    const pick = (e) => {
        const c = wheelRef.current;
        const r = c.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const dist = Math.min(1, Math.sqrt(dx * dx + dy * dy) / (r.width / 2));
        const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
        setHsv([hue, dist, hsv[2]]);
        onChange(hsvToHex(hue, dist, hsv[2]));
    };

    return (
        <div className="flex items-center gap-4">
            <canvas
                ref={wheelRef}
                data-testid="colour-wheel"
                width={110}
                height={110}
                className="h-[110px] w-[110px] shrink-0 cursor-crosshair rounded-full shadow-[0_10px_30px_rgba(10,10,10,0.18)] ring-1 ring-ink/10"
                style={{ touchAction: "none" }}
                onPointerDown={(e) => {
                    dragging.current = true;
                    pick(e);
                }}
                onPointerMove={(e) => dragging.current && pick(e)}
                onPointerUp={() => (dragging.current = false)}
                onPointerLeave={() => (dragging.current = false)}
            />
            <div className="min-w-0 flex-1 space-y-3">
                <input
                    data-testid="colour-wheel-brightness"
                    type="range"
                    min="15"
                    max="100"
                    value={Math.round(hsv[2] * 100)}
                    onChange={(e) => {
                        const v = Number(e.target.value) / 100;
                        setHsv([hsv[0], hsv[1], v]);
                        onChange(hsvToHex(hsv[0], hsv[1], v));
                    }}
                    className="w-full accent-ink"
                />
                <p className="text-xs font-medium leading-snug text-ink/55">
                    Spin the wheel to choose a hue, slide for brightness — or type an exact
                    colour code below.
                </p>
            </div>
        </div>
    );
}

export default function ColourStudio() {
    const { user } = useAuth();
    const [image, setImage] = useState(null);
    const [brushSize, setBrushSize] = useState(26);
    const [eraseMode, setEraseMode] = useState(false);
    const [tapMode, setTapMode] = useState(true);
    const [brand, setBrand] = useState("popular");
    const [activeLayer, setActiveLayer] = useState("walls");
    const [layerColours, setLayerColours] = useState({
        walls: SWATCHES[1],
    });
    const [sheen, setSheen] = useState("matte");
    const [customHex, setCustomHex] = useState("#1F3A93");
    const [hexInput, setHexInput] = useState("#1F3A93");
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [email, setEmail] = useState("");
    const [emailState, setEmailState] = useState(null);
    const [emailing, setEmailing] = useState(false);
    const [strokes, setStrokes] = useState(0);
    const [tapCount, setTapCount] = useState(0);
    const [savedLooks, setSavedLooks] = useState(() => loadSavedLooks());
    const [showSaved, setShowSaved] = useState(false);
    const [savedFlash, setSavedFlash] = useState("");
    const [accountBusy, setAccountBusy] = useState(false);
    const [accountState, setAccountState] = useState(null);
    const [sampleImage, setSampleImage] = useState(null);
    const [loupe, setLoupe] = useState(null);
    const [plate, setPlate] = useState([]);
    const [plateBusy, setPlateBusy] = useState(false);
    const [plateFlash, setPlateFlash] = useState("");
    const [showSignin, setShowSignin] = useState(false);
    const [signinReason, setSigninReason] = useState("plate");
    const [favs, setFavs] = useState([]);
    const fileRef = useRef(null);
    const canvasRef = useRef(null);
    const imgRef = useRef(null);
    const drawing = useRef(false);
    const strokesRef = useRef({ walls: [] });
    const tapMaskRef = useRef({ walls: null });
    const sampleFileRef = useRef(null);
    const sampleImgRef = useRef(null);
    const sampleCanvasRef = useRef(null);
    const loupeRef = useRef(null);

    const userEmail = user && typeof user === "object" ? user.email : null;
    useEffect(() => {
        if (!userEmail) {
            setPlate([]);
            setFavs([]);
            return;
        }
        axios.get(`${API_BASE}/colours`, { withCredentials: true })
            .then(({ data }) => setPlate(data))
            .catch(() => {});
        axios.get(`${API_BASE}/favourites`, { withCredentials: true })
            .then(({ data }) => setFavs(data))
            .catch(() => {});
    }, [userEmail]);

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
        const scale = canvas.width / (canvas.getBoundingClientRect().width || 1);
        for (const kind of ["walls"]) {
            const col = SURFACES[kind].stroke;
            if (tapMaskRef.current[kind]) {
                ctx.drawImage(tapMaskRef.current[kind], 0, 0, canvas.width, canvas.height);
            }
            ctx.strokeStyle = col;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            for (const stroke of strokesRef.current[kind]) {
                ctx.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";
                ctx.strokeStyle = stroke.erase ? "rgba(0,0,0,1)" : col;
                ctx.lineWidth = Math.max(6, stroke.size * scale) * (stroke.erase ? 1.4 : 1);
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
            ctx.globalCompositeOperation = "source-over";
        }
        setStrokes(strokesRef.current[activeLayer].length);
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
        if (tapMode && imgRef.current) {
            // tap-to-select: the tapped surface joins the active layer's mask
            const pos = getPos(e);
            const region = regionFromPoint(imgRef.current, pos.x, pos.y, activeLayer);
            if (!tapMaskRef.current[activeLayer]) {
                const mc = document.createElement("canvas");
                mc.width = imgRef.current.naturalWidth;
                mc.height = imgRef.current.naturalHeight;
                tapMaskRef.current[activeLayer] = mc;
            }
            tapMaskRef.current[activeLayer].getContext("2d").drawImage(region, 0, 0);
            setTapCount((c) => c + 1);
            redraw();
            return;
        }
        drawing.current = true;
        e.target.setPointerCapture?.(e.pointerId);
        strokesRef.current[activeLayer].push({ size: brushSize, points: [getPos(e)], erase: eraseMode });
        redraw();
    };

    const onPointerMove = (e) => {
        if (!drawing.current) return;
        e.preventDefault();
        strokesRef.current[activeLayer][strokesRef.current[activeLayer].length - 1]?.points.push(getPos(e));
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
        strokesRef.current = { walls: [] };
        tapMaskRef.current = { walls: null };
        setTapCount(0);
        setStrokes(0);
        try {
            setImage(await fileToDataUrl(file));
        } catch {
            setError("That image could not be read — try a different photo.");
        }
    };

    const undo = () => {
        strokesRef.current[activeLayer].pop();
        redraw();
    };

    const clearBrush = () => {
        strokesRef.current[activeLayer] = [];
        tapMaskRef.current[activeLayer] = null;
        setTapCount(0);
        redraw();
    };

    const applyCustomHex = (hex, name = "Custom") => {
        setCustomHex(hex);
        setHexInput(hex);
        setLayerColours((c) => ({ ...c, [activeLayer]: { name, hex } }));
    };

    /* ---------- colour sampler: match a colour from an uploaded photo ---------- */
    const pickSampleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setSampleImage(await fileToDataUrl(file));
            setLoupe(null);
        } catch {
            setError("That image could not be read — try a different photo.");
        }
        e.target.value = "";
    };

    // pixel data comes lazily from the VISIBLE <img> (already loaded by the
    // time anyone hovers it) — no load-event timing to worry about
    const getSampleCtx = () => {
        const img = sampleImgRef.current;
        if (!img || !img.naturalWidth) return null;
        if (!sampleCanvasRef.current) sampleCanvasRef.current = document.createElement("canvas");
        const cv = sampleCanvasRef.current;
        if (cv.width !== img.naturalWidth || cv.height !== img.naturalHeight) {
            cv.width = img.naturalWidth;
            cv.height = img.naturalHeight;
            cv.getContext("2d").drawImage(img, 0, 0);
        }
        return cv.getContext("2d");
    };

    const hexAtEvent = (e) => {
        const ctx = getSampleCtx();
        if (!ctx) return null;
        const cv = sampleCanvasRef.current;
        const img = sampleImgRef.current;
        const r = img.getBoundingClientRect();
        // the photo renders object-contain — map the click through the letterbox
        // to the actual image content before reading the pixel
        const boxAspect = r.width / r.height;
        const imgAspect = cv.width / cv.height;
        let cw = r.width, ch = r.height;
        if (imgAspect > boxAspect) ch = r.width / imgAspect;
        else cw = r.height * imgAspect;
        const offX = (r.width - cw) / 2;
        const offY = (r.height - ch) / 2;
        const nx = Math.min(Math.max((e.clientX - r.left - offX) / cw, 0), 1);
        const ny = Math.min(Math.max((e.clientY - r.top - offY) / ch, 0), 1);
        const px = Math.min(cv.width - 1, Math.max(0, Math.round(nx * (cv.width - 1))));
        const py = Math.min(cv.height - 1, Math.max(0, Math.round(ny * (cv.height - 1))));
        const [rr, gg, bb] = ctx.getImageData(px, py, 1, 1).data;
        return { hex: rgbToHex(rr, gg, bb), px, py };
    };

    const onSampleMove = (e) => {
        const hit = hexAtEvent(e);
        if (!hit) return;
        const wrap = sampleImgRef.current.parentElement.getBoundingClientRect();
        setLoupe({ ...hit, x: e.clientX - wrap.left, y: e.clientY - wrap.top });
    };


    // pixel-zoom lens: drawn after render so the canvas ref exists
    useEffect(() => {
        if (!loupe || !loupeRef.current) return;
        const ctx = getSampleCtx();
        const lcv = loupeRef.current;
        if (!ctx) return;
        const cv = sampleCanvasRef.current;
        const lctx = lcv.getContext("2d");
        lctx.imageSmoothingEnabled = false;
        lctx.fillStyle = "#ffffff";
        lctx.fillRect(0, 0, lcv.width, lcv.height);
        const srcR = Math.max(8, Math.round(cv.width / 48));
        const sx = Math.min(Math.max(loupe.px - srcR / 2, 0), Math.max(0, cv.width - srcR));
        const sy = Math.min(Math.max(loupe.py - srcR / 2, 0), Math.max(0, cv.height - srcR));
        lctx.drawImage(cv, sx, sy, srcR, srcR, 0, 0, lcv.width, lcv.height);
    }, [loupe]);

    const onSampleApply = (e) => {
        const hit = hexAtEvent(e);
        if (!hit) return;
        applyCustomHex(hit.hex, "Photo match");
        setPlateFlash(`Matched ${hit.hex.toUpperCase()} — fine-tune with the wheel, then save it to your plate.`);
        setTimeout(() => setPlateFlash(""), 3000);
    };

    const applySampleAverage = () => {
        const ctx = getSampleCtx();
        if (!ctx) return;
        const cv = sampleCanvasRef.current;
        const small = document.createElement("canvas");
        small.width = 32;
        small.height = 32;
        const sctx = small.getContext("2d");
        sctx.drawImage(cv, 0, 0, 32, 32);
        const d = sctx.getImageData(0, 0, 32, 32).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < 32 * 32; i++) {
            r += d[i * 4]; g += d[i * 4 + 1]; b += d[i * 4 + 2];
        }
        const hex = rgbToHex(Math.round(r / (32 * 32)), Math.round(g / (32 * 32)), Math.round(b / (32 * 32)));
        applyCustomHex(hex, "Photo match");
        setPlateFlash(`Matched ${hex.toUpperCase()} from the screenshot — save it to your plate.`);
        setTimeout(() => setPlateFlash(""), 3000);
    };

    const saveToPlate = async () => {
        if (!user) {
            setShowSignin(true);
            return;
        }
        if (plate.some((c) => c.hex === normaliseHex(customHex))) {
            setPlateFlash("That colour is already on your plate ✓");
            setTimeout(() => setPlateFlash(""), 3000);
            return;
        }
        setPlateBusy(true);
        try {
            const { data } = await axios.post(
                `${API_BASE}/colours`,
                { name: layerColours[activeLayer].name, hex: activeHex },
                { withCredentials: true, timeout: 30000 }
            );
            setPlate((p) => [data, ...p]);
            setPlateFlash("Saved to your colour plate ✓");
        } catch (err) {
            setPlateFlash(err.response?.data?.detail || "Couldn't save — please try again.");
        } finally {
            setPlateBusy(false);
            setTimeout(() => setPlateFlash(""), 3000);
        }
    };

    const removeFromPlate = async (id) => {
        try {
            await axios.delete(`${API_BASE}/colours/${id}`, { withCredentials: true });
            setPlate((p) => p.filter((c) => c.id !== id));
        } catch {
            /* already gone */
        }
    };

    /* ---------- favourites: heart the colour you love ---------- */
    const activeHex = normaliseHex(layerColours[activeLayer].hex);
    const favNow = favs.find((f) => f.hex === activeHex);

    const toggleFavourite = async () => {
        if (!user) {
            setSigninReason("favourites");
            setShowSignin(true);
            return;
        }
        try {
            if (favNow) {
                await axios.delete(`${API_BASE}/favourites/${favNow.id}`, { withCredentials: true });
                setFavs((f) => f.filter((x) => x.id !== favNow.id));
            } else {
                const { data } = await axios.post(
                    `${API_BASE}/favourites`,
                    { name: layerColours[activeLayer].name, hex: activeHex, code: layerColours[activeLayer].code || "" },
                    { withCredentials: true }
                );
                setFavs((f) => [data, ...f]);
                setPlateFlash("Added to your favourites ♥");
                setTimeout(() => setPlateFlash(""), 3000);
            }
        } catch (err) {
            setPlateFlash(err.response?.data?.detail || "Couldn't update favourites — please try again.");
            setTimeout(() => setPlateFlash(""), 3000);
        }
    };

    const removeFavourite = async (id) => {
        try {
            await axios.delete(`${API_BASE}/favourites/${id}`, { withCredentials: true });
            setFavs((f) => f.filter((x) => x.id !== id));
        } catch {
            /* already gone */
        }
    };

    const generate = () => {
        if (!image || !imgRef.current) return;
        const layers = ["walls"]
            .filter((k) => strokesRef.current[k].length || tapMaskRef.current[k])
            .map((kind) => ({ kind, hex: layerColours[kind].hex }));
        if (!layers.length) {
            setError("Tap a surface or brush over the area you'd like repainted first.");
            return;
        }
        setError("");
        setBusy(true);
        recolourLayers(imgRef.current, canvasRef.current, layers, sheen, (after) => {
            const parts = layers.map(
                (l) => `${SURFACES[l.kind].label}: ${layerColours[l.kind].name}${layerColours[l.kind].code ? " · " + layerColours[l.kind].code : ""} (${l.hex.toUpperCase()})`
            );
            setResult({ image: after, prompt: `${parts.join(" | ")} — ${sheen} finish` });
            setBusy(false);
        });
    };

    const reset = () => {
        setResult(null);
        setEmailState(null);
    };

    const saveLook = async () => {
        if (!result) return;
        try {
            const [beforeT, afterT] = await Promise.all([makeThumb(image), makeThumb(result.image)]);
            const entry = {
                id: `${Date.now()}`,
                at: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
                before: beforeT,
                after: afterT,
                prompt: result.prompt,
                sheen,
            };
            const next = [entry, ...savedLooks].slice(0, 12);
            localStorage.setItem(LOOKS_KEY, JSON.stringify(next));
            setSavedLooks(next);
            setSavedFlash("Saved to your looks ✓");
            setTimeout(() => setSavedFlash(""), 2500);
        } catch {
            setSavedFlash("Couldn't save — your browser storage is full.");
        }
    };

    const deleteLook = (id) => {
        const next = savedLooks.filter((l) => l.id !== id);
        setSavedLooks(next);
        localStorage.setItem(LOOKS_KEY, JSON.stringify(next));
    };

    const openLook = (look) => {
        setResult({ image: look.after, prompt: look.prompt });
        setShowSaved(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const shareLook = async () => {
        if (!result) return;
        const text = `Hi TMN — here's the look I created: ${result.prompt}. I'd love a quote for this.`;
        try {
            const blob = await (await fetch(result.image)).blob();
            const file = new File([blob], "tmn-my-look.jpg", { type: "image/jpeg" });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: "My TMN look", text });
                return;
            }
        } catch {
            /* dismissed or unsupported — fall through to download + WhatsApp */
        }
        const a = document.createElement("a");
        a.href = result.image;
        a.download = "tmn-my-look.jpg";
        a.click();
        window.open(waLink(text + " (I've saved the photo — attaching it here)"), "_blank");
    };

    const saveToAccount = async () => {
        if (!result) return;
        setAccountBusy(true);
        setAccountState(null);
        try {
            await axios.post(
                `${API_BASE}/looks`,
                { image: result.image, prompt: result.prompt, sheen },
                { withCredentials: true, timeout: 60000 }
            );
            setAccountState({ ok: true, msg: "Saved to your account — find it in your portal any time." });
        } catch (err) {
            setAccountState({ ok: false, msg: err.response?.data?.detail || "Couldn't save — please try again." });
        } finally {
            setAccountBusy(false);
        }
    };

    const sendToTmn = async () => {
        if (!result) return;
        setAccountBusy(true);
        setAccountState(null);
        try {
            const { data: look } = await axios.post(
                `${API_BASE}/looks`,
                { image: result.image, prompt: result.prompt, sheen },
                { withCredentials: true, timeout: 60000 }
            );
            await axios.post(`${API_BASE}/looks/${look.id}/send`, {}, { withCredentials: true, timeout: 60000 });
            setAccountState({ ok: true, msg: "Sent to TMN — we'll reply in your account chat shortly." });
        } catch (err) {
            setAccountState({ ok: false, msg: err.response?.data?.detail || "Couldn't send — please try again." });
        } finally {
            setAccountBusy(false);
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

    const list = BRANDS[brand].list;
    const activeColour = layerColours[activeLayer];

    return (
        <section id="colours" data-testid="colour-studio" className="relative overflow-x-hidden py-20 sm:py-28">
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
                            Upload a photo, brush or tap over the walls, pick a paint
                            colour and see it instantly — drag the slider to compare.
                        </p>
                    </FadeUp>
                </div>

                <div className="grid gap-10 [&>*]:min-w-0 lg:grid-cols-[1fr_1.25fr] lg:gap-16">
                    {/* controls */}
                    <FadeUp delay={0.1} mount>
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
                                    <div className="flex items-start gap-2.5 rounded-xl bg-[#C6A55C]/10 px-4 py-3" data-testid="colour-guide">
                                        <MousePointerClick className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink/60" />
                                        <p className="text-xs font-medium leading-relaxed text-ink/70" data-testid="colour-guide-text">
                                            For the best result tap each wall. Missed a patch? Tap it again — or switch to Brush to highlight it by hand.
                                        </p>
                                    </div>
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

                                    <div>
                                        <p className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/55">
                                            <Layers className="h-3.5 w-3.5" /> Surface — paint each one its own colour
                                        </p>
                                        <div className="grid grid-cols-2 gap-2.5">
                                            {Object.entries(SURFACES).map(([kind, s]) => {
                                                const active = activeLayer === kind;
                                                const done = tapCount > 0 || strokesRef.current[kind].length > 0;
                                                return (
                                                    <button
                                                        key={kind}
                                                        data-testid={`colour-layer-${kind}`}
                                                        onClick={() => setActiveLayer(kind)}
                                                        className={`flex items-center gap-2.5 rounded-2xl border-2 px-4 py-3 text-left transition-colors ${
                                                            active ? "border-ink bg-ink/[0.04]" : "border-ink/15 hover:border-ink/40"
                                                        }`}
                                                    >
                                                        <span
                                                            className="h-4 w-4 shrink-0 rounded-full ring-2 ring-white"
                                                            style={{ backgroundColor: layerColours[kind].hex }}
                                                        />
                                                        <span>
                                                            <span className={`block font-display text-sm font-bold uppercase tracking-tight ${active ? "text-ink" : "text-ink/70"}`}>
                                                                {s.label}
                                                            </span>
                                                            <span className="block text-[10px] font-medium uppercase tracking-wider text-ink/45">
                                                                {done ? "ready" : "not marked yet"}
                                                            </span>
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
                                        <div className="mb-2 flex items-center justify-between gap-3">
                                            <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/55">
                                                <Paintbrush className="h-3.5 w-3.5" /> {tapMode ? "Tap select" : eraseMode ? "Eraser" : "Brush"}
                                            </p>
                                            <div className="flex gap-1.5">
                                                <button
                                                    data-testid="colour-brush-mode-brush"
                                                    onClick={() => { setTapMode(false); setEraseMode(false); }}
                                                    className={`rounded-full px-3.5 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.15em] transition-colors ${
                                                        !eraseMode && !tapMode ? "bg-ink text-paper" : "border border-ink/25 text-ink/65 hover:border-ink hover:text-ink"
                                                    }`}
                                                >
                                                    Brush
                                                </button>
                                                <button
                                                    data-testid="colour-brush-mode-erase"
                                                    onClick={() => { setTapMode(false); setEraseMode(true); }}
                                                    className={`rounded-full px-3.5 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.15em] transition-colors ${
                                                        eraseMode ? "bg-ink text-paper" : "border border-ink/25 text-ink/65 hover:border-ink hover:text-ink"
                                                    }`}
                                                >
                                                    Erase
                                                </button>
                                                <button
                                                    data-testid="colour-brush-mode-tap"
                                                    onClick={() => setTapMode((t) => !t)}
                                                    className={`rounded-full px-3.5 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.15em] transition-colors ${
                                                        tapMode ? "bg-ink text-paper" : "border border-ink/25 text-ink/65 hover:border-ink hover:text-ink"
                                                    }`}
                                                >
                                                    Tap
                                                </button>
                                            </div>
                                        </div>
                                        {tapMode && (
                                            <p className="mt-2 text-[11px] font-medium text-ink/45" data-testid="colour-tap-hint">
                                                Tap any part of the wall to select that whole area.
                                            </p>
                                        )}
                                        <input
                                            data-testid="colour-brush-size"
                                            type="range"
                                            min="8"
                                            max="80"
                                            value={brushSize}
                                            onChange={(e) => setBrushSize(Number(e.target.value))}
                                            className="w-full accent-ink"
                                        />
                                    </div>

                                    <div>
                                        <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/55">
                                            Pick your paint — {SURFACES[activeLayer].label.toLowerCase()}
                                        </p>
                                        <div className="mb-3 flex flex-wrap gap-1.5">
                                            {Object.entries(BRANDS).map(([key, b]) => (
                                                <button
                                                    key={key}
                                                    data-testid={`colour-brand-${key}`}
                                                    onClick={() => setBrand(key)}
                                                    className={`rounded-full px-3.5 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.15em] transition-colors ${
                                                        brand === key
                                                            ? "bg-ink text-paper"
                                                            : "border border-ink/25 text-ink/65 hover:border-ink hover:text-ink"
                                                    }`}
                                                >
                                                    {b.label}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="flex flex-wrap gap-2.5">
                                            {list.map((s) => {
                                                const active = activeColour.name === s.name;
                                                return (
                                                    <button
                                                        key={s.name}
                                                        data-testid={`colour-swatch-${s.name.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                                                        onClick={() => {
                                                            setLayerColours((c) => ({ ...c, [activeLayer]: s }));
                                                            setCustomHex(s.hex);
                                                            setHexInput(s.hex);
                                                        }}
                                                        title={`${s.name}${s.code ? " · " + s.code : ""}`}
                                                        className={`h-10 w-10 rounded-full border-2 transition-transform duration-200 hover:scale-110 ${
                                                            active ? "scale-110 border-ink ring-2 ring-ink/30" : "border-ink/15"
                                                        }`}
                                                        style={{ backgroundColor: s.hex }}
                                                    >
                                                        <span className="sr-only">{s.name}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-bold uppercase tracking-wide text-ink/75" data-testid="colour-active-name">
                                                {activeColour.name}
                                                {activeColour.code ? <span className="ml-2 font-mono text-[10px] font-medium text-ink/50">{activeColour.code}</span> : null}
                                                <span className="ml-2 font-mono text-[10px] font-medium text-ink/50" data-testid="colour-active-hex">{activeColour.hex.toUpperCase()}</span>
                                            </p>
                                            <button
                                                data-testid="colour-favourite-toggle"
                                                onClick={toggleFavourite}
                                                title={favNow ? "Remove from favourites" : "Add to favourites"}
                                                className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
                                                    favNow
                                                        ? "border-[#C6A55C] bg-[#C6A55C]/15 text-ink"
                                                        : "border-ink/25 text-ink/60 hover:border-ink hover:text-ink"
                                                }`}
                                            >
                                                <Heart className={`h-3.5 w-3.5 ${favNow ? "fill-[#C6A55C] text-[#C6A55C]" : ""}`} />
                                                {favNow ? "Favourited" : "Favourite"}
                                            </button>
                                        </div>
                                        <p className="mt-1 text-[11px] font-medium text-ink/45">
                                            Brand colours are close digital matches — always order a
                                            sample pot before committing.
                                        </p>
                                    </div>

                                    <div className="rounded-2xl border border-ink/10 bg-ink/[0.03] p-4">
                                        <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/55">
                                            Custom colour — wheel or code
                                        </p>
                                        <ColourWheel hex={customHex} onChange={applyCustomHex} />
                                        <div className="mt-3 flex items-center gap-2.5">
                                            <input
                                                data-testid="colour-code-input"
                                                type="text"
                                                value={hexInput}
                                                onChange={(e) => setHexInput(e.target.value)}
                                                onKeyDown={(e) => e.key === "Enter" && isValidHex(hexInput) && applyCustomHex(normaliseHex(hexInput))}
                                                placeholder="Colour code e.g. 1F3A93"
                                                className="min-w-0 flex-1 rounded-full border border-ink/20 bg-white px-4 py-2.5 font-mono text-sm font-medium placeholder:text-ink/40 focus:border-ink focus:outline-none"
                                            />
                                            <button
                                                data-testid="colour-code-apply"
                                                onClick={() => isValidHex(hexInput) && applyCustomHex(normaliseHex(hexInput))}
                                                className={`rounded-full px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] transition-colors ${
                                                    isValidHex(hexInput)
                                                        ? "bg-ink text-paper hover:opacity-90"
                                                        : "cursor-not-allowed bg-ink/10 text-ink/40"
                                                }`}
                                            >
                                                Apply
                                            </button>
                                        </div>
                                        {!isValidHex(hexInput) && hexInput.trim() !== "" && (
                                            <p className="mt-2 text-xs font-medium text-red-700">
                                                That doesn't look like a colour code — use hex like
                                                1F3A93 or 039.
                                            </p>
                                        )}
                                    </div>

                                    <div className="rounded-2xl border border-ink/10 bg-ink/[0.03] p-4" data-testid="colour-sampler">
                                        <p className="mb-1 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/55">
                                            <Pipette className="h-3.5 w-3.5" /> Match a colour from a photo
                                        </p>
                                        <p className="mb-3 text-[11px] font-medium leading-relaxed text-ink/45">
                                            Upload a close-up of the wall or a screenshot of a colour you
                                            love — zoom in, tap the exact spot and we&#39;ll match it.
                                        </p>
                                        {!sampleImage ? (
                                            <label
                                                data-testid="colour-sample-upload"
                                                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-ink/30 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                                            >
                                                <Upload className="h-3.5 w-3.5" /> Upload photo or screenshot
                                                <input
                                                    ref={sampleFileRef}
                                                    data-testid="colour-sample-input"
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={pickSampleFile}
                                                />
                                            </label>
                                        ) : (
                                            <div className="space-y-3">
                                                <div className="relative select-none overflow-hidden rounded-xl ring-1 ring-ink/10" data-testid="colour-sample-stage">
                                                    <img
                                                        ref={sampleImgRef}
                                                        src={sampleImage}
                                                        alt="Colour reference"
                                                        data-testid="colour-sample-img"
                                                        className="block max-h-[280px] w-full cursor-crosshair object-contain"
                                                        draggable={false}
                                                        onPointerMove={onSampleMove}
                                                        onPointerLeave={() => setLoupe(null)}
                                                        onPointerDown={onSampleApply}
                                                    />
                                                    {loupe && (
                                                        <div
                                                            className="pointer-events-none absolute z-10 flex flex-col items-center"
                                                            style={{ left: loupe.x, top: loupe.y, transform: "translate(-50%, -115%)" }}
                                                            data-testid="colour-sample-loupe"
                                                        >
                                                            <canvas
                                                                ref={loupeRef}
                                                                width={84}
                                                                height={84}
                                                                className="rounded-full shadow-[0_10px_30px_rgba(10,10,10,0.25)] ring-2 ring-white"
                                                            />
                                                            <span className="mt-1 rounded-full bg-ink px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.1em] text-paper">
                                                                {loupe.hex.toUpperCase()}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                                    <button
                                                        data-testid="colour-sample-average"
                                                        onClick={applySampleAverage}
                                                        className="inline-flex items-center gap-1.5 rounded-full border border-ink/30 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                                                    >
                                                        Use average of screenshot
                                                    </button>
                                                    <button
                                                        data-testid="colour-sample-remove"
                                                        onClick={() => { setSampleImage(null); setLoupe(null); }}
                                                        className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink/60 hover:text-ink"
                                                    >
                                                        <Trash2 className="h-3 w-3" /> Remove
                                                    </button>
                                                    <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">
                                                        Tap the photo to sample that exact pixel
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        <div className="mt-4 border-t border-ink/10 pt-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/55">
                                                    My colour plate
                                                </p>
                                                <button
                                                    data-testid="colour-plate-save"
                                                    onClick={saveToPlate}
                                                    disabled={plateBusy}
                                                    className="rounded-full bg-ink px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
                                                >
                                                    {plateBusy ? "Saving…" : user ? "Save this colour" : "Save to my plate"}
                                                </button>
                                            </div>
                                            {plate.length > 0 ? (
                                                <div className="mt-3 flex flex-wrap gap-3">
                                                    {plate.map((c, i) => (
                                                        <div key={c.id} className="group relative">
                                                            <button
                                                                data-testid={`colour-plate-swatch-${i}`}
                                                                onClick={() => applyCustomHex(c.hex, c.name)}
                                                                title={`${c.name} ${c.hex}`}
                                                                className="h-9 w-9 rounded-full shadow-md ring-2 ring-white transition-transform hover:scale-110"
                                                                style={{ backgroundColor: c.hex }}
                                                            >
                                                                <span className="sr-only">{c.name}</span>
                                                            </button>
                                                            <button
                                                                data-testid={`colour-plate-delete-${i}`}
                                                                onClick={() => removeFromPlate(c.id)}
                                                                title={`Remove ${c.name}`}
                                                                className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-ink font-mono text-[8px] font-bold text-paper opacity-0 transition-opacity group-hover:opacity-100"
                                                            >
                                                                <X className="h-2.5 w-2.5" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="mt-2 text-[11px] font-medium text-ink/45">
                                                    {user
                                                        ? "Colours you save appear here on every visit."
                                                        : "Sign in to keep your custom colours on your plate."}
                                                </p>
                                            )}
                                            {favs.length > 0 && (
                                                <div className="mt-3 border-t border-ink/10 pt-3" data-testid="colour-favourites-row">
                                                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/55">
                                                        Your favourites
                                                    </p>
                                                    <div className="mt-2 flex flex-wrap gap-3">
                                                        {favs.map((f, i) => (
                                                            <div key={f.id} className="group relative">
                                                                <button
                                                                    data-testid={`colour-fav-swatch-${i}`}
                                                                    onClick={() => applyCustomHex(f.hex, f.name)}
                                                                    title={`${f.name} ${f.hex}`}
                                                                    className="h-9 w-9 rounded-full shadow-md ring-2 ring-white transition-transform hover:scale-110"
                                                                    style={{ backgroundColor: f.hex }}
                                                                >
                                                                    <span className="sr-only">{f.name}</span>
                                                                </button>
                                                                <button
                                                                    data-testid={`colour-fav-delete-${i}`}
                                                                    onClick={() => removeFavourite(f.id)}
                                                                    title={`Remove ${f.name} from favourites`}
                                                                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-ink font-mono text-[8px] font-bold text-paper opacity-0 transition-opacity group-hover:opacity-100"
                                                                >
                                                                    <X className="h-2.5 w-2.5" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {plateFlash && (
                                                <p className="mt-2 text-xs font-medium text-ink/70" data-testid="colour-plate-flash">
                                                    {plateFlash}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/55">
                                            Finish
                                        </p>
                                        <div className="grid grid-cols-3 gap-2">
                                            {SHEENS.map((s) => (
                                                <button
                                                    key={s}
                                                    data-testid={`colour-sheen-${s}`}
                                                    onClick={() => setSheen(s)}
                                                    className={`rounded-xl border-2 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] transition-colors ${
                                                        sheen === s
                                                            ? "border-ink bg-ink text-paper"
                                                            : "border-ink/20 text-ink/65 hover:border-ink hover:text-ink"
                                                    }`}
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                        <p className="mt-2 text-[11px] font-medium text-ink/45">
                                            {sheen === "matte" && "Flat, modern, no shine — the current UK favourite."}
                                            {sheen === "silk" && "A gentle soft sheen that catches the light."}
                                            {sheen === "gloss" && "High shine with strong light reflections."}
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
                    <FadeUp delay={0.2} mount>
                        <div className="rounded-3xl border border-ink/10 bg-white/85 p-6 shadow-[0_24px_70px_rgba(10,10,10,0.09)] sm:p-8">
                            {result ? (
                                <div className="space-y-5">
                                    <BeforeAfter before={image} after={result.image} />

                                    <p className="rounded-xl bg-ink/5 p-3 font-mono text-[10px] font-medium leading-relaxed text-ink/65">
                                        Colour applied: {result.prompt} — like it? We do this for real.
                                    </p>

                                    {savedFlash && (
                                        <p className="rounded-xl bg-green-50 p-3 text-sm font-medium text-green-800" data-testid="colour-saved-flash">
                                            {savedFlash}
                                        </p>
                                    )}

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
                                            data-testid="colour-save-look"
                                            onClick={saveLook}
                                            className="inline-flex items-center gap-2 rounded-full border border-ink/25 px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                                        >
                                            <Bookmark className="h-4 w-4" /> Save this look
                                        </button>
                                        <button
                                            data-testid="colour-share-look"
                                            onClick={shareLook}
                                            className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white transition-transform hover:scale-105 active:scale-95"
                                        >
                                            <Share2 className="h-4 w-4" /> Share my look
                                        </button>
                                        <button
                                            data-testid="colour-try-another"
                                            onClick={reset}
                                            className="inline-flex items-center gap-2 rounded-full border border-ink/25 px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                                        >
                                            <Sparkles className="h-4 w-4" /> Try another colour
                                        </button>
                                        <a
                                            href={waLink(
                                                result
                                                    ? `Hi TMN — I tested colours with your visualiser: ${result.prompt}. I'd like a quote for this look.`
                                                    : "Hi TMN — I tested colours with your visualiser and I'd like a quote."
                                            )}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            data-testid="colour-quote-link"
                                            className="inline-flex items-center gap-2 rounded-full bg-[#C6A55C] px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white transition-transform hover:scale-105 active:scale-95"
                                        >
                                            Get this look — quote
                                        </a>
                                    </div>

                                    {user ? (
                                        <div className="rounded-2xl border border-ink/10 bg-white/90 p-5" data-testid="visualiser-account-actions">
                                            <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/60">
                                                Your account
                                            </p>
                                            {accountState && (
                                                <p
                                                    className={`mb-3 rounded-xl p-3 text-sm font-medium ${
                                                        accountState.ok ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"
                                                    }`}
                                                    data-testid="visualiser-account-status"
                                                >
                                                    {accountState.msg}
                                                </p>
                                            )}
                                            <div className="flex flex-wrap gap-2.5">
                                                <button
                                                    data-testid="colour-save-account"
                                                    onClick={saveToAccount}
                                                    disabled={accountBusy}
                                                    className="rounded-full border border-ink/30 px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper disabled:opacity-40"
                                                >
                                                    {accountBusy ? "Working…" : "Save to my account"}
                                                </button>
                                                <button
                                                    data-testid="colour-send-chat"
                                                    onClick={sendToTmn}
                                                    disabled={accountBusy}
                                                    className="rounded-full bg-ink px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                                                >
                                                    {accountBusy ? "Working…" : "Send to TMN"}
                                                </button>
                                            </div>
                                            <p className="mt-2 text-[11px] font-medium text-ink/45">
                                                Signed in as {user.email} — saved looks live in your
                                                portal; sending lands in our chat with the image.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="rounded-2xl border border-ink/10 bg-ink/[0.03] p-5" data-testid="visualiser-signup-cta">
                                            <p className="text-sm font-medium leading-relaxed text-ink/70">
                                                Want to save your looks to an account and send them
                                                straight to us?{" "}
                                                <Link
                                                    to="/login"
                                                    data-testid="visualiser-signup-link"
                                                    className="font-bold text-ink underline underline-offset-2"
                                                >
                                                    Sign up or log in
                                                </Link>{" "}
                                                — it takes a minute. Or just{" "}
                                                <a
                                                    href={waLink("Hi TMN — I made a look in your visualiser and I'd like a quote.")}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="font-bold text-ink underline underline-offset-2"
                                                >
                                                    ask on WhatsApp
                                                </a>
                                                .
                                            </p>
                                        </div>
                                    )}

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
                                        Your before &amp; after appears here — tap a wall,
                                        pick a colour and drag the slider to reveal your newly
                                        painted home.
                                    </p>
                                </div>
                            )}
                        </div>
                    </FadeUp>
                </div>

                {/* saved looks gallery */}
                {savedLooks.length > 0 && (
                    <div className="mt-10">
                        <button
                            data-testid="colour-my-looks-toggle"
                            onClick={() => setShowSaved((s) => !s)}
                            className="inline-flex items-center gap-2 rounded-full border border-ink/25 px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                        >
                            <Bookmark className="h-4 w-4" /> My looks ({savedLooks.length})
                        </button>
                        {showSaved && (
                            <div data-testid="colour-saved-grid" className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                                {savedLooks.map((look) => (
                                    <div
                                        key={look.id}
                                        data-testid="colour-saved-card"
                                        className="group overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-[0_10px_30px_rgba(10,10,10,0.08)]"
                                    >
                                        <button onClick={() => openLook(look)} className="block w-full text-left">
                                            <img src={look.after} alt={look.prompt} className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                            <p className="truncate px-3 pt-2 text-[11px] font-bold uppercase tracking-wide text-ink/80">
                                                {look.prompt}
                                            </p>
                                            <p className="px-3 pb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink/45">
                                                {look.at} · {look.sheen}
                                            </p>
                                        </button>
                                        <button
                                            data-testid="colour-saved-delete"
                                            onClick={() => deleteLook(look.id)}
                                            className="flex w-full items-center justify-center gap-1.5 border-t border-ink/10 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-red-700/70 hover:bg-red-50 hover:text-red-700"
                                        >
                                            <Trash2 className="h-3 w-3" /> Remove
                                        </button>
                                    </div>
                                ))}
                            <button
                                onClick={() => setShowSaved(false)}
                                className="col-span-full mt-1 inline-flex items-center justify-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink/50 hover:text-ink"
                            >
                                <X className="h-3 w-3" /> Close my looks
                            </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
            <Dialog open={showSignin} onOpenChange={setShowSignin}>
                <DialogContent className="rounded-2xl border-ink/10 bg-paper text-ink sm:max-w-md" data-testid="colour-signin-popup">
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-bold uppercase tracking-tight text-ink">
                            {signinReason === "favourites" ? "Save the colours you love" : "Save it to your colour plate"}
                        </DialogTitle>
                        <DialogDescription className="text-sm font-medium leading-relaxed text-ink/60">
                            {signinReason === "favourites"
                                ? "Sign in or create an account to keep the colours you favourite — they'll be here every time you visit."
                                : "You can only save custom upload colours to your colour plate. Sign in or create an account to keep them — they'll be here every time you visit."}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex-row gap-2 sm:justify-start">
                        <Link
                            to="/login"
                            data-testid="colour-signin-link"
                            onClick={() => setShowSignin(false)}
                            className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-90"
                        >
                            Sign in
                        </Link>
                        <Link
                            to="/login?mode=register"
                            data-testid="colour-signup-link"
                            onClick={() => setShowSignin(false)}
                            className="inline-flex items-center justify-center rounded-full border border-ink/30 px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                        >
                            Create account
                        </Link>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
    );
}
