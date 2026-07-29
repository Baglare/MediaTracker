"use client";

import { useEffect, useState } from "react";
import {
  decodePublicCloudRolloutState,
  evaluateRemoteCloudRollout,
  getCloudRolloutContract,
  type CloudRolloutContract,
} from "@/lib/cloud-rollout";
import { setCloudRolloutRuntimeContract } from "@/lib/sync-manager";

const DEPLOYMENT_EPOCH =
  process.env.NEXT_PUBLIC_CLOUD_MEDIA_DEPLOYMENT_EPOCH ?? "";

export function useCloudRolloutGuard(
  ownerId: string | null,
): CloudRolloutContract {
  const [contract, setContract] = useState(getCloudRolloutContract);

  useEffect(() => {
    if (!ownerId) {
      setCloudRolloutRuntimeContract(null);
      return;
    }
    const controller = new AbortController();
    let current = true;
    const verify = async () => {
      try {
        const response = await fetch("/api/cloud/rollout", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("rollout_check_failed");
        const remote = decodePublicCloudRolloutState(await response.json());
        if (!remote) throw new Error("rollout_contract_invalid");
        const next = evaluateRemoteCloudRollout(
          getCloudRolloutContract(),
          remote,
          DEPLOYMENT_EPOCH,
        );
        if (!current) return;
        setContract(next);
        setCloudRolloutRuntimeContract(next);
      } catch {
        if (!current || controller.signal.aborted) return;
        const local = getCloudRolloutContract();
        const next: CloudRolloutContract = {
          ...local,
          status: "verification_unavailable",
          code: "cloud_rollout_verification_unavailable",
          message:
            "Cloud sürüm doğrulaması yapılamadı. Yerel verin korunuyor; senkronizasyon geçici olarak durduruldu.",
          requiresReload: false,
        };
        setContract(next);
        setCloudRolloutRuntimeContract(next);
      }
    };
    void verify();
    const interval = window.setInterval(verify, 30_000);
    return () => {
      current = false;
      controller.abort();
      window.clearInterval(interval);
      setCloudRolloutRuntimeContract(null);
    };
  }, [ownerId]);

  return ownerId ? contract : getCloudRolloutContract();
}
