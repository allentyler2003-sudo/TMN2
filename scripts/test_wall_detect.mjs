/* Test harness: runs the REAL detectWallMask algorithm from
   frontend/src/lib/colour.js inside Node (canvas stubbed, BILINEAR filtering
   to mimic the browser) against synthetic photos at FULL 800x600 — the same
   size the browser hands the function, so grid-relative feature sizes match
   the real app exactly. Scenarios: A house, B interior, C ambiguous, D harsh,
   E two wall faces split by a downpipe, F woodwork (thin 8px frames + door +
   skirting), G woodwork wall-piece trap. */

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
                    fillRect() {
                        cv._fallbackUsed = true;
                        const out = new Uint8ClampedArray(cv.width * cv.height * 4);
                        for (let i = 0; i < cv.width * cv.height; i++) {
                            out[i * 4] = 230; out[i * 4 + 1] = 57; out[i * 4 + 2] = 70; out[i * 4 + 3] = 255;
                        }
                        cv._data = out;
                    },
                };
                return ctx;
            },
        };
        return cv;
    }
    return { createElement: () => createCanvas() };
}

globalThis.document = makeCanvasStub();

const { detectWallMask } = await import("./colour_copy.mjs");

/* ---------- synthetic photo builders (W=800, H=600 — FULL photo size) ---------- */
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

function buildHouse() {
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
            if (y < 200) c = mix(skyTop, skyHorizon, y / 200);
            else if (y < 216) c = mix(skyHorizon, wall, (y - 200) / 16);
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

function buildInterior() {
    const img = blankImg();
    const wallC = [238, 233, 224];
    const window_ = [210, 226, 242];
    const floor = [168, 132, 96];
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let c = wallC;
            if (y >= 420) c = floor;
            if (x >= 500 && x < 660 && y >= 80 && y < 300) c = window_;
            setPx(img, x, y, c[0] + noise(5), c[1] + noise(5), c[2] + noise(5));
        }
    }
    return img;
}

function buildAmbiguous() {
    const img = blankImg();
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) setPx(img, x, y, 244 + noise(3), 244 + noise(3), 242 + noise(3));
    return img;
}

function buildHarsh() {
    const img = blankImg();
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let c;
            if (y < 220) c = [190, 205, 225];
            else if (y < 460) c = mix([250, 248, 244], [190, 188, 182], (y - 220) / 240);
            else c = [110, 108, 104];
            if (x >= 600 && x < 720 && y >= 280 && y < 460) c = [70, 66, 62];
            if (Math.random() < 0.02 && y >= 220 && y < 460 && !(x >= 600 && x < 720)) {
                const s = noise(60);
                c = [238 + s, 236 + s, 232 + s];
            }
            setPx(img, x, y, c[0], c[1], c[2]);
        }
    }
    return img;
}

/* Scenario E: TWO white wall faces split by a dark downpipe. */
function buildTwoWalls() {
    const img = blankImg();
    const skyTop = [203, 219, 238];
    const skyHorizon = [233, 237, 243];
    const wallA = [243, 241, 236];
    const wallB = [233, 231, 224];
    const pipe = [90, 90, 88];
    const ground = [150, 150, 148];
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let c;
            if (y < 200) c = mix(skyTop, skyHorizon, y / 200);
            else if (y < 216) c = mix(skyHorizon, wallA, (y - 200) / 16);
            else if (y < 444) c = x < 456 ? wallA : x < 468 ? pipe : wallB;
            else c = mix(ground, [138, 138, 136], (y - 444) / 156);
            setPx(img, x, y, c[0] + noise(4), c[1] + noise(4), c[2] + noise(4));
        }
    }
    return img;
}

/* Scenario F: woodwork — two window rings with THIN 8px frames (the size that
   failed in the browser), a door slab and a skirting board. */
function buildWoodwork() {
    const img = blankImg();
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) setPx(img, x, y, 238 + noise(5), 233 + noise(5), 224 + noise(5));
    function ring(x0, x1, y0, y1, t) {
        for (let y = y0; y < y1; y++)
            for (let x = x0; x < x1; x++) {
                const edge = x < x0 + t || x >= x1 - t || y < y0 + t || y >= y1 - t;
                if (edge) setPx(img, x, y, 70 + noise(4), 70 + noise(4), 68 + noise(4));
                else setPx(img, x, y, 120 + noise(6), 125 + noise(6), 130 + noise(6));
            }
    }
    ring(120, 280, 90, 270, 8);
    ring(480, 680, 120, 300, 8);
    for (let y = 180; y < 540; y++)
        for (let x = 320; x < 416; x++) setPx(img, x, y, 40 + noise(4), 45 + noise(4), 60 + noise(4)); // door
    for (let y = 528; y < 552; y++)
        for (let x = 0; x < W; x++) setPx(img, x, y, 250 + noise(3), 250 + noise(3), 248 + noise(3)); // skirting
    return img;
}

/* Scenario G: woodwork trap — a wall fragment (with a window hole) that the
   trim detector used to grab as "woodwork", a dark door, a framed window. */
function buildWallPieceTrap() {
    const img = blankImg();
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) setPx(img, x, y, 238 + noise(5), 233 + noise(5), 224 + noise(5));
    for (let y = 0; y < H; y++)
        for (let x = 660; x < 670; x++) setPx(img, x, y, 90 + noise(4), 90 + noise(4), 88 + noise(4)); // downpipe
    for (let y = 120; y < 360; y++)
        for (let x = 680; x < 796; x++) {
            const edge = x < 696 || x >= 780 || y < 136 || y >= 344;
            if (edge) setPx(img, x, y, 70 + noise(4), 70 + noise(4), 68 + noise(4));
            else setPx(img, x, y, 150 + noise(6), 155 + noise(6), 160 + noise(6)); // glass
        }
    for (let y = 180; y < 540; y++)
        for (let x = 120; x < 220; x++) setPx(img, x, y, 40 + noise(4), 45 + noise(4), 60 + noise(4)); // door
    return img;
}

/* ---------- region sets + analysis (all coords at 800x600) ---------- */
const REGION_SETS = {
    house: { sky: [0, W, 0, 200], wall: [0, W, 216, 444], door: [124, 276, 308, 440], ground: [0, W, 456, H] },
    interior: { wall: [0, W, 0, 416], floor: [0, W, 424, H] },
    harsh: { sky: [0, W, 0, 210], wall: [0, W, 224, 452], door: [604, 716, 284, 456], ground: [0, W, 464, H] },
    twowalls: { sky: [0, W, 0, 200], wallA: [0, 452, 216, 440], wallB: [472, W, 216, 440], pipe: [457, 467, 216, 440], ground: [0, W, 456, H] },
    woodwork: { frame1: [120, 280, 90, 270], frame2: [480, 680, 120, 300], door: [322, 414, 184, 536], skirting: [0, W, 528, 552], wall: [420, 476, 320, 520] },
    trap: { pieceWall: [672, 692, 30, 110], frame: [680, 796, 120, 360], door: [120, 220, 184, 536], mainWall: [300, 600, 400, 500] },
};

function analyse(mask, label, regionSetName, limits, mode = "walls") {
    const REGIONS = REGION_SETS[regionSetName];
    if (!mask) {
        if (limits.allowNull) {
            console.log(`  ✓ ${label}: returned null (graceful fail — brush fallback)`);
            passes++;
            return true;
        }
        console.log(`  ✗ ${label}: returned null but a mask was expected`);
        failures++;
        return false;
    }
    const d = mask._data;
    if (!d) {
        console.log(`  ✗ ${label}: mask has no pixel data`);
        failures++;
        return false;
    }
    if (mask._fallbackUsed) {
        console.log(`  ✗ ${label}: BLANKET FALLBACK fired`);
        failures++;
        return false;
    }
    let soft = 0;
    for (let i = 0; i < W * H; i++) {
        const a = d[i * 4 + 3];
        if (a !== 0 && a !== 255) soft++;
    }
    if (soft > 0) {
        console.log(`  ✗ ${label}: ${soft} soft-edge pixels — mask edges not crisp`);
        failures++;
        return false;
    }
    const stats = {};
    for (const [name, [x0, x1, y0, y1]] of Object.entries(REGIONS)) {
        let hit = 0;
        let total = 0;
        for (let y = y0; y < y1; y++)
            for (let x = x0; x < x1; x++) {
                total++;
                const p = (y * W + x) * 4;
                const isHit = mode === "woodwork" ? d[p + 2] > 40 && d[p] < 140 : d[p] > 40 && d[p + 2] < 140;
                if (isHit) hit++;
            }
        stats[name] = Math.round((hit / total) * 100);
    }
    console.log(`  ${label}: mask coverage — ${Object.entries(stats).map(([k, v]) => `${k} ${v}%`).join(" | ")}`);
    let ok = true;
    for (const [name, range] of Object.entries(limits)) {
        if (!Array.isArray(range)) continue;
        const [min, max] = range;
        const v = stats[name];
        if (v < min || v > max) {
            console.log(`    ✗ ${name}: got ${v}%, wanted ${min}-${max}%`);
            ok = false;
        }
    }
    if (ok) {
        passes++;
        console.log(`    ✓ within limits`);
    } else failures++;
    return ok;
}

/* ---------- run ---------- */
console.log("\n=== A: house exterior (sky/wall/door/ground) ===");
analyse(detectWallMask(buildHouse(), "walls"), "house", "house", { sky: [0, 3], wall: [70, 100], door: [0, 35], ground: [0, 3] });

console.log("\n=== B: interior (wall + window + floor) ===");
analyse(detectWallMask(buildInterior(), "walls"), "interior", "interior", { wall: [70, 100], floor: [0, 5] });

console.log("\n=== C: ambiguous all-white (must fail gracefully) ===");
analyse(detectWallMask(buildAmbiguous(), "walls"), "ambiguous", "house", { allowNull: true });

console.log("\n=== D: harsh regression (gradient wall + speckles + dark door) ===");
analyse(detectWallMask(buildHarsh(), "walls"), "harsh", "harsh", { sky: [0, 5], wall: [55, 100], door: [0, 10], ground: [0, 5] });

console.log("\n=== E: TWO wall faces split by a downpipe (user's missed wall) ===");
analyse(detectWallMask(buildTwoWalls(), "walls"), "two-walls", "twowalls", { sky: [0, 3], wallA: [60, 100], wallB: [60, 100], pipe: [0, 25], ground: [0, 3] });

console.log("\n=== F: woodwork (thin window rings + door + skirting) ===");
analyse(detectWallMask(buildWoodwork(), "woodwork"), "woodwork", "woodwork", { frame1: [2, 60], frame2: [2, 60], door: [60, 100], skirting: [0, 100], wall: [0, 15] }, "woodwork");

console.log("\n=== G: woodwork trap (wall piece must NOT be grabbed) ===");
analyse(detectWallMask(buildWallPieceTrap(), "woodwork"), "trap", "trap", { pieceWall: [0, 15], frame: [2, 60], door: [60, 100], mainWall: [0, 10] }, "woodwork");

console.log(`\n===== ${passes} passed, ${failures} failed =====`);
process.exit(failures ? 1 : 0);
