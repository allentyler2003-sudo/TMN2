/* Test harness for the TAP-TO-SELECT fill (regionFromPoint) from
   frontend/src/lib/colour.js — runs in Node (canvas stubbed, bilinear
   filtering to mimic the browser). Scenarios:
   T1 gravel leak: flat wall beside heavy gravel texture split by a soft
       ramp — the fill must stop on the straight boundary, never wander
       into the gravel, and the boundary must be STRAIGHT (low row-to-row
       wobble), not jagged.
   T2 house with dark gutter: tapping the wall must paint the wall only.
   T3 tapping the door must paint the door only.
   T4 textured render wall: texture must not stop the fill covering it.
   T5 two taps accumulate: door + wall both selectable on one photo. */

let failures = 0;
let passes = 0;

function makeCanvasStub() {
    function createCanvas(w = 0, h = 0) {
        const cv = {
            width: w, height: h, _data: null, _fallbackUsed: false,
            getContext() {
                const ctx = {
                    imageSmoothingEnabled: true, fillStyle: "",
                    drawImage(src, dx, dy, dw, dh) {
                        const sw = src.naturalWidth || src.width;
                        const sh = src.naturalHeight || src.height;
                        const sdata = src._data;
                        if (!sdata) throw new Error("drawImage: source has no pixel data");
                        const tw = cv.width, th = cv.height;
                        const out = new Uint8ClampedArray(tw * th * 4);
                        for (let y = 0; y < th; y++) {
                            const fy = Math.max(0, Math.min(sh - 1.001, ((y - (dy || 0)) / dh) * sh - 0.5));
                            const y0 = Math.floor(fy), y1 = y0 + 1, wy = fy - y0;
                            for (let x = 0; x < tw; x++) {
                                const fx = Math.max(0, Math.min(sw - 1.001, ((x - (dx || 0)) / dw) * sw - 0.5));
                                const x0 = Math.floor(fx), x1 = x0 + 1, wx = fx - x0;
                                const tp = (y * tw + x) * 4;
                                for (let c = 0; c < 4; c++) {
                                    out[tp + c] = sdata[(y0 * sw + x0) * 4 + c] * (1 - wx) * (1 - wy) +
                                        sdata[(y0 * sw + x1) * 4 + c] * wx * (1 - wy) +
                                        sdata[(y1 * sw + x0) * 4 + c] * (1 - wx) * wy +
                                        sdata[(y1 * sw + x1) * 4 + c] * wx * wy;
                                }
                            }
                        }
                        cv._data = out;
                    },
                    getImageData(px, py, w, h) {
                        if (!cv._data) return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
                        return { data: new Uint8ClampedArray(cv._data), width: w, height: h };
                    },
                    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
                    putImageData(imgData) { cv._data = new Uint8ClampedArray(imgData.data); },
                };
                return ctx;
            },
        };
        return cv;
    }
    return { createElement: () => createCanvas() };
}

globalThis.document = makeCanvasStub();

const { regionFromPoint } = await import("./colour_copy.mjs");

/* ---------- synthetic photo builders (W=800, H=600) ---------- */
const W = 800;
const H = 600;

function blankImg() {
    return { naturalWidth: W, naturalHeight: H, _data: new Uint8ClampedArray(W * H * 4) };
}
function setPx(img, x, y, r, g, b) {
    const p = (y * W + x) * 4;
    img._data[p] = r;
    img._data[p + 1] = g;
    img._data[p + 2] = b;
    img._data[p + 3] = 255;
}
function mix(c1, c2, t) {
    return c1.map((v, i) => Math.round(v * (1 - t) + c2[i] * t));
}
function noise(amp) {
    return Math.round((Math.random() - 0.5) * amp);
}

/* T1: flat wall (left) vs heavy gravel texture (right), soft 8px ramp between */
function buildGravelWall() {
    const img = blankImg();
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let c;
            if (x < 396) c = [243, 241, 236];
            else if (x < 404) c = mix([243, 241, 236], [150, 148, 145], (x - 396) / 8);
            else c = [150, 148, 145];
            if (x >= 404) setPx(img, x, y, 150 + noise(60), 148 + noise(60), 145 + noise(60));
            else setPx(img, x, y, c[0] + noise(4), c[1] + noise(4), c[2] + noise(4));
        }
    }
    return img;
}

/* T2/T3/T5: house exterior with a DARK GUTTER line under the sky (real
   houses have one) — sky, wall, framed door, ground */
function buildTapHouse() {
    const img = blankImg();
    const skyTop = [203, 219, 238];
    const skyHorizon = [233, 237, 243];
    const wall = [243, 241, 236];
    const door = [224, 221, 214];
    const frame = [120, 120, 118];
    const ground = [150, 150, 148];
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let c;
            if (y < 198) c = mix(skyTop, skyHorizon, y / 198);
            else if (y < 210) c = [110, 108, 104]; // dark gutter/roofline
            else if (y < 444) c = mix(wall, [238, 236, 230], y / 600);
            else c = mix(ground, [138, 138, 136], (y - 444) / 156);
            if (x >= 116 && x < 284 && y >= 296 && y < 444) {
                if (x < 124 || x >= 276 || y < 304) c = frame;
                else c = door;
            }
            setPx(img, x, y, c[0] + noise(4), c[1] + noise(4), c[2] + noise(4));
        }
    }
    return img;
}

/* T4: full-frame textured render wall (mild roughcast texture) */
function buildTexturedWall() {
    const img = blankImg();
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
            setPx(img, x, y, 236 + noise(18), 232 + noise(18), 224 + noise(18));
    return img;
}

/* ---------- analysis ---------- */
const REGION_SETS = {
    gravel: { wall: [0, 392, 20, 580], gravel: [410, W, 0, H] },
    taphouse: {
        sky: [0, W, 0, 194], door: [124, 276, 308, 440], ground: [0, W, 456, H],
        wallL: [0, 112, 214, 444], wallR: [288, W, 214, 444], // wall strips clear of the door+frame box
    },
};

function coverage(mask, regionSetName, limits) {
    const REGIONS = REGION_SETS[regionSetName];
    const d = mask._data;
    let soft = 0;
    for (let i = 0; i < W * H; i++) {
        const a = d[i * 4 + 3];
        if (a !== 0 && a !== 255) soft++;
    }
    let ok = true;
    if (soft > 0) {
        console.log(`    ✗ ${soft} soft-edge pixels — mask edges not crisp`);
        ok = false;
    }
    const stats = {};
    for (const [name, [x0, x1, y0, y1]] of Object.entries(REGIONS)) {
        let hit = 0;
        let total = 0;
        for (let y = y0; y < y1; y++)
            for (let x = x0; x < x1; x++) {
                total++;
                const p = (y * W + x) * 4;
                if (d[p] > 40 && d[p + 2] < 140) hit++;
            }
        stats[name] = Math.round((hit / total) * 100);
    }
    console.log(`  coverage — ${Object.entries(stats).map(([k, v]) => `${k} ${v}%`).join(" | ")}`);
    for (const [name, [min, max]] of Object.entries(limits)) {
        const v = stats[name];
        if (v < min || v > max) {
            console.log(`    ✗ ${name}: got ${v}%, wanted ${min}-${max}%`);
            ok = false;
        }
    }
    return ok;
}

/* straightness of the mask boundary in the wall/gravel photo: per row, the
   rightmost masked pixel; wobble (std dev) must be tiny and no pixel may
   leak deeper than maxLeakX into the gravel */
function straightness(mask, maxLeakX) {
    const d = mask._data;
    const rights = [];
    let maxMaskedX = 0;
    for (let y = 100; y < 500; y++) {
        let right = -1;
        for (let x = 0; x < W; x++) {
            const p = (y * W + x) * 4;
            if (d[p + 3] === 255 && d[p] > 40 && d[p + 2] < 140) {
                right = x;
                maxMaskedX = Math.max(maxMaskedX, x);
            }
        }
        if (right >= 0) rights.push(right);
    }
    const mean = rights.reduce((a, b) => a + b, 0) / rights.length;
    const sd = Math.sqrt(rights.reduce((a, b) => a + (b - mean) ** 2, 0) / rights.length);
    return { sd: Math.round(sd * 10) / 10, maxMaskedX };
}

function run(label, ok) {
    if (ok) {
        passes++;
        console.log(`    ✓ ${label} PASS`);
    } else {
        failures++;
        console.log(`    ✗ ${label} FAIL`);
    }
}

/* ---------- run ---------- */
console.log("\n=== T1: gravel leak + boundary straightness (3 runs) ===");
for (let i = 0; i < 3; i++) {
    const m = regionFromPoint(buildGravelWall(), 0.25, 0.5, "walls");
    const cov = coverage(m, "gravel", { wall: [88, 100], gravel: [0, 2] });
    const s = straightness(m, 412);
    console.log(`  boundary wobble sd=${s.sd}px, deepest mask x=${s.maxMaskedX} (boundary at 400)`);
    run(`T1 run ${i + 1}: no gravel leak, straight boundary`, cov && s.sd <= 5 && s.maxMaskedX <= 412);
}

console.log("\n=== T2: house — tap wall (dark gutter protects sky) ===");
for (let i = 0; i < 3; i++) {
    const m = regionFromPoint(buildTapHouse(), 0.5, 0.6, "walls");
    run(`T2 run ${i + 1}: wall painted, sky/door/ground clean`, coverage(m, "taphouse", { wallL: [80, 100], wallR: [80, 100], sky: [0, 3], door: [0, 10], ground: [0, 5] }));
}

console.log("\n=== T3: house — tap door ===");
for (let i = 0; i < 3; i++) {
    const m = regionFromPoint(buildTapHouse(), 0.25, 0.61, "walls");
    run(`T3 run ${i + 1}: door painted, wall/sky clean`, coverage(m, "taphouse", { door: [80, 100], wallL: [0, 5], wallR: [0, 5], sky: [0, 3], ground: [0, 3] }));
}

console.log("\n=== T4: textured render wall — texture must not block fill ===");
{
    const m = regionFromPoint(buildTexturedWall(), 0.5, 0.5, "walls");
    const d = m._data;
    let hit = 0;
    for (let i = 0; i < W * H; i++) if (d[i * 4] > 40 && d[i * 4 + 2] < 140) hit++;
    const pct = Math.round((hit / (W * H)) * 100);
    console.log(`  whole-image coverage ${pct}%`);
    run("T4: textured wall fully covered", pct >= 90);
}

console.log("\n=== T5: two taps accumulate on one photo ===");
{
    const img = buildTapHouse();
    const m1 = regionFromPoint(img, 0.25, 0.61, "walls"); // door
    const m2 = regionFromPoint(img, 0.5, 0.6, "walls");   // wall
    // merge like the real canvas does (source-over): later mask wins where opaque
    const merged = blankImg();
    const d1 = m1._data, d2 = m2._data, dm = merged._data;
    for (let i = 0; i < W * H; i++) {
        const a2 = d2[i * 4 + 3] > 120, a1 = d1[i * 4 + 3] > 120;
        const src = a2 ? d2 : a1 ? d1 : null;
        if (src) {
            dm[i * 4] = src[i * 4];
            dm[i * 4 + 1] = src[i * 4 + 1];
            dm[i * 4 + 2] = src[i * 4 + 2];
            dm[i * 4 + 3] = 255;
        }
    }
    run("T5: door AND wall both masked", coverage(merged, "taphouse", { door: [80, 100], wallL: [80, 100], wallR: [80, 100], sky: [0, 3], ground: [0, 5] }));
}

console.log(`\n===== ${passes} passed, ${failures} failed =====`);
process.exit(failures ? 1 : 0);
