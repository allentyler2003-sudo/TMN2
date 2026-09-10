import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatApiError, useAuth } from "@/context/AuthContext";
import { EASE } from "@/components/Reveal";

export default function Login() {
    const { login, register } = useAuth();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [mode, setMode] = useState(params.get("mode") === "register" ? "register" : "login");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
            const user =
                mode === "login"
                    ? await login(email, password)
                    : await register(name, email, password);
            navigate(user.role === "admin" ? "/admin" : "/account");
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex min-h-screen bg-paper font-body text-ink">
            {/* brand panel */}
            <div className="relative hidden w-1/2 items-center justify-center overflow-hidden bg-ink p-16 lg:flex">
                <div className="max-w-md">
                    <img
                        src="/logo-white.png"
                        alt="TMN logo"
                        className="h-24 w-24 object-contain"
                    />
                    <h1 className="mt-10 font-display text-5xl font-extrabold uppercase leading-[0.9] tracking-tight text-white">
                        Welcome
                        <br />
                        <span className="text-outline">back.</span>
                    </h1>
                    <p className="mt-6 text-base leading-relaxed text-white/70">
                        Track your history, chat with us about a job and keep every message in
                        one place — all your TMN conversations live here.
                    </p>
                </div>
            </div>

            {/* form panel */}
            <div className="flex w-full items-center justify-center p-6 sm:p-12 lg:w-1/2">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: EASE }}
                    className="w-full max-w-md"
                >
                    <a
                        href="/"
                        data-testid="login-back-link"
                        className="font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-ink/50 hover:text-ink"
                    >
                        ← Back to site
                    </a>

                    <div className="mt-8 flex gap-2">
                        {["login", "register"].map((m) => (
                            <button
                                key={m}
                                data-testid={`login-mode-${m}`}
                                onClick={() => {
                                    setMode(m);
                                    setError("");
                                }}
                                className={`rounded-full border px-5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-300 ${
                                    mode === m
                                        ? "border-ink bg-ink text-paper"
                                        : "border-ink/25 text-ink/70 hover:border-ink"
                                }`}
                            >
                                {m === "login" ? "Log in" : "Create account"}
                            </button>
                        ))}
                    </div>

                    <h2 className="mt-8 font-display text-3xl font-extrabold uppercase tracking-tight">
                        {mode === "login" ? "Customer login" : "Join TMN"}
                    </h2>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-ink/70">
                        {mode === "login"
                            ? "Log in to see your message history and chat with us."
                            : "Create an account to chat with us and keep your project history."}
                    </p>

                    <form onSubmit={submit} className="mt-8 space-y-4">
                        {mode === "register" && (
                            <input
                                data-testid="login-name-input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Your name"
                                required
                                minLength={2}
                                className="w-full rounded-2xl border border-ink/20 bg-white/70 p-4 text-sm font-medium text-ink placeholder:text-ink/40 focus:border-ink focus:outline-none"
                            />
                        )}
                        <input
                            data-testid="login-email-input"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Email address"
                            required
                            className="w-full rounded-2xl border border-ink/20 bg-white/70 p-4 text-sm font-medium text-ink placeholder:text-ink/40 focus:border-ink focus:outline-none"
                        />
                        <input
                            data-testid="login-password-input"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Password"
                            required
                            minLength={8}
                            className="w-full rounded-2xl border border-ink/20 bg-white/70 p-4 text-sm font-medium text-ink placeholder:text-ink/40 focus:border-ink focus:outline-none"
                        />

                        {error && (
                            <p
                                data-testid="login-error"
                                className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700"
                            >
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={busy}
                            data-testid="login-submit-button"
                            className="w-full rounded-full bg-ink px-6 py-4 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-paper transition-transform duration-300 hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                        >
                            {busy
                                ? "One moment…"
                                : mode === "login"
                                ? "Log in"
                                : "Create my account"}
                        </button>
                    </form>
                </motion.div>
            </div>
        </div>
    );
}
