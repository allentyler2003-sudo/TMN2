import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Send } from "lucide-react";
import { getVisitorId } from "@/constants/visitor";

const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

function sessionId() {
    let id = localStorage.getItem("tmn-ai-session");
    if (!id) {
        id = `ai-${crypto.randomUUID()}`;
        localStorage.setItem("tmn-ai-session", id);
    }
    return id;
}

export default function AiChat() {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([
        {
            role: "assistant",
            text: "Hi! I'm the TMN assistant. Ask me anything about painting, decorating or property upkeep — I'm great with quick guidance.",
        },
    ]);
    const [draft, setDraft] = useState("");
    const [streaming, setStreaming] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages]);

    const send = async (e) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text || streaming) return;
        setDraft("");
        const userMsg = { role: "user", text };
        setMessages((m) => [...m, userMsg, { role: "assistant", text: "" }]);
        setStreaming(true);
        try {
            const res = await fetch(`${API_BASE}/ai/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Visitor-Id": getVisitorId() },
                credentials: "include",
                body: JSON.stringify({ session_id: sessionId(), message: text }),
            });
            if (!res.ok) {
                let msg = "The assistant is unavailable right now — please WhatsApp us on 07736 325643 instead.";
                try {
                    const data = await res.json();
                    if (data?.detail) msg = data.detail;
                } catch {}
                setMessages((m) => {
                    const copy = [...m];
                    copy[copy.length - 1] = { role: "assistant", text: msg };
                    return copy;
                });
                return;
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split("\n\n");
                buffer = parts.pop();
                for (const part of parts) {
                    if (!part.startsWith("data: ")) continue;
                    const payload = JSON.parse(part.slice(6));
                    if (payload.delta) {
                        setMessages((m) => {
                            const copy = [...m];
                            copy[copy.length - 1] = {
                                role: "assistant",
                                text: copy[copy.length - 1].text + payload.delta,
                            };
                            return copy;
                        });
                    }
                    if (payload.error) {
                        setMessages((m) => {
                            const copy = [...m];
                            copy[copy.length - 1] = { role: "assistant", text: payload.error };
                            return copy;
                        });
                    }
                }
            }
        } catch (err) {
            setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = {
                    role: "assistant",
                    text: "Connection hiccup — please try again, or WhatsApp us on 07736 325643.",
                };
                return copy;
            });
        } finally {
            setStreaming(false);
        }
    };

    const renderBold = (text) =>
        text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
            i % 2 === 1 ? (
                <strong key={i} className="font-bold">
                    {part}
                </strong>
            ) : (
                part
            )
        );

    return (
        <>
            <AnimatePresence>
                {open && (
                    <motion.div
                        data-testid="ai-chat-panel"
                        initial={{ opacity: 0, y: 24, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 24, scale: 0.96 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="fixed bottom-[104px] right-5 z-[85] flex h-[480px] w-[calc(100vw-40px)] max-w-[360px] flex-col overflow-hidden rounded-3xl border border-ink/15 bg-white shadow-[0_30px_80px_rgba(10,10,10,0.25)] sm:right-7"
                    >
                        <div className="flex items-center justify-between bg-ink px-5 py-4 text-paper">
                            <div>
                                <p className="font-display text-sm font-bold uppercase tracking-tight">
                                    TMN Assistant
                                </p>
                                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-paper/60">
                                    AI · minor guidance
                                </p>
                            </div>
                            <button
                                data-testid="ai-chat-close"
                                onClick={() => setOpen(false)}
                                aria-label="Close assistant"
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-paper/30 transition-colors hover:bg-paper hover:text-ink"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div
                            ref={scrollRef}
                            data-testid="ai-chat-messages"
                            className="flex-1 space-y-3 overflow-y-auto bg-paper/60 px-4 py-4"
                        >
                            {messages.map((m, i) => (
                                <div
                                    key={i}
                                    data-testid={`ai-chat-message-${m.role}`}
                                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm font-medium leading-relaxed ${
                                        m.role === "user"
                                            ? "ml-auto bg-ink text-paper"
                                            : "bg-white text-ink shadow-[0_6px_18px_rgba(10,10,10,0.07)]"
                                    }`}
                                >
                                    {renderBold(m.text)}
                                </div>
                            ))}
                            {streaming && (
                                <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-ink/40">
                                    TMN Assistant is typing…
                                </p>
                            )}
                        </div>

                        <form
                            onSubmit={send}
                            className="flex items-center gap-2 border-t border-ink/10 bg-white px-4 py-3"
                        >
                            <input
                                data-testid="ai-chat-input"
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                placeholder="Ask for quick advice…"
                                className="flex-1 rounded-full border border-ink/20 bg-transparent px-4 py-2.5 text-sm font-medium placeholder:text-ink/40 focus:border-ink focus:outline-none"
                            />
                            <button
                                type="submit"
                                data-testid="ai-chat-send"
                                disabled={!draft.trim() || streaming}
                                aria-label="Send message"
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                            >
                                <Send className="h-4 w-4" />
                            </button>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            {!open && (
                <motion.button
                    data-testid="ai-chat-button"
                    onClick={() => setOpen((o) => !o)}
                    aria-label="Open AI assistant"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 1.05, type: "spring", stiffness: 260, damping: 18 }}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.94 }}
                    className="fixed bottom-[104px] right-5 z-[80] flex h-14 w-14 items-center justify-center rounded-full bg-ink text-paper shadow-[0_12px_30px_rgba(10,10,10,0.28)] sm:bottom-[108px] sm:right-7"
                >
                    <Sparkles className="h-5 w-5" />
                    <span className="absolute -left-1 -top-1 flex h-5 items-center rounded-full bg-white px-2 font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-ink shadow">
                        AI
                    </span>
                </motion.button>
            )}
        </>
    );
}
