import { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE, formatApiError, useAuth } from "@/context/AuthContext";
import ChatTab from "@/components/admin/ChatTab";
import JobsTab from "@/components/admin/JobsTab";
import NotesTab from "@/components/admin/NotesTab";
import InvoicesTab from "@/components/admin/InvoicesTab";

const TABS = ["Chat", "Jobs", "Notes", "Invoices"];

export default function Admin() {
    const { user, logout } = useAuth();
    const [customers, setCustomers] = useState([]);
    const [stats, setStats] = useState(null);
    const [activeId, setActiveId] = useState(null);
    const [tab, setTab] = useState("Chat");
    const [error, setError] = useState("");

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

    useEffect(() => {
        loadCustomers();
        loadStats();
        const id = setInterval(() => {
            loadCustomers();
            loadStats();
        }, 4000);
        return () => clearInterval(id);
    }, []);

    const active = customers.find((c) => c.id === activeId);

    return (
        <div className="min-h-screen bg-paper font-body text-ink">
            <header className="border-b border-ink/10 bg-paper/85 backdrop-blur-xl">
                <div className="mx-auto flex h-24 max-w-[1500px] items-center justify-between px-5 sm:px-8">
                    <a href="/" data-testid="admin-home-link" className="flex items-center gap-3">
                        <img src="/logo-dark.png" alt="TMN logo" className="h-14 w-14 object-contain" />
                        <span className="hidden font-display text-sm font-bold uppercase tracking-[0.18em] sm:block">
                            Admin console
                        </span>
                    </a>
                    <button
                        data-testid="admin-logout-button"
                        onClick={logout}
                        className="rounded-full border border-ink/25 px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                    >
                        Log out
                    </button>
                </div>
            </header>

            <main className="mx-auto max-w-[1500px] px-5 py-10 sm:px-8 lg:py-14">
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
                    <div className="max-h-[65vh] space-y-3 overflow-y-auto rounded-3xl border border-ink/10 bg-white/60 p-4 backdrop-blur-xl">
                        {customers.length === 0 && (
                            <p className="p-6 text-center text-sm font-medium text-ink/55">
                                No customers have registered yet.
                            </p>
                        )}
                        {customers.map((c) => (
                            <button
                                key={c.id}
                                data-testid={`admin-customer-item-${c.email}`}
                                onClick={() => setActiveId(c.id)}
                                className={`w-full rounded-2xl border p-4 text-left transition-colors duration-300 ${
                                    activeId === c.id
                                        ? "border-ink bg-white shadow-[0_10px_30px_rgba(10,10,10,0.08)]"
                                        : "border-transparent hover:border-ink/20"
                                }`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <span className="font-display text-base font-bold uppercase tracking-tight">
                                        {c.name}
                                    </span>
                                    {c.unread > 0 && (
                                        <span
                                            data-testid={`admin-unread-badge-${c.email}`}
                                            className="rounded-full bg-ink px-2.5 py-1 font-mono text-[9px] font-bold text-paper"
                                        >
                                            {c.unread} new
                                        </span>
                                    )}
                                </div>
                                <p className="mt-0.5 text-xs font-medium text-ink/55">{c.email}</p>
                                <p className="mt-2 truncate text-xs font-medium text-ink/70">
                                    {c.last_message
                                        ? `${c.last_message.sender === "customer" ? "Them" : "You"}: ${c.last_message.text}`
                                        : "No messages yet"}
                                </p>
                            </button>
                        ))}
                    </div>

                    {/* workspace */}
                    <div className="rounded-3xl border border-ink/10 bg-white/70 shadow-[0_24px_70px_rgba(10,10,10,0.10)] backdrop-blur-xl">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-6 py-4">
                            <div>
                                <span className="font-display text-lg font-bold uppercase tracking-tight">
                                    {active ? active.name : "Select a customer"}
                                </span>
                                {active && (
                                    <span className="ml-3 font-mono text-[10px] uppercase tracking-[0.25em] text-ink/50">
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
            </main>
        </div>
    );
}
