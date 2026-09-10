import { useEffect, useState } from "react";
import axios from "axios";
import { Trash2 } from "lucide-react";
import { API_BASE, formatApiError } from "@/context/AuthContext";
import { fmtDate } from "@/components/admin/shared";

export default function NotesTab({ customer }) {
    const [notes, setNotes] = useState([]);
    const [text, setText] = useState("");
    const [error, setError] = useState("");

    const load = async () => {
        if (!customer) return;
        try {
            const { data } = await axios.get(
                `${API_BASE}/admin/notes?customer_id=${customer.id}`,
                { withCredentials: true }
            );
            setNotes(data);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    useEffect(() => {
        setNotes([]);
        setText("");
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customer?.id]);

    const add = async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        try {
            const { data } = await axios.post(
                `${API_BASE}/admin/notes`,
                { customer_id: customer.id, text },
                { withCredentials: true }
            );
            setNotes((n) => [data, ...n]);
            setText("");
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    const remove = async (note) => {
        try {
            await axios.delete(`${API_BASE}/admin/notes/${note.id}`, { withCredentials: true });
            setNotes((n) => n.filter((x) => x.id !== note.id));
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    return (
        <div className="h-[calc(65vh-64px)] overflow-y-auto px-6 py-5">
            <form onSubmit={add} className="mb-6 space-y-3">
                <textarea
                    data-testid="admin-note-input"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Private note about this customer — colours used, keys collected, follow-ups…"
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-ink/20 bg-transparent p-4 text-sm font-medium placeholder:text-ink/40 focus:border-ink focus:outline-none"
                />
                <button
                    type="submit"
                    data-testid="admin-note-add-button"
                    disabled={!text.trim()}
                    className="rounded-full bg-ink px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper disabled:opacity-40"
                >
                    Add note
                </button>
            </form>

            {error && <p className="mb-4 text-sm font-medium text-red-700">{error}</p>}

            <div className="space-y-3">
                {notes.length === 0 && (
                    <p className="pt-10 text-center text-sm font-medium text-ink/55">
                        No notes yet. Anything worth remembering about this customer lives here.
                    </p>
                )}
                {notes.map((n) => (
                    <div
                        key={n.id}
                        data-testid={`admin-note-card-${n.id}`}
                        className="flex items-start justify-between gap-4 rounded-2xl border border-ink/12 bg-white/80 p-5"
                    >
                        <div>
                            <p className="text-sm font-medium leading-relaxed text-ink/85">
                                {n.text}
                            </p>
                            <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink/45">
                                {fmtDate(n.created_at)}
                            </p>
                        </div>
                        <button
                            data-testid={`admin-note-delete-${n.id}`}
                            onClick={() => remove(n)}
                            aria-label="Delete note"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink/20 text-ink/60 transition-colors hover:border-red-400 hover:text-red-600"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
