import { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE, formatApiError } from "@/context/AuthContext";
import { StatusBadge, fmtDay, fmtMoney } from "@/components/admin/shared";
import { downloadInvoicePdf } from "@/utils/invoicePdf";

export default function InvoicesTab({ customer }) {
    const [invoices, setInvoices] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [items, setItems] = useState([{ description: "", amount: "" }]);
    const [dueDate, setDueDate] = useState("");
    const [status, setStatus] = useState("draft");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const load = async () => {
        if (!customer) return;
        try {
            const { data } = await axios.get(
                `${API_BASE}/admin/invoices?customer_id=${customer.id}`,
                { withCredentials: true }
            );
            setInvoices(data);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    useEffect(() => {
        setInvoices([]);
        setShowForm(false);
        setItems([{ description: "", amount: "" }]);
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customer?.id]);

    const total = items.reduce(
        (sum, i) => sum + (parseFloat(i.amount) || 0),
        0
    );

    const create = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            await axios.post(
                `${API_BASE}/admin/invoices`,
                {
                    customer_id: customer.id,
                    items: items.map((i) => ({
                        description: i.description,
                        amount: parseFloat(i.amount) || 0,
                    })),
                    due_date: dueDate,
                    status,
                },
                { withCredentials: true }
            );
            setItems([{ description: "", amount: "" }]);
            setDueDate("");
            setStatus("draft");
            setShowForm(false);
            load();
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        } finally {
            setBusy(false);
        }
    };

    const setStatusFor = async (invoice, value) => {
        setInvoices((inv) => inv.map((x) => (x.id === invoice.id ? { ...x, status: value } : x)));
        try {
            await axios.patch(
                `${API_BASE}/admin/invoices/${invoice.id}`,
                { status: value },
                { withCredentials: true }
            );
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
            load();
        }
    };

    return (
        <div className="h-[calc(65vh-64px)] overflow-y-auto px-6 py-5">
            <div className="mb-5 flex items-center justify-between">
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-ink/55">
                    {invoices.length} invoice{invoices.length === 1 ? "" : "s"} on file
                </p>
                <button
                    data-testid="admin-invoice-new-button"
                    onClick={() => setShowForm((s) => !s)}
                    className="rounded-full bg-ink px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper transition-transform hover:scale-105 active:scale-95"
                >
                    {showForm ? "Cancel" : "+ New invoice"}
                </button>
            </div>

            {showForm && (
                <form
                    onSubmit={create}
                    data-testid="admin-invoice-form"
                    className="mb-6 space-y-4 rounded-2xl border border-ink/15 bg-white/80 p-5"
                >
                    {items.map((item, i) => (
                        <div key={i} className="flex flex-wrap gap-3">
                            <input
                                data-testid={`admin-invoice-item-desc-${i}`}
                                value={item.description}
                                onChange={(e) =>
                                    setItems((arr) =>
                                        arr.map((x, j) => (j === i ? { ...x, description: e.target.value } : x))
                                    )
                                }
                                placeholder="Line item — e.g. Living room repaint (walls + ceiling)"
                                required
                                minLength={1}
                                className="min-w-0 flex-1 rounded-xl border border-ink/20 bg-transparent px-4 py-3 text-sm font-medium placeholder:text-ink/40 focus:border-ink focus:outline-none"
                            />
                            <input
                                data-testid={`admin-invoice-item-amount-${i}`}
                                value={item.amount}
                                onChange={(e) =>
                                    setItems((arr) =>
                                        arr.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x))
                                    )
                                }
                                placeholder="£ 0.00"
                                type="number"
                                min="0"
                                step="0.01"
                                required
                                className="w-32 rounded-xl border border-ink/20 bg-transparent px-4 py-3 text-sm font-medium placeholder:text-ink/40 focus:border-ink focus:outline-none"
                            />
                            {items.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => setItems((arr) => arr.filter((_, j) => j !== i))}
                                    className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-red-600"
                                >
                                    Remove
                                </button>
                            )}
                        </div>
                    ))}
                    <button
                        type="button"
                        data-testid="admin-invoice-add-line"
                        onClick={() => setItems((arr) => [...arr, { description: "", amount: "" }])}
                        className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink/60 hover:text-ink"
                    >
                        + Add line item
                    </button>
                    <div className="flex flex-wrap items-center gap-3 border-t border-ink/10 pt-4">
                        <input
                            data-testid="admin-invoice-due-input"
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            required
                            className="rounded-xl border border-ink/20 bg-transparent px-4 py-3 text-sm font-medium focus:border-ink focus:outline-none"
                        />
                        <select
                            data-testid="admin-invoice-status-select"
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="rounded-xl border border-ink/20 bg-transparent px-4 py-3 text-sm font-medium focus:border-ink focus:outline-none"
                        >
                            <option value="draft">Draft</option>
                            <option value="sent">Sent</option>
                            <option value="paid">Paid</option>
                        </select>
                        <span className="ml-auto font-display text-lg font-bold">
                            Total: {fmtMoney(total)}
                        </span>
                        <button
                            type="submit"
                            disabled={busy}
                            data-testid="admin-invoice-create-button"
                            className="rounded-full bg-ink px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper disabled:opacity-40"
                        >
                            Create invoice
                        </button>
                    </div>
                </form>
            )}

            {error && <p className="mb-4 text-sm font-medium text-red-700">{error}</p>}

            <div className="space-y-3">
                {invoices.length === 0 && (
                    <p className="pt-10 text-center text-sm font-medium text-ink/55">
                        No invoices yet. Create one and the customer sees it in their account.
                    </p>
                )}
                {invoices.map((inv) => (
                    <div
                        key={inv.id}
                        data-testid={`admin-invoice-card-${inv.id}`}
                        className="rounded-2xl border border-ink/12 bg-white/80 p-5"
                    >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <span className="font-display text-base font-bold uppercase tracking-tight">
                                    {inv.number}
                                </span>
                                <span className="ml-3 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-ink/55">
                                    Due {fmtDay(inv.due_date)}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="font-display text-lg font-bold">
                                    {fmtMoney(inv.total)}
                                </span>
                                <select
                                    data-testid={`admin-invoice-status-${inv.id}`}
                                    value={inv.status}
                                    onChange={(e) => setStatusFor(inv, e.target.value)}
                                    className="rounded-full border border-ink/20 bg-transparent px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] focus:border-ink focus:outline-none"
                                >
                                    <option value="draft">Draft</option>
                                    <option value="sent">Sent</option>
                                    <option value="paid">Paid</option>
                                </select>
                            </div>
                        </div>
                        <ul className="mt-3 space-y-1">
                            {inv.items.map((i, j) => (
                                <li
                                    key={j}
                                    className="flex justify-between text-sm font-medium text-ink/75"
                                >
                                    <span>{i.description}</span>
                                    <span>{fmtMoney(i.amount)}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="mt-3 flex items-center gap-3">
                            <StatusBadge value={inv.status} />
                            <button
                                data-testid={`admin-invoice-pdf-${inv.id}`}
                                onClick={() => downloadInvoicePdf(inv, customer?.name, customer?.email)}
                                className="rounded-full border border-ink/25 px-4 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                            >
                                PDF
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
