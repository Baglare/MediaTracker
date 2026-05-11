/* ============================================================
   MediaTracker — Library page sections
   ============================================================ */

const { Icons, Cover, TYPE_LABELS } = window;

/* ------------------------------------------------------------ */
/* Hero — Tema + alt tema seçimi                                  */
/* ------------------------------------------------------------ */

const THEMES = [
  { id: "all",     label: "Tümü",      icon: "Globe",   color: "var(--theme-all)" },
  { id: "east",    label: "Doğu",      icon: "Sword",   color: "var(--theme-east)" },
  { id: "screen",  label: "Ekran",     icon: "Tv",      color: "var(--theme-screen)" },
  { id: "library", label: "Kütüphane", icon: "Book",    color: "var(--theme-library)" },
];

const SUBTHEMES = {
  east: [
    { id: "anime",   title: "Anime",  sub: "TV · Film · OVA",       icon: "Sparkle", count: "124" },
    { id: "manga",   title: "Manga",  sub: "Manhwa · Manhua",        icon: "Stack",   count: "98" },
    { id: "novel",   title: "Novel",  sub: "Light · Web · Roman",    icon: "Book",    count: "23" },
  ],
  screen: [
    { id: "tv",      title: "Dizi",    sub: "TVMaze entegre",        icon: "Tv",      count: "31" },
    { id: "movie",   title: "Film",    sub: "TMDB hazır",            icon: "Film",    count: "47" },
    { id: "docu",    title: "Belgesel", sub: "Sezonluk kaynaklar",   icon: "Activity", count: "—", ghost: true },
  ],
  library: [
    { id: "book",    title: "Kitap",     sub: "Open Library",        icon: "Book",    count: "18" },
    { id: "novel",   title: "Roman",     sub: "Edebi eserler",       icon: "Bookmark", count: "9" },
    { id: "audio",   title: "Sesli Kitap", sub: "Yakında",          icon: "Activity", count: "—", ghost: true },
  ],
  all: [
    { id: "all",     title: "Hepsi",     sub: "Tüm medya türleri",   icon: "Globe",   count: "285" },
    { id: "ongoing", title: "Devam Eden", sub: "Aktif takip",        icon: "Play",    count: "32" },
    { id: "fav",     title: "Favori",    sub: "Yıldızladıkların",    icon: "Heart",   count: "47" },
  ],
};

const HeroBar = ({ theme, setTheme, subtheme, setSubtheme }) => {
  const subs = SUBTHEMES[theme] || SUBTHEMES.east;
  const headlines = {
    all:     { eyebrow: "TÜM KOLEKSİYON",  kanji: "全",  title: "Tüm Kütüphanen",     sub: "Bütün medya tek bir görünümde." },
    east:    { eyebrow: "DOĞU YOLU",       kanji: "東",  title: "Doğu Koleksiyonu",   sub: "Anime, manga, manhwa ve novel’lerin." },
    screen:  { eyebrow: "EKRAN ARŞİVİ",    kanji: "幕",  title: "Ekran Koleksiyonu",  sub: "Diziler, filmler ve belgeseller." },
    library: { eyebrow: "KÜTÜPHANE",       kanji: "書",  title: "Kitap Koleksiyonu",  sub: "Kitap, roman ve uzun okuma." },
  };
  const h = headlines[theme] || headlines.east;

  return (
    <div className="hero" data-theme={theme}>
      <div className="hero-header">
        <div className="hero-title-row">
          <span className="hero-kanji">{h.kanji}</span>
          <div>
            <div className="hero-eyebrow">{h.eyebrow}</div>
            <h2 className="hero-title">{h.title}</h2>
            <div className="hero-sub">{h.sub}</div>
          </div>
        </div>

        <div className="theme-tabs">
          {THEMES.map(t => {
            const Ico = Icons[t.icon];
            return (
              <button
                key={t.id}
                className="theme-tab"
                data-active={theme === t.id ? "true" : undefined}
                onClick={() => { setTheme(t.id); setSubtheme(null); }}
              >
                <span className="dot" style={{ background: t.color }} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="hero-content">
        {subs.map((s, i) => {
          const Ico = Icons[s.icon];
          const active = subtheme ? subtheme === s.id : i === 0;
          return (
            <button
              key={s.id}
              className="subtheme"
              data-active={active ? "true" : undefined}
              onClick={() => !s.ghost && setSubtheme(s.id)}
              disabled={s.ghost}
              style={s.ghost ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
            >
              <span className="subtheme-icon"><Ico size={18} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="subtheme-title">{s.title}</div>
                <div className="subtheme-sub">{s.sub}</div>
              </div>
              <span className="subtheme-count">{s.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------ */
/* Section header                                                 */
/* ------------------------------------------------------------ */

const SectionHead = ({ title, count, children }) => (
  <div className="section-header">
    <span className="section-tick" />
    <h3 className="section-title">{title}</h3>
    {count != null && <span className="section-count">{count}</span>}
    <div className="section-actions">{children}</div>
  </div>
);

/* ------------------------------------------------------------ */
/* Devam Ettiklerim                                               */
/* ------------------------------------------------------------ */

const ContinueCard = ({ item }) => (
  <div className="continue-card">
    <div className="cover">
      <Cover type={item.type} label={item.cover} size="small" />
      <span className="cover-badge">{TYPE_LABELS[item.type]}</span>
      {item.favorite && (
        <span className="cover-fav"><Icons.Star size={11} fill="currentColor" /></span>
      )}
    </div>
    <div className="continue-body">
      <div className="media-type-row">
        <span className="status-pill" data-status={item.status}>İzleniyor</span>
      </div>
      <h4 className="media-title">{item.title}</h4>
      <div className="media-meta">
        <span>{item.subtype}</span>
        <span className="sep">·</span>
        <span>{item.total} bölüm</span>
      </div>

      <div className="progress">
        <div className="progress-meta">
          <span>{item.nextLabel}</span>
          <span>{item.pct}%</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${item.pct}%` }} />
        </div>
      </div>

      <div className="continue-actions">
        <button className="tiny-btn" data-variant="primary">
          <Icons.Play size={10} /> Devam Et
        </button>
        <button className="tiny-btn"><Icons.Plus size={10} /> +1</button>
        <button className="tiny-btn" style={{ marginLeft: "auto" }}><Icons.More size={12} /></button>
      </div>
    </div>
  </div>
);

const ContinueSection = () => (
  <div className="section">
    <SectionHead title="Devam Ettiklerim" count="4 aktif">
      <button className="section-link">Tümünü gör <Icons.ChevronRight size={12} /></button>
    </SectionHead>
    <div className="continue-grid">
      {window.CONTINUE_ITEMS.map(item => <ContinueCard key={item.id} item={item} />)}
    </div>
  </div>
);

/* ------------------------------------------------------------ */
/* Series Group Card                                              */
/* ------------------------------------------------------------ */

const SeriesGroupCard = ({ group }) => {
  const stateIcon = (state) => {
    if (state === "completed") return <Icons.Check size={10} />;
    if (state === "watching") return <Icons.Play size={10} />;
    return <Icons.Clock size={10} />;
  };
  return (
    <div className="series-group">
      <div className="sg-header">
        <div className="sg-mark">
          <Icons.Stack size={28} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="sg-title-row">
            <span className="sg-badge"><Icons.Stack size={10} /> {group.badge}</span>
            <h3 className="sg-title">{group.title}</h3>
          </div>
          <div className="sg-meta">
            <span>{group.seasons} sezon</span>
            <span className="sep">·</span>
            <span>{group.totalEp} bölüm</span>
            <span className="sep">·</span>
            <span><strong style={{ color: "var(--status-completed)" }}>{group.completed}</strong> tamamlandı</span>
          </div>
          <div className="sg-tags">
            {group.tags.map(t => <span key={t} className="chip">{t}</span>)}
          </div>
        </div>
        <div className="sg-stats">
          <div className="sg-progress">
            <div className="progress-meta">
              <span>İlerleme</span>
              <span><strong>{group.pct}%</strong></span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" data-tone="gold" style={{ width: `${group.pct}%` }} />
            </div>
          </div>
          <button className="tiny-btn" data-variant="primary">
            <Icons.Plus size={11} /> Sezon Ekle
          </button>
        </div>
      </div>

      <div className="sg-children">
        {group.children.map((c, i) => (
          <div key={i} className="sg-child" data-state={c.state}>
            <div className="sg-child-cover">
              <Cover type={group.type} label={`S${i+1}`} size="tiny" />
              <span className="sg-child-state" data-state={c.state}>{stateIcon(c.state)}</span>
            </div>
            <div className="sg-child-label">
              {c.label}
              {c.current && <span style={{ fontSize: 9, color: "var(--status-watching)", fontFamily: "var(--font-mono)" }}>● ŞİMDİ</span>}
            </div>
            <div className="sg-child-meta">
              <span>{c.ep}/{c.total}</span>
              <span>{c.pct}%</span>
            </div>
            <div className="sg-child-progress">
              <div className="progress-fill" data-tone={c.state === "completed" ? "green" : c.state === "watching" ? undefined : "blue"} style={{ width: `${c.pct}%`, height: "100%" }} />
            </div>
          </div>
        ))}
        <button className="sg-add-child">
          <Icons.Plus size={16} />
          <span>Sezon / Parça Ekle</span>
          <span style={{ fontSize: 9, color: "var(--fg-4)" }}>TVMaze · Manuel</span>
        </button>
      </div>
    </div>
  );
};

const CollectionsSection = () => (
  <div className="section">
    <SectionHead title="Seri Koleksiyonlarım" count="12 koleksiyon">
      <button className="btn" data-variant="ghost" style={{ padding: "5px 8px", fontSize: 12 }}>
        <Icons.Filter size={12} /> Grup Düzenle
      </button>
      <div className="seg">
        <button data-active="true"><Icons.ChevronLeft size={12} /></button>
        <button><Icons.ChevronRight size={12} /></button>
      </div>
    </SectionHead>
    <SeriesGroupCard group={window.SERIES_GROUP} />
  </div>
);

/* ------------------------------------------------------------ */
/* Library Grid                                                   */
/* ------------------------------------------------------------ */

const MEDIA_FILTERS = [
  { id: "all",    label: "Hepsi", icon: "Globe" },
  { id: "anime",  label: "Anime", icon: "Sparkle" },
  { id: "manga",  label: "Manga", icon: "Stack" },
  { id: "manhwa", label: "Manhwa", icon: "Stack" },
  { id: "movie",  label: "Film",  icon: "Film" },
  { id: "tv",     label: "Dizi",  icon: "Tv" },
  { id: "book",   label: "Kitap", icon: "Book" },
  { id: "novel",  label: "Novel", icon: "Bookmark" },
];

const STATUS_FILTERS = [
  { id: "all",       label: "Tümü" },
  { id: "watching",  label: "Devam" },
  { id: "planned",   label: "Planlandı" },
  { id: "completed", label: "Tamamlandı" },
  { id: "paused",    label: "Duraklatıldı" },
  { id: "dropped",   label: "Bırakıldı" },
];

const MediaCard = ({ item }) => (
  <div className="media-card">
    <div className="cover">
      <Cover type={item.type} label={item.cover} size="normal" />
      {item.rating && (
        <span className="rating-badge">
          <Icons.Star size={9} fill="currentColor" /> {item.rating}
        </span>
      )}
      {item.fav && !item.rating && (
        <span className="rating-badge"><Icons.Heart size={9} fill="currentColor" /></span>
      )}
      <div className="cover-status">
        <span className="status-pill" data-status={item.status}>
          {item.status === "watching" ? "İzleniyor" :
           item.status === "completed" ? "Tamam" :
           item.status === "planned" ? "Planlı" :
           item.status === "paused" ? "Duraklı" : "Bırakıldı"}
        </span>
      </div>
    </div>
    <div className="media-card-body">
      <div className="media-card-title">{item.title}</div>
      <div className="media-card-meta">
        <span className="type-chip">{TYPE_LABELS[item.type]}</span>
        <span>· {item.total} {item.type === "movie" ? "" : "bölüm"}</span>
      </div>
      <div className="media-card-progress">
        <div className="progress-fill" data-tone={item.status === "completed" ? "green" : item.status === "planned" ? "blue" : undefined} style={{ width: `${item.pct}%`, height: "100%" }} />
      </div>
    </div>
  </div>
);

const LibrarySection = ({ mediaFilter, setMediaFilter, statusFilter, setStatusFilter, sort, setSort, view, setView }) => {
  const filtered = window.LIBRARY.filter(i =>
    (mediaFilter === "all" || i.type === mediaFilter) &&
    (statusFilter === "all" || i.status === statusFilter)
  );
  return (
    <div className="section">
      <SectionHead title="Kütüphanem" count={`${filtered.length} içerik`}>
        <div className="seg">
          <button onClick={() => setSort("recent")} data-active={sort === "recent" ? "true" : undefined}>Son Eklenen</button>
          <button onClick={() => setSort("rating")} data-active={sort === "rating" ? "true" : undefined}>Puana Göre</button>
          <button onClick={() => setSort("progress")} data-active={sort === "progress" ? "true" : undefined}>İlerleme</button>
        </div>
        <div className="seg">
          <button onClick={() => setView("grid")} data-active={view === "grid" ? "true" : undefined}><Icons.Grid size={12} /></button>
          <button onClick={() => setView("rows")} data-active={view === "rows" ? "true" : undefined}><Icons.Rows size={12} /></button>
        </div>
      </SectionHead>

      <div className="lib-controls">
        <div className="lib-filters">
          {MEDIA_FILTERS.map(f => {
            const Ico = Icons[f.icon];
            return (
              <button
                key={f.id}
                className="lib-filter"
                data-active={mediaFilter === f.id ? "true" : undefined}
                onClick={() => setMediaFilter(f.id)}
              >
                <Ico size={12} /> {f.label}
              </button>
            );
          })}
        </div>
        <div className="spacer" />
        <div className="lib-filters">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.id}
              className="lib-filter"
              data-active={statusFilter === f.id ? "true" : undefined}
              onClick={() => setStatusFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="lib-grid">
        {filtered.map(item => <MediaCard key={item.id} item={item} />)}
      </div>
    </div>
  );
};

window.HeroBar = HeroBar;
window.ContinueSection = ContinueSection;
window.CollectionsSection = CollectionsSection;
window.LibrarySection = LibrarySection;
window.SectionHead = SectionHead;
