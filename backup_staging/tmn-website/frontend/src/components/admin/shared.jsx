const STYLES = {
    scheduled: "border border-ink/30 text-ink/70",
    "in progress": "bg-ink text-paper",
    completed: "bg-ink/10 text-ink",
    draft: "border border-ink/30 text-ink/70",
    sent: "bg-ink/10 text-ink",
    paid: "bg-ink text-paper",
};

export function StatusBadge({ value }) {
    return (
        <span
            className={`inline-block rounded-full px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.15em] ${
                STYLES[value] || "border border-ink/30 text-ink/70"
            }`}
        >
            {value}
        </span>
    );
}

export const fmtDate = (iso) =>
    new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });

export const fmtDay = (value) => {
    if (!value) return "—";
    const d = new Date(`${value}T00:00:00`);
    return isNaN(d) ? value : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

export const fmtMoney = (n) =>
    `£${Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
