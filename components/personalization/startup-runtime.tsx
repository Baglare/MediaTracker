"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useStartupPreferences } from "@/hooks/use-startup-preferences";

type StartupRuntimeValue = ReturnType<typeof useStartupPreferences>;

const StartupRuntimeContext = createContext<StartupRuntimeValue | null>(null);

export function StartupRuntime({ children }: { children: ReactNode }) {
  const value = useStartupPreferences();
  return (
    <StartupRuntimeContext.Provider value={value}>
      {children}
    </StartupRuntimeContext.Provider>
  );
}

export function useStartupRuntime(): StartupRuntimeValue {
  const value = useContext(StartupRuntimeContext);
  if (!value) throw new Error("useStartupRuntime must be used inside StartupRuntime.");
  return value;
}
