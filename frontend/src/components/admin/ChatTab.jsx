import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_BASE, formatApiError } from "@/context/AuthContext";

const fmt = (iso) =>
    new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });

export default function ChatTab({ customer }) {
    const [messages, setMessages] = useState([]);
    const [draft, setDraft] = useState("");
    const [error, setError] = useState("");
    const bottomRef = useRef(null);

    const load = async () => {
        if (!customer) return;
        try {
            const { data } = await axios.get(
                `${API_BASE}/admin/messages?customer_id=${customer.id}`,
                { withCredentials: true }
            );
            setMessages(data);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    useEffect(() => {
        setMessages([]);
        load();
        const id = setInterval(load, 4000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customer?.id]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length]);

    const send = async (e) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text || !customer) return;
        try {
            const { data } = await axios.post(
                `${API_BASE}/admin/messages`,
                { customer_id: customer.id, text },
                { withCredentials: true }
            );
            setMessages((m) => [...m, data]);
            setDraft("");
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    return (
        <div className="flex h-[calc(65vh-64px)] flex-col">
            <div
                data-testid="admin-chat-thread"
                className="flex-1 space-y-4 overflow-y-auto px-6 py-5"
            >
                {messages.length === 0 && (
                    <p className="pt-16 text-center text-sm font-medium text-ink/55">
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
                            {m.sender === "admin" ? "You (TMN)" : "Customer"} · {fmt(m.created_at)}
                        </p>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            {error && <p className="px-6 pb-2 text-sm font-medium text-red-700">{error}</p>}

            <form
                onSubmit={send}
                className="flex items-center gap-3 border-t border-ink/10 px-6 py-4"
            >
                <input
                    data-testid="admin-reply-input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Write a reply…"
                    className="flex-1 rounded-full border border-ink/20 bg-transparent px-5 py-3.5 text-sm font-medium placeholder:text-ink/40 focus:border-ink focus:outline-none"
                />
                <button
                    type="submit"
                    disabled={!draft.trim()}
                    data-testid="admin-send-button"
                    className="rounded-full bg-ink px-6 py-3.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                >
                    Reply
                </button>
            </form>
        </div>
    );
}
