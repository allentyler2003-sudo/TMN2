import { Eye, Heart, Sparkles, Users } from "lucide-react";

/* Admin stats: site views, customer account quantity and the colours
   clients have favourited in the visualiser. */
export default function StatsView({ stats, favourites }) {
    const cards = [
        { label: "Site views — all time", value: stats ? stats.views_total : null, icon: Eye, testid: "stat-views-total" },
        { label: "Views today", value: stats ? stats.views_today : null, icon: Eye, testid: "stat-views-today" },
        { label: "Views this week", value: stats ? stats.views_7d : null, icon: Eye, testid: "stat-views-week" },
        { label: "Unique visitors this week", value: stats ? stats.visitors_7d : null, icon: Users, testid: "stat-visitors-week" },
        { label: "Customer accounts", value: stats ? stats.customers : null, icon: Users, testid: "stat-customers-total" },
        { label: "New accounts this week", value: stats ? stats.customers_new_7d : null, icon: Sparkles, testid: "stat-customers-new" },
    ];

    return (
        <div className="space-y-12" data-testid="admin-stats-view">
            <div>
                <div className="mb-8">
                    <p className="font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-ink/60">
                        Live from your website
                    </p>
                    <h1 className="mt-2 font-display text-4xl font-extrabold uppercase tracking-tight">
                        Site stats
                    </h1>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {cards.map(({ label, value, icon: Icon, testid }) => (
                        <div
                            key={testid}
                            data-testid={testid}
                            className="rounded-3xl border border-ink/10 bg-white/85 p-6 shadow-[0_10px_30px_rgba(10,10,10,0.05)]"
                        >
                            <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink/55">
                                <Icon className="h-3.5 w-3.5" /> {label}
                            </div>
                            <p className="mt-3 font-display text-5xl font-extrabold tracking-tight">
                                {stats ? value.toLocaleString() : "—"}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <div className="mb-6 flex items-center gap-3">
                    <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight">
                        Clients&rsquo; favourite colours
                    </h2>
                    <Heart className="h-4 w-4 fill-[#C6A55C] text-[#C6A55C]" />
                </div>
                {!favourites ? (
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink/50">Loading…</p>
                ) : favourites.length === 0 ? (
                    <div className="rounded-3xl border border-ink/10 bg-white/85 p-8 text-center">
                        <p className="text-sm font-medium text-ink/55">
                            No favourites yet — when clients tap the heart on a colour in the
                            visualiser, the most-loved shades land here.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {favourites.map((f, i) => (
                            <div
                                key={f.hex}
                                data-testid={`admin-favourite-row-${i}`}
                                className="flex flex-wrap items-center gap-4 rounded-2xl border border-ink/10 bg-white/85 p-4"
                            >
                                <span
                                    className="h-10 w-10 shrink-0 rounded-full shadow-md ring-2 ring-white"
                                    style={{ backgroundColor: f.hex }}
                                />
                                <div className="min-w-0">
                                    <p className="font-display text-base font-bold uppercase tracking-tight">
                                        {f.name} <span className="ml-1 font-mono text-xs font-medium text-ink/50">{f.hex}</span>
                                    </p>
                                    <p className="truncate text-xs font-medium text-ink/55">
                                        {f.clients.length ? f.clients.join(" · ") : "No client attached"}
                                    </p>
                                </div>
                                <span
                                    data-testid={`admin-favourite-count-${i}`}
                                    className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 font-mono text-[10px] font-bold text-paper"
                                >
                                    <Heart className="h-3 w-3 fill-[#C6A55C] text-[#C6A55C]" /> {f.count}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
