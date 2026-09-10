/* Test harness for recolourLayers colour fidelity: the painted wall must read
   as the SELECTED colour everywhere — only a subtle hint of the photo's own
   shading may remain, instead of the full lightness spread ("fading into
   different colours across the wall"). */

function makeCanvasStub() {
    const created = [];
    function createCanvas(w = 0, h = 0) {
        const cv = {
            width: w, height: h, _data: null,
            getContext() {
                const ctx = {
                    imageSmoothingEnabled: true, fillStyle: "",
                    drawImage(src, dx, dy, dw, dh) {
                        const sw = src.naturalWidth || src.width;
                        const sh = src.naturalHeight || src.height;
                        const sdata = src._data;
                        const tw = cv.width, th = cv.height;
                        const out = new Uint8ClampedArray(tw * th * 4);
                        for (let y = 0; y < th; y++) {
                            const sy = Math.min(sh - 1, Math.floor(((y - (dy || 0)) / dh) * sh));
                            for (let x = 0; x < tw; x++) {
                                const sx = Math.min(sw - 1, Math.floor(((x - (dx || 0)) / dw) * sw));
                                const sp = (sy * sw + sx) * 4, tp = (y * tw + x) * 4;
                                out[tp] = sdata[sp]; out[tp + 1] = sdata[sp + 1]; out[tp + 2] = sdata[sp + 2]; out[tp + 3] = 255;
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
                    fillRect() {},
                };
                return ctx;
            },
            toDataURL: () => "data:image/jpeg;base64,stub",
        };
        created.push(cv);
        return cv;
    }
    return { createElement: () => createCanvas(), created };
}
globalThis.document = makeCanvasStub();
const { created } = globalThis.document;

const { recolourLayers } = await import("./colour_copy.mjs");
const { rgbToLab } = await import("./colour_copy.mjs");

const W = 200, H = 150;
function buildGradientWallImg() {
    const img = { naturalWidth: W, naturalHeight: H, _data: new Uint8ClampedArray(W * H * 4) };
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
            const p = (y * W + x) * 4;
            const t = (y - 20) / 90; // strong light gradient across the wall
            const g = Math.round(150 + Math.max(0, Math.min(1, t)) * 90);
            img._data[p] = g; img._data[p + 1] = g; img._data[p + 2] = g; img._data[p + 3] = 255;
        }
    return img;
}
function buildWallMask() {
    const cv = globalThis.document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    cv._data = new Uint8ClampedArray(W * H * 4);
    for (let y = 20; y < 110; y++)
        for (let x = 20; x < 180; x++) {
            const p = (y * W + x) * 4;
            cv._data[p] = 230; cv._data[p + 1] = 57; cv._data[p + 2] = 70; cv._data[p + 3] = 255;
        }
    return cv;
}

function measure(hex) {
    const img = buildGradientWallImg();
    const mask = buildWallMask();
    created.length = 0; // recolourLayers creates its base canvas next -> created[0]
    recolourLayers(img, mask, [{ kind: "walls", hex }], "matte", () => {});
    const base = created[0];
    const [tR, tG, tB] = [parseInt(hex.slice(1), 16) >> 16, (parseInt(hex.slice(1), 16) >> 8) & 255, parseInt(hex.slice(1), 16) & 255];
    const tL = rgbToLab(tR, tG, tB)[0];
    let min = 999, max = -999, sum = 0, n = 0;
    for (let y = 22; y < 108; y++)
        for (let x = 22; x < 178; x++) {
            const p = (y * W + x) * 4;
            const L = rgbToLab(base._data[p], base._data[p + 1], base._data[p + 2])[0];
            min = Math.min(min, L); max = Math.max(max, L); sum += L; n++;
        }
    return { targetL: Math.round(tL * 10) / 10, min: Math.round(min * 10) / 10, max: Math.round(max * 10) / 10, avg: Math.round((sum / n) * 10) / 10, spread: Math.round((max - min) * 10) / 10 };
}

let failures = 0;
/* Light colour on a strongly shaded wall — the worst "fading" case */
const ivory = measure("#F5F0E1");
console.log(`Warm ivory: target L ${ivory.targetL} -> painted L ${ivory.min}..${ivory.max} (avg ${ivory.avg}, spread ${ivory.spread})`);
if (ivory.spread > 16) { console.log("  ✗ FAIL: spread too wide — colour fades across the wall"); failures++; } else console.log("  ✓ tight spread");

/* Mid/dark colour — must stay near target everywhere */
const blue = measure("#1F3A93");
console.log(`Royal blue: target L ${blue.targetL} -> painted L ${blue.min}..${blue.max} (avg ${blue.avg}, spread ${blue.spread})`);
if (blue.spread > 10) { console.log("  ✗ FAIL: spread too wide — colour fades across the wall"); failures++; } else console.log("  ✓ tight spread");

/* The average must still land ON the target colour's lightness */
if (Math.abs(ivory.avg - ivory.targetL) > 6) { console.log(`  ✗ ivory avg off target by ${Math.abs(ivory.avg - ivory.targetL)}`); failures++; }
if (Math.abs(blue.avg - blue.targetL) > 6) { console.log(`  ✗ blue avg off target by ${Math.abs(blue.avg - blue.targetL)}`); failures++; }
else console.log("  ✓ averages land on target");

console.log(`\n===== ${failures} failed =====`);
process.exit(failures ? 1 : 0);
