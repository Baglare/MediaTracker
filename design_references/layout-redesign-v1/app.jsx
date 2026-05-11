/* ============================================================
   MediaTracker — Main App
   ============================================================ */

const { useState } = React;
const {
  Sidebar, HeroBar, ContinueSection, CollectionsSection,
  LibrarySection, RightRail, Icons,
  TweaksPanel, useTweaks, TweakSection, TweakRadio, TweakColor, TweakToggle, TweakSelect,
} = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#e8b86a",
  "density": "comfy",
  "rail": "full",
  "covers": "tinted",
  "kanji": true
}/*EDITMODE-END*/;

const ACCENT_OPTIONS = [
  "#e8b86a", // warm gold (default)
  "#c79afc", // lilac
  "#8ec98a", // sage
  "#6fb0e0", // sky
];

const App = () => {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [theme, setTheme] = useState("east");
  const [subtheme, setSubtheme] = useState("anime");
  const [mediaFilter, setMediaFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const [view, setView] = useState("grid");

  // Apply accent
  React.useEffect(() => {
    document.documentElement.style.setProperty("--accent", tweaks.accent);
    // derive accent-strong / soft / line
    document.documentElement.style.setProperty("--accent-soft", `${tweaks.accent}22`);
    document.documentElement.style.setProperty("--accent-line", `${tweaks.accent}55`);
  }, [tweaks.accent]);

  const appStyle = {
    gridTemplateColumns: tweaks.rail === "full" ? "248px 1fr 320px" : "248px 1fr",
  };

  return (
    <div className="app" data-density={tweaks.density} style={appStyle}>
      <Sidebar />

      <main className="main" data-screen-label="Kütüphanem">
        <header className="topbar">
          <div className="crumbs">
            <span>MediaTracker</span>
            <Icons.ChevronRight size={12} className="sep" />
            <strong>Kütüphanem</strong>
          </div>

          <div className="search">
            <Icons.Search size={14} />
            <input placeholder="Kütüphane, kaynak ve serilerde ara…" />
            <kbd>⌘K</kbd>
          </div>

          <button className="icon-btn" title="Bildirimler">
            <Icons.Bell size={16} />
            <span className="dot" />
          </button>
          <button className="btn" data-variant="primary">
            <Icons.Plus size={14} /> Medya Ekle
          </button>
        </header>

        <div className="page">
          <HeroBar theme={theme} setTheme={setTheme} subtheme={subtheme} setSubtheme={setSubtheme} />
          <ContinueSection />
          <CollectionsSection />
          <LibrarySection
            mediaFilter={mediaFilter} setMediaFilter={setMediaFilter}
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            sort={sort} setSort={setSort}
            view={view} setView={setView}
          />
          <ComponentBreakdown />
        </div>
      </main>

      {tweaks.rail === "full" && <RightRail />}

      <TweaksPanel title="Tweaks">
        <TweakSection title="Aksan rengi" subtitle="Tema yıldız rengi">
          <TweakColor
            label="Aksan"
            value={tweaks.accent}
            options={ACCENT_OPTIONS}
            onChange={v => setTweak("accent", v)}
          />
        </TweakSection>
        <TweakSection title="Yoğunluk">
          <TweakRadio
            label="Yoğunluk"
            value={tweaks.density}
            options={[{ label: "Yoğun", value: "compact" }, { label: "Rahat", value: "comfy" }]}
            onChange={v => setTweak("density", v)}
          />
        </TweakSection>
        <TweakSection title="Sağ panel">
          <TweakRadio
            label="Görünüm"
            value={tweaks.rail}
            options={[{ label: "Açık", value: "full" }, { label: "Kapalı", value: "off" }]}
            onChange={v => setTweak("rail", v)}
          />
        </TweakSection>
        <TweakSection title="Hero kanji" subtitle="Kanji süslemesi">
          <TweakToggle
            label="Kanji glifini göster"
            value={tweaks.kanji}
            onChange={v => setTweak("kanji", v)}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
};

/* ============================================================
   Component Breakdown — implementation notes
   ============================================================ */

const ComponentBreakdown = () => (
  <div className="section" style={{ marginTop: 12 }}>
    <SectionHead title="Implementasyon Notları" count="Yeniden kullanım · Yeni iş · Fazlar" />

    <div className="breakdown">
      <div className="bd-col" data-tone="reuse">
        <h4>Mevcut mantığı koruyan</h4>
        <ul>
          <li>MediaCard içeriği (cover, başlık, tür, durum, ilerleme, puan, favori)</li>
          <li>SeriesGroupCard veri modeli & “Sezon Ekle / Parça Ekle” akışı</li>
          <li>Tema / kategori filtresi: Tümü · Doğu · Ekran · Kütüphane</li>
          <li>Durum filtresi: Devam · Planlandı · Tamamlandı · Duraklatıldı · Bırakıldı</li>
          <li>Quick Search / Global Search (⌘K) — mevcut indeksleyici</li>
          <li>TVMaze sezon, AniList relation, Open Library, TMDB bağlayıcıları</li>
          <li>Aktivite günlüğü, manuel grup düzenleme, notlar/etiketler</li>
          <li>AI Danışman: kütüphane profili, son aktivite, AI ayarları</li>
          <li>Cloud Sync durumu, hesap, yerel/cloud veri farkı</li>
        </ul>
      </div>

      <div className="bd-col" data-tone="new">
        <h4>Yeni layout işleri</h4>
        <ul>
          <li>App shell: sol sidebar + topbar + main + sağ rail (CSS grid)</li>
          <li>Kütüphanem hero: tema sekmeleri + alt-tema kartları</li>
          <li>Curated section sistemi: Devam · Koleksiyonlar · Kütüphanem</li>
          <li>Yeni MediaCard (kompakt + cover-overlay durum pill)</li>
          <li>Genişletilmiş SeriesGroupCard (header + sezon grid + Add)</li>
          <li>Right rail widget framework (Ring, Goal, Upcoming, Activity)</li>
          <li>Ghost / “Yakında” nav state — Takvim, İstatistikler, Belgesel</li>
          <li>XP / Seviye kartı — “Doğu Yolcusu” konsept sistemi</li>
          <li>AI önerilen-devam widget’ı (kütüphane profili → öneri)</li>
        </ul>
      </div>

      <div className="bd-col" data-tone="phase">
        <h4>Faz planı</h4>
        <ul>
          <li><span className="phase-pill">F1</span>App shell + sidebar nav routing</li>
          <li><span className="phase-pill">F1</span>Topbar + ⌘K Global Search bağlantısı</li>
          <li><span className="phase-pill">F2</span>Kütüphanem hero + tema/alt-tema sistemi</li>
          <li><span className="phase-pill">F2</span>Devam Ettiklerim → mevcut “İzleniyor” query</li>
          <li><span className="phase-pill">F2</span>SeriesGroupCard yeni grid layout</li>
          <li><span className="phase-pill">F3</span>MediaCard refactor + filter/sort/view kontrolleri</li>
          <li><span className="phase-pill">F3</span>Right rail: Genel İlerleme + Günlük Hedef</li>
          <li><span className="phase-pill">F4</span>Yaklaşan Bölümler (TVMaze + AniList airing)</li>
          <li><span className="phase-pill">F4</span>AI Önerilen Devam widget (mevcut AI Danışman pipe’ı)</li>
          <li><span className="phase-pill">F5</span>Takvim, İstatistikler, XP sistemi (ghost → live)</li>
          <li><span className="phase-pill">RWD</span>≥1440px tam shell · 1280px rail toggle · &lt;1024px sidebar collapse</li>
        </ul>
      </div>
    </div>
  </div>
);

const { SectionHead } = window;

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
