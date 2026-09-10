import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Archive, Download, Mail, Plus, Search, Send } from "lucide-react";
import { API_BASE, formatApiError } from "@/context/AuthContext";
import { StatusBadge, fmtDay, fmtMoney } from "@/components/admin/shared";
import { downloadInvoicePdf, invoicePdfBase64 } from "@/utils/invoicePdf";

/* Global invoice desk for the admin: generate invoices for any client, view
   paid + unpaid, search everything, send invoices to clients on the site
   (lands in their portal chat) or download a PDF to email yourself. */
export default function InvoicesView({ customers }) {
    const [invoices, setInvoices] = useState(null);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState("all");
    const [showForm, setShowForm] = useState(false);
    const [clientId, setClientId] = useState("");
    const [clientType, setClientType] = useState("registered");
    const [offsite, setOffsite] = useState({ name: "", email: "", address: "" });
    const [items, setItems] = useState([{ description: "", amount: "" }]);
    const [dueDate, setDueDate] = useState("");
    const [status, setStatus] = useState("draft");
    const [busy, setBusy] = useState(false);
    const [flash, setFlash] = useState("");
    const [error, setError] = useState("");
    const [emailRowId, setEmailRowId] = useState(null);
    const [emailTo, setEmailTo] = useState("");
    const [emailBusy, setEmailBusy] = useState(false);

    const load = async () => {
        try {
            const { data } = await axios.get(`${API_BASE}/admin/invoices`, {
                withCredentials: true,
            });
            setInvoices(data);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    useEffect(() => {
        load();
    }, []);

    const clientFor = (inv) => {
        if (inv.client_name) {
            return { name: inv.client_name, email: inv.client_email || "", address: inv.client_address || "" };
        }
        const c = customers.find((x) => x.id === inv.customer_id);
        return c ? { ...c, address: "" } : { name: "Unknown client", email: "", address: "" };
    };

    const flash_ = (msg) => {
        setFlash(msg);
        setTimeout(() => setFlash(""), 3200);
    };

    const create = async (e) => {
        e.preventDefault();
        if (clientType === "registered" && !clientId) {
            setError("Pick a client for the invoice.");
            return;
        }
        if (clientType === "offsite" && !offsite.name.trim()) {
            setError("Enter the client's name for an off-site invoice.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            await axios.post(
                `${API_BASE}/admin/invoices`,
                {
                    customer_id: clientType === "registered" ? clientId : "",
                    client_name: clientType === "offsite" ? offsite.name : "",
                    client_email: clientType === "offsite" ? offsite.email : "",
                    client_address: clientType === "offsite" ? offsite.address : "",
                    items: items.map((i) => ({
                        description: i.description,
                        amount: parseFloat(i.amount) || 0,
                    })),
                    due_date: dueDate,
                    status,
                },
                { withCredentials: true }
            );
            setOffsite({ name: "", email: "", address: "" });
            setItems([{ description: "", amount: "" }]);
            setDueDate("");
            setStatus("draft");
            setShowForm(false);
            flash_("Invoice created ✓");
            load();
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        } finally {
            setBusy(false);
        }
    };

    const sendToClient = async (inv) => {
        try {
            await axios.post(`${API_BASE}/admin/invoices/${inv.id}/send`, {}, { withCredentials: true });
            setInvoices((xs) => xs.map((x) => (x.id === inv.id ? { ...x, status: "sent" } : x)));
            flash_(`Invoice ${inv.number} sent to ${clientFor(inv).name} — it's in their chat.`);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    const markStatus = async (inv, value) => {
        setInvoices((xs) => xs.map((x) => (x.id === inv.id ? { ...x, status: value } : x)));
        try {
            await axios.patch(
                `${API_BASE}/admin/invoices/${inv.id}`,
                { status: value },
                { withCredentials: true }
            );
            flash_(`Invoice ${inv.number} marked ${value}.`);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    const openEmail = (inv) => {
        setEmailRowId((id) => (id === inv.id ? null : inv.id));
        setEmailTo(inv.client_email || "");
    };

    const emailInvoice = async (inv) => {
        const to = emailTo.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
            setError("Enter the email address to send this invoice to.");
            return;
        }
        setEmailBusy(true);
        setError("");
        try {
            const c = clientFor(inv);
            const pdf_base64 = await invoicePdfBase64(inv, c.name, c.email, c.address || "");
            const { data } = await axios.post(
                `${API_BASE}/admin/invoices/${inv.id}/email`,
                { to, pdf_base64, filename: `${inv.number}.pdf` },
                { withCredentials: true, timeout: 60000 }
            );
            setEmailRowId(null);
            setFlash(data.attached
                ? `Invoice ${inv.number} emailed to ${to} — the PDF is attached ✓`
                : `Invoice ${inv.number} emailed to ${to} ✓`);
            setTimeout(() => setFlash(""), 3600);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail) || "Couldn't send the email — please try again.");
            setTimeout(() => setError(""), 3600);
        } finally {
            setEmailBusy(false);
        }
    };

    const download = async (inv) => {
        const c = clientFor(inv);
        try {
            await downloadInvoicePdf(inv, c.name, c.email, c.address || "");
            flash_(`Invoice ${inv.number} downloaded — attach it to your email.`);
        } catch {
            setError("Couldn't build the PDF — please try again.");
        }
    };

    const filtered = useMemo(() => {
        if (!invoices) return null;
        const q = query.trim().toLowerCase();
        return invoices
            .filter((inv) =>
                filter === "all"
                    ? true
                    : filter === "paid"
                        ? inv.status === "paid"
                        : inv.status !== "paid"
            )
            .filter((inv) => {
                if (!q) return true;
                const c = clientFor(inv);
                const hay = `${inv.number} ${c.name} ${c.email} ${inv.status}`.toLowerCase();
                return hay.includes(q);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [invoices, query, filter, customers]);

    const unpaidCount = (invoices || []).filter((i) => i.status !== "paid").length;
    const paidCount = (invoices || []).filter((i) => i.status === "paid").length;

    return (
        <div className="space-y-8" data-testid="admin-invoices-view">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <p className="font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-ink/60">
                        Every invoice, one desk
                    </p>
                    <h1 className="mt-2 font-display text-4xl font-extrabold uppercase tracking-tight">
                        Invoices
                    </h1>
                </div>
                <button
                    data-testid="admin-invoice-generate"
                    onClick={() => {
                        setShowForm((s) => !s);
                        setClientId(customers.find((c) => !c.archived)?.id || "");
                    }}
                    className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-paper transition-transform hover:scale-105 active:scale-95"
                >
                    <Plus className="h-4 w-4" /> Generate invoice
                </button>
            </div>

            {showForm && (
                <form
                    onSubmit={create}
                    data-testid="admin-invoice-form"
                    className="space-y-4 rounded-3xl border border-ink/10 bg-white/85 p-6 shadow-[0_14px_40px_rgba(10,10,10,0.06)]"
                >
                    <div className="flex gap-2">
                        {[
                            { key: "registered", label: "Registered client", testid: "admin-invoice-type-registered" },
                            { key: "offsite", label: "Off-site client (no account)", testid: "admin-invoice-type-offsite" },
                        ].map((t) => (
                            <button
                                key={t.key}
                                type="button"
                                data-testid={t.testid}
                                onClick={() => setClientType(t.key)}
                                className={`rounded-full px-4 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.12em] transition-colors ${
                                    clientType === t.key ? "bg-ink text-paper" : "border border-ink/25 text-ink/70 hover:border-ink hover:text-ink"
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                        {clientType === "registered" ? (
                            <label className="block">
                                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink/55">Client</span>
                                <select
                                    data-testid="admin-invoice-client"
                                    value={clientId}
                                    onChange={(e) => setClientId(e.target.value)}
                                    className="mt-1.5 w-full rounded-xl border border-ink/20 bg-white px-3 py-2.5 text-sm font-medium"
                                >
                                    {customers.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name} — {c.email}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ) : (
                            <label className="block">
                                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink/55">Client name *</span>
                                <input
                                    data-testid="admin-invoice-offsite-name"
                                    placeholder="e.g. Sarah Hughes, Plympton"
                                    value={offsite.name}
                                    onChange={(e) => setOffsite((o) => ({ ...o, name: e.target.value }))}
                                    className="mt-1.5 w-full rounded-xl border border-ink/20 bg-white px-3 py-2.5 text-sm font-medium"
                                />
                            </label>
                        )}
                        <label className="block">
                            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink/55">Due date</span>
                            <input
                                data-testid="admin-invoice-due"
                                type="date"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                className="mt-1.5 w-full rounded-xl border border-ink/20 bg-white px-3 py-2.5 text-sm font-medium"
                            />
                        </label>
                        <label className="block">
                            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink/55">Starting status</span>
                            <select
                                data-testid="admin-invoice-status"
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                                className="mt-1.5 w-full rounded-xl border border-ink/20 bg-white px-3 py-2.5 text-sm font-medium"
                            >
                                <option value="draft">Draft</option>
                                <option value="sent">Sent</option>
                            </select>
                        </label>
                    </div>
                    {items.map((it, idx) => (
                        <div key={idx} className="grid gap-3 sm:grid-cols-[1fr_160px_44px]">
                            <input
                                data-testid={`admin-invoice-item-desc-${idx}`}
                                placeholder="What was done — e.g. Full repaint, 3-bed semi"
                                value={it.description}
                                onChange={(e) =>
                                    setItems((xs) => xs.map((x, j) => (j === idx ? { ...x, description: e.target.value } : x)))
                                }
                                className="rounded-xl border border-ink/20 bg-white px-3 py-2.5 text-sm font-medium"
                            />
                            <input
                                data-testid={`admin-invoice-item-amount-${idx}`}
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="£ Amount"
                                value={it.amount}
                                onChange={(e) =>
                                    setItems((xs) => xs.map((x, j) => (j === idx ? { ...x, amount: e.target.value } : x)))
                                }
                                className="rounded-xl border border-ink/20 bg-white px-3 py-2.5 text-sm font-medium"
                            />
                            {items.length > 1 && (
                                <button
                                    type="button"
                                    data-testid={`admin-invoice-item-remove-${idx}`}
                                    onClick={() => setItems((xs) => xs.filter((_, j) => j !== idx))}
                                    className="rounded-xl border border-ink/20 font-mono text-xs text-ink/60 hover:border-ink hover:text-ink"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    ))}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <button
                            type="button"
                            data-testid="admin-invoice-add-item"
                            onClick={() => setItems((xs) => [...xs, { description: "", amount: "" }])}
                            className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-ink/60 hover:text-ink"
                        >
                            + Add line
                        </button>
                        <p className="font-display text-xl font-extrabold tracking-tight">
                            Total {fmtMoney(items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0))}
                        </p>
                        <button
                            type="submit"
                            data-testid="admin-invoice-create"
                            disabled={busy}
                            className="rounded-full bg-ink px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
                        >
                            {busy ? "Creating…" : "Create invoice"}
                        </button>
                    </div>
                </form>
            )}

            <div className="flex flex-wrap items-center gap-3">
                <label className="relative flex-1 sm:max-w-sm">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
                    <input
                        data-testid="admin-invoice-search"
                        placeholder="Search invoice, client or status…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="w-full rounded-full border border-ink/20 bg-white/85 py-3 pl-11 pr-4 text-sm font-medium backdrop-blur-sm"
                    />
                </label>
                <div className="flex gap-2">
                    {[
                        { key: "all", label: `All ${(invoices || []).length}` },
                        { key: "unpaid", label: `Unpaid ${unpaidCount}` },
                        { key: "paid", label: `Paid ${paidCount}` },
                    ].map((f) => (
                        <button
                            key={f.key}
                            data-testid={`admin-invoice-filter-${f.key}`}
                            onClick={() => setFilter(f.key)}
                            className={`rounded-full px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] transition-colors ${
                                filter === f.key ? "bg-ink text-paper" : "border border-ink/25 text-ink/70 hover:border-ink hover:text-ink"
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {flash && (
                <p className="rounded-xl bg-[#C6A55C]/15 px-4 py-3 text-sm font-medium text-ink/80" data-testid="admin-invoice-flash">
                    {flash}
                </p>
            )}
            {error && (
                <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm font-medium text-red-700" data-testid="admin-invoice-error">
                    {error}
                </p>
            )}

            <div className="space-y-3">
                {filtered === null ? (
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink/50">Loading…</p>
                ) : filtered.length === 0 ? (
                    <div className="rounded-3xl border border-ink/10 bg-white/85 p-8 text-center">
                        <p className="text-sm font-medium text-ink/55" data-testid="admin-invoice-empty">
                            No invoices match — try a different search or generate one above.
                        </p>
                    </div>
                ) : (
                    filtered.map((inv, i) => {
                        const c = clientFor(inv);
                        return (
                            <div
                                key={inv.id}
                                data-testid={`admin-invoice-row-${i}`}
                                className="flex flex-wrap items-center gap-4 rounded-2xl border border-ink/10 bg-white/85 p-4 shadow-[0_10px_30px_rgba(10,10,10,0.05)]"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="flex items-center gap-2 font-display text-base font-bold uppercase tracking-tight">
                                        {inv.number}
                                        <StatusBadge value={inv.status} />
                                    </p>
                                    <p className="truncate text-xs font-medium text-ink/55">
                                        {c.name}
                                        {!inv.customer_id && <span className="ml-1.5 rounded-full bg-ink/10 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-ink/60">Off-site</span>}
                                        {c.email ? ` · ${c.email}` : ""} · due {fmtDay(inv.due_date)}
                                    </p>
                                    <p className="mt-0.5 truncate text-xs text-ink/45">
                                        {(inv.items || []).map((it) => it.description).filter(Boolean).join(", ") || "—"}
                                    </p>
                                </div>
                                <p className="font-display text-xl font-extrabold tracking-tight">{fmtMoney(inv.total)}</p>
                                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                                    {inv.status === "paid" ? (
                                        <button
                                            data-testid={`admin-invoice-unmark-${i}`}
                                            onClick={() => markStatus(inv, "sent")}
                                            className="rounded-full border border-ink/20 px-3.5 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-ink/60 hover:border-ink hover:text-ink"
                                        >
                                            Mark unpaid
                                        </button>
                                    ) : (
                                        <>
                                            {inv.customer_id && inv.status !== "sent" && (
                                                <button
                                                    data-testid={`admin-invoice-send-${i}`}
                                                    onClick={() => sendToClient(inv)}
                                                    title="Send to the client on the site — lands in their chat"
                                                    className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-paper hover:opacity-90"
                                                >
                                                    <Send className="h-3 w-3" /> Send to client
                                                </button>
                                            )}
                                            <button
                                                data-testid={`admin-invoice-paid-${i}`}
                                                onClick={() => markStatus(inv, "paid")}
                                                className="rounded-full border border-ink/20 px-3.5 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-ink/70 hover:border-ink hover:text-ink"
                                            >
                                                Mark paid
                                            </button>
                                        </>
                                    )}
                                    <button
                                        data-testid={`admin-invoice-email-${i}`}
                                        onClick={() => openEmail(inv)}
                                        title="Send the invoice straight to an email address"
                                        className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 px-3.5 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-ink/70 hover:border-ink hover:text-ink"
                                    >
                                        <Mail className="h-3 w-3" /> Email
                                    </button>
                                    <button
                                        data-testid={`admin-invoice-download-${i}`}
                                        onClick={() => download(inv)}
                                        title="Download the PDF to attach to an email"
                                        className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 px-3.5 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-ink/70 hover:border-ink hover:text-ink"
                                    >
                                        <Download className="h-3 w-3" /> Download
                                    </button>
                                </div>
                                {emailRowId === inv.id && (
                                    <div className="mt-3 flex w-full flex-wrap items-center gap-2" data-testid={`admin-invoice-email-box-${i}`}>
                                        <input
                                            data-testid={`admin-invoice-email-input-${i}`}
                                            placeholder="client@example.com"
                                            value={emailTo}
                                            onChange={(e) => setEmailTo(e.target.value)}
                                            className="min-w-0 flex-1 rounded-full border border-ink/20 bg-white px-4 py-2.5 text-sm font-medium"
                                        />
                                        <button
                                            data-testid={`admin-invoice-email-send-${i}`}
                                            onClick={() => emailInvoice(inv)}
                                            disabled={emailBusy}
                                            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
                                        >
                                            <Send className="h-3 w-3" /> {emailBusy ? "Sending…" : "Send invoice"}
                                        </button>
                                        <button
                                            data-testid={`admin-invoice-email-cancel-${i}`}
                                            onClick={() => setEmailRowId(null)}
                                            className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-ink/50 hover:text-ink"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
