/* Test harness: runs the REAL detectWallMask algorithm from
   frontend/src/lib/colour.js inside Node (canvas stubbed) against synthetic
   house photos. Verifies walls-only coverage, no sky/door/ground bleed. */

let failures = 0;
let passes = 0;

function makeCanvasStub() {
    function createCanvas(w = 0, h = 0) {
        const cv = {
            width: w,
            height: h,
            _data: null,
            _fallbackUsed: false,
            getContext() {
                const ctx = {
                    imageSmoothingEnabled: true,
                    fillStyle: "",
                    drawImage(src, dx, dy, dw, dh) {
                        const sw = src.naturalWidth || src.width;
                        const sh = src.naturalHeight || src.height;
                        const sdata = src._data;
                        if (!sdata) throw new Error("drawImage: source has no pixel data");
                        const tw = cv.width;
                        const th = cv.height;
                        const out = new Uint8ClampedArray(tw * th * 4);
                        for (let y = 0; y < th; y++) {
                            const sy = Math.min(sh - 1, Math.floor(((y - (dy || 0)) / dh) * sh));
                            for (let x = 0; x < tw; x++) {
                                const sx = Math.min(sw - 1, Math.floor(((x - (dx || 0)) / dw) * sw));
                                const sp = (sy * sw + sx) * 4;
                                const tp = (y * tw + x) * 4;
                                out[tp] = sdata[sp];
                                out[tp + 1] = sdata[sp + 1];
                                out[tp + 2] = sdata[sp + 2];
                                out[tp + 3] = 255;
                            }
                        }
                        cv._data = out;
                    },
                    getImageData(px, py, w, h) {
                        if (!cv._data) return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
                        return { data: new Uint8ClampedArray(cv._data), width: w, height: h };
                    },
                    createImageData(w, h) {
                        return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
                    },
                    putImageData(imgData) {
                        cv._data = new Uint8ClampedArray(imgData.data);
                    },
                    fillRect(x, y, w, h) {
                        cv._fallbackUsed = true;
                        const fill = ctx.fillStyle.includes("230") ? [230, 57, 70] : [0, 0, 0];
                        const out = new Uint8ClampedArray(cv.width * cv.height * 4);
                        for (let yy = 0; yy < h; yy++)
                            for (let xx = 0; xx < w; xx++) {
                                const p = (yy * cv.width + xx) * 4;
                                out[p] = fill[0];
                                out[p + 1] = fill[1];
                                out[p + 2] = fill[2];
                                out[p + 3] = 255;
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

/* ---------- synthetic photo builders (W=400, H=300) ---------- */
const W = 400;
const H = 300;

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

/* Region bounds for metrics — [x0, x1) x [y0, y1), defined per scenario */
const REGION_SETS = {
    house: {
        sky: [0, W, 0, 100],
        wall: [0, W, 108, 222],
        door: [62, 138, 154, 220],
        ground: [0, W, 228, H],
    },
    interior: {
        wall: [0, W, 0, 208],
        floor: [0, W, 212, H],
    },
    harsh: {
        sky: [0, W, 0, 105],
        wall: [0, W, 112, 226],
        door: [302, 358, 142, 228],
        ground: [0, W, 232, H],
    },
};

/* Scenario A: user-style house exterior — pale gradient sky, white wall,
   white door with frame, grey ground, blurred wall/sky boundary. */
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
            if (y < 100) {
                c = mix(skyTop, skyHorizon, y / 100); // smooth sky gradient
            } else if (y < 108) {
                c = mix(skyHorizon, wall, (y - 100) / 8); // blurred boundary (the killer)
            } else if (y < 222) {
                c = mix(wall, [238, 236, 230], y / 300); // wall with gentle shading
            } else {
                c = mix(ground, [138, 138, 136], (y - 222) / 78); // ground gradient
            }
            if (x >= 58 && x < 142 && y >= 148 && y < 222) {
                if (x < 62 || x >= 138 || y < 152) c = frame; // door frame edge
                else c = door;
            }
            setPx(img, x, y, c[0] + noise(4), c[1] + noise(4), c[2] + noise(4));
        }
    }
    return img;
}

/* Scenario B: interior — cream wall, bright window with sky, wood floor. */
function buildInterior() {
    const img = blankImg();
    const wallC = [238, 233, 224];
    const window_ = [210, 226, 242];
    const floor = [168, 132, 96];
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let c = wallC;
            if (y >= 210) c = floor;
            if (x >= 250 && x < 330 && y >= 40 && y < 150) c = window_; // window in wall
            setPx(img, x, y, c[0] + noise(5), c[1] + noise(5), c[2] + noise(5));
        }
    }
    return img;
}

/* Scenario C: ambiguous — near-uniform white everything. Must fail
   gracefully (null), never paint a blanket region. */
function buildAmbiguous() {
    const img = blankImg();
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) setPx(img, x, y, 244 + noise(3), 244 + noise(3), 242 + noise(3));
    return img;
}

/* Scenario D: regression — gradient wall + speckles + dark door + dark ground.
   (The harsh case from the earlier "edge-to-edge" fix.) */
function buildHarsh() {
    const img = blankImg();
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let c;
            if (y < 110) c = [190, 205, 225];
            else if (y < 230) c = mix([250, 248, 244], [190, 188, 182], (y - 110) / 120); // strong gradient
            else c = [110, 108, 104];
            if (x >= 300 && x < 360 && y >= 140 && y < 230) c = [70, 66, 62]; // dark door
            if (Math.random() < 0.02 && y >= 110 && y < 230 && !(x >= 300 && x < 360)) {
                const s = noise(60);
                c = [238 + s, 236 + s, 232 + s]; // speckles
            }
            setPx(img, x, y, c[0], c[1], c[2]);
        }
    }
    return img;
}

/* ---------- mask analysis ---------- */
function analyse(mask, label, regionSetName, limits) {
    const REGIONS = REGION_SETS[regionSetName];
    if (!mask) {
        if (limits.allowNull) {
            console.log(`  ✓ ${label}: returned null (graceful fail — brush fallback)`);
            passes++;
            return true;
        }
        console.log(`  ✗ ${label}: returned null but a wall mask was expected`);
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
        console.log(`  ✗ ${label}: BLANKET FALLBACK fired (paints top 45% of photo)`);
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
                if (d[p] > 40 && d[p + 2] < 140) hit++; // walls-mask red channel
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
console.log("\n=== Scenario A: house exterior (sky/wall/door/ground) ===");
const A = detectWallMask(buildHouse(), "walls");
analyse(A, "house", "house", { sky: [0, 3], wall: [70, 100], door: [0, 35], ground: [0, 3] });

console.log("\n=== Scenario B: interior (wall + window + floor) ===");
const B = detectWallMask(buildInterior(), "walls");
analyse(B, "interior", "interior", { wall: [70, 100], floor: [0, 5] });

console.log("\n=== Scenario C: ambiguous all-white (must fail gracefully) ===");
const C = detectWallMask(buildAmbiguous(), "walls");
analyse(C, "ambiguous", "house", { allowNull: true });

console.log("\n=== Scenario D: harsh regression (gradient wall + speckles + dark door) ===");
const D = detectWallMask(buildHarsh(), "walls");
analyse(D, "harsh", "harsh", { sky: [0, 5], wall: [55, 100], door: [0, 10], ground: [0, 5] });

console.log(`\n===== ${passes} passed, ${failures} failed =====`);
process.exit(failures ? 1 : 0);
