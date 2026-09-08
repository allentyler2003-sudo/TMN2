import { useEffect, useState } from "react";
import axios from "axios";
import { Trash2 } from "lucide-react";
import { API_BASE, formatApiError } from "@/context/AuthContext";
import { StatusBadge, fmtDay } from "@/components/admin/shared";

export default function JobsTab({ customer }) {
    const [jobs, setJobs] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [date, setDate] = useState("");
    const [status, setStatus] = useState("scheduled");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const load = async () => {
        if (!customer) return;
        try {
            const { data } = await axios.get(
                `${API_BASE}/admin/jobs?customer_id=${customer.id}`,
                { withCredentials: true }
            );
            setJobs(data);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    useEffect(() => {
        setJobs([]);
        setShowForm(false);
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customer?.id]);

    const create = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            await axios.post(
                `${API_BASE}/admin/jobs`,
                { customer_id: customer.id, title, description, scheduled_date: date, status },
                { withCredentials: true }
            );
            setTitle("");
            setDescription("");
            setDate("");
            setStatus("scheduled");
            setShowForm(false);
            load();
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        } finally {
            setBusy(false);
        }
    };

    const setStatusFor = async (job, value) => {
        setJobs((js) => js.map((j) => (j.id === job.id ? { ...j, status: value } : j)));
        try {
            await axios.patch(
                `${API_BASE}/admin/jobs/${job.id}`,
                { status: value },
                { withCredentials: true }
            );
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
            load();
        }
    };

    const remove = async (job) => {
        try {
            await axios.delete(`${API_BASE}/admin/jobs/${job.id}`, { withCredentials: true });
            setJobs((js) => js.filter((j) => j.id !== job.id));
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    return (
        <div className="h-[calc(65vh-64px)] overflow-y-auto px-6 py-5">
            <div className="mb-5 flex items-center justify-between">
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-ink/55">
                    {jobs.length} job{jobs.length === 1 ? "" : "s"} on file
                </p>
                <button
                    data-testid="admin-job-new-button"
                    onClick={() => setShowForm((s) => !s)}
                    className="rounded-full bg-ink px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper transition-transform hover:scale-105 active:scale-95"
                >
                    {showForm ? "Cancel" : "+ New job"}
                </button>
            </div>

            {showForm && (
                <form
                    onSubmit={create}
                    data-testid="admin-job-form"
                    className="mb-6 space-y-3 rounded-2xl border border-ink/15 bg-white/80 p-5"
                >
                    <input
                        data-testid="admin-job-title-input"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Job title — e.g. Hallway repaint"
                        required
                        minLength={2}
                        className="w-full rounded-xl border border-ink/20 bg-transparent px-4 py-3 text-sm font-medium placeholder:text-ink/40 focus:border-ink focus:outline-none"
                    />
                    <textarea
                        data-testid="admin-job-description-input"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What's involved? Rooms, colours, access…"
                        rows={2}
                        className="w-full resize-none rounded-xl border border-ink/20 bg-transparent px-4 py-3 text-sm font-medium placeholder:text-ink/40 focus:border-ink focus:outline-none"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                        <input
                            data-testid="admin-job-date-input"
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            required
                            className="rounded-xl border border-ink/20 bg-transparent px-4 py-3 text-sm font-medium focus:border-ink focus:outline-none"
                        />
                        <select
                            data-testid="admin-job-status-select"
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="rounded-xl border border-ink/20 bg-transparent px-4 py-3 text-sm font-medium focus:border-ink focus:outline-none"
                        >
                            <option value="scheduled">Scheduled</option>
                            <option value="in progress">In progress</option>
                            <option value="completed">Completed</option>
                        </select>
                        <button
                            type="submit"
                            disabled={busy}
                            data-testid="admin-job-create-button"
                            className="ml-auto rounded-full bg-ink px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper disabled:opacity-40"
                        >
                            Save job
                        </button>
                    </div>
                </form>
            )}

            {error && <p className="mb-4 text-sm font-medium text-red-700">{error}</p>}

            <div className="space-y-3">
                {jobs.length === 0 && (
                    <p className="pt-10 text-center text-sm font-medium text-ink/55">
                        No jobs tracked yet. Create one to start this customer's history.
                    </p>
                )}
                {jobs.map((job) => (
                    <div
                        key={job.id}
                        data-testid={`admin-job-card-${job.id}`}
                        className="rounded-2xl border border-ink/12 bg-white/80 p-5"
                    >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <span className="font-display text-base font-bold uppercase tracking-tight">
                                    {job.title}
                                </span>
                                <span className="ml-3 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-ink/55">
                                    {fmtDay(job.scheduled_date)}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <select
                                    data-testid={`admin-job-status-${job.id}`}
                                    value={job.status}
                                    onChange={(e) => setStatusFor(job, e.target.value)}
                                    className="rounded-full border border-ink/20 bg-transparent px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] focus:border-ink focus:outline-none"
                                >
                                    <option value="scheduled">Scheduled</option>
                                    <option value="in progress">In progress</option>
                                    <option value="completed">Completed</option>
                                </select>
                                <button
                                    data-testid={`admin-job-delete-${job.id}`}
                                    onClick={() => remove(job)}
                                    aria-label="Delete job"
                                    className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/20 text-ink/60 transition-colors hover:border-red-400 hover:text-red-600"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                        {job.description && (
                            <p className="mt-3 text-sm font-medium leading-relaxed text-ink/75">
                                {job.description}
                            </p>
                        )}
                        <div className="mt-3">
                            <StatusBadge value={job.status} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
