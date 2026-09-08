import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_BASE, formatApiError, useAuth } from "@/context/AuthContext";

const fmt = (iso) =>
    new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });

export default function Admin() {
    const { user, logout } = useAuth();
    const [customers, setCustomers] = useState([]);
    const [stats, setStats] = useState(null);
    const [activeId, setActiveId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [draft, setDraft] = useState("");
    const [error, setError] = useState("");
    const bottomRef = useRef(null);

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

    const loadThread = async (id) => {
        if (!id) return;
        try {
            const { data } = await axios.get(`${API_BASE}/admin/messages?customer_id=${id}`, {
                withCredentials: true,
            });
            setMessages(data);
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

    useEffect(() => {
        if (!activeId) return;
        loadThread(activeId);
        const id = setInterval(() => loadThread(activeId), 4000);
        return () => clearInterval(id);
    }, [activeId]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length]);

    const send = async (e) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text || !activeId) return;
        try {
            const { data } = await axios.post(
                `${API_BASE}/admin/messages`,
                { customer_id: activeId, text },
                { withCredentials: true }
            );
            setMessages((m) => [...m, data]);
            setDraft("");
            loadCustomers();
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    const active = customers.find((c) => c.id === activeId);

    return (
        <div className="min-h-screen bg-paper font-body text-ink">
            <header className="border-b border-ink/10 bg-paper/85 backdrop-blur-xl">
                <div className="mx-auto flex h-24 max-w-[1500px] items-center justify-between px-5 sm:px-8">
                    <a href="/" data-testid="admin-home-link" className="flex items-center gap-3">
                        <img src="/logo-dark.png" alt="TMN logo" className="h-14 w-14 object-contain" />
                        <span className="hidden font-display text-sm font-bold uppercase tracking-[0.18em] sm:block">
                            Admin inbox
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
                            Admin console
                        </p>
                        <h1 className="mt-2 font-display text-4xl font-extrabold uppercase tracking-tight">
                            Customer messages
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

                    {/* thread */}
                    <div className="flex h-[65vh] flex-col rounded-3xl border border-ink/10 bg-white/70 shadow-[0_24px_70px_rgba(10,10,10,0.10)] backdrop-blur-xl">
                        <div className="flex items-center justify-between border-b border-ink/10 px-7 py-5">
                            <span className="font-display text-lg font-bold uppercase tracking-tight">
                                {active ? active.name : "Select a customer"}
                            </span>
                            {active && (
                                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink/50">
                                    {active.email}
                                </span>
                            )}
                        </div>

                        <div
                            data-testid="admin-chat-thread"
                            className="flex-1 space-y-4 overflow-y-auto px-7 py-6"
                        >
                            {!active && (
                                <p className="pt-20 text-center text-sm font-medium text-ink/55">
                                    Pick a customer to read and reply to their messages.
                                </p>
                            )}
                            {active && messages.length === 0 && (
                                <p className="pt-20 text-center text-sm font-medium text-ink/55">
                                    No messages in this thread yet.
                                </p>
                            )}
                            {messages.map((m) => (
                                <div
                                    key={m.id}
                                    data-testid={`admin-chat-message-${m.sender}`}
                                    className={`max-w-[80%] rounded-2xl px-5 py-3.5 ${
                                        m.sender === "admin"
                                            ? "ml-auto bg-ink text-paper"
                                            : "bg-white text-ink shadow-[0_8px_24px_rgba(10,10,10,0.08)]"
                                    }`}
                                >
                                    <p className="whitespace-pre-wrap break-words text-sm font-medium leading-relaxed">
                                        {m.text}
                                    </p>
                                    <p
                                        className={`mt-1.5 font-mono text-[9px] uppercase tracking-[0.2em] ${
                                            m.sender === "admin" ? "text-paper/60" : "text-ink/45"
                                        }`}
                                    >
                                        {m.sender === "admin" ? "You (TMN)" : "Customer"} ·{" "}
                                        {fmt(m.created_at)}
                                    </p>
                                </div>
                            ))}
                            <div ref={bottomRef} />
                        </div>

                        <form
                            onSubmit={send}
                            className="flex items-center gap-3 border-t border-ink/10 px-7 py-5"
                        >
                            <input
                                data-testid="admin-reply-input"
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                placeholder="Write a reply…"
                                disabled={!active}
                                className="flex-1 rounded-full border border-ink/20 bg-transparent px-5 py-3.5 text-sm font-medium placeholder:text-ink/40 focus:border-ink focus:outline-none disabled:opacity-40"
                            />
                            <button
                                type="submit"
                                disabled={!active || !draft.trim()}
                                data-testid="admin-send-button"
                                className="rounded-full bg-ink px-6 py-3.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                            >
                                Reply
                            </button>
                        </form>
                    </div>
                </div>
            </main>
        </div>
    );
}
