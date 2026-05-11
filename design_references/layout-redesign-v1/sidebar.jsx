/* Cover placeholder — subtle striped gradient based on type */

const Cover = ({ type = "anime", label = "", size = "normal" }) => {
  const tone = window.TYPE_TONES[type] || window.TYPE_TONES.anime;
  return (
    <div className="cover-art" style={{ background: tone.bg }}>
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.18 }}
        aria-hidden="true"
        preserveAspectRatio="none"
        viewBox="0 0 100 150"
      >
        <defs>
          <pattern id={`stripes-${type}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="white" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100" height="150" fill={`url(#stripes-${type})`} />
      </svg>
      <div style={{
        position: "relative",
        zIndex: 1,
        fontWeight: 700,
        fontSize: size === "tiny" ? 8 : size === "small" ? 10 : 11,
        letterSpacing: "0.12em",
        color: tone.accent,
        textShadow: "0 1px 4px rgba(0,0,0,0.4)",
      }}>
        {label}
      </div>
    </div>
  );
};

/* ============================================================
   Sidebar
   ============================================================ */

const NAV_PRIMARY = [
  { id: "dashboard", label: "Dashboard", icon: "Home" },
  { id: "library",   label: "Kütüphanem", icon: "Library", active: true, badge: "285" },
  { id: "discover",  label: "Keşfet",     icon: "Compass" },
  { id: "calendar",  label: "Takvim",     icon: "Calendar", ghost: true, badge: "Yakında" },
];

const NAV_PERSONAL = [
  { id: "progress",  label: "İlerlemem",   icon: "Trending" },
  { id: "watch",     label: "İzleme Listem", icon: "List", badge: "42" },
  { id: "favs",      label: "Favorilerim",   icon: "Heart" },
  { id: "ratings",   label: "Puanlamalarım", icon: "Star" },
  { id: "notes",     label: "Notlarım",      icon: "Note" },
  { id: "stats",     label: "İstatistikler", icon: "Stats", ghost: true, badge: "Yakında" },
];

const NAV_AI = [
  { id: "ai",        label: "AI Danışman",   icon: "Sparkle", badge: "Beta", badgeTone: "accent" },
  { id: "activity",  label: "Aktivite",       icon: "Activity" },
];

const NAV_FOOT = [
  { id: "settings",  label: "Ayarlar",       icon: "Settings" },
];

const NavItem = ({ item }) => {
  const Ico = window.Icons[item.icon];
  return (
    <button
      className="nav-item"
      data-active={item.active ? "true" : undefined}
      data-ghost={item.ghost ? "true" : undefined}
    >
      <span className="nav-icon"><Ico size={16} /></span>
      <span>{item.label}</span>
      {item.badge && (
        <span className="nav-badge" data-tone={item.badgeTone || (item.ghost ? "soon" : undefined)}>
          {item.badge}
        </span>
      )}
    </button>
  );
};

const Sidebar = () => (
  <aside className="sidebar">
    <div className="brand">
      <div className="brand-mark">M</div>
      <div>
        <div className="brand-name">MediaTracker</div>
        <div className="brand-tagline">İzle · oku · takip et</div>
      </div>
    </div>

    <div className="nav-section">
      <div className="nav-label">Genel</div>
      {NAV_PRIMARY.map(i => <NavItem key={i.id} item={i} />)}
    </div>

    <div className="nav-section">
      <div className="nav-label">Kişisel</div>
      {NAV_PERSONAL.map(i => <NavItem key={i.id} item={i} />)}
    </div>

    <div className="nav-section">
      <div className="nav-label">Yardımcılar</div>
      {NAV_AI.map(i => <NavItem key={i.id} item={i} />)}
    </div>

    <div style={{ marginTop: "auto" }}>
      <div className="nav-section">
        {NAV_FOOT.map(i => <NavItem key={i.id} item={i} />)}
      </div>

      <div className="user-card">
        <div className="user-row">
          <div className="user-avatar">B</div>
          <div className="user-meta">
            <div className="user-name">Burak</div>
            <div className="user-level">Seviye 23 · Doğu Yolcusu</div>
          </div>
        </div>
        <div>
          <div className="xp-track"><div className="xp-fill" style={{ width: "67%" }} /></div>
          <div className="xp-meta" style={{ marginTop: 4 }}>
            <span>2.340 XP</span>
            <span>3.500</span>
          </div>
        </div>
      </div>
    </div>
  </aside>
);

window.Sidebar = Sidebar;
window.Cover = Cover;
