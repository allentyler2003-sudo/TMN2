import { useEffect, useState } from "react";
import axios from "axios";
import { Check, Pencil, Pin, X } from "lucide-react";
import { API_BASE, formatApiError, useAuth } from "@/context/AuthContext";
import ChatTab from "@/components/admin/ChatTab";
import JobsTab from "@/components/admin/JobsTab";
import NotesTab from "@/components/admin/NotesTab";
import InvoicesTab from "@/components/admin/InvoicesTab";
import ClientsView from "@/components/admin/ClientsView";
import StatsView from "@/components/admin/StatsView";

const TABS = ["Chat", "Jobs", "Notes", "Invoices"];

export default function Admin() {
    const { user, logout } = useAuth();
    const [view, setView] = useState("inbox");
    const [customers, setCustomers] = useState([]);
    const [stats, setStats] = useState(null);
    const [activeId, setActiveId] = useState(null);
    const [tab, setTab] = useState("Chat");
    const [error, setError] = useState("");
    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState("");
    const [favourites, setFavourites] = useState(null);

    const loadCustomers = async () => {
        try {
            const { data } = await axios.get(`${API_BASE}/admin/customers`, {
                withCredentials: true,
            });
            setCustomers(data);
            setActiveId((cur) => cur || (data[0] ? data[0].id : null));
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    const loadStats = async () => {
        try {
            const { data } = await axios.get(`${API_BASE}/admin/stats`, {
                withCredentials: true,
            });
            setStats(data);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    const loadFavourites = async () => {
        try {
            const { data } = await axios.get(`${API_BASE}/admin/favourites`, {
                withCredentials: true,
            });
            setFavourites(data);
        } catch {
            /* non-blocking */
        }
    };

    useEffect(() => {
        loadCustomers();
        loadStats();
        loadFavourites();
        const id = setInterval(() => {
            loadCustomers();
            loadStats();
            loadFavourites();
        }, 4000);
        return () => clearInterval(id);
    }, []);

    const active = customers.find((c) => c.id === activeId);

    const togglePin = async (c) => {
        try {
            const { data } = await axios.post(
                `${API_BASE}/admin/customers/${c.id}/pin`,
                {},
                { withCredentials: true }
            );
            setCustomers((cs) =>
                cs
                    .map((x) => (x.id === c.id ? { ...x, pinned: data.pinned } : x))
                    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
            );
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    const renameCustomer = async () => {
        const name = nameDraft.trim();
        if (!active || name.length < 2) return;
        try {
            await axios.patch(
                `${API_BASE}/admin/customers/${active.id}`,
                { name },
                { withCredentials: true }
            );
            setCustomers((cs) => cs.map((c) => (c.id === active.id ? { ...c, name } : c)));
            setEditingName(false);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    return (
        <div className="min-h-screen bg-paper font-body text-ink">
            <header className="border-b border-ink/10 bg-paper/85">
                <div className="mx-auto flex h-24 max-w-[1500px] items-center justify-between px-5 sm:px-8">
                    <a href="/" data-testid="admin-home-link" className="flex items-center gap-3">
                        <img src="/logo-dark.png" alt="TMN logo" className="h-14 w-14 object-contain" />
                        <span className="hidden font-display text-sm font-bold uppercase tracking-[0.18em] sm:block">
                            Admin console
                        </span>
                    </a>
                    <div className="flex items-center gap-4">
                        <div className="flex gap-2">
                            <button
                                data-testid="admin-view-inbox"
                                onClick={() => setView("inbox")}
                                className={`rounded-full px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] transition-all duration-300 ${
                                    view === "inbox"
                                        ? "bg-ink text-paper"
                                        : "border border-ink/25 text-ink/70 hover:border-ink hover:text-ink"
                                }`}
                            >
                                Inbox
                            </button>
                            <button
                                data-testid="admin-view-stats"
                                onClick={() => setView("stats")}
                                className={`rounded-full px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] transition-all duration-300 ${
                                    view === "stats"
                                        ? "bg-ink text-paper"
                                        : "border border-ink/25 text-ink/70 hover:border-ink hover:text-ink"
                                }`}
                            >
                                Stats
                            </button>
                            <button
                                data-testid="admin-view-records"
                                onClick={() => setView("records")}
                                className={`rounded-full px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] transition-all duration-300 ${
                                    view === "records"
                                        ? "bg-ink text-paper"
                                        : "border border-ink/25 text-ink/70 hover:border-ink hover:text-ink"
                                }`}
                            >
                                Client records
                            </button>
                        </div>
                        <button
                            data-testid="admin-logout-button"
                            onClick={logout}
                            className="rounded-full border border-ink/25 px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                        >
                            Log out
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-[1500px] px-5 py-10 sm:px-8 lg:py-14">
                {view === "stats" ? (
                    <StatsView stats={stats} favourites={favourites} />
                ) : view === "records" ? (
                    <>
                        <div className="mb-8">
                            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-ink/60">
                                Full record &amp; history
                            </p>
                            <h1 className="mt-2 font-display text-4xl font-extrabold uppercase tracking-tight">
                                Client records
                            </h1>
                        </div>
                        <ClientsView />
                    </>
                ) : (
                    <>
                        <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
                            <div>
                                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-ink/60">
                                    Signed in as {user?.email}
                                </p>
                                <h1 className="mt-2 font-display text-4xl font-extrabold uppercase tracking-tight">
                                    Jobs, notes &amp; invoices
                                </h1>
                            </div>
                            <div className="flex gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em]">
                                <span className="rounded-full border border-ink/20 px-4 py-2" data-testid="stat-customers">
                                    {stats ? `${stats.customers} customers` : "—"}
                                </span>
                                <span className="rounded-full border border-ink/20 px-4 py-2" data-testid="stat-messages">
                                    {stats ? `${stats.messages} messages` : "—"}
                                </span>
                                <span className="rounded-full bg-ink px-4 py-2 text-paper" data-testid="stat-unread">
                                    {stats ? `${stats.unread} unread` : "—"}
                                </span>
                            </div>
                        </div>

                        {error && <p className="mb-6 text-sm font-medium text-red-700">{error}</p>}

                        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
                            {/* customer list */}
                            <div className="max-h-[65vh] space-y-3 overflow-y-auto rounded-3xl border border-ink/10 bg-white/85 p-4">
                                {customers.length === 0 && (
                                    <p className="p-6 text-center text-sm font-medium text-ink/55">
                                        No customers have registered yet.
                                    </p>
                                )}
                                {customers.map((c) => (
                                    <div
                                        key={c.id}
                                        role="button"
                                        tabIndex={0}
                                        data-testid={`admin-customer-item-${c.email}`}
                                        onClick={() => setActiveId(c.id)}
                                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setActiveId(c.id)}
                                        className={`w-full cursor-pointer rounded-2xl border p-4 text-left transition-colors duration-300 ${
                                            activeId === c.id
                                                ? "border-ink bg-white shadow-[0_10px_30px_rgba(10,10,10,0.08)]"
                                                : "border-transparent hover:border-ink/20"
                                        } ${c.pinned ? "ring-1 ring-[#C6A55C]/60" : ""}`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex min-w-0 items-center gap-2">
                                                {c.pinned && (
                                                    <Pin
                                                        data-testid={`admin-pin-badge-${c.email}`}
                                                        className="h-3.5 w-3.5 shrink-0 fill-[#C6A55C] text-[#C6A55C]"
                                                    />
                                                )}
                                                <span className="font-display text-base font-bold uppercase tracking-tight">
                                                    {c.name}
                                                </span>
                                                {c.pinned && (
                                                    <span className="hidden shrink-0 rounded-full bg-[#C6A55C]/15 px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-ink/70 sm:inline">
                                                        Priority
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex shrink-0 items-center gap-2">
                                                {c.unread > 0 && (
                                                    <span
                                                        data-testid={`admin-unread-badge-${c.email}`}
                                                        className="rounded-full bg-ink px-2.5 py-1 font-mono text-[9px] font-bold text-paper"
                                                    >
                                                        {c.unread} new
                                                    </span>
                                                )}
                                                <button
                                                    data-testid={`admin-pin-${c.email}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        togglePin(c);
                                                    }}
                                                    title={c.pinned ? "Remove from priority list" : "Pin to priority list"}
                                                    className={`rounded-full border p-1.5 transition-colors ${
                                                        c.pinned
                                                            ? "border-[#C6A55C] bg-[#C6A55C]/15 hover:bg-[#C6A55C]/25"
                                                            : "border-ink/20 hover:border-ink"
                                                    }`}
                                                >
                                                    <Pin className={`h-3.5 w-3.5 ${c.pinned ? "fill-[#C6A55C] text-[#C6A55C]" : "text-ink/50"}`} />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="mt-0.5 text-xs font-medium text-ink/55">{c.email}</p>
                                        <p className="mt-2 truncate text-xs font-medium text-ink/70">
                                            {c.last_message
                                                ? `${c.last_message.sender === "customer" ? "Them" : "You"}: ${c.last_message.text}`
                                                : "No messages yet"}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            {/* workspace */}
                            <div className="rounded-3xl border border-ink/10 bg-white/70 shadow-[0_24px_70px_rgba(10,10,10,0.10)]">
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-6 py-4">
                                    <div>
                                        {editingName && active ? (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    data-testid="admin-workspace-name-input"
                                                    value={nameDraft}
                                                    onChange={(e) => setNameDraft(e.target.value)}
                                                    className="rounded-xl border border-ink/25 bg-transparent px-3 py-1.5 font-display text-lg font-bold uppercase tracking-tight focus:border-ink focus:outline-none"
                                                />
                                                <button
                                                    data-testid="admin-workspace-name-save"
                                                    onClick={renameCustomer}
                                                    aria-label="Save name"
                                                    className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-paper"
                                                >
                                                    <Check className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => setEditingName(false)}
                                                    aria-label="Cancel"
                                                    className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/25 text-ink/60"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-3">
                                                <span className="font-display text-lg font-bold uppercase tracking-tight">
                                                    {active ? active.name : "Select a customer"}
                                                </span>
                                                {active && (
                                                    <button
                                                        data-testid="admin-workspace-name-edit"
                                                        onClick={() => {
                                                            setNameDraft(active.name);
                                                            setEditingName(true);
                                                        }}
                                                        aria-label="Edit customer name"
                                                        className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/25 text-ink/60 transition-colors hover:border-ink hover:text-ink"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                        {active && (
                                            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink/50">
                                                {active.email}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        {TABS.map((t) => (
                                            <button
                                                key={t}
                                                data-testid={`admin-tab-${t.toLowerCase()}`}
                                                onClick={() => setTab(t)}
                                                className={`rounded-full px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] transition-all duration-300 ${
                                                    tab === t
                                                        ? "bg-ink text-paper"
                                                        : "border border-ink/25 text-ink/70 hover:border-ink hover:text-ink"
                                                }`}
                                            >
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="px-6 pt-1">
                                    <p className="border-b-2 border-ink/80 pb-3 font-mono text-[10px] uppercase tracking-[0.25em] text-ink/50">
                                        {tab === "Chat" && "Conversation — replies go straight to the customer"}
                                        {tab === "Jobs" && "Track and date every job for this customer"}
                                        {tab === "Notes" && "Private notes — the customer never sees these"}
                                        {tab === "Invoices" && "Create invoices — the customer sees them in their account"}
                                    </p>
                                </div>

                                {!active ? (
                                    <p className="py-24 text-center text-sm font-medium text-ink/55">
                                        Pick a customer to get started.
                                    </p>
                                ) : (
                                    <>
                                        {tab === "Chat" && <ChatTab customer={active} />}
                                        {tab === "Jobs" && <JobsTab customer={active} />}
                                        {tab === "Notes" && <NotesTab customer={active} />}
                                        {tab === "Invoices" && <InvoicesTab customer={active} />}
                                    </>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
