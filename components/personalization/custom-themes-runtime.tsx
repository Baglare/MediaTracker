"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useCustomThemes } from "@/hooks/use-custom-themes";

type CustomThemesRuntimeValue = ReturnType<typeof useCustomThemes>;

const CustomThemesRuntimeContext = createContext<CustomThemesRuntimeValue | null>(null);

export function CustomThemesRuntime({ children }: { children: ReactNode }) {
  const value = useCustomThemes();
  return (
    <CustomThemesRuntimeContext.Provider value={value}>
      {children}
    </CustomThemesRuntimeContext.Provider>
  );
}

export function useCustomThemesRuntime(): CustomThemesRuntimeValue {
  const value = useContext(CustomThemesRuntimeContext);
  if (!value) throw new Error("useCustomThemesRuntime must be used inside CustomThemesRuntime.");
  return value;
}
