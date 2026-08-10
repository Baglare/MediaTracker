import { describe, expect, it } from "vitest";

import {
  addReleaseCalendarDays,
  buildReleaseMonthGrid,
  canNavigateReleaseMonth,
  daysInMonth,
  releaseMonthNavigationBounds,
  shiftReleaseMonth,
} from "@/features/calendar/domain/release-month";
import {
  selectReleaseAgenda,
  type ReleaseDatePrecision,
  type ReleaseEvent,
} from "@/features/calendar/domain/release-calendar";
import {
  buildReleaseAgendaFromViewItems,
  filterReleaseCalendarViewItems,
  type ReleaseAgendaViewItem,
  type ReleaseMediaFilter,
} from "@/features/calendar/services/release-calendar-service";
import type { MediaItem } from "@/lib/types";

function event(
  id: string,
  date: ReleaseDatePrecision,
  mediaRecordId = "media-1",
): ReleaseEvent {
  return {
    schemaVersion: 1,
    id,
    mediaRecordId,
    type: "episode",
    title: `Event ${id}`,
    date,
    origin: {
      kind: "provider",
      provider: "tvmaze",
      providerEventId: `provider-${id}`,
      persistence: "reproducible_cache",
    },
  };
}

function manualEvent(id: string, date: ReleaseDatePrecision): ReleaseEvent {
  return {
    ...event(id, date),
    origin: { kind: "manual", persistence: "persistent_user_data" },
  };
}

function viewItem(
  id: string,
  type: ReleaseMediaFilter,
  date: string,
): ReleaseAgendaViewItem {
  const media: MediaItem = {
    id,
    title: id,
    type,
    theme: "screen",
    mediaType: type,
    subType: type === "movie" ? "film" : type === "anime" ? "anime_series" : "tv_series",
    status: "watching",
    coverImage: "",
    currentProgress: 0,
    totalProgress: 12,
    favorite: false,
  };
  return {
    event: event(id, { precision: "date_only", date }, id),
    media,
    stale: false,
    fetchedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("release month grid", () => {
  it("starts on Monday and builds five-week and six-week months", () => {
    const fiveWeeks = buildReleaseMonthGrid({
      events: [],
      month: "2026-09",
      today: "2026-09-01",
    });
    expect(fiveWeeks.weeks).toHaveLength(5);
    expect(fiveWeeks.days[0].date).toBe("2026-08-31");

    const sixWeeks = buildReleaseMonthGrid({
      events: [],
      month: "2026-08",
      today: "2026-08-01",
    });
    expect(sixWeeks.weeks).toHaveLength(6);
    expect(sixWeeks.days[0].date).toBe("2026-07-27");
    expect(sixWeeks.days.at(-1)?.date).toBe("2026-09-06");
  });

  it("supports leap years and December/January transitions", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(addReleaseCalendarDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addReleaseCalendarDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(shiftReleaseMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftReleaseMonth("2027-01", -1)).toBe("2026-12");
  });

  it("keeps the provider horizon at 90 days without locking month navigation", () => {
    const bounds = releaseMonthNavigationBounds("2026-11-15");
    expect(bounds).toEqual({
      firstMonth: "0001-01",
      lastMonth: "9999-12",
      horizonDate: "2027-02-13",
    });
    expect(canNavigateReleaseMonth("2026-11", -1, "2026-11-15")).toBe(true);
    expect(canNavigateReleaseMonth("2026-11", 1, "2026-11-15")).toBe(true);
    expect(canNavigateReleaseMonth("2027-02", 1, "2026-11-15")).toBe(true);
    expect(canNavigateReleaseMonth("0001-01", -1, "2026-11-15")).toBe(false);
    expect(canNavigateReleaseMonth("9999-12", 1, "2026-11-15")).toBe(false);
  });

  it("keeps date-only on its literal day and exact datetimes on the local day", () => {
    const dateOnly = event("literal", {
      precision: "date_only",
      date: "2026-02-01",
    });
    const exact = event("instant", {
      precision: "exact_datetime",
      dateTime: "2026-01-31T23:30:00Z",
    });
    const grid = buildReleaseMonthGrid({
      events: [dateOnly, exact],
      month: "2026-02",
      today: "2026-02-01",
      options: { timeZone: "Asia/Tokyo" },
    });
    expect(grid.days.find((day) => day.date === "2026-02-01")?.events)
      .toEqual([exact, dateOnly]);
    expect(grid.days.find((day) => day.date === "2026-01-31")?.events).toEqual([]);
  });

  it("limits cells to three visible events and reports overflow", () => {
    const events = Array.from({ length: 5 }, (_, index) =>
      event(`event-${index}`, { precision: "date_only", date: "2026-04-10" }));
    const day = buildReleaseMonthGrid({
      events,
      month: "2026-04",
      today: "2026-04-01",
      selectedDate: "2026-04-10",
    }).days.find((entry) => entry.date === "2026-04-10");
    expect(day?.events).toHaveLength(5);
    expect(day?.visibleEvents).toHaveLength(3);
    expect(day?.overflowCount).toBe(2);
    expect(day?.isSelected).toBe(true);
  });

  it("keeps TBA and out-of-horizon events outside the grid", () => {
    const onHorizon = event("horizon", {
      precision: "date_only",
      date: "2026-04-01",
    });
    const outside = event("outside", {
      precision: "date_only",
      date: "2026-04-02",
    });
    const tba = event("tba", { precision: "tba" });
    const grid = buildReleaseMonthGrid({
      events: [onHorizon, outside, tba],
      month: "2026-04",
      today: "2026-01-01",
    });
    expect(grid.days.flatMap((day) => day.events).map((entry) => entry.id))
      .toEqual(["horizon"]);
    expect(selectReleaseAgenda([onHorizon, outside, tba], "2026-01-01").tba)
      .toEqual([tba]);
  });

  it("shows manual events beyond the provider horizon and in past/future months", () => {
    const providerOutside = event("provider-day-91", { precision: "date_only", date: "2026-04-02" });
    const manualOutside = manualEvent("manual-day-91", { precision: "date_only", date: "2026-04-02" });
    const past = manualEvent("manual-past", { precision: "date_only", date: "2025-06-10" });
    const future = manualEvent("manual-future", { precision: "date_only", date: "2028-05-20" });

    expect(buildReleaseMonthGrid({ events: [providerOutside, manualOutside], month: "2026-04", today: "2026-01-01" })
      .days.flatMap((day) => day.events).map((entry) => entry.id)).toEqual(["manual-day-91"]);
    expect(buildReleaseMonthGrid({ events: [past], month: "2025-06", today: "2026-01-01" })
      .days.flatMap((day) => day.events).map((entry) => entry.id)).toEqual(["manual-past"]);
    expect(buildReleaseMonthGrid({ events: [future], month: "2028-05", today: "2026-01-01" })
      .days.flatMap((day) => day.events).map((entry) => entry.id)).toEqual(["manual-future"]);
  });

  it("uses the same filtered view-item set for agenda and month", () => {
    const all = [
      viewItem("tv", "tv", "2026-01-02"),
      viewItem("anime", "anime", "2026-01-03"),
      viewItem("movie", "movie", "2026-01-04"),
    ];
    const filtered = filterReleaseCalendarViewItems(all, ["tv", "movie"]);
    const agenda = buildReleaseAgendaFromViewItems({
      items: filtered,
      today: "2026-01-01",
    });
    const month = buildReleaseMonthGrid({
      events: filtered.map(({ event: release }) => release),
      month: "2026-01",
      today: "2026-01-01",
    });
    expect(agenda.next7Days.map(({ event: release }) => release.id)).toEqual(["tv", "movie"]);
    expect(month.days.flatMap((day) => day.events).map((release) => release.id))
      .toEqual(["tv", "movie"]);
  });
});
