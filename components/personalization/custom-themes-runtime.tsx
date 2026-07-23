"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useCustomThemes } from "@/hooks/use-custom-themes";
import { useAuth } from "@/hooks/use-auth";
import { resolveLocalOwnerScope } from "@/lib/local-owner-scope";

type CustomThemesRuntimeValue = ReturnType<typeof useCustomThemes>;

const CustomThemesRuntimeContext = createContext<CustomThemesRuntimeValue | null>(null);

export function CustomThemesRuntime({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const scope = resolveLocalOwnerScope(
    auth.loading ? undefined : auth.user?.id ?? null,
  );
  const value = useCustomThemes(scope);
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
