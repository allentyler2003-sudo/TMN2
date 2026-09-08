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

export default function Account() {
    const { user, logout } = useAuth();
    const [messages, setMessages] = useState([]);
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const bottomRef = useRef(null);

    const load = async () => {
        try {
            const { data } = await axios.get(`${API_BASE}/messages`, {
                withCredentials: true,
            });
            setMessages(data);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    useEffect(() => {
        load();
        const id = setInterval(load, 4000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length]);

    const send = async (e) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text) return;
        setSending(true);
        try {
            const { data } = await axios.post(
                `${API_BASE}/messages`,
                { text },
                { withCredentials: true }
            );
            setMessages((m) => [...m, data]);
            setDraft("");
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        } finally {
            setSending(false);
        }
    };

    const memberSince = user?.created_at
        ? new Date(user.created_at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
          })
        : "—";

    return (
        <div className="min-h-screen bg-paper font-body text-ink">
            <header className="border-b border-ink/10 bg-paper/85 backdrop-blur-xl">
                <div className="mx-auto flex h-24 max-w-[1400px] items-center justify-between px-5 sm:px-8">
                    <a href="/" data-testid="account-home-link" className="flex items-center gap-3">
                        <img src="/logo-dark.png" alt="TMN logo" className="h-14 w-14 object-contain" />
                        <span className="hidden font-display text-sm font-bold uppercase tracking-[0.18em] sm:block">
                            My account
                        </span>
                    </a>
                    <button
                        data-testid="account-logout-button"
                        onClick={logout}
                        className="rounded-full border border-ink/25 px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                    >
                        Log out
                    </button>
                </div>
            </header>

            <main className="mx-auto grid max-w-[1400px] gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_1.6fr] lg:py-16">
                {/* details */}
                <div className="space-y-6">
                    <div>
                        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-ink/60">
                            My details
                        </p>
                        <h1 className="mt-3 font-display text-4xl font-extrabold uppercase tracking-tight">
                            Hello, {user?.name?.split(" ")[0]}
                        </h1>
                    </div>

                    <div className="rounded-3xl border border-ink/10 bg-white/70 p-7 shadow-[0_20px_50px_rgba(10,10,10,0.08)] backdrop-blur-xl">
                        <dl className="space-y-4 text-sm font-medium">
                            <div>
                                <dt className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink/55">
                                    Name
                                </dt>
                                <dd className="mt-1">{user?.name}</dd>
                            </div>
                            <div>
                                <dt className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink/55">
                                    Email
                                </dt>
                                <dd className="mt-1">{user?.email}</dd>
                            </div>
                            <div>
                                <dt className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink/55">
                                    Customer since
                                </dt>
                                <dd className="mt-1">{memberSince}</dd>
                            </div>
                        </dl>
                    </div>

                    <div className="rounded-3xl border border-ink/10 bg-ink p-7 text-paper">
                        <p className="font-display text-xl font-bold uppercase tracking-tight">
                            Every message reaches us
                        </p>
                        <p className="mt-3 text-sm leading-relaxed text-paper/75">
                            Your messages come straight to the TMN inbox and your whole
                            conversation is saved here as your project history.
                        </p>
                    </div>
                </div>

                {/* chat */}
                <div className="flex h-[70vh] flex-col rounded-3xl border border-ink/10 bg-white/70 shadow-[0_24px_70px_rgba(10,10,10,0.10)] backdrop-blur-xl">
                    <div className="flex items-center justify-between border-b border-ink/10 px-7 py-5">
                        <span className="font-display text-lg font-bold uppercase tracking-tight">
                            Chat with TMN
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink/50">
                            {messages.length} messages
                        </span>
                    </div>

                    <div
                        data-testid="account-chat-thread"
                        className="flex-1 space-y-4 overflow-y-auto px-7 py-6"
                    >
                        {messages.length === 0 && (
                            <p className="mx-auto max-w-xs pt-16 text-center text-sm font-medium leading-relaxed text-ink/55">
                                No messages yet. Say hello or tell us about a job — we'll reply
                                as fast as we can.
                            </p>
                        )}
                        {messages.map((m) => (
                            <div
                                key={m.id}
                                data-testid={`chat-message-${m.sender}`}
                                className={`max-w-[80%] rounded-2xl px-5 py-3.5 ${
                                    m.sender === "customer"
                                        ? "ml-auto bg-ink text-paper"
                                        : "bg-white text-ink shadow-[0_8px_24px_rgba(10,10,10,0.08)]"
                                }`}
                            >
                                <p className="whitespace-pre-wrap break-words text-sm font-medium leading-relaxed">
                                    {m.text}
                                </p>
                                <p
                                    className={`mt-1.5 font-mono text-[9px] uppercase tracking-[0.2em] ${
                                        m.sender === "customer" ? "text-paper/60" : "text-ink/45"
                                    }`}
                                >
                                    {m.sender === "customer" ? "You" : "TMN"} · {fmt(m.created_at)}
                                </p>
                            </div>
                        ))}
                        <div ref={bottomRef} />
                    </div>

                    {error && (
                        <p className="px-7 pb-2 text-sm font-medium text-red-700">{error}</p>
                    )}

                    <form
                        onSubmit={send}
                        className="flex items-center gap-3 border-t border-ink/10 px-7 py-5"
                    >
                        <input
                            data-testid="account-chat-input"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder="Write a message…"
                            className="flex-1 rounded-full border border-ink/20 bg-transparent px-5 py-3.5 text-sm font-medium placeholder:text-ink/40 focus:border-ink focus:outline-none"
                        />
                        <button
                            type="submit"
                            disabled={sending || !draft.trim()}
                            data-testid="account-chat-send"
                            className="rounded-full bg-ink px-6 py-3.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                        >
                            Send
                        </button>
                    </form>
                </div>
            </main>
        </div>
    );
}
