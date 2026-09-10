import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Eye, Heart, Sparkles, Users } from "lucide-react";

/* each stat card clicks through to chart ITS series over the last 14 days */
const METRICS = {
    views: { key: "views", label: "site views" },
    visitors: { key: "visitors", label: "unique visitors" },
    signups: { key: "signups", label: "new accounts" },
};

/* Admin stats: site views, customer account quantity and the colours
   clients have favourited in the visualiser. */
export default function StatsView({ stats, favourites }) {
    const [metric, setMetric] = useState("views");
    const cards = [
        { label: "Site views — all time", value: stats ? stats.views_total : null, icon: Eye, testid: "stat-views-total", metric: "views" },
        { label: "Views today", value: stats ? stats.views_today : null, icon: Eye, testid: "stat-views-today", metric: "views" },
        { label: "Views this week", value: stats ? stats.views_7d : null, icon: Eye, testid: "stat-views-week", metric: "views" },
        { label: "Unique visitors this week", value: stats ? stats.visitors_7d : null, icon: Users, testid: "stat-visitors-week", metric: "visitors" },
        { label: "Customer accounts", value: stats ? stats.customers : null, icon: Users, testid: "stat-customers-total", metric: "signups" },
        { label: "New accounts this week", value: stats ? stats.customers_new_7d : null, icon: Sparkles, testid: "stat-customers-new", metric: "signups" },
    ];

    const maxViews = stats && stats.daily ? Math.max(...stats.daily.map((d) => d.views)) : 0;

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
                    {cards.map(({ label, value, icon: Icon, testid, metric: m }) => (
                        <button
                            key={testid}
                            data-testid={testid}
                            data-metric={m}
                            onClick={() => setMetric(m)}
                            title={`Chart ${METRICS[m].label} over the last 14 days`}
                            className={`rounded-3xl border border-ink/10 p-6 text-left shadow-[0_10px_30px_rgba(10,10,10,0.05)] transition-all duration-300 hover:-translate-y-0.5 ${
                                metric === m ? "bg-white ring-2 ring-[#C6A55C]" : "bg-white/85 hover:bg-white"
                            }`}
                        >
                            <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink/55">
                                <Icon className="h-3.5 w-3.5" /> {label}
                            </div>
                            <p className="mt-3 font-display text-5xl font-extrabold tracking-tight">
                                {stats ? value.toLocaleString() : "—"}
                            </p>
                            <p className={`mt-2 font-mono text-[9px] font-bold uppercase tracking-[0.15em] ${metric === m ? "text-[#C6A55C]" : "text-ink/35"}`}>
                                {metric === m ? "■ Charting now" : "□ Tap to chart"}
                            </p>
                        </button>
                    ))}
                </div>

                <div
                    className="mt-6 rounded-3xl border border-ink/10 bg-white/85 p-6 shadow-[0_10px_30px_rgba(10,10,10,0.05)]"
                    data-testid="stats-chart"
                >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink/55" data-testid="stats-chart-title">
                            {METRICS[metric].label} — last 14 days
                        </p>
                        {maxViews === 0 && (
                            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-ink/40">
                                Bars rise as the visits come in
                            </p>
                        )}
                    </div>
                    <div className="mt-4 h-56 w-full sm:h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats ? stats.daily : []} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                                <CartesianGrid stroke="rgba(10,10,10,0.07)" vertical={false} />
                                <XAxis
                                    dataKey="day"
                                    tickFormatter={(d) => d.slice(8, 10) + "/" + d.slice(5, 7)}
                                    tick={{ fontSize: 10, fill: "rgba(10,10,10,0.45)", fontFamily: "monospace" }}
                                    axisLine={{ stroke: "rgba(10,10,10,0.15)" }}
                                    tickLine={false}
                                    interval={1}
                                />
                                <YAxis
                                    allowDecimals={false}
                                    tick={{ fontSize: 10, fill: "rgba(10,10,10,0.45)", fontFamily: "monospace" }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip
                                    cursor={{ fill: "rgba(198,165,92,0.12)" }}
                                    contentStyle={{
                                        borderRadius: 14,
                                        border: "1px solid rgba(10,10,10,0.12)",
                                        fontFamily: "monospace",
                                        fontSize: 11,
                                    }}
                                    formatter={(v) => [`${v} ${METRICS[metric].key}`, null]}
                                    labelFormatter={(d) => "Day " + d.slice(8, 10) + "/" + d.slice(5, 7)}
                                />
                                <Bar dataKey={METRICS[metric].key} fill="#C6A55C" radius={[6, 6, 0, 0]} maxBarSize={26} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
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
