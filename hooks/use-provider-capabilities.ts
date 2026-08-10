"use client";

import { useEffect, useState } from "react";

import { FAIL_CLOSED_PROVIDER_CAPABILITIES, type PublicProviderCapabilities } from "@/lib/providers/types";

let cached: PublicProviderCapabilities | undefined;
let pending: Promise<PublicProviderCapabilities> | undefined;

async function loadCapabilities(): Promise<PublicProviderCapabilities> {
  if (cached) return cached;
  pending ??= fetch("/api/providers/capabilities", { cache: "no-store" })
    .then(async (response) => response.ok ? await response.json() as PublicProviderCapabilities : FAIL_CLOSED_PROVIDER_CAPABILITIES)
    .catch(() => FAIL_CLOSED_PROVIDER_CAPABILITIES)
    .then((value) => {
      cached = value;
      return value;
    })
    .finally(() => { pending = undefined; });
  return pending;
}

export function useProviderCapabilities() {
  const [capabilities, setCapabilities] = useState(cached ?? FAIL_CLOSED_PROVIDER_CAPABILITIES);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let active = true;
    void loadCapabilities().then((value) => {
      if (!active) return;
      setCapabilities(value);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return { capabilities, loading };
}
