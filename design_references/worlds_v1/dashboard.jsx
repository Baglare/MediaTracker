/* MediaTracker dashboard shell — same structure, world-driven theming */
const { useMemo } = React;

/* ----- ICONS ----- */
const Ic = {
  home: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 11l9-8 9 8M5 10v10h14V10"/></svg>,
  lib: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 4h3v16H4zM10 4h3v16h-3zM17 5l3 .5L17 21l-3-.5z"/></svg>,
  comp: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><path d="M16 8l-2 6-6 2 2-6z"/></svg>,
  cal: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>,
  trend: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 17l6-6 4 4 8-8M14 7h7v7"/></svg>,
  list: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>,
  heart: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20.8 6.6a5 5 0 0 0-7-.6L12 7.4l-1.8-1.4a5 5 0 1 0-6.4 7.6L12 21l8.2-7.4a5 5 0 0 0 .6-7z"/></svg>,
  star: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3l2.9 6 6.6 1-4.8 4.6 1.1 6.5L12 18l-5.8 3 1.1-6.5L2.5 10l6.6-1z"/></svg>,
  note: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 4h12l4 4v12H4zM14 4v6h6"/></svg>,
  bar: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 20V10M10 20V4M16 20v-6M22 20H2"/></svg>,
  ai: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z"/></svg>,
  act: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>,
  gear: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>,
  search: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>,
  plus: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>,
  cloud: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M17.5 19a4.5 4.5 0 0 0 0-9 6.5 6.5 0 0 0-12.4 3A4 4 0 0 0 6 19z"/></svg>,
  check: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M20 6L9 17l-5-5"/></svg>,
};

/* Subgroup motif SVGs */
const Motifs = {
  // Doğu
  katana: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 4L4 20M4 20l-2 2 4-2zM20 4l1-1M16 8l4 4"/></svg>,
  yinyang: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 3a4.5 4.5 0 0 0 0 9 4.5 4.5 0 0 1 0 9" fill="currentColor"/><circle cx="12" cy="7.5" r="1" fill="currentColor"/><circle cx="12" cy="16.5" r="1" stroke="none" fill="currentColor"/></svg>,
  scroll: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM9 8h6M9 12h6M9 16h4"/></svg>,
  // Kadraj
  lens: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 4l2 4M12 20l-2-4M4 12l4-2M20 12l-4 2"/></svg>,
  clapper: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="9" width="18" height="11" rx="1"/><path d="M3 9l3-4 4 1-3 3zM10 9l-3 4M14 6l-3 4M18 6l-3 4"/></svg>,
  doc: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>,
  // Arşiv
  book: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4h7a3 3 0 0 1 3 3v14a2 2 0 0 0-2-2H4zM20 4h-7a3 3 0 0 0-3 3v14a2 2 0 0 1 2-2h8z"/></svg>,
  feather: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 4S12 4 8 8s-4 12-4 12 8 0 12-4 4-12 4-12zM4 20l8-8M14 6l-4 4"/></svg>,
  seal: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="7"/><path d="M12 7l1.5 3.5L17 11l-2.5 2.5L15 17l-3-2-3 2 .5-3.5L7 11l3.5-.5z"/></svg>,
};

/* World configurations */
const WORLDS = {
  east: {
    name: "Doğu", kanji: "東方", glyph: "東",
    eyebrow: "DOĞU YOLU · 東方",
    title: "Doğu",
    sub: "Anime, manga ve novel koleksiyonun tek başlık altında.",
    subgroups: [
      { id: "anime", title: "Anime", sub: "Anime · Film · OVA · ONA", count: "24", motif: Motifs.katana, active: true },
      { id: "manga", title: "Manga", sub: "Manga · Manhwa · Manhua", count: "12", motif: Motifs.yinyang },
      { id: "novel", title: "Novel", sub: "Light · Web · Visual Novel", count: "4", motif: Motifs.scroll },
    ],
    cards: [
      { title: "Delicious in Dungeon", type: "ANIME", meta: "24 bölüm · TV", pct: 33, p: "8 / 24", watching: true },
      { title: "Tales of Demons and Gods", type: "MANHUA", meta: "?? bölüm · MANHUA", pct: 88, p: "220 / 250", watching: true },
      { title: "Your lie in April", type: "ANIME", meta: "22 bölüm · TV", pct: 14, p: "3 / 22", watching: true },
      { title: "Witch Hat Atelier", type: "MANGA", meta: "13 cilt · ONA", pct: 8, p: "1 / 13", watching: true },
    ],
    series: {
      badge: "SERİ", title: "Frieren: Beyond Journey's End",
      meta: ["2 parça", "1 tamamlandı", "Drama · Adventure"], pct: 74,
      children: [
        { label: "Sezon 1", meta: "28 bölüm", pct: 100, state: "done" },
        { label: "Sezon 2", meta: "10 bölüm", pct: 50, state: "watching" },
        { label: "OVA", meta: "1 bölüm", pct: 0, state: "planned" },
        { label: "Recap", meta: "2 bölüm", pct: 0, state: "planned" },
        { label: "+ Ekle", meta: "yeni parça", pct: 0, state: "add" },
      ],
    },
  },
  screen: {
    name: "Kadraj", kanji: "幕", glyph: "幕",
    eyebrow: "KADRAJ · ÇERÇEVEDE OLAN",
    title: "Kadraj",
    sub: "Film, dizi ve belgesel koleksiyonun mercek altında.",
    subgroups: [
      { id: "film", title: "Film", sub: "Sinema · Kısa Film", count: "18", motif: Motifs.lens, active: true },
      { id: "dizi", title: "Dizi", sub: "TV · Mini Dizi", count: "9", motif: Motifs.clapper },
      { id: "doc", title: "Belgesel", sub: "Doc · Docuseries", count: "3", motif: Motifs.doc },
    ],
    cards: [
      { title: "Interstellar", type: "FİLM", meta: "169 dk · 2014", pct: 100, p: "1 / 1", watching: true },
      { title: "Game of Thrones — S2", type: "DİZİ", meta: "10 bölüm · HBO", pct: 40, p: "4 / 10", watching: true },
      { title: "Perfect Days", type: "FİLM", meta: "124 dk · 2023", pct: 0, p: "0 / 1" },
      { title: "Chef's Table", type: "BELGESEL", meta: "6 bölüm · S1", pct: 50, p: "3 / 6", watching: true },
    ],
    series: {
      badge: "SERİ", title: "Game of Thrones",
      meta: ["4 sezon", "1 tamamlandı", "Drama · Fantasy"], pct: 35,
      children: [
        { label: "Sezon 1", meta: "10 bölüm", pct: 100, state: "done" },
        { label: "Sezon 2", meta: "10 bölüm", pct: 40, state: "watching" },
        { label: "Sezon 3", meta: "10 bölüm", pct: 0, state: "planned" },
        { label: "Sezon 4", meta: "10 bölüm", pct: 0, state: "planned" },
        { label: "+ Sezon", meta: "yeni sezon", pct: 0, state: "add" },
      ],
    },
  },
  arch: {
    name: "Arşiv", kanji: "書", glyph: "Æ",
    eyebrow: "KADİM ARŞİV · MÜHÜRLÜ KAYITLAR",
    title: "Arşiv",
    sub: "Kitap, roman ve klasiklerin mühürlü koleksiyonu.",
    subgroups: [
      { id: "book", title: "Kitap", sub: "Kurgu Dışı · Deneme", count: "14", motif: Motifs.book, active: true },
      { id: "novel", title: "Roman", sub: "Modern · Çağdaş", count: "8", motif: Motifs.feather },
      { id: "classics", title: "Klasikler", sub: "Klasik · Antik", count: "5", motif: Motifs.seal },
    ],
    cards: [
      { title: "Mistborn: The Final Empire", type: "ROMAN", meta: "672 sayfa", pct: 45, p: "302 / 672", watching: true },
      { title: "Meditations", type: "KLASİK", meta: "M.Ö. 180", pct: 20, p: "II / XII", watching: true },
      { title: "Sapiens", type: "KURGU DIŞI", meta: "443 sayfa", pct: 100, p: "443 / 443" },
      { title: "Dune", type: "ROMAN", meta: "688 sayfa", pct: 12, p: "82 / 688", watching: true },
    ],
    series: {
      badge: "KOLEKSİYON", title: "Stormlight Archive",
      meta: ["4 cilt", "1 tamamlandı", "Fantasy · Epic"], pct: 28,
      children: [
        { label: "Cilt I", meta: "The Way of Kings", pct: 100, state: "done" },
        { label: "Cilt II", meta: "Words of Radiance", pct: 60, state: "watching" },
        { label: "Cilt III", meta: "Oathbringer", pct: 0, state: "planned" },
        { label: "Cilt IV", meta: "Rhythm of War", pct: 0, state: "planned" },
        { label: "+ Cilt", meta: "yeni cilt", pct: 0, state: "add" },
      ],
    },
  },
};

const NAV = [
  { group: "GENEL", items: [
    { icon: Ic.home, label: "Dashboard" },
    { icon: Ic.lib, label: "Kütüphanem", active: true },
    { icon: Ic.comp, label: "Keşfet" },
    { icon: Ic.cal, label: "Takvim", ghost: true, badge: "Yakında" },
  ]},
  { group: "KİŞİSEL", items: [
    { icon: Ic.trend, label: "İlerlemem", ghost: true, badge: "Yakında" },
    { icon: Ic.list, label: "İzleme Listem", ghost: true, badge: "Yakında" },
    { icon: Ic.heart, label: "Favorilerim", ghost: true, badge: "Yakında" },
    { icon: Ic.star, label: "Puanlamalarım", ghost: true, badge: "Yakında" },
    { icon: Ic.note, label: "Notlarım", ghost: true, badge: "Yakında" },
    { icon: Ic.bar, label: "İstatistikler", ghost: true, badge: "Yakında" },
  ]},
  { group: "YARDIMCILAR", items: [
    { icon: Ic.ai, label: "AI Danışman", badge: "Beta" },
    { icon: Ic.act, label: "Aktivite" },
  ]},
];

/* ----- Cover art placeholder ----- */
function Cover({ title, hue }) {
  const initials = title.split(/\s+/).slice(0,2).map(w => w[0]).join("").toUpperCase();
  return (
    <div className="cover">
      <div className="cover-art" style={{
        background: `linear-gradient(135deg, hsl(${hue} 30% 24%), hsl(${(hue+30)%360} 24% 14%))`,
        color: `hsl(${hue} 40% 80%)`
      }}>{initials}</div>
    </div>
  );
}

/* ----- Sidebar ----- */
function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">M</div>
        <div>
          <div className="brand-name">MediaTracker</div>
          <div className="brand-sub">izle · oku · takip et</div>
        </div>
      </div>
      {NAV.map(g => (
        <div key={g.group}>
          <div className="nav-label">{g.group}</div>
          {g.items.map(it => (
            <button key={it.label} className="nav-item" data-active={!!it.active} data-ghost={!!it.ghost}>
              {it.icon}<span>{it.label}</span>
              {it.badge && <span className="nav-badge">{it.badge}</span>}
            </button>
          ))}
        </div>
      ))}
      <div style={{marginTop:"auto"}}>
        <div className="nav-label">SİSTEM</div>
        <button className="nav-item">{Ic.gear}<span>Ayarlar</span></button>
      </div>
    </aside>
  );
}

/* ----- Topbar ----- */
function Topbar() {
  return (
    <div className="topbar">
      <div className="crumbs">MediaTracker <span style={{opacity:0.4}}>›</span> <strong>Kütüphanem</strong></div>
      <div className="search">{Ic.search}<input placeholder="Kütüphanende ara..."/></div>
      <button className="btn"><span style={{color:"#5fc28a"}}>{Ic.cloud}</span>Cloud Hazır</button>
      <button className="btn" data-variant="primary">{Ic.plus}Medya Ekle</button>
    </div>
  );
}

/* ----- Hero ----- */
function Hero({ world, world_key }) {
  return (
    <div className="hero">
      {world_key === "arch" && <span className="wax-mark">Æ</span>}
      <div className="hero-row">
        <div className="hero-title-row">
          <span className="hero-glyph">{world.glyph}</span>
          <div>
            <div className="hero-eyebrow">{world.eyebrow}</div>
            <h1 className="hero-title">{world.title}</h1>
            <div className="hero-sub">{world.sub}</div>
          </div>
        </div>
        <div className="world-tabs">
          <button className="world-tab"><span className="dot" style={{background:"#9aa0ad"}}></span>Tümü</button>
          <button className="world-tab" data-active={world_key==="east"}><span className="dot" style={{background:"#e8b86a"}}></span>Doğu</button>
          <button className="world-tab" data-active={world_key==="screen"}><span className="dot" style={{background:"#6fb0e0"}}></span>Kadraj</button>
          <button className="world-tab" data-active={world_key==="arch"}><span className="dot" style={{background:"#b8956a"}}></span>Arşiv</button>
        </div>
      </div>
      <div className="subgroups">
        {world.subgroups.map(sg => (
          <button key={sg.id} className="subgroup" data-active={!!sg.active}>
            <div className="sg-motif">{sg.motif}</div>
            <div>
              <div className="sg-title">{sg.title}</div>
              <div className="sg-sub">{sg.sub}</div>
            </div>
            <div className="sg-count">{sg.count}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ----- MediaCard ----- */
function MediaCard({ card, hue }) {
  return (
    <div className="media-card" data-watching={!!card.watching}>
      <Cover title={card.title} hue={hue}/>
      <div className="card-body">
        <span className="type-chip">{card.type}</span>
        <h4 className="card-title">{card.title}</h4>
        <div className="card-meta">{card.meta}</div>
        <div className="card-progress">
          <div className="progress-track"><div className="progress-fill" style={{width: card.pct + "%"}}></div></div>
          <div className="progress-meta"><span>{card.p}</span><span>{card.pct}%</span></div>
        </div>
      </div>
    </div>
  );
}

/* ----- SeriesGroupCard ----- */
function SeriesGroup({ s, hue }) {
  return (
    <div className="series-group">
      <div className="sg-row">
        <div className="sg-mark">{Ic.lib}</div>
        <div>
          <div className="sg-title-row">
            <span className="sg-badge">{s.badge}</span>
            <h3 className="sg-title">{s.title}</h3>
          </div>
          <div className="sg-meta">
            {s.meta.map((m, i) => <span key={i}>{m}{i < s.meta.length-1 && <span className="sep"> · </span>}</span>)}
          </div>
        </div>
        <div className="sg-stats">
          <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--w-primary)"}}>{s.pct}%</div>
          <div className="sg-progress progress-track"><div className="progress-fill" style={{width: s.pct+"%"}}></div></div>
        </div>
      </div>
      <div className="sg-children">
        {s.children.map((c, i) => (
          <div key={i} className="sg-child" data-state={c.state}>
            {c.state !== "add" ? (
              <>
                <div className="sg-child-cover" style={{background: `linear-gradient(135deg, hsl(${(hue+i*20)%360} 30% 22%), hsl(${(hue+i*20+30)%360} 24% 12%))`}}></div>
                <div className="sg-child-label"><span>{c.label}</span>{c.state==="done" && <span style={{color:"#5fc28a"}}>{Ic.check}</span>}</div>
                <div className="sg-child-meta"><span>{c.meta}</span><span>{c.pct}%</span></div>
                <div className="sg-progress-mini"><div className="progress-fill" style={{width:c.pct+"%", height:"100%"}}></div></div>
              </>
            ) : (
              <>
                <div className="sg-child-cover" style={{background:"transparent", border:"1px dashed var(--line-2)", display:"grid", placeItems:"center", color:"var(--fg-3)"}}>{Ic.plus}</div>
                <div className="sg-child-label" style={{color:"var(--fg-2)"}}>{c.label}</div>
                <div className="sg-child-meta">{c.meta}</div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----- RightRail ----- */
function RightRail({ world_key }) {
  const upcoming = world_key === "east"
    ? [{t:"Frieren S2", m:"3. Bölüm", w:"Bugün"}, {t:"Solo Leveling", m:"6. Bölüm", w:"2g"}, {t:"Jujutsu Kaisen", m:"S2 · 8", w:"4g"}]
    : world_key === "screen"
    ? [{t:"Severance", m:"S2 · 5", w:"Bugün"}, {t:"True Detective", m:"S4 · 6", w:"3g"}, {t:"Blue Eye Samurai", m:"S2 · 1", w:"7g"}]
    : [{t:"Stormlight V", m:"Yayın", w:"Aralık"}, {t:"Mistborn 7", m:"Ön sipariş", w:"Şub"}, {t:"Dune Prophecy", m:"Kitap", w:"Mar"}];

  return (
    <aside className="rail">
      <div style={{fontSize:10, fontWeight:700, letterSpacing:"0.14em", color:"var(--fg-3)", padding:"4px 4px 0"}}>BAKIŞ</div>
      <div className="widget">
        <div className="widget-title">Genel İlerleme<span style={{marginLeft:"auto", fontFamily:"var(--font-mono)", fontSize:9, color:"var(--fg-3)"}}>KÜTÜPHANE</span></div>
        <div className="ring-row">
          <div className="ring">
            <svg viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.5" stroke="var(--bg-3)" strokeWidth="3" fill="none"/>
              <circle cx="18" cy="18" r="15.5" stroke="var(--w-primary)" strokeWidth="3" fill="none"
                strokeDasharray={`${48 * 0.97} 100`} strokeLinecap="round"
                style={{filter:"drop-shadow(0 0 4px var(--w-glow))"}}/>
            </svg>
            <div className="ring-pct">48%</div>
          </div>
          <div style={{flex:1, display:"flex", flexDirection:"column", gap:5}}>
            <div className="stat-line"><span>Toplam</span><strong>54</strong></div>
            <div className="stat-line"><span>Tamamlanan</span><strong>26</strong></div>
            <div className="stat-line"><span>Devam Eden</span><strong>6</strong></div>
            <div className="stat-line"><span>Planlanan</span><strong>20</strong></div>
          </div>
        </div>
      </div>

      <div className="widget">
        <div className="widget-title">Günlük Hedef<span style={{marginLeft:"auto", fontFamily:"var(--font-mono)", fontSize:9, color:"var(--fg-3)"}}>7 GÜN</span></div>
        <div style={{fontSize:11, color:"var(--fg-2)", marginBottom:8}}>Hedef sistemi yakında <span style={{color:"var(--w-primary)", float:"right", fontFamily:"var(--font-mono)"}}>86 aktivite</span></div>
        <div style={{display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:3}}>
          {["SAL","ÇRŞ","PER","CUM","CMT","PZR","PZT"].map((d, i) => (
            <div key={d}>
              <div style={{height:32, background:"var(--bg-3)", borderRadius:3, position:"relative", overflow:"hidden"}}>
                <div style={{position:"absolute", bottom:0, left:0, right:0, height:`${[40,60,30,80,55,72,90][i]}%`, background:"var(--w-primary)", opacity:0.7}}></div>
              </div>
              <div style={{fontFamily:"var(--font-mono)", fontSize:8, color:"var(--fg-3)", textAlign:"center", marginTop:3}}>{d}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="widget">
        <div className="widget-title">Yaklaşan Bölümler<span style={{marginLeft:"auto", fontFamily:"var(--font-mono)", fontSize:9, color:"var(--fg-3)"}}>YAKINDA</span></div>
        {upcoming.map((u, i) => (
          <div key={i} className="upcoming-item">
            <div className="upcoming-cover" style={{background:`linear-gradient(135deg, hsl(${(i*60)%360} 30% 24%), hsl(${(i*60+30)%360} 24% 14%))`}}></div>
            <div>
              <div className="upcoming-title">{u.t}</div>
              <div className="upcoming-meta">{u.m}</div>
            </div>
            <div className="upcoming-when">{u.w}</div>
          </div>
        ))}
      </div>

      <div className="empty">
        <span className="empty-glyph">{world_key === "east" ? "道" : world_key === "screen" ? "◉" : "✦"}</span>
        <div>{world_key === "east" ? "Yolu uzun, kılıç keskindir." : world_key === "screen" ? "Perde açıldığında her şey başlar." : "Mühür kırıldığında bilgelik akar."}</div>
      </div>
    </aside>
  );
}

/* ----- Shell ----- */
function Shell({ world_key }) {
  const world = WORLDS[world_key];
  const hues = { east: 30, screen: 210, arch: 30 };
  const hue = hues[world_key];
  return (
    <div className="shell" data-world={world_key} key={world_key}>
      <Sidebar/>
      <main className="main">
        <Topbar/>
        <div className="page">
          <Hero world={world} world_key={world_key}/>

          <div className="section">
            <div className="section-head">
              <span className="section-tick"></span>
              <h2 className="section-title">Devam Ettiklerim</h2>
              <span className="section-count">{world.cards.filter(c => c.watching).length} aktif</span>
              <button className="section-link">Son aktiviteye göre ↓</button>
            </div>
            <div className="media-grid">
              {world.cards.map((c, i) => <MediaCard key={i} card={c} hue={(hue + i*15) % 360}/>)}
            </div>
          </div>

          <div className="section">
            <div className="section-head">
              <span className="section-tick"></span>
              <h2 className="section-title">Seri Koleksiyonlarım</h2>
              <span className="section-count">1 görüntüleniyor</span>
              <button className="section-link">Tümünü Gör →</button>
            </div>
            <SeriesGroup s={world.series} hue={hue}/>
          </div>
        </div>
      </main>
      <RightRail world_key={world_key}/>
    </div>
  );
}

/* ----- Mount ----- */
["east", "screen", "arch"].forEach(k => {
  const root = document.getElementById("shell-" + k);
  if (root) ReactDOM.createRoot(root).render(<Shell world_key={k}/>);
});
