/* Colour engine for the TMN visualiser — pure client-side, zero cost.
   Paint-true recolouring keeps the photo's own lightness and shading. */

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

export function recolourImage(baseImg, maskCanvas, targetHex, onDone) {
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
        out.data[p] = r * (1 - m) + nr * m;
        out.data[p + 1] = g * (1 - m) + ng * m;
        out.data[p + 2] = b * (1 - m) + nb * m;
        out.data[p + 3] = 255;
    }
    bctx.putImageData(out, 0, 0);
    onDone(base.toDataURL("image/jpeg", 0.92));
}

/* Auto wall detection: flood-fill from seed points in the upper-middle of the
   photo (where walls live) — the fill naturally stops at floors, ceilings,
   windows and sky. Seeds that land on sky are discarded. Pure client-side. */
export function detectWallMask(img) {
    const W = 160;
    const H = Math.max(1, Math.round((160 * img.naturalHeight) / img.naturalWidth));
    const small = document.createElement("canvas");
    small.width = W;
    small.height = H;
    const sctx = small.getContext("2d");
    sctx.drawImage(img, 0, 0, W, H);
    const d = sctx.getImageData(0, 0, W, H).data;

    const pix = (p) => [d[p * 4], d[p * 4 + 1], d[p * 4 + 2]];
    const within = (p, ref, tol) => {
        const [r, g, b] = pix(p);
        return (
            Math.abs(r - ref[0]) <= tol &&
            Math.abs(g - ref[1]) <= tol &&
            Math.abs(b - ref[2]) <= tol
        );
    };

    const seeds = [];
    for (const fy of [0.2, 0.32, 0.44]) {
        for (const fx of [0.3, 0.5, 0.7]) {
            seeds.push([Math.round(fy * (H - 1)) * W + Math.round(fx * (W - 1))]);
        }
    }

    const isSky = (comp) => {
        let touchesTop = false;
        let sumR = 0;
        let sumB = 0;
        for (const p of comp) {
            const x = p % W;
            const y = (p - x) / W;
            if (y < H * 0.06) touchesTop = true;
            sumR += d[p * 4];
            sumB += d[p * 4 + 2];
        }
        return touchesTop && sumB / comp.length > sumR / comp.length + 12;
    };

    const seen = new Uint8Array(W * H);
    let best = null;
    const minArea = 0.1 * W * H;
    const maxArea = 0.72 * W * H;

    for (const [seed] of seeds) {
        if (seen[seed]) continue;
        const ref = pix(seed);
        const comp = [];
        const local = new Uint8Array(W * H);
        const q = [seed];
        local[seed] = 1;
        let escaped = false;
        while (q.length) {
            const cur = q.pop();
            comp.push(cur);
            if (comp.length > maxArea) {
                escaped = true;
                break;
            }
            const x = cur % W;
            const y = (cur - x) / W;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
                const ni = ny * W + nx;
                if (local[ni] || seen[ni]) continue;
                if (within(ni, ref, 26)) {
                    local[ni] = 1;
                    q.push(ni);
                }
            }
        }
        for (const p of comp) seen[p] = 1;
        if (escaped) continue;
        const frac = comp.length / (W * H);
        if (comp.length < minArea || frac > maxArea / (W * H)) continue;
        if (isSky(comp)) continue;
        if (!best || comp.length > best.length) best = comp;
    }

    const mask = document.createElement("canvas");
    mask.width = img.naturalWidth;
    mask.height = img.naturalHeight;
    const mctx = mask.getContext("2d");
    if (best) {
        const msmall = document.createElement("canvas");
        msmall.width = W;
        msmall.height = H;
        const msctx = msmall.getContext("2d");
        const id = msctx.createImageData(W, H);
        for (const p of best) {
            id.data[p * 4] = 230;
            id.data[p * 4 + 1] = 57;
            id.data[p * 4 + 2] = 70;
            id.data[p * 4 + 3] = 255;
        }
        msctx.putImageData(id, 0, 0);
        mctx.imageSmoothingEnabled = true;
        mctx.drawImage(msmall, 0, 0, mask.width, mask.height);
    } else {
        mctx.fillStyle = "rgb(230, 57, 70)";
        mctx.fillRect(0, 0, mask.width, mask.height * 0.45);
    }
    return mask;
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
