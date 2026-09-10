import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_BASE, formatApiError, useAuth } from "@/context/AuthContext";
import { StatusBadge, fmtDay, fmtMoney } from "@/components/admin/shared";
import { downloadInvoicePdf } from "@/utils/invoicePdf";

const fmt = (iso) =>
    new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });

const TABS = ["Chat", "My jobs", "My invoices"];

export default function Account() {
    const { user, logout } = useAuth();
    const [tab, setTab] = useState("Chat");
    const [messages, setMessages] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    const [paying, setPaying] = useState(null);
    const [error, setError] = useState("");
    const [banner, setBanner] = useState(null);
    const bottomRef = useRef(null);

    const loadMessages = async () => {
        try {
            const { data } = await axios.get(`${API_BASE}/messages`, {
                withCredentials: true,
            });
            setMessages(data);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    const loadHistory = async () => {
        try {
            const [jobsRes, invRes] = await Promise.all([
                axios.get(`${API_BASE}/my/jobs`, { withCredentials: true }),
                axios.get(`${API_BASE}/my/invoices`, { withCredentials: true }),
            ]);
            setJobs(jobsRes.data);
            setInvoices(invRes.data);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const payment = params.get("payment");
        const sessionId = params.get("session_id");
        if (payment === "success" && sessionId) {
            setBanner("pending");
            let tries = 0;
            const poll = setInterval(async () => {
                tries += 1;
                try {
                    const { data } = await axios.get(
                        `${API_BASE}/payments/status/${sessionId}`,
                        { withCredentials: true }
                    );
                    if (data.payment_status === "paid") {
                        clearInterval(poll);
                        setBanner("success");
                        loadHistory();
                    } else if (tries > 8) {
                        clearInterval(poll);
                        setBanner("pending");
                    }
                } catch (e) {
                    if (tries > 8) {
                        clearInterval(poll);
                        setBanner("pending");
                    }
                }
            }, 2000);
            window.history.replaceState({}, "", "/account");
            return () => clearInterval(poll);
        }
        if (payment === "cancelled") {
            setBanner("cancelled");
            window.history.replaceState({}, "", "/account");
        }
    }, []);

    useEffect(() => {
        loadMessages();
        loadHistory();
        const id = setInterval(loadMessages, 4000);
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

    const pay = async (invoice) => {
        setPaying(invoice.id);
        setError("");
        try {
            const { data } = await axios.post(
                `${API_BASE}/invoices/${invoice.id}/checkout`,
                { origin_url: window.location.origin },
                { withCredentials: true }
            );
            window.location.href = data.checkout_url;
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
            setPaying(null);
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
            <header className="border-b border-ink/10 bg-paper/85">
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

                    <div className="rounded-3xl border border-ink/10 bg-white/70 p-7 shadow-[0_20px_50px_rgba(10,10,10,0.08)]">
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
                            Your history, one place
                        </p>
                        <p className="mt-3 text-sm leading-relaxed text-paper/75">
                            Chat with us, see every job we've scheduled for you, download your
                            invoices and pay them online — all saved to your account.
                        </p>
                    </div>
                </div>

                {/* workspace */}
                <div className="flex flex-col rounded-3xl border border-ink/10 bg-white/70 shadow-[0_24px_70px_rgba(10,10,10,0.10)]">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-7 py-4">
                        <div className="flex gap-2">
                            {TABS.map((t) => (
                                <button
                                    key={t}
                                    data-testid={`account-tab-${t.toLowerCase().replace(" ", "-")}`}
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
                        {tab === "Chat" && (
                            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink/50">
                                {messages.length} messages
                            </span>
                        )}
                    </div>

                    {banner && (
                        <div
                            data-testid={`payment-banner-${banner}`}
                            className={`mx-7 mt-5 rounded-2xl p-4 text-sm font-medium ${
                                banner === "success"
                                    ? "bg-green-50 text-green-800"
                                    : banner === "cancelled"
                                    ? "bg-amber-50 text-amber-800"
                                    : "bg-ink/5 text-ink/75"
                            }`}
                        >
                            {banner === "success"
                                ? "Payment received — thank you! Your invoice is marked as paid below."
                                : banner === "cancelled"
                                ? "Payment cancelled — no money was taken. You can pay any time below."
                                : "Finishing up your payment confirmation…"}
                        </div>
                    )}

                    {error && <p className="px-7 pt-4 text-sm font-medium text-red-700">{error}</p>}

                    {/* CHAT */}
                    {tab === "Chat" && (
                        <>
                            <SavedLooks />
                            <div
                                data-testid="account-chat-thread"
                                className="h-[60vh] flex-1 space-y-4 overflow-y-auto px-7 py-6"
                            >
                                {messages.length === 0 && (
                                    <p className="mx-auto max-w-xs pt-16 text-center text-sm font-medium leading-relaxed text-ink/55">
                                        No messages yet. Say hello or tell us about a job — we'll
                                        reply as fast as we can.
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
                                        {m.image && (
                                            <img
                                                src={m.image}
                                                alt="Shared look"
                                                data-testid="account-chat-image"
                                                className="mb-2 max-h-64 w-full rounded-xl object-cover"
                                            />
                                        )}
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
                        </>
                    )}

                    {/* JOBS */}
                    {tab === "My jobs" && (
                        <div
                            data-testid="account-jobs-list"
                            className="h-[60vh] space-y-3 overflow-y-auto px-7 py-6"
                        >
                            {jobs.length === 0 && (
                                <p className="pt-16 text-center text-sm font-medium text-ink/55">
                                    No jobs on your file yet. Once we schedule work with you,
                                    it appears here with dates and progress.
                                </p>
                            )}
                            {jobs.map((job) => (
                                <div
                                    key={job.id}
                                    data-testid={`account-job-card-${job.id}`}
                                    className="rounded-2xl border border-ink/12 bg-white/80 p-5"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <span className="font-display text-base font-bold uppercase tracking-tight">
                                            {job.title}
                                        </span>
                                        <StatusBadge value={job.status} />
                                    </div>
                                    <p className="mt-2 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-ink/55">
                                        {fmtDay(job.scheduled_date)}
                                    </p>
                                    {job.description && (
                                        <p className="mt-3 text-sm font-medium leading-relaxed text-ink/75">
                                            {job.description}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* INVOICES */}
                    {tab === "My invoices" && (
                        <div
                            data-testid="account-invoices-list"
                            className="h-[60vh] space-y-3 overflow-y-auto px-7 py-6"
                        >
                            {invoices.length === 0 && (
                                <p className="pt-16 text-center text-sm font-medium text-ink/55">
                                    No invoices yet. Any invoice we raise for your jobs shows
                                    here with its status.
                                </p>
                            )}
                            {invoices.map((inv) => (
                                <div
                                    key={inv.id}
                                    data-testid={`account-invoice-card-${inv.id}`}
                                    className="rounded-2xl border border-ink/12 bg-white/80 p-5"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <span className="font-display text-base font-bold uppercase tracking-tight">
                                            Invoice {inv.number}
                                        </span>
                                        <div className="flex items-center gap-3">
                                            <span className="font-display text-lg font-bold">
                                                {fmtMoney(inv.total)}
                                            </span>
                                            <StatusBadge value={inv.status} />
                                        </div>
                                    </div>
                                    <p className="mt-2 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-ink/55">
                                        Due {fmtDay(inv.due_date)}
                                    </p>
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
                                    <div className="mt-4 flex flex-wrap gap-3">
                                        {inv.status === "sent" && (
                                            <button
                                                data-testid={`account-pay-button-${inv.id}`}
                                                onClick={() => pay(inv)}
                                                disabled={paying === inv.id}
                                                className="rounded-full bg-ink px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                                            >
                                                {paying === inv.id ? "Opening Stripe…" : "Pay with card"}
                                            </button>
                                        )}
                                        <button
                                            data-testid={`account-invoice-pdf-${inv.id}`}
                                            onClick={() =>
                                                downloadInvoicePdf(inv, user?.name, user?.email)
                                            }
                                            className="rounded-full border border-ink/25 px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                                        >
                                            Download PDF
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
function SavedLooks() {
    const [looks, setLooks] = useState([]);
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
        axios
            .get(`${API_BASE}/looks`, { withCredentials: true })
            .then(({ data }) => {
                setLooks(data);
                setLoaded(true);
            })
            .catch(() => setLoaded(true));
    }, []);
    const remove = async (id) => {
        try {
            await axios.delete(`${API_BASE}/looks/${id}`, { withCredentials: true });
            setLooks((l) => l.filter((x) => x.id !== id));
        } catch {}
    };
    if (!loaded) return null;
    return (
        <div className="mx-7 mb-5 rounded-2xl border border-ink/10 bg-white/80 p-5" data-testid="account-looks">
            <div className="mb-3 flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/60">
                    My saved looks
                </p>
                <a
                    href="/visualiser"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="account-looks-open-visualiser"
                    className="rounded-full border border-ink/25 px-4 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                >
                    Open visualiser
                </a>
            </div>
            {looks.length === 0 ? (
                <p className="text-sm font-medium text-ink/55">
                    No saved looks yet — create one in the colour visualiser and save it to
                    your account.
                </p>
            ) : (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {looks.map((l) => (
                        <div key={l.id} className="overflow-hidden rounded-xl border border-ink/10" data-testid="account-look-card">
                            <img src={l.image} alt={l.prompt || "My look"} className="aspect-square w-full object-cover" />
                            <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                                <p className="truncate text-[10px] font-bold uppercase tracking-wide text-ink/70">
                                    {l.prompt || "My look"}
                                </p>
                                <button
                                    onClick={() => remove(l.id)}
                                    data-testid="account-look-delete"
                                    className="shrink-0 font-mono text-[9px] font-bold uppercase text-red-700/70 hover:text-red-700"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
