// ============================================
// Onay Penceresi (Confirm Dialog) Bileşeni
// ============================================
// Silme veya sıfırlama gibi geri dönüşü olmayan işlemlerden
// önce kullanıcıdan onay almak için kullanılır.

"use client";

import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;                // Pencere açık mı?
  title: string;                  // Pencere başlığı
  message: string;                // Uyarı mesajı
  confirmLabel?: string;          // Onay butonundaki yazı (varsayılan: "Onayla")
  onConfirm: () => void;          // Onay verilince çağrılır
  onCancel: () => void;           // İptal edilince çağrılır
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Onayla",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Pencere kapalıysa hiçbir şey gösterme
  if (!isOpen) return null;

  return (
    // Arka plan karartması (tıklayınca iptal olur)
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      {/* Modal kutusu */}
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()} // Kutunun içine tıklayınca kapanmasın
      >
        {/* Uyarı ikonu ve başlık */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
        </div>

        {/* Mesaj */}
        <p className="text-sm text-zinc-400 mb-6 leading-relaxed">{message}</p>

        {/* Butonlar */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            İptal
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-red-500/20 text-red-400 ring-1 ring-red-500/30 hover:bg-red-500/30 transition-colors cursor-pointer"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
