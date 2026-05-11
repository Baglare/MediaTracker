/* ============================================================
   MediaTracker — Right rail widgets
   ============================================================ */

const { Icons, Cover } = window;

/* Ring progress */
const Ring = ({ pct = 42, size = 84, stroke = 6 }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="ring-bg" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="ring-fill"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
      <div className="ring-label" style={{ display: "flex", flexDirection: "column" }}>
        <span className="ring-pct">{pct}%</span>
        <span className="ring-cap">Tamamlandı</span>
      </div>
    </div>
  );
};

const OverallWidget = () => (
  <div className="widget">
    <div className="widget-header">
      <div className="widget-title"><Icons.Target size={13} /> Genel İlerleme</div>
      <span className="widget-eyebrow">7 GÜN</span>
    </div>
    <div className="ring-row">
      <Ring pct={42} />
      <div className="stat-list">
        <div className="stat-row"><span>İzlenen Bölüm</span><strong>1.246</strong></div>
        <div className="stat-row"><span>Okunan Bölüm</span><strong>583</strong></div>
        <div className="stat-row"><span>Okuma Süresi</span><strong>324s 18d</strong></div>
        <div className="stat-row"><span>Puan Ortalaması</span><strong>8.7 / 10</strong></div>
      </div>
    </div>
  </div>
);

const DailyGoalWidget = () => (
  <div className="widget">
    <div className="widget-header">
      <div className="widget-title"><Icons.Activity size={13} /> Günlük Hedef</div>
      <span className="widget-count">4 / 8</span>
    </div>
    <div className="goal-bar">
      <div className="goal-fill" style={{ width: "50%" }} />
    </div>
    <div className="goal-meta">
      <span>Bölüm hedefi</span>
      <strong>%50</strong>
    </div>
    <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
      {Array.from({ length: 7 }).map((_, i) => {
        const filled = [0, 1, 2, 3].includes(i);
        const today = i === 3;
        return (
          <div key={i} style={{
            flex: 1,
            height: 22,
            borderRadius: 4,
            background: filled ? "var(--accent)" : "var(--bg-3)",
            opacity: filled ? (today ? 1 : 0.5) : 1,
            border: today ? "1px solid var(--accent-strong)" : "1px solid transparent",
          }} />
        );
      })}
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--fg-4)", letterSpacing: "0.1em", fontFamily: "var(--font-mono)" }}>
      <span>PZT</span><span>SAL</span><span>ÇRŞ</span><span>PER</span><span>CUM</span><span>CMT</span><span>PZR</span>
    </div>
  </div>
);

const UpcomingWidget = () => (
  <div className="widget">
    <div className="widget-header">
      <div className="widget-title"><Icons.Calendar size={13} /> Yaklaşan Bölümler</div>
      <span className="widget-count">{window.UPCOMING.length}</span>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {window.UPCOMING.map((u, i) => (
        <div key={i} className="upcoming-item">
          <div className="upcoming-cover">
            <Cover type="anime" label={u.cover} size="tiny" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="upcoming-title">{u.title}</div>
            <div className="upcoming-meta">{u.meta}</div>
          </div>
          <span className="upcoming-when" data-tone={u.tone === "muted" ? "muted" : undefined}>{u.when}</span>
        </div>
      ))}
    </div>
  </div>
);

const ActivityWidget = () => (
  <div className="widget">
    <div className="widget-header">
      <div className="widget-title"><Icons.Activity size={13} /> Son Aktiviteler</div>
      <button className="section-link" style={{ fontSize: 11 }}>Tümü <Icons.ChevronRight size={11} /></button>
    </div>
    <div>
      {window.ACTIVITY.map((a, i) => (
        <div key={i} className="activity-item">
          <span className="activity-dot" data-tone={a.tone} />
          <div className="activity-text">{a.text}</div>
          <span className="activity-time">{a.time}</span>
        </div>
      ))}
    </div>
  </div>
);

const SuggestionWidget = () => (
  <div className="widget" style={{ borderColor: "var(--accent-line)", background: "linear-gradient(180deg, rgba(232,184,106,0.06), var(--bg-1))" }}>
    <div className="widget-header">
      <div className="widget-title" style={{ color: "var(--accent)" }}>
        <Icons.Sparkle size={13} /> Önerilen Devam
      </div>
      <span className="widget-eyebrow" style={{ color: "var(--accent)" }}>AI</span>
    </div>
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <div style={{ width: 56, height: 80, borderRadius: 6, overflow: "hidden", flexShrink: 0, position: "relative", background: "var(--bg-3)" }}>
        <Cover type="anime" label="VINLD" size="tiny" />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-0)" }}>Vinland Saga · S2</div>
        <div style={{ fontSize: 11, color: "var(--fg-2)", marginTop: 2, lineHeight: 1.45 }}>
          Frieren’i sevdin. Sakin tempo + karakter odaklı.
        </div>
        <button className="tiny-btn" data-variant="primary" style={{ marginTop: 8 }}>
          <Icons.Plus size={10} /> Listeye ekle
        </button>
      </div>
    </div>
  </div>
);

const QuoteWidget = () => (
  <div className="widget quote-card">
    <span className="quote-mark">「</span>
    <div className="quote-text">Yol uzundur, kılıç keskindir. İzleyen değil, anlayan kazanır.</div>
    <div className="quote-author">— Doğu Yolu</div>
  </div>
);

const RightRail = () => (
  <aside className="right-rail">
    <OverallWidget />
    <DailyGoalWidget />
    <UpcomingWidget />
    <SuggestionWidget />
    <ActivityWidget />
    <QuoteWidget />
  </aside>
);

window.RightRail = RightRail;
