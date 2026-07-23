export interface ColorCatalogEntry {
  name: string;
  hex: `#${string}`;
}

export interface ColorCatalogGroup {
  id: "neutral" | "warm" | "cool" | "earth" | "pastel" | "deep";
  label: string;
  colors: readonly ColorCatalogEntry[];
}

export const COLOR_CATALOG: readonly ColorCatalogGroup[] = [
  {
    id: "neutral",
    label: "Nötr",
    colors: [
      { name: "Gece", hex: "#09090B" },
      { name: "Kömür", hex: "#18181B" },
      { name: "Slate", hex: "#334155" },
      { name: "Taş", hex: "#78716C" },
      { name: "Kum", hex: "#D6D3D1" },
      { name: "Kırık beyaz", hex: "#F5F5F4" },
    ],
  },
  {
    id: "warm",
    label: "Sıcak",
    colors: [
      { name: "Kiremit", hex: "#C2410C" },
      { name: "Terracotta", hex: "#B4533C" },
      { name: "Kehribar", hex: "#D97706" },
      { name: "Altın", hex: "#CA8A04" },
      { name: "Gül kurusu", hex: "#BE6074" },
      { name: "Bordo", hex: "#881337" },
    ],
  },
  {
    id: "cool",
    label: "Soğuk",
    colors: [
      { name: "Okyanus", hex: "#0369A1" },
      { name: "Camgöbeği", hex: "#0891B2" },
      { name: "Turkuaz", hex: "#0F766E" },
      { name: "İndigo", hex: "#4338CA" },
      { name: "Buz", hex: "#BAE6FD" },
      { name: "Gri mavi", hex: "#64748B" },
    ],
  },
  {
    id: "earth",
    label: "Toprak",
    colors: [
      { name: "Çam", hex: "#164E3B" },
      { name: "Yosun", hex: "#4D7C0F" },
      { name: "Zeytin", hex: "#6B6D35" },
      { name: "Kabuk", hex: "#713F12" },
      { name: "Kil", hex: "#9A3412" },
      { name: "Parşömen", hex: "#E7D7B5" },
    ],
  },
  {
    id: "pastel",
    label: "Pastel",
    colors: [
      { name: "Toz pembe", hex: "#E8B4C0" },
      { name: "Lavanta", hex: "#C4B5FD" },
      { name: "Adaçayı", hex: "#B7C9B2" },
      { name: "Buz mavisi", hex: "#CFE8F3" },
      { name: "Şeftali", hex: "#FED7AA" },
      { name: "Krem", hex: "#F3E8D0" },
    ],
  },
  {
    id: "deep",
    label: "Derin",
    colors: [
      { name: "Derin lacivert", hex: "#06111F" },
      { name: "Çam gölgesi", hex: "#071A14" },
      { name: "Erik", hex: "#3B1D52" },
      { name: "Mürekkep", hex: "#29211A" },
      { name: "Gece mavisi", hex: "#172554" },
      { name: "Koyu gül", hex: "#4A1726" },
    ],
  },
] as const;
