import { describe, expect, it } from "vitest";
import {
  dateOnlyInTimeZone,
  isScheduleActiveOn,
  isValidIanaTimeZone,
  resolveGoalPeriod,
} from "@/features/goals/domain";

describe("Goal date ve timezone policy", () => {
  it("one-time sınırlarını inclusive değerlendirir", () => {
    const schedule = { kind: "one_time", startsOn: "2026-08-03", endsOn: "2026-08-09" } as const;
    expect(isScheduleActiveOn(schedule, "2026-08-03")).toEqual({ ok: true, value: true });
    expect(isScheduleActiveOn(schedule, "2026-08-09")).toEqual({ ok: true, value: true });
    expect(isScheduleActiveOn(schedule, "2026-08-02")).toEqual({ ok: true, value: false });
    expect(isScheduleActiveOn(schedule, "2026-08-10")).toEqual({ ok: true, value: false });
  });

  it("haftayı Pazartesi-Pazar olarak çözer", () => {
    const result = resolveGoalPeriod({
      kind: "weekly", startsOn: "2026-08-01", weekStartsOn: "monday", timeZone: "Europe/Istanbul",
    }, "2026-08-06");
    expect(result).toEqual({ ok: true, value: { start: "2026-08-03", end: "2026-08-09" } });
  });

  it("ilk ve son recurring dönemi schedule sınırlarına kırpar", () => {
    const schedule = {
      kind: "weekly", startsOn: "2026-08-05", weekStartsOn: "monday", timeZone: "Europe/Istanbul", endsOn: "2026-08-08",
    } as const;
    expect(resolveGoalPeriod(schedule, "2026-08-06")).toEqual({
      ok: true,
      value: { start: "2026-08-05", end: "2026-08-08" },
    });
    expect(resolveGoalPeriod(schedule, "2026-08-09")).toEqual({ ok: true, value: null });
  });

  it("aylık dönemi yerel takvim ayı ve leap year ile çözer", () => {
    expect(resolveGoalPeriod({ kind: "monthly", startsOn: "2024-01-01", timeZone: "Europe/Istanbul" }, "2024-02-15"))
      .toEqual({ ok: true, value: { start: "2024-02-01", end: "2024-02-29" } });
  });

  it("Aralık/Ocak yıl geçişini doğru çözer", () => {
    expect(resolveGoalPeriod({ kind: "weekly", startsOn: "2025-12-01", weekStartsOn: "monday", timeZone: "Europe/Istanbul" }, "2026-01-01"))
      .toEqual({ ok: true, value: { start: "2025-12-29", end: "2026-01-04" } });
  });

  it("DST geçişinde instant değerini istenen timezone yerel gününe dönüştürür", () => {
    expect(dateOnlyInTimeZone("2026-03-29T00:30:00.000Z", "Europe/Berlin"))
      .toEqual({ ok: true, value: "2026-03-29" });
    expect(dateOnlyInTimeZone("2026-11-01T05:30:00.000Z", "America/New_York"))
      .toEqual({ ok: true, value: "2026-11-01" });
  });

  it("geçersiz IANA timezone için kontrollü hata döndürür ve UTC fallback yapmaz", () => {
    expect(isValidIanaTimeZone("Mars/Olympus")).toBe(false);
    expect(dateOnlyInTimeZone("2026-08-03T00:00:00.000Z", "Mars/Olympus")).toMatchObject({
      ok: false,
      code: "timezone_invalid",
    });
    expect(dateOnlyInTimeZone("2026-08-03", "UTC")).toMatchObject({ ok: false, code: "instant_invalid" });
  });

  it("geçersiz date-only ve endsOn öncesi aralığı reddeder", () => {
    expect(resolveGoalPeriod({ kind: "monthly", startsOn: "2025-02-29", timeZone: "UTC" }, "2025-03-01")).toMatchObject({ ok: false });
    expect(resolveGoalPeriod({ kind: "one_time", startsOn: "2026-08-10", endsOn: "2026-08-09" }, "2026-08-10")).toMatchObject({ ok: false });
  });
});
