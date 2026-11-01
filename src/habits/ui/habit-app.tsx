"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDownToLine, ArrowRight, Check, CheckCheck, ChevronLeft, ChevronRight, Cloud, CloudOff, Flame, LayoutGrid, Leaf, LoaderCircle, Plus, Search, Settings, ShieldCheck, Sparkles, TrendingUp, WifiOff, X } from "lucide-react";
import { useHabitApp } from "@/shared/ui/use-habit-app";
import { usePwa } from "@/shared/ui/use-pwa";
import { useLocalDate } from "@/shared/ui/use-local-date";
import { NotificationSettings } from "@/notifications/ui/notification-settings";
import { LegalLinks } from "@/shared/legal/legal-links";
import { CatCompanion } from "@/shared/ui/cat";
import { cloudConfigured } from "@/sync/infrastructure/firebase-client";
import { CATEGORIES, type HabitDetails, type HabitModel } from "../domain/habit.entity";
import { insightSummary, progress, scheduled, complete } from "../domain/habit.insights";
import { CreateHabit } from "../create-habit/create-habit.command";
import { EditHabit } from "../edit-habit/edit-habit.command";
import { CheckInHabit } from "../check-in/check-in.command";
import { dateObject, shiftDate } from "@/shared/domain/calendar";
import { HabitEditor } from "./habit-editor";
import { HabitCard } from "./habit-card";
import { HabitIcon } from "./habit-icon";
import { Insights } from "./insights";

type View = "today" | "insights" | "settings";
const navigation = [{ id: "today", label: "My habits", icon: LayoutGrid }, { id: "insights", label: "My progress", icon: TrendingUp }, { id: "settings", label: "Settings", icon: Settings }] as const;
const starters: HabitDetails[] = [
  { name: "Drink more water", description: "A little hydration, a lot more energy.", category: "Wellbeing", color: "blue", period: "Anytime", target: 8, unit: "glasses", days: [0, 1, 2, 3, 4, 5, 6] },
  { name: "Make time to read", description: "Trade a little scrolling for a new perspective.", category: "Learning", color: "peach", period: "Evening", target: 10, unit: "pages", days: [0, 1, 2, 3, 4, 5, 6] },
  { name: "A moment of calm", description: "Pause. Breathe. Come back to yourself.", category: "Focus", color: "sage", period: "Morning", target: 1, unit: "moment", days: [0, 1, 2, 3, 4, 5, 6] },
];

export function HabitApp() {
  const app = useHabitApp();
  const pwa = usePwa();
  const { habits, loading, online, pending, syncing, error, lastSync } = app.snapshot;
  const [view, setView] = useState<View>("today");
  const today = useLocalDate();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const day = selectedDay ?? today;
  const setDay = (value: string) => setSelectedDay(value === today ? null : value);
  const [category, setCategory] = useState("All habits");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "todo" | "done">("all");
  const [editor, setEditor] = useState<{ habit: HabitModel | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!today) return <div className="app-loading"><Image src="/brand.svg" alt="" width={54} height={54} priority /><h1>Simply Habits</h1><p>Small steps. Good days.</p><p className="loading-description">A gentle, offline-first habit tracker for daily goals, check-ins, streaks, and progress. Keep your habits on this device, or connect optional cloud sync.</p><span role="status">Making room for your habits...</span></div>;

  const active = habits.filter(h => !h.archived);
  const due = active.filter(h => scheduled(h, day));
  const filtered = due.filter(h => (category === "All habits" || h.category === category) && `${h.name} ${h.description}`.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || (filter === "done" ? complete(h, day) : !complete(h, day))));
  const selectedProgress = progress(active, day);
  const summary = insightSummary(habits, today);
  const historical = day !== today;
  const week = Array.from({ length: 7 }, (_, i) => shiftDate(day, i - 6));
  const firstName = app.user?.displayName?.split(" ")[0];
  const status = !online ? "Offline · saved locally" : syncing ? "Syncing your habits..." : app.user ? pending ? `${pending} habits waiting to sync` : lastSync ? "Everything is synced" : "Cloud connected" : "Saved on this device";

  async function checkIn(habit: HabitModel, delta: number) {
    if (!app.runtime || busy) return;
    setBusy(habit.id);
    try {
      await app.runtime.execute(new CheckInHabit(crypto.randomUUID(), { id: habit.id, day, delta }));
      if (delta > 0 && (habit.entries[day]?.count ?? 0) + 1 >= (habit.entries[day]?.target ?? habit.target)) setToast("A small win, just for you. Nicely done!");
    } catch { /* The runtime reports command errors to the accessible error banner. */ }
    finally { setBusy(null); }
  }
  async function save(details: HabitDetails) {
    if (!app.runtime) throw new Error("Local storage is still starting. Please wait.");
    const command = editor?.habit
      ? new EditHabit(crypto.randomUUID(), { id: editor.habit.id, details })
      : new CreateHabit(crypto.randomUUID(), { id: crypto.randomUUID(), details });
    await app.runtime.execute(command);
    setToast(editor?.habit ? "Habit updated. Make it work for you." : "A new beginning. You've got this.");
  }
  async function addStarter(details: HabitDetails) {
    if (!app.runtime || busy) return;
    setBusy("starter");
    try {
      await app.runtime.execute(new CreateHabit(crypto.randomUUID(), { id: crypto.randomUUID(), details }));
      setDay(today); setCategory("All habits"); setFilter("all"); setSearch("");
      setToast(`${details.name} is ready. Start small!`);
    } catch { /* The runtime displays the error. */ }
    finally { setBusy(null); }
  }
  async function restore(habit: HabitModel) {
    if (!app.runtime || busy) return;
    setBusy(habit.id);
    try { await app.runtime.execute(new EditHabit(crypto.randomUUID(), { id: habit.id, archived: false })); setToast("Welcome back, little habit."); }
    catch { /* The runtime displays the error. */ }
    finally { setBusy(null); }
  }
  function exportData() {
    const blob = new Blob([JSON.stringify({ app: "Simply Habits", version: 1, exported_at: new Date().toISOString(), habits }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `simply-habits-${today}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("Your habit history, to keep.");
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="sidebar">
      <Link href="/" className="brand"><Image src="/brand.svg" alt="" width={42} height={42} priority /><span>simply<span className="brand-second">habits<span className="brand-dot">.</span></span></span></Link>
      <p className="sidebar-tagline">Little by little.</p>
      <div className="nav-label">YOUR LITTLE CORNER</div>
      <nav aria-label="Main navigation">{navigation.map(item => <button key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} onClick={() => setView(item.id)} aria-current={view === item.id ? "page" : undefined}><item.icon size={19} strokeWidth={1.7} /><span>{item.label}</span>{view === item.id && <span className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-note"><Leaf size={22} strokeWidth={1.5} /><p>Good things take<br />a little tending.</p><span>One day. One habit. One you.</span></div>
      <div className="sidebar-footer"><span className={`status-dot ${!online ? "offline" : ""}`} /><span>{app.user ? "Your cloud is connected" : "Your habits stay yours"}</span><ShieldCheck size={15} /></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="mobile-brand"><Image src="/brand.svg" alt="" width={31} height={31} /><strong>simply habits.</strong></div><span className="desktop-breadcrumb">Your space <ChevronRight size={13} /> <strong>{navigation.find(n => n.id === view)?.label}</strong></span><div className="topbar-right"><span className={`sync-status ${!online ? "is-offline" : ""}`} title={status}>{!online ? <WifiOff size={15} /> : syncing ? <LoaderCircle size={15} className="spin" /> : app.user ? <Cloud size={15} /> : <ShieldCheck size={15} />}<span>{status}</span></span><button className="avatar" aria-label="Open account settings" onClick={() => setView("settings")}>{firstName?.[0] ?? <Leaf size={18} />}</button></div></header>
      <main id="main-content" className="main-content">
        {!online && <div className="notice"><WifiOff size={17} /><p>You&apos;re offline. Keep going — your check-ins are saved on this device.{app.user && " They'll sync when you're back."}</p></div>}
        {(error || app.authError || pwa.error) && <div role="alert" className="notice error"><CloudOff size={18} /><p>{error || app.authError || pwa.error}</p>{(error || app.authError) && <button aria-label="Dismiss error" onClick={() => { app.runtime?.clearError(); app.clearAuthError(); }}><X size={18} /></button>}</div>}
        {pwa.update && <div className="notice"><Sparkles size={18} /><p>A fresh version is ready. Your saved habits will stay safe.</p><button className="text-button" onClick={pwa.applyUpdate} disabled={!!busy}>Refresh app</button></div>}
        {view === "today" && <div className="view-enter">
          <div className="page-heading"><div><p className="eyebrow">{dateObject(today).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p><h1>{firstName ? `A little better, ${firstName}.` : "Small steps. Good days."}<span className="heading-spark"> ✳</span></h1><p className="muted">You don&apos;t have to do it all. Just a little, every day.</p></div><button className="button primary" disabled={loading} onClick={() => setEditor({ habit: null })}><Plus size={18} /> New habit</button></div>
          <div className="today-layout">
            <div className="habit-column">
              <section className="welcome-card"><div><span className="welcome-tag"><Sparkles size={13} /> A FRESH LITTLE START</span><h2>{selectedProgress.total && selectedProgress.completed === selectedProgress.total ? "Look at you growing." : "A little effort today.\nA little more you tomorrow."}</h2><p>{selectedProgress.total && selectedProgress.completed === selectedProgress.total ? "You made time for every habit today. Take a breath and enjoy the little wins." : "Build habits that feel like care, not a chore.\nYour future self is already cheering you on."}</p><span className="welcome-signature"><span /> No perfect streaks required.</span></div><CatCompanion className="welcome-cat" /></section>
              <section className="habits-section" aria-label="Habit check-ins">
                <div className="section-heading"><h2>{historical ? "A look back" : "Your daily little things"} <span className="count-badge">{due.length}</span></h2><div className="date-navigation"><button className="icon-button" aria-label="Previous week" onClick={() => setDay(shiftDate(day, -7))}><ChevronLeft size={18} /></button><span>{dateObject(day).toLocaleDateString("en", { month: "short", year: "numeric" })}</span><button className="icon-button" aria-label="Next week" disabled={day >= today} onClick={() => setDay(shiftDate(day, 7) > today ? today : shiftDate(day, 7))}><ChevronRight size={18} /></button></div></div>
                <div className="date-strip">{week.map(date => {
                  const p = progress(active, date), selected = date === day;
                  return <button key={date} className={`date-cell ${selected ? "selected" : ""} ${date === today ? "is-today" : ""}`} aria-pressed={selected} aria-label={`${dateObject(date).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}: ${p.completed} of ${p.total} habits complete`} onClick={() => setDay(date)}><span>{dateObject(date).toLocaleDateString("en", { weekday: "short" })}</span><strong>{dateObject(date).getDate()}</strong><span className={`date-indicator ${p.total && p.completed === p.total ? "all-done" : p.completed ? "some-done" : ""}`}>{p.total && p.completed === p.total ? <Check size={9} /> : null}</span></button>;
                })}</div>
                {historical && <div className="history-notice"><span>Checking in for {dateObject(day).toLocaleDateString("en", { month: "long", day: "numeric" })}</span><button className="text-button" onClick={() => setDay(today)}>Back to today <ArrowRight size={13} /></button></div>}
                <div className="category-tabs" aria-label="Filter by category">{["All habits", ...CATEGORIES].map(c => <button key={c} className={category === c ? "active" : ""} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div>
                <div className="list-toolbar"><label className="search-field"><Search size={17} /><input aria-label="Search habits" placeholder="Find a little habit..." value={search} onChange={e => setSearch(e.target.value)} /></label><select aria-label="Filter by completion" value={filter} onChange={e => { const v = e.target.value; if (v === "all" || v === "todo" || v === "done") setFilter(v); }}><option value="all">All progress</option><option value="todo">Still to do</option><option value="done">Completed</option></select></div>
                {loading ? <div className="loading-state" role="status"><LoaderCircle size={24} className="spin" /><p>Making room for your habits...</p></div> : filtered.length ? <div className="habit-grid">{filtered.map(h => <HabitCard key={h.id} habit={h} day={day} today={today} busy={!!busy} onChange={delta => { void checkIn(h, delta); }} onEdit={() => setEditor({ habit: h })} />)}</div> : <div className="empty-state"><div className="empty-icon"><Leaf size={27} strokeWidth={1.4} /></div><h3>{!active.length ? "Good things start small." : !due.length ? "A little room to breathe." : "Nothing here just yet."}</h3><p>{!active.length ? "Choose one small thing you'd like to make time for.\nWe'll help you keep showing up." : !due.length ? "No habits scheduled for this day. Enjoy the pause,\nor make space for a new little ritual." : "Try a different filter or search to find your habits."}</p>{!active.length ? <button className="text-button" onClick={() => setEditor({ habit: null })}>Create your first habit <ArrowRight size={16} /></button> : due.length > 0 ? <button className="text-button" onClick={() => { setSearch(""); setCategory("All habits"); setFilter("all"); }}>Clear filters</button> : null}</div>}
                {!loading && !active.length && <section className="starter-section"><div className="section-heading"><h3>A little inspiration</h3><span className="subtle-label">Yours to make your own</span></div><div className="starter-grid">{starters.map(s => <button key={s.name} className={`starter-card tint-${s.color}`} disabled={!!busy} onClick={() => { void addStarter(s); }}><HabitIcon category={s.category} size={23} /><strong>{s.name}</strong><span>{s.target} {s.unit} a day</span><span className="starter-add"><Plus size={14} /> Add habit</span></button>)}</div></section>}
              </section>
            </div>
            <aside className="right-column" aria-label="Your progress at a glance">
              <section className="panel daily-progress"><div className="section-heading"><h3>{historical ? "That day's rhythm" : "Today's rhythm"}</h3><span className="mini-symbol tint-sage"><Leaf size={16} /></span></div><div className="progress-ring" role="img" aria-label={`${selectedProgress.completed} of ${selectedProgress.total} habits completed`} style={{ "--progress": `${selectedProgress.percent}%` } as React.CSSProperties}><div><strong>{selectedProgress.percent}<span>%</span></strong><span>a little closer</span></div></div><p><strong>{selectedProgress.completed}</strong> of {selectedProgress.total} habits complete</p><div className="gentle-note">{selectedProgress.total === 0 ? "Your next chapter starts with one little habit." : selectedProgress.percent === 100 ? "You did your little things. That's a big deal." : selectedProgress.percent > 0 ? "Every check-in counts. You're doing good." : "No rush. Your first little win is waiting."}</div></section>
              <section className="panel week-overview"><div className="section-heading"><h3>Your week in bloom</h3><TrendingUp size={18} className="muted" /></div><div className="mini-week">{summary.week.map(d => <div key={d.day}><div className="mini-bar"><span style={{ height: `${d.percent}%` }} /></div><span>{dateObject(d.day).toLocaleDateString("en", { weekday: "narrow" })}</span></div>)}</div><div className="week-metric"><strong>{summary.weeklyRate}%</strong><span>of scheduled habits completed<br />over the last 7 days</span></div><button className="text-button" onClick={() => setView("insights")}>See your progress <ArrowRight size={14} /></button></section>
              <section className="streak-card"><div className="streak-icon"><Flame size={23} strokeWidth={1.6} /></div><div><strong>{summary.bestStreak} <span>day{summary.bestStreak !== 1 ? "s" : ""}</span></strong><p>Your longest current streak</p></div><span className="streak-flower">✳</span></section>
              <div className="small-reminder"><span>A GENTLE REMINDER</span><p>&ldquo;You&apos;re allowed to be both<br />a masterpiece and a<br />work in progress.&rdquo;</p><span className="tiny-leaf"><Leaf size={17} /></span></div>
            </aside>
          </div>
          <footer className="page-footer"><Leaf size={13} /> Made for real life. And the little things in it.<LegalLinks /></footer>
        </div>}
        {view === "insights" && <Insights habits={habits} today={today} />}
        {view === "settings" && <div className="settings-view view-enter"><div className="page-heading"><div><p className="eyebrow">YOUR HABITS, YOUR WAY</p><h1>A space that feels like you.</h1><p className="muted">Keep your little things safe, close, and ready for wherever life goes.</p></div></div>
          <section className="panel settings-panel"><div className="settings-heading"><span className="settings-symbol tint-sage"><Cloud size={24} /></span><div><h2>A little peace of mind</h2><p className="muted">Optional cloud sync. Always local-first.</p></div></div>{app.user ? <><p>Connected as <strong>{app.user.displayName || app.user.email}</strong>.</p><p className="muted text-sm mt-2">{status}{lastSync && ` · Last synced ${new Date(lastSync).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}`}</p><div className="flex flex-wrap gap-3 mt-5"><button className="button primary" disabled={!online || syncing || loading} onClick={() => app.runtime?.requestSync()}>{syncing ? <LoaderCircle size={16} className="spin" /> : <Cloud size={16} />} Sync now</button><button className="button secondary" disabled={app.authBusy || !!busy} onClick={() => { void app.disconnect(); }}>Sign out</button></div><p className="settings-hint">Signing out returns to this device&apos;s guest space. This account&apos;s saved habits stay in its separate local vault.</p></> : <><p>Sign in with Google to bring your habits across devices. Your current device habits will be added to your account when you connect.</p>{cloudConfigured ? <button className="button primary mt-5" disabled={app.authBusy || !online || loading} onClick={() => { void app.connect(); }}>{app.authBusy ? <LoaderCircle size={17} className="spin" /> : <Cloud size={17} />} Connect with Google</button> : <div className="configuration-note"><ShieldCheck size={18} /><span>Local mode is ready. To enable cloud sync, add your Firebase configuration as described in the project README.</span></div>}</>}
          </section>
          <NotificationSettings key={app.user?.uid ?? "guest"} user={app.user} habits={habits} online={online} pending={pending} />
          <section className="panel settings-panel"><h2>Your trust matters</h2><p className="muted mt-3 mb-4">Read how your data is handled and the terms for using Simply Habits.</p><LegalLinks /></section>
          <section className="panel settings-panel"><div className="settings-heading"><span className="settings-symbol tint-peach"><ArrowDownToLine size={24} /></span><div><h2>Always within reach</h2><p className="muted">Your companion, right on your home screen.</p></div></div><p>{pwa.installed ? "Simply Habits is installed. Your little rituals have a home." : "Install Simply Habits for a focused, app-like experience. No app store needed."}</p><div className="flex flex-wrap items-center gap-4 mt-5">{!pwa.installed && <button className="button primary" onClick={() => { void pwa.install(); }}><Plus size={17} /> Install app</button>}<span className="offline-ready">{pwa.offlineReady ? <CheckCheck size={17} /> : <ShieldCheck size={17} />}{pwa.offlineReady ? "Ready for offline use" : process.env.NODE_ENV === "production" ? "Preparing offline access..." : "Offline shell enabled in production"}</span></div>{pwa.instructions && <div className="install-instructions"><button className="icon-button" aria-label="Close installation instructions" onClick={pwa.closeInstructions}><X size={17} /></button><h3>A home for your habits</h3><p>On iPhone or iPad, open this app in Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. On desktop or Android, use your browser&apos;s <strong>Install app</strong> or <strong>Add to home screen</strong> menu. Installation requires HTTPS (or localhost).</p></div>}</section>
          <section className="panel settings-panel"><div className="settings-heading"><span className="settings-symbol tint-blue"><ShieldCheck size={24} /></span><div><h2>Your story belongs to you</h2><p className="muted">A copy of every little win.</p></div></div><p>Download all your habits and check-in history as JSON. Your data stays in your browser until you choose to connect cloud sync.</p><button className="button secondary mt-5" disabled={loading} onClick={exportData}><ArrowDownToLine size={16} /> Export my habits</button><p className="settings-hint">Browser storage can be cleared by your browser or device. Export regularly, or connect cloud sync for a second copy.</p></section>
          <section className="panel settings-panel"><div className="section-heading"><h2>Taking a little pause</h2><span className="subtle-label">{habits.filter(h => h.archived).length} archived</span></div><p className="muted text-sm mb-4">Archived habits keep their history. Bring them back whenever you&apos;re ready.</p>{habits.filter(h => h.archived).map(h => <div className="archived-row" key={h.id}><span className={`mini-symbol tint-${h.color}`}><HabitIcon category={h.category} size={18} /></span><strong>{h.name}</strong><button className="text-button" disabled={!!busy} onClick={() => { void restore(h); }}>Restore <ArrowRight size={14} /></button></div>)}{!habits.some(h => h.archived) && <p className="muted py-3 text-sm">No habits on pause. You can archive a habit from its edit menu.</p>}</section>
        </div>}
      </main>
    </div>
    <nav className="mobile-nav" aria-label="Mobile navigation">{navigation.map(item => <button key={item.id} onClick={() => setView(item.id)} className={view === item.id ? "active" : ""} aria-current={view === item.id ? "page" : undefined}><item.icon size={20} /><span>{item.label}</span></button>)}</nav>
    {editor && <HabitEditor habit={editor.habit} onClose={() => setEditor(null)} onSave={save} onArchive={async () => {
      if (!app.runtime || !editor.habit) throw new Error("No habit selected.");
      await app.runtime.execute(new EditHabit(crypto.randomUUID(), { id: editor.habit.id, archived: true }));
      setToast("Taking a pause. Your history stays safe.");
    }} />}
    {toast && <div className="toast" role="status"><span><Check size={15} /></span>{toast}</div>}
  </div>;
}
