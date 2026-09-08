import { useEffect, useState } from "react";
import axios from "axios";
import { Check, Pencil, Search, X } from "lucide-react";
import { API_BASE, formatApiError } from "@/context/AuthContext";
import { StatusBadge, fmtDate, fmtDay, fmtMoney } from "@/components/admin/shared";

function ClientRecord({ client, onRename }) {
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(client.name);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const save = async () => {
        if (name.trim().length < 2) return;
        setBusy(true);
        try {
            await axios.patch(
                `${API_BASE}/admin/customers/${client.id}`,
                { name: name.trim() },
                { withCredentials: true }
            );
            onRename(client.id, name.trim());
            setEditing(false);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-3xl border border-ink/12 bg-white/80 p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink/10 pb-5">
                <div>
                    {editing ? (
                        <div className="flex items-center gap-2">
                            <input
                                data-testid="admin-name-input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="rounded-xl border border-ink/25 bg-transparent px-4 py-2 font-display text-lg font-bold uppercase tracking-tight focus:border-ink focus:outline-none"
                            />
                            <button
                                data-testid="admin-name-save"
                                onClick={save}
                                disabled={busy}
                                aria-label="Save name"
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-paper disabled:opacity-40"
                            >
                                <Check className="h-4 w-4" />
                            </button>
                            <button
                                onClick={() => {
                                    setEditing(false);
                                    setName(client.name);
                                }}
                                aria-label="Cancel"
                                className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/25 text-ink/60"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                            <h3
                                data-testid={`client-record-name-${client.email}`}
                                className="font-display text-2xl font-extrabold uppercase tracking-tight"
                            >
                                {client.name}
                            </h3>
                            <button
                                data-testid={`admin-edit-name-button-${client.email}`}
                                onClick={() => setEditing(true)}
                                aria-label="Edit customer name"
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/25 text-ink/60 transition-colors hover:border-ink hover:text-ink"
                            >
                                <Pencil className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    )}
                    <p className="mt-1 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-ink/55">
                        {client.email} · customer since{" "}
                        {client.created_at
                            ? new Date(client.created_at).toLocaleDateString("en-GB", {
                                  day: "numeric",
                                  month: "long",
                                  year: "numeric",
                              })
                            : "—"}
                    </p>
                    {error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}
                </div>
                <div className="grid grid-cols-3 gap-4 text-center font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-ink/60">
                    <div>
                        <p className="font-display text-xl font-extrabold text-ink">{client.jobs.length}</p>
                        jobs
                    </div>
                    <div>
                        <p className="font-display text-xl font-extrabold text-ink">{fmtMoney(client.total_invoiced)}</p>
                        invoiced
                    </div>
                    <div>
                        <p className="font-display text-xl font-extrabold text-ink">{fmtMoney(client.total_unpaid)}</p>
                        unpaid
                    </div>
                </div>
            </div>

            <div className="grid gap-8 pt-6 lg:grid-cols-2">
                {/* jobs */}
                <section>
                    <h4 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/60">
                        Jobs ({client.jobs.length})
                    </h4>
                    <div className="space-y-2.5">
                        {client.jobs.length === 0 && (
                            <p className="text-sm font-medium text-ink/45">No jobs on file.</p>
                        )}
                        {client.jobs.map((j) => (
                            <div key={j.id} className="rounded-xl border border-ink/12 p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-bold">{j.title}</span>
                                    <StatusBadge value={j.status} />
                                </div>
                                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-ink/50">
                                    {fmtDay(j.scheduled_date)}
                                </p>
                                {j.description && (
                                    <p className="mt-2 text-sm font-medium text-ink/70">{j.description}</p>
                                )}
                            </div>
                        ))}
                    </div>
                </section>

                {/* invoices */}
                <section>
                    <h4 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/60">
                        Invoices ({client.invoices.length})
                    </h4>
                    <div className="space-y-2.5">
                        {client.invoices.length === 0 && (
                            <p className="text-sm font-medium text-ink/45">No invoices on file.</p>
                        )}
                        {client.invoices.map((i) => (
                            <div key={i.id} className="rounded-xl border border-ink/12 p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-bold">{i.number}</span>
                                    <StatusBadge value={i.status} />
                                </div>
                                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-ink/50">
                                    Due {fmtDay(i.due_date)} · {fmtMoney(i.total)}
                                </p>
                                <ul className="mt-2 space-y-0.5">
                                    {i.items.map((it, j) => (
                                        <li key={j} className="flex justify-between text-xs font-medium text-ink/65">
                                            <span>{it.description}</span>
                                            <span>{fmtMoney(it.amount)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>

                {/* notes */}
                <section>
                    <h4 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/60">
                        Notes ({client.notes.length})
                    </h4>
                    <div className="space-y-2.5">
                        {client.notes.length === 0 && (
                            <p className="text-sm font-medium text-ink/45">No notes on file.</p>
                        )}
                        {client.notes.map((n) => (
                            <div key={n.id} className="rounded-xl border border-ink/12 p-4">
                                <p className="text-sm font-medium text-ink/80">{n.text}</p>
                                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-ink/45">
                                    {fmtDate(n.created_at)}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* messages */}
                <section>
                    <h4 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/60">
                        Messages ({client.messages.length})
                    </h4>
                    <div className="max-h-72 space-y-2 overflow-y-auto">
                        {client.messages.length === 0 && (
                            <p className="text-sm font-medium text-ink/45">No messages on file.</p>
                        )}
                        {client.messages.map((m) => (
                            <div key={m.id} className="rounded-xl border border-ink/12 p-3.5">
                                <p className="text-sm font-medium text-ink/80">
                                    <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink/50">
                                        {m.sender === "admin" ? "TMN" : "Customer"} ·{" "}
                                    </span>
                                    {m.text}
                                </p>
                                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-ink/45">
                                    {fmtDate(m.created_at)}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}

export default function ClientsView() {
    const [clients, setClients] = useState([]);
    const [search, setSearch] = useState("");
    const [openId, setOpenId] = useState(null);
    const [error, setError] = useState("");

    const load = async () => {
        try {
            const { data } = await axios.get(`${API_BASE}/admin/clients`, {
                withCredentials: true,
            });
            setClients(data);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    useEffect(() => {
        load();
    }, []);

    const q = search.trim().toLowerCase();
    const matches = (c) => {
        if (!q) return true;
        if (c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)) return true;
        return (
            c.jobs.some((j) => `${j.title} ${j.description}`.toLowerCase().includes(q)) ||
            c.notes.some((n) => n.text.toLowerCase().includes(q)) ||
            c.messages.some((m) => m.text.toLowerCase().includes(q)) ||
            c.invoices.some((i) => i.number.toLowerCase().includes(q))
        );
    };
    const visible = clients.filter(matches);

    const rename = (id, name) => {
        setClients((cs) => cs.map((c) => (c.id === id ? { ...c, name } : c)));
    };

    return (
        <div>
            <div className="mb-6 flex flex-wrap items-center gap-4">
                <div className="relative w-full max-w-md">
                    <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
                    <input
                        data-testid="admin-clients-search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search customers, jobs, notes, messages, invoices…"
                        className="w-full rounded-full border border-ink/20 bg-white/70 py-3.5 pl-11 pr-5 text-sm font-medium placeholder:text-ink/40 focus:border-ink focus:outline-none"
                    />
                </div>
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-ink/50">
                    {visible.length} of {clients.length} shown
                </span>
            </div>

            {error && <p className="mb-4 text-sm font-medium text-red-700">{error}</p>}

            <div className="space-y-4">
                {visible.length === 0 && (
                    <p className="py-16 text-center text-sm font-medium text-ink/55">
                        {clients.length === 0
                            ? "No clients yet — records appear here once customers register."
                            : `Nothing matches "${search}".`}
                    </p>
                )}
                {visible.map((c) => (
                    <div
                        key={c.id}
                        data-testid={`client-record-card-${c.email}`}
                        className="rounded-3xl border border-ink/12 bg-white/60 backdrop-blur-xl"
                    >
                        <button
                            onClick={() => setOpenId(openId === c.id ? null : c.id)}
                            className="flex w-full flex-wrap items-center justify-between gap-4 p-6 text-left"
                        >
                            <div>
                                <span className="font-display text-lg font-extrabold uppercase tracking-tight">
                                    {c.name}
                                </span>
                                <span className="ml-3 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-ink/50">
                                    {c.email}
                                </span>
                            </div>
                            <div className="flex items-center gap-5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-ink/60">
                                <span>{c.jobs.length} jobs</span>
                                <span>{fmtMoney(c.total_invoiced)} invoiced</span>
                                {c.total_unpaid > 0 && (
                                    <span className="rounded-full bg-ink px-3 py-1 text-paper">
                                        {fmtMoney(c.total_unpaid)} unpaid
                                    </span>
                                )}
                                <span
                                    className={`inline-block transition-transform duration-300 ${
                                        openId === c.id ? "rotate-180" : ""
                                    }`}
                                >
                                    ▾
                                </span>
                            </div>
                        </button>
                        {openId === c.id && (
                            <div className="px-6 pb-6">
                                <ClientRecord client={c} onRename={rename} />
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
