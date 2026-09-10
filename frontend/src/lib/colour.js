/* Colour engine for the TMN visualiser — pure client-side, zero cost.
   Paint-true recolouring keeps the photo's own lightness and shading.
   Supports multiple surface layers (walls, woodwork) each with its own colour,
   plus matte/silk/gloss sheen simulation. */

export function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
    return (
        "#" +
        [r, g, b]
            .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
            .join("")
            .toUpperCase()
    );
}

export function isValidHex(s) {
    return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s.trim());
}

export function normaliseHex(s) {
    let h = s.trim().replace(/^#/, "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return "#" + h.toUpperCase();
}

export function rgbToLab(r, g, b) {
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

export function labToRgb(L, a, b) {
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
        // linear -> sRGB: the 12.92 branch ends at linear 0.0031308 (NOT the
        // 0.04045 sRGB-domain threshold — using that inflated every dark
        // channel, so painted colours didn't match the ones selected)
        const c = v > 0.0031308 ? 1.055 * Math.pow(v, 1 / 2.4) - 0.055 : 12.92 * v;
        return Math.max(0, Math.min(255, Math.round(c * 255)));
    };
    return [
        back(3.2406 * X - 1.5372 * Y - 0.4986 * Z),
        back(-0.9689 * X + 1.8758 * Y + 0.0415 * Z),
        back(0.0557 * X - 0.204 * Y + 1.057 * Z),
    ];
}

export function hexToHsv(hex) {
    const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h = Math.round(((h * 60) + 360) % 360);
    }
    return [h, max === 0 ? 0 : d / max, max];
}

export function hsvToHex(h, s, v) {
    const c = v * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let [r, g, b] = [0, 0, 0];
    if (hp < 1) [r, g, b] = [c, x, 0];
    else if (hp < 2) [r, g, b] = [x, c, 0];
    else if (hp < 3) [r, g, b] = [0, c, x];
    else if (hp < 4) [r, g, b] = [0, x, c];
    else if (hp < 5) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const m = v - c;
    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/* Layered recolour. layers: [{ kind: 'walls'|'woodwork', hex }] — processed in
   order, later layers win where masks overlap (woodwork sits in front of walls).
   sheen: 'matte' | 'silk' | 'gloss' — simulates light picking up on the finish. */
export function recolourLayers(baseImg, maskCanvas, layers, sheen, onDone) {
    const w = baseImg.naturalWidth;
    const h = baseImg.naturalHeight;
    const base = document.createElement("canvas");
    base.width = w;
    base.height = h;
    const bctx = base.getContext("2d");
    bctx.drawImage(baseImg, 0, 0, w, h);
    const baseData = bctx.getImageData(0, 0, w, h);
    const maskData = maskCanvas.getContext("2d").getImageData(0, 0, w, h);

    const passes = layers
        .filter((l) => l && l.hex)
        .map(({ kind, hex }) => {
            const [tr, tg, tb] = hexToRgb(hex);
            const [tL, ta, tbb] = rgbToLab(tr, tg, tb);
            const isLayer = (p) => {
                const r = maskData.data[p];
                const b = maskData.data[p + 2];
                return kind === "woodwork" ? b > 40 && r < 140 : r > 40 && b < 140;
            };
            let sumL = 0;
            let count = 0;
            for (let i = 0; i < w * h; i++) {
                if (isLayer(i * 4)) {
                    const [L] = rgbToLab(baseData.data[i * 4], baseData.data[i * 4 + 1], baseData.data[i * 4 + 2]);
                    sumL += L;
                    count++;
                }
            }
            const avgL = count ? sumL / count : tL;
            return { isLayer, tL, ta, tbb, scale: count ? tL / avgL : 1 };
        });

    const out = bctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
        const p = i * 4;
        const r0 = baseData.data[p];
        const g0 = baseData.data[p + 1];
        const b0 = baseData.data[p + 2];
        let or_ = r0;
        let og = g0;
        let ob = b0;
        for (const pass of passes) {
            const mRaw = pass.isLayer(p) ? maskData.data[p] : 0;
            if (mRaw < 10) continue;
            const m = mRaw / 255;
            const [L] = rgbToLab(or_, og, ob);
            let newL = Math.max(0, Math.min(100, L * pass.scale));
            // stay true to the chosen colour: keep only a subtle hint of the
            // photo's own shading — preserving the full lightness spread read
            // as the colour "fading" into different shades across the wall
            newL = pass.tL + (newL - pass.tL) * 0.42;
            newL = Math.max(pass.tL - 20, Math.min(pass.tL + 16, newL));
            const y = i / w / h;
            if (sheen === "silk") newL = Math.min(100, newL * (1 + 0.06 * (1 - y)));
            if (sheen === "gloss") newL = Math.min(100, newL * (1 + 0.26 * Math.pow(Math.max(0, 1 - y), 1.6)));
            const [nr, ng, nb] = labToRgb(newL, pass.ta, pass.tbb);
            or_ = or_ * (1 - m) + nr * m;
            og = og * (1 - m) + ng * m;
            ob = ob * (1 - m) + nb * m;
        }
        out.data[p] = or_;
        out.data[p + 1] = og;
        out.data[p + 2] = ob;
        out.data[p + 3] = 255;
    }
    bctx.putImageData(out, 0, 0);
    onDone(base.toDataURL("image/jpeg", 0.92));
}

const MASK_COLS = {
    walls: [230, 57, 70],    // red overlay
    woodwork: [29, 78, 216], // blue overlay
};

/* Crisp mask edges: the smoothed upscale leaves soft half-covered boundary
   pixels that bleed over trims, windows and doors — re-binarize the alpha so
   the edge lands on single full pixels. */
function sharpenMask(mctx, mask, cols) {
    const up = mctx.getImageData(0, 0, mask.width, mask.height);
    for (let i = 0; i < mask.width * mask.height; i++) {
        if (up.data[i * 4 + 3] > 120) {
            up.data[i * 4] = cols[0];
            up.data[i * 4 + 1] = cols[1];
            up.data[i * 4 + 2] = cols[2];
            up.data[i * 4 + 3] = 255;
        } else {
            up.data[i * 4] = 0;
            up.data[i * 4 + 1] = 0;
            up.data[i * 4 + 2] = 0;
            up.data[i * 4 + 3] = 0;
        }
    }
    mctx.putImageData(up, 0, 0);
}

/* Mean Lab colour of a component (for wall-vs-trim decisions). */
function meanLab(comp, d) {
    let L = 0;
    let A = 0;
    let B = 0;
    for (const p of comp) {
        const [l, a, b] = rgbToLab(d[p * 4], d[p * 4 + 1], d[p * 4 + 2]);
        L += l;
        A += a;
        B += b;
    }
    return [L / comp.length, A / comp.length, B / comp.length];
}

/* Shared wall region-growing: 3x3-smooths the photo, blocks the sky, then
   grows wall-coloured regions from a dense seed grid. Returns the qualifying
   parts (arrays of pixel indices). Used by the walls detector directly and by
   the woodwork detector to learn the wall's colour. */
function growWallParts(d, W, H) {
    const smooth = new Float32Array(W * H * 4);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const i = y * W + x;
            let r = 0, g = 0, b = 0, n = 0;
            for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
                    const p = ny * W + nx;
                    r += d[p * 4]; g += d[p * 4 + 1]; b += d[p * 4 + 2];
                    n++;
                }
            }
            smooth[i * 4] = r / n;
            smooth[i * 4 + 1] = g / n;
            smooth[i * 4 + 2] = b / n;
        }
    }
    // dense seed grid: a wall face carrying a window or a door can easily sit
    // between sparse seeds and never get grown at all
    const seeds = [];
    for (const fy of [0.18, 0.32, 0.46, 0.6, 0.74]) {
        for (const fx of [0.12, 0.28, 0.44, 0.6, 0.76, 0.92, 0.96]) {
            seeds.push([Math.round(fy * (H - 1)) * W + Math.round(fx * (W - 1))]);
        }
    }
    // block the sky first: walk smooth colour from the top row (sky + clouds)
    // so the wall fill can never leak into it. A pixel may only join the sky
    // if it is sky-plausible: pale skies always lean blue (b >= r), while warm
    // white walls never do — so the walk cannot cross a blurred wall boundary.
    const sky = new Uint8Array(W * H);
    const skyQ = [];
    for (let x = 0; x < W; x++) {
        sky[x] = 1;
        skyQ.push(x);
    }
    while (skyQ.length) {
        const cur = skyQ.pop();
        const x = cur % W;
        const y = (cur - x) / W;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
            const ni = ny * W + nx;
            if (sky[ni]) continue;
            const diff =
                Math.abs(smooth[ni * 4] - smooth[cur * 4]) +
                Math.abs(smooth[ni * 4 + 1] - smooth[cur * 4 + 1]) +
                Math.abs(smooth[ni * 4 + 2] - smooth[cur * 4 + 2]);
            if (diff < 24 && smooth[ni * 4 + 2] >= smooth[ni * 4] - 2) {
                sky[ni] = 1;
                skyQ.push(ni);
            }
        }
    }

    const seen = new Uint8Array(W * H);
    const parts = [];
    const partMin = 0.045 * W * H;
    for (let i = 0; i < W * H; i++) if (sky[i]) seen[i] = 1;
    for (const [seed] of seeds) {
        if (seen[seed]) continue;
        const comp = [];
        const local = new Uint8Array(W * H);
        const q = [seed];
        local[seed] = 1;
        let overflow = false;
        while (q.length) {
            const cur = q.pop();
            comp.push(cur);
            if (comp.length > 0.85 * W * H) { overflow = true; break; }
            const x = cur % W;
            const y = (cur - x) / W;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
                const ni = ny * W + nx;
                if (local[ni] || seen[ni]) continue;
                // walk smooth gradients (shadows, corners) but stop at real edges
                const localDiff =
                    Math.abs(smooth[ni * 4] - smooth[cur * 4]) +
                    Math.abs(smooth[ni * 4 + 1] - smooth[cur * 4 + 1]) +
                    Math.abs(smooth[ni * 4 + 2] - smooth[cur * 4 + 2]);
                const seedDiff =
                    Math.abs(smooth[ni * 4] - smooth[seed * 4]) +
                    Math.abs(smooth[ni * 4 + 1] - smooth[seed * 4 + 1]) +
                    Math.abs(smooth[ni * 4 + 2] - smooth[seed * 4 + 2]);
                // stay near the wall's own colour (so ramps onto ground/doors
                // are refused) while still walking smooth shading gradients.
                // 18 seals the 3x3-blur ramps of any boundary with contrast
                // >= ~45 (doors, skirting, windows) — the blur spreads such a
                // step to ~20 per pixel, which must stay ABOVE the threshold
                if (localDiff < 18 && seedDiff < 90) {
                    local[ni] = 1;
                    q.push(ni);
                }
            }
        }
        for (const p of comp) seen[p] = 1;
        if (overflow) continue;
        if (comp.length < partMin) continue;
        parts.push(comp);
    }
    return parts;
}

/* Tap-to-select: grow the region under the visitor's tap with the same
   edge-aware fill used for walls. Works on ANY photo — the tap picks the
   seed, so walls, doors, window frames, kitchen units and ceilings are all
   selectable. Returns a full-size canvas painted in the layer's mask colour. */
export function regionFromPoint(img, xFrac, yFrac, kind = "walls") {
    const W = 384;
    const H = Math.max(1, Math.round((W * img.naturalHeight) / img.naturalWidth));
    const small = document.createElement("canvas");
    small.width = W;
    small.height = H;
    const sctx = small.getContext("2d");
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(img, 0, 0, W, H);
    const d = sctx.getImageData(0, 0, W, H).data;
    const smooth = new Float32Array(W * H * 4);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const i = y * W + x;
            let r = 0, g = 0, b = 0, n = 0;
            for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
                    const p = ny * W + nx;
                    r += d[p * 4]; g += d[p * 4 + 1]; b += d[p * 4 + 2];
                    n++;
                }
            }
            smooth[i * 4] = r / n;
            smooth[i * 4 + 1] = g / n;
            smooth[i * 4 + 2] = b / n;
        }
    }
    const sx = Math.min(W - 1, Math.max(0, Math.round(xFrac * (W - 1))));
    const sy = Math.min(H - 1, Math.max(0, Math.round(yFrac * (H - 1))));
    const seed = sy * W + sx;
    const inMask = new Uint8Array(W * H);
    const q = [seed];
    inMask[seed] = 1;
    while (q.length) {
        const cur = q.pop();
        const x = cur % W;
        const y = (cur - x) / W;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
            const ni = ny * W + nx;
            if (inMask[ni]) continue;
            const localDiff =
                Math.abs(smooth[ni * 4] - smooth[cur * 4]) +
                Math.abs(smooth[ni * 4 + 1] - smooth[cur * 4 + 1]) +
                Math.abs(smooth[ni * 4 + 2] - smooth[cur * 4 + 2]);
            const seedDiff =
                Math.abs(smooth[ni * 4] - smooth[seed * 4]) +
                Math.abs(smooth[ni * 4 + 1] - smooth[seed * 4 + 1]) +
                Math.abs(smooth[ni * 4 + 2] - smooth[seed * 4 + 2]);
            // the same tolerances as the wall fill: walk smooth shading, stop
            // at real edges, stay near the tapped surface's colour
            if (localDiff < 18 && seedDiff < 90) {
                inMask[ni] = 1;
                q.push(ni);
            }
        }
    }
    // two hole-filling rounds: painted render never leaves speckles
    for (let pass = 0; pass < 2; pass++) {
        const changes = [];
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const i = y * W + x;
                let neighbours = 0;
                let total = 0;
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
                    const nx = x + dx, ny = y + dy;
                    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
                    total++;
                    if (inMask[ny * W + nx]) neighbours++;
                }
                if (total && (inMask[i] ? neighbours < 3 : neighbours > total * 0.62)) changes.push([i, !inMask[i]]);
            }
        }
        for (const [i, v] of changes) inMask[i] = v ? 1 : 0;
    }
    const mask = document.createElement("canvas");
    mask.width = img.naturalWidth;
    mask.height = img.naturalHeight;
    const mctx = mask.getContext("2d");
    const msmall = document.createElement("canvas");
    msmall.width = W;
    msmall.height = H;
    const msctx = msmall.getContext("2d");
    const id = msctx.createImageData(W, H);
    const [mr, mg, mb] = MASK_COLS[kind] || MASK_COLS.walls;
    for (let i = 0; i < W * H; i++) {
        if (inMask[i]) {
            id.data[i * 4] = mr;
            id.data[i * 4 + 1] = mg;
            id.data[i * 4 + 2] = mb;
            id.data[i * 4 + 3] = 255;
        }
    }
    msctx.putImageData(id, 0, 0);
    mctx.imageSmoothingEnabled = true;
    mctx.drawImage(msmall, 0, 0, mask.width, mask.height);
    sharpenMask(mctx, mask, [mr, mg, mb]);
    return mask;
}

/* Auto surface detection. kind 'walls': flood fill from upper-middle seeds.
   kind 'woodwork': finds smooth strips & panels — skirting boards, doors,
   frames (elongated or small components in the lower 3/4). Best-effort;
   the brush is always there to fix. Returns a mask canvas or null. */
export function detectWallMask(img, kind = "walls") {
    // woodwork analyses at near-full resolution: thin window frames (5-8px on
    // a visitor's photo) otherwise shrink to 1-2px at the analysis grid and
    // fragment past recovery — at 768 they keep a solid interior
    const W = kind === "woodwork" ? 768 : 256;
    const H = Math.max(1, Math.round((W * img.naturalHeight) / img.naturalWidth));
    const small = document.createElement("canvas");
    small.width = W;
    small.height = H;
    const sctx = small.getContext("2d");
    sctx.drawImage(img, 0, 0, W, H);
    const d = sctx.getImageData(0, 0, W, H).data;

    const pix = (p) => [d[p * 4], d[p * 4 + 1], d[p * 4 + 2]];
    const mask = document.createElement("canvas");
    mask.width = img.naturalWidth;
    mask.height = img.naturalHeight;
    const mctx = mask.getContext("2d");

    if (kind === "woodwork") {
        // TWO scales: the edge map is found at HALF scale — boundary lines are
        // 2px-thick there and photo grain averages away — then upscaled to the
        // full grid where thin frames (5-8px on a visitor's photo) keep a solid
        // interior. Either scale alone breaks: at half scale frames are 1-2px
        // and fragment, at full scale boundary lines are 1px and dissolve.
        const EW = Math.max(1, W >> 1);
        const EH = Math.max(1, H >> 1);
        const esmall = document.createElement("canvas");
        esmall.width = EW;
        esmall.height = EH;
        const ectx = esmall.getContext("2d");
        ectx.imageSmoothingEnabled = true;
        ectx.drawImage(small, 0, 0, EW, EH);
        const ed = ectx.getImageData(0, 0, EW, EH).data;
        const lum = new Float32Array(EW * EH);
        for (let i = 0; i < EW * EH; i++) lum[i] = 0.299 * ed[i * 4] + 0.587 * ed[i * 4 + 1] + 0.114 * ed[i * 4 + 2];
        const gray = new Float32Array(EW * EH);
        for (let y = 0; y < EH; y++) {
            for (let x = 0; x < EW; x++) {
                let sum = 0;
                let n = 0;
                for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < EW && ny >= 0 && ny < EH) {
                        sum += lum[ny * EW + nx];
                        n++;
                    }
                }
                gray[y * EW + x] = sum / n;
            }
        }
        const lowEdge = new Uint8Array(W * H);
        for (let y = 0; y < EH; y++) {
            for (let x = 0; x < EW; x++) {
                const i = y * EW + x;
                const gx = x + 1 < EW ? Math.abs(gray[i + 1] - gray[i]) : 0;
                const gy = y + 1 < EH ? Math.abs(gray[i + EW] - gray[i]) : 0;
                if (gx + gy < 14) {
                    lowEdge[y * 2 * W + x * 2] = 1;
                    if (x * 2 + 1 < W) lowEdge[y * 2 * W + x * 2 + 1] = 1;
                    if (y * 2 + 1 < H) lowEdge[(y * 2 + 1) * W + x * 2] = 1;
                    if (x * 2 + 1 < W && y * 2 + 1 < H) lowEdge[(y * 2 + 1) * W + x * 2 + 1] = 1;
                }
            }
        }
        const seen = new Uint8Array(W * H);
        let picks = [];
        for (let i = 0; i < W * H && picks.length < 8; i++) {
            if (!lowEdge[i] || seen[i]) continue;
            const q = [i];
            seen[i] = 1;
            const px = [];
            while (q.length) {
                const cur = q.pop();
                px.push(cur);
                const x = cur % W;
                const y = (cur - x) / W;
                // 8-connected: a thin frame's 4-connected strips fragment at
                // corner pixels and each fragment then falls under the area bar
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
                    const ni = ny * W + nx;
                    if (lowEdge[ni] && !seen[ni]) {
                        seen[ni] = 1;
                        q.push(ni);
                    }
                }
            }
            let minX = 999;
            let maxX = -1;
            let minY = 999;
            let maxY = -1;
            for (const p of px) {
                const x = p % W;
                const y = (p - x) / W;
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
            const cw = maxX - minX + 1;
            const ch = maxY - minY + 1;
            const area = px.length / (W * H);
            const horizontal = cw / ch > 3 && minY > H * 0.4;
            const vertical = ch / cw > 1.8 && cw < W * 0.35;
            // rectangular rings — window frames: a frame perimeter bounding a
            // hole (or a dark pane) has a boxy bounding box it only partly fills
            // (6%/5% minimums: a narrow window on a full-size photo is ~9% wide
            // and must still qualify)
            const fill = px.length / (cw * ch);
            const boxy = ch > H * 0.05 && cw > W * 0.06 && fill < 0.8 && cw / ch > 0.5 && ch / cw > 0.5;
            // 0.06%: a hairline frame ring (a 7px frame on a full-size photo
            // leaves a 1px smooth line) is tiny in area but it is exactly what
            // the visitor asked to paint; noise speckles stay well under
            if (area > 0.0006 && area < 0.08 && (horizontal || vertical || boxy)) picks.push(px);
        }
        // gates — one pass, per-pick stats computed once so no filter can
        // mislabel another's results: (a) trim is never the wall's own colour
        // (the owner's bug: woodwork grabbing walls), (b) never a
        // sky-reflecting pane (light + blue-leaning = glass), (c) never a pane
        // enclosed by a detected frame ring — the ring is the trim, while a
        // dark door inside its architrave is trim too and survives
        const wallParts = growWallParts(d, W, H);
        const wallLab = wallParts.length
            ? meanLab(wallParts.reduce((a, b) => (b.length > a.length ? b : a)), d)
            : null;
        const stats = picks.map((comp) => {
            let minX = 999, maxX = -1, minY = 999, maxY = -1, r = 0, g = 0, b = 0, L = 0;
            for (const p of comp) {
                const x = p % W;
                const y = (p - x) / W;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                r += d[p * 4];
                g += d[p * 4 + 1];
                b += d[p * 4 + 2];
                L += rgbToLab(d[p * 4], d[p * 4 + 1], d[p * 4 + 2])[0];
            }
            const n = comp.length;
            return { minX, maxX, minY, maxY, n, r: r / n, g: g / n, b: b / n, L: L / n, fill: n / ((maxX - minX + 1) * (maxY - minY + 1)) };
        });
        picks = picks.filter((_, k) => {
            const s = stats[k];
            if (wallLab && s.n >= 0.04 * W * H) {
                const [pL, pA, pB] = rgbToLab(Math.round(s.r), Math.round(s.g), Math.round(s.b));
                if (Math.hypot(pL - wallLab[0], pA - wallLab[1], pB - wallLab[2]) <= 12) return false;
            }
            if (s.b - s.r > 12 && s.L >= 50) return false;
            for (let j = 0; j < stats.length; j++) {
                if (j === k) continue;
                const t = stats[j];
                const inside =
                    s.minX >= t.minX - 2 && s.maxX <= t.maxX + 2 &&
                    s.minY >= t.minY - 2 && s.maxY <= t.maxY + 2;
                if (!inside) continue;
                const jBigger =
                    t.maxX - t.minX > s.maxX - s.minX || t.maxY - t.minY > s.maxY - s.minY;
                if ((jBigger || t.fill <= s.fill + 0.05) && s.L >= 45) return false;
            }
            return true;
        });
        if (picks.length) {
            const msmall = document.createElement("canvas");
            msmall.width = W;
            msmall.height = H;
            const msctx = msmall.getContext("2d");
            const id = msctx.createImageData(W, H);
            const [wr, wg, wb] = MASK_COLS.woodwork;
            for (const comp of picks) {
                for (const p of comp) {
                    id.data[p * 4] = wr;
                    id.data[p * 4 + 1] = wg;
                    id.data[p * 4 + 2] = wb;
                    id.data[p * 4 + 3] = 255;
                }
            }
            msctx.putImageData(id, 0, 0);
            mctx.imageSmoothingEnabled = true;
            mctx.drawImage(msmall, 0, 0, mask.width, mask.height);
            sharpenMask(mctx, mask, MASK_COLS.woodwork);
            return mask;
        }
        return null; // nothing woodwork-like found — caller falls back to brushing
    }

    // walls: region growing from a dense seed grid (shared with the woodwork
    // detector). A house can show SEVERAL wall faces (front wall + return wall
    // split by a downpipe or corner) — union every part that STICKS OUT of the
    // main face's bounding box. Openings (doors, windows) sit ENCLOSED inside
    // it, so they never join the walls mask.
    const parts = growWallParts(d, W, H);
    let best = null;
    if (parts.length) {
        parts.sort((a, b) => b.length - a.length);
        const bbox = (comp) => {
            let minX = 999, maxX = -1, minY = 999, maxY = -1;
            for (const p of comp) {
                const x = p % W;
                const y = (p - x) / W;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
            return [minX, maxX, minY, maxY];
        };
        const [px0, px1, py0, py1] = bbox(parts[0]);
        const slackX = W * 0.02;
        const slackY = H * 0.02;
        best = [...parts[0]];
        for (let k = 1; k < parts.length; k++) {
            const [x0, x1, y0, y1] = bbox(parts[k]);
            const enclosed = x0 >= px0 - slackX && x1 <= px1 + slackX && y0 >= py0 - slackY && y1 <= py1 + slackY;
            // a part that only extends BELOW the main face is ground/flooring
            // (extra wall faces stick out sideways or upward, never just down)
            const sticksDownOnly = y0 >= py0 - slackY && y1 > py1 + slackY;
            if (!enclosed && !sticksDownOnly) best.push(...parts[k]);
        }
    }
    const minArea = 0.08 * W * H;

    if (best) {
        // the bottom quarter of a photo is ground/flooring — never the walls
        best = best.filter((p) => (p - (p % W)) / W < H * 0.78);
        if (best.length < minArea) best = null;
    }

    if (best) {
        // hole-fill + boundary smoothing: a pixel joins if the wall surrounds
        // it, drops out if it's an isolated dot, and rounds of both pull the
        // jagged fill boundary toward a straighter edge
        const inMask = new Uint8Array(W * H);
        for (const p of best) inMask[p] = 1;
        for (let pass = 0; pass < 6; pass++) {
            const changes = [];
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    const i = y * W + x;
                    let neighbours = 0;
                    let total = 0;
                    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
                        const nx = x + dx, ny = y + dy;
                        if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
                            total++;
                            if (inMask[ny * W + nx]) neighbours++;
                        }
                    }
                    if (total && (inMask[i] ? neighbours < 3 : neighbours > total * 0.62)) {
                        changes.push([i, !inMask[i]]);
                    }
                }
            }
            if (!changes.length) break;
            for (const [i, val] of changes) inMask[i] = val ? 1 : 0;
        }
        best = [];
        for (let i = 0; i < W * H; i++) if (inMask[i]) best.push(i);
    }

    if (best) {
        const msmall = document.createElement("canvas");
        msmall.width = W;
        msmall.height = H;
        const msctx = msmall.getContext("2d");
        const id = msctx.createImageData(W, H);
        const [wr, wg, wb] = MASK_COLS.walls;
        for (const p of best) {
            id.data[p * 4] = wr;
            id.data[p * 4 + 1] = wg;
            id.data[p * 4 + 2] = wb;
            id.data[p * 4 + 3] = 255;
        }
        msctx.putImageData(id, 0, 0);
        mctx.imageSmoothingEnabled = true;
        mctx.drawImage(msmall, 0, 0, mask.width, mask.height);
        sharpenMask(mctx, mask, MASK_COLS.walls);
        return mask;
    }
    // honest failure: no blanket fill — the caller tells the visitor to brush
    // the area instead (auto-painting the top 45% of the photo covered doors,
    // windows and ground, which is exactly what visitors complained about)
    return null;
}

export function makeThumb(dataUrl, maxSide = 640) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            const c = document.createElement("canvas");
            c.width = Math.round(img.width * scale);
            c.height = Math.round(img.height * scale);
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL("image/jpeg", 0.8));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

export function drawColourWheel(canvas) {
    const ctx = canvas.getContext("2d");
    const R = canvas.width / 2;
    const img = ctx.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const dx = x - R;
            const dy = y - R;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const p = (y * canvas.width + x) * 4;
            if (dist > R) {
                img.data[p + 3] = 0;
                continue;
            }
            const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
            const sat = Math.min(1, dist / R);
            const [r, g, b] = hexToRgb(hsvToHex(hue, sat, 1));
            img.data[p] = r;
            img.data[p + 1] = g;
            img.data[p + 2] = b;
            img.data[p + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
}
