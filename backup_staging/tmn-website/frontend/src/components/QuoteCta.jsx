import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";

/* "Get a quote" → account first. Signed-in users go straight to their portal
   to chat and request quotes; guests get a create-account / sign-in popup
   instead of being dropped onto WhatsApp. */
export default function QuoteCta({ className, testid, children }) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);

    const onClick = () => {
        if (user) navigate(user.role === "admin" ? "/admin" : "/account");
        else setOpen(true);
    };

    return (
        <>
            <button type="button" data-testid={testid} onClick={onClick} className={className}>
                {children}
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent
                    className="rounded-2xl border-ink/10 bg-paper text-ink sm:max-w-md"
                    data-testid="quote-signin-popup"
                >
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-bold uppercase tracking-tight text-ink">
                            Request your quote
                        </DialogTitle>
                        <DialogDescription className="text-sm font-medium leading-relaxed text-ink/60">
                            Create an account or sign in to chat with us and request your
                            quote — messages, quotes and updates all stay in one place.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex-row gap-2 sm:justify-start">
                        <Link
                            to="/login"
                            data-testid="quote-signin-link"
                            onClick={() => setOpen(false)}
                            className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-90"
                        >
                            Sign in
                        </Link>
                        <Link
                            to="/login?mode=register"
                            data-testid="quote-signup-link"
                            onClick={() => setOpen(false)}
                            className="inline-flex items-center justify-center rounded-full border border-ink/30 px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                        >
                            Create account
                        </Link>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
