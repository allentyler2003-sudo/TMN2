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
        const c = v > 0.04045 ? 1.055 * Math.pow(v, 1 / 2.4) - 0.055 : 12.92 * v;
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

/* Auto surface detection. kind 'walls': flood fill from upper-middle seeds.
   kind 'woodwork': finds smooth strips & panels — skirting boards, doors,
   frames (elongated or small components in the lower 3/4). Best-effort;
   the brush is always there to fix. Returns a mask canvas or null. */
export function detectWallMask(img, kind = "walls") {
    const W = 160;
    const H = Math.max(1, Math.round((160 * img.naturalHeight) / img.naturalWidth));
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
        const gray = new Float32Array(W * H);
        for (let i = 0; i < W * H; i++) gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
        const lowEdge = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const i = y * W + x;
                const gx = x + 1 < W ? Math.abs(gray[i + 1] - gray[i]) : 0;
                const gy = y + 1 < H ? Math.abs(gray[i + W] - gray[i]) : 0;
                lowEdge[i] = gx + gy < 14 ? 1 : 0;
            }
        }
        const seen = new Uint8Array(W * H);
        const picks = [];
        for (let i = 0; i < W * H && picks.length < 3; i++) {
            if (!lowEdge[i] || seen[i]) continue;
            const q = [i];
            seen[i] = 1;
            const px = [];
            while (q.length) {
                const cur = q.pop();
                px.push(cur);
                const x = cur % W;
                const y = (cur - x) / W;
                if (x + 1 < W && lowEdge[cur + 1] && !seen[cur + 1]) { seen[cur + 1] = 1; q.push(cur + 1); }
                if (x - 1 >= 0 && lowEdge[cur - 1] && !seen[cur - 1]) { seen[cur - 1] = 1; q.push(cur - 1); }
                if (y + 1 < H && lowEdge[cur + W] && !seen[cur + W]) { seen[cur + W] = 1; q.push(cur + W); }
                if (y - 1 >= 0 && lowEdge[cur - W] && !seen[cur - W]) { seen[cur - W] = 1; q.push(cur - W); }
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
            const horizontal = cw / ch > 3 && minY > H * 0.45;
            const vertical = ch / cw > 1.8 && cw < W * 0.3;
            if (area > 0.003 && area < 0.12 && (horizontal || vertical)) picks.push(px);
        }
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
            return mask;
        }
        return null; // nothing woodwork-like found — caller falls back to brushing
    }

    // walls: region growing from upper-middle seeds. Acceptance is LOCAL (walks
    // smooth shading gradients right to the wall's true edges) with hole-filling
    // afterwards so textured render never leaves speckles.
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
    const seeds = [];
    for (const fy of [0.2, 0.32, 0.44]) {
        for (const fx of [0.3, 0.5, 0.7]) {
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
    let best = null;
    const minArea = 0.1 * W * H;
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
            if (comp.length > 0.72 * W * H) { overflow = true; break; }
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
                // are refused) while still walking smooth shading gradients
                if (localDiff < 26 && seedDiff < 90) {
                    local[ni] = 1;
                    q.push(ni);
                }
            }
        }
        for (const p of comp) seen[p] = 1;
        if (overflow) continue;
        if (comp.length < minArea) continue;
        if (!best || comp.length > best.length) best = comp;
    }

    if (best) {
        // the bottom quarter of a photo is ground/flooring — never the walls
        best = best.filter((p) => (p - (p % W)) / W < H * 0.78);
        if (best.length < minArea) best = null;
    }

    if (best) {
        // hole-fill + speckle removal: a pixel joins if the wall surrounds it,
        // and drops out if it's an isolated dot inside the region
        const inMask = new Uint8Array(W * H);
        for (const p of best) inMask[p] = 1;
        for (let pass = 0; pass < 3; pass++) {
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
                    if (total && (inMask[i] ? neighbours < 3 : neighbours > total * 0.72)) {
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
