import "server-only";

import { after } from "next/server";
import type { PostResponseTaskScheduler } from "./scheduler";

export const nextPostResponseTaskScheduler: PostResponseTaskScheduler = Object.freeze({
  schedule(task: () => Promise<void>) {
    after(async () => {
      try {
        await task();
      } catch {
        // Shadow tasks are fail-soft and must never create an unhandled rejection.
      }
    });
  },
});
