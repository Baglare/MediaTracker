// ============================================
// Manuel Grup Yönetimi Modalı — V1
// ============================================
// Otomatik gruplamanın yetmediği durumlarda kullanıcının bir item'ı
// yeni/mevcut bir gruba eklemesi, gruptan çıkarması veya bir grubun
// başlığını değiştirmesi için modal.
//
// Veri güvenliği: bu modal yalnızca series* alanlarını üretir; commit
// tarafı (app/page.tsx) currentProgress/status/userRating/favorite/tags/
// notes/personalNotes/external* alanlarına dokunmaz.

"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { X, Save, Layers, FolderPlus, FolderInput, FolderMinus, Pencil } from "lucide-react";
import { MediaItem, SeriesRelationType } from "@/lib/types";

const RELATION_LABELS: Record<SeriesRelationType, string> = {
  main: "Ana eser",
  season: "Sezon",
  movie: "Film",
  ova: "OVA",
  ona: "ONA",
  special: "Special",
  recap: "Recap",
  spin_off: "Spin-off",
  side_story: "Yan hikaye",
  adaptation: "Uyarlama",
  source_material: "Kaynak eser",
  sequel: "Devam",
  prequel: "Öncesi",
  other: "Diğer",
};

const RELATION_OPTIONS: SeriesRelationType[] = [
  "main",
  "season",
  "movie",
  "ova",
  "ona",
  "special",
  "recap",
  "spin_off",
  "side_story",
  "sequel",
  "prequel",
  "other",
];

export type ManualGroupAction =
  | {
      kind: "create";
      itemId: string;
      groupTitle: string;
      relationType?: SeriesRelationType;
      seasonNumber?: number;
      orderIndex?: number;
    }
  | {
      kind: "join";
      itemId: string;
      groupId: string;
      groupTitle: string;
      relationType?: SeriesRelationType;
      seasonNumber?: number;
      orderIndex?: number;
    }
  | {
      kind: "leave";
      itemId: string;
    }
  | {
      kind: "rename";
      groupId: string;
      newTitle: string;
    };

interface ManualGroupModalProps {
  isOpen: boolean;
  item: MediaItem | null;
  mediaList: MediaItem[];
  onSave: (action: ManualGroupAction) => void;
  onClose: () => void;
}

type Mode = "create" | "join" | "leave" | "rename";

interface GroupOption {
  id: string;
  title: string;
  count: number;
}

function buildGroupOptions(mediaList: MediaItem[]): GroupOption[] {
  const map = new Map<string, GroupOption>();
  for (const it of mediaList) {
    if (!it.seriesGroupId) continue;
    const existing = map.get(it.seriesGroupId);
    if (existing) {
      existing.count += 1;
      if (!existing.title && it.seriesGroupTitle) existing.title = it.seriesGroupTitle;
    } else {
      map.set(it.seriesGroupId, {
        id: it.seriesGroupId,
        title: it.seriesGroupTitle || it.title || it.seriesGroupId,
        count: 1,
      });
    }
  }
  // V1: tekil grupları da göster (1 üye → manuel olarak ikinciyi eklemek mantıklı).
  return Array.from(map.values()).sort((a, b) =>
    a.title.localeCompare(b.title, "tr")
  );
}

function generateManualGroupId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `manual-series:${Date.now().toString(36)}-${rand}`;
}

export default function ManualGroupModal({
  isOpen,
  item,
  mediaList,
  onSave,
  onClose,
}: ManualGroupModalProps) {
  const groupOptions = useMemo(() => buildGroupOptions(mediaList), [mediaList]);
  const inGroup = !!item?.seriesGroupId;
  const currentGroupId = item?.seriesGroupId;
  const currentGroupTitle = item?.seriesGroupTitle ?? "";

  // Mode default: gruptaysa "rename" (yaygın senaryo), değilse "create".
  const initialMode: Mode = inGroup ? "rename" : "create";
  const [mode, setMode] = useState<Mode>(initialMode);

  // Form state
  const [newGroupTitle, setNewGroupTitle] = useState<string>("");
  const [joinGroupId, setJoinGroupId] = useState<string>("");
  const [renameTitle, setRenameTitle] = useState<string>("");
  const [relationType, setRelationType] = useState<SeriesRelationType | "">(
    item?.seriesRelationType ?? ""
  );
  const [seasonNumber, setSeasonNumber] = useState<string>(
    typeof item?.seasonNumber === "number" ? String(item.seasonNumber) : ""
  );
  const [orderIndex, setOrderIndex] = useState<string>(
    typeof item?.orderIndex === "number" ? String(item.orderIndex) : ""
  );

  // Item değişince formu sıfırla (modal açılınca state taşımasın).
  const itemKey = isOpen && item ? item.id : null;
  const [resetKey, setResetKey] = useState<string | null>(null);
  if (resetKey !== itemKey) {
    setResetKey(itemKey);
    setMode(item?.seriesGroupId ? "rename" : "create");
    setNewGroupTitle(item?.title ?? "");
    setJoinGroupId("");
    setRenameTitle(item?.seriesGroupTitle ?? "");
    setRelationType(item?.seriesRelationType ?? "");
    setSeasonNumber(
      typeof item?.seasonNumber === "number" ? String(item.seasonNumber) : ""
    );
    setOrderIndex(
      typeof item?.orderIndex === "number" ? String(item.orderIndex) : ""
    );
  }

  if (!isOpen || !item) return null;

  const parsePositiveInt = (s: string): number | undefined => {
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const canSubmit = (() => {
    switch (mode) {
      case "create":
        return newGroupTitle.trim().length > 0;
      case "join":
        return joinGroupId.length > 0;
      case "leave":
        return inGroup;
      case "rename":
        return inGroup && renameTitle.trim().length > 0;
    }
  })();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !item) return;

    const sNum = parsePositiveInt(seasonNumber);
    const oIdx = parsePositiveInt(orderIndex);
    const rType = relationType === "" ? undefined : relationType;

    if (mode === "create") {
      onSave({
        kind: "create",
        itemId: item.id,
        groupTitle: newGroupTitle.trim(),
        relationType: rType,
        seasonNumber: sNum,
        orderIndex: oIdx,
      });
    } else if (mode === "join") {
      const opt = groupOptions.find((g) => g.id === joinGroupId);
      if (!opt) return;
      onSave({
        kind: "join",
        itemId: item.id,
        groupId: opt.id,
        groupTitle: opt.title,
        relationType: rType,
        seasonNumber: sNum,
        orderIndex: oIdx,
      });
    } else if (mode === "leave") {
      onSave({ kind: "leave", itemId: item.id });
    } else if (mode === "rename") {
      if (!currentGroupId) return;
      onSave({
        kind: "rename",
        groupId: currentGroupId,
        newTitle: renameTitle.trim(),
      });
    }
  }

  // Mod sekmesi başına aktif/edilebilir bilgisi
  const modeButtons: Array<{ value: Mode; label: string; icon: React.ReactNode; disabled?: boolean }> = [
    { value: "create", label: "Yeni grup", icon: <FolderPlus className="w-3.5 h-3.5" /> },
    {
      value: "join",
      label: "Gruba ekle",
      icon: <FolderInput className="w-3.5 h-3.5" />,
      disabled: groupOptions.length === 0,
    },
    {
      value: "rename",
      label: "Başlık değiştir",
      icon: <Pencil className="w-3.5 h-3.5" />,
      disabled: !inGroup,
    },
    {
      value: "leave",
      label: "Gruptan çıkar",
      icon: <FolderMinus className="w-3.5 h-3.5" />,
      disabled: !inGroup,
    },
  ];

  const inputCls =
    "w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40";
  const labelCls = "block text-xs font-medium text-zinc-400 mb-1.5";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-400" />
            Manuel Grup Yönetimi
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-5">
          {/* Item özeti */}
          <div className="flex gap-3 p-3 rounded-xl bg-zinc-800/30 border border-zinc-800/80">
            <div className="w-12 h-16 flex-shrink-0 bg-zinc-800 rounded-md overflow-hidden">
              <Image
                src={item.coverImage}
                alt={item.title}
                width={48}
                height={64}
                className="w-full h-full object-cover"
                unoptimized
              />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-zinc-100 truncate">{item.title}</h3>
              <p className="text-[11px] text-zinc-500 mt-0.5 capitalize">{item.type}</p>
              <p className="text-[11px] text-zinc-400 mt-1.5 truncate">
                <span className="text-zinc-500">Mevcut grup:</span>{" "}
                {inGroup ? (
                  <span className="text-violet-300 font-medium">{currentGroupTitle || currentGroupId}</span>
                ) : (
                  <span className="text-zinc-600 italic">yok</span>
                )}
              </p>
            </div>
          </div>

          {/* Mod sekmesi */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-950 rounded-xl border border-zinc-800">
            {modeButtons.map((m) => (
              <button
                key={m.value}
                type="button"
                disabled={m.disabled}
                onClick={() => setMode(m.value)}
                className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[11px] font-medium transition-colors ${
                  mode === m.value
                    ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40"
                    : m.disabled
                    ? "text-zinc-600 cursor-not-allowed"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>

          {/* Form alanları (moda göre) */}
          {mode === "create" && (
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Yeni grup başlığı *</label>
                <input
                  type="text"
                  value={newGroupTitle}
                  onChange={(e) => setNewGroupTitle(e.target.value)}
                  placeholder="Örn. Frieren"
                  className={inputCls}
                  required
                />
              </div>
              <SeriesFields
                relationType={relationType}
                setRelationType={setRelationType}
                seasonNumber={seasonNumber}
                setSeasonNumber={setSeasonNumber}
                orderIndex={orderIndex}
                setOrderIndex={setOrderIndex}
                inputCls={inputCls}
                labelCls={labelCls}
              />
            </div>
          )}

          {mode === "join" && (
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Mevcut grup *</label>
                {groupOptions.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic">Henüz hiç grup yok. Önce yeni bir grup oluştur.</p>
                ) : (
                  <select
                    value={joinGroupId}
                    onChange={(e) => setJoinGroupId(e.target.value)}
                    className={inputCls}
                    required
                  >
                    <option value="" disabled>
                      Grup seç…
                    </option>
                    {groupOptions.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title} ({g.count} parça)
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <SeriesFields
                relationType={relationType}
                setRelationType={setRelationType}
                seasonNumber={seasonNumber}
                setSeasonNumber={setSeasonNumber}
                orderIndex={orderIndex}
                setOrderIndex={setOrderIndex}
                inputCls={inputCls}
                labelCls={labelCls}
              />
            </div>
          )}

          {mode === "rename" && (
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Yeni grup başlığı *</label>
                <input
                  type="text"
                  value={renameTitle}
                  onChange={(e) => setRenameTitle(e.target.value)}
                  className={inputCls}
                  required
                />
                <p className="mt-1.5 text-[11px] text-zinc-500">
                  Bu başlık gruptaki tüm parçaların seriesGroupTitle alanına yazılır.
                </p>
              </div>
            </div>
          )}

          {mode === "leave" && (
            <div className="rounded-xl bg-zinc-800/30 border border-zinc-800/80 p-4">
              <p className="text-sm text-zinc-300">
                Bu item gruptan çıkarılacak. Item silinmez; yalnızca grup bilgisi temizlenir.
              </p>
              <p className="mt-2 text-[11px] text-zinc-500">
                İlerleme, durum, puan, favori, etiket ve notlar etkilenmez.
              </p>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-zinc-800 flex justify-end gap-3 bg-zinc-900/50">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            İptal
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-6 py-2.5 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-colors flex items-center gap-2 shadow-lg shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-violet-600"
          >
            <Save className="w-4 h-4" />
            Kaydet
          </button>
        </div>
      </form>
    </div>
  );
}

interface SeriesFieldsProps {
  relationType: SeriesRelationType | "";
  setRelationType: (v: SeriesRelationType | "") => void;
  seasonNumber: string;
  setSeasonNumber: (v: string) => void;
  orderIndex: string;
  setOrderIndex: (v: string) => void;
  inputCls: string;
  labelCls: string;
}

function SeriesFields({
  relationType,
  setRelationType,
  seasonNumber,
  setSeasonNumber,
  orderIndex,
  setOrderIndex,
  inputCls,
  labelCls,
}: SeriesFieldsProps) {
  return (
    <>
      <div>
        <label className={labelCls}>Tür</label>
        <select
          value={relationType}
          onChange={(e) => setRelationType((e.target.value as SeriesRelationType) || "")}
          className={inputCls}
        >
          <option value="">— seçilmedi —</option>
          {RELATION_OPTIONS.map((rt) => (
            <option key={rt} value={rt}>
              {RELATION_LABELS[rt]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>
            Sezon No <span className="text-zinc-600 font-normal">(opsiyonel)</span>
          </label>
          <input
            type="number"
            min={1}
            value={seasonNumber}
            onChange={(e) => setSeasonNumber(e.target.value)}
            className={inputCls}
            placeholder="—"
          />
        </div>
        <div>
          <label className={labelCls}>
            Sıra <span className="text-zinc-600 font-normal">(opsiyonel)</span>
          </label>
          <input
            type="number"
            min={1}
            value={orderIndex}
            onChange={(e) => setOrderIndex(e.target.value)}
            className={inputCls}
            placeholder="—"
          />
        </div>
      </div>
    </>
  );
}

export { generateManualGroupId };
