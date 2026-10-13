import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import type { PublicProviderCapabilities } from "@/lib/providers/types";
import { readSearchResponse } from "@/lib/search-response";

const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = typeof initial === "function" ? initial() : initial;
    return [state.values[index], (next: unknown) => {
      state.values[index] = typeof next === "function" ? next(state.values[index]) : next;
    }];
  },
  useRef: () => ({ current: null }),
  useEffect: () => undefined,
  useCallback: (callback: unknown) => callback,
}));
import GlobalSearch from "@/components/global-search";
import TvmazeSearch from "@/components/tvmaze-search";

type Node = ReactElement<{ children?: ReactNode; [key: string]: unknown }>;
function nodes(tree: ReactNode): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const node = tree as Node;
  return [node, ...nodes(node.props.children)];
}
function text(tree: ReactNode): string {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join(" ");
  if (tree && typeof tree === "object" && "props" in tree) return text((tree as Node).props.children);
  return "";
}
function capabilities(openlibrary = false): PublicProviderCapabilities {
  return { providers: {
    tvmaze: { enabled: true }, openlibrary: { enabled: openlibrary },
    tmdb: { enabled: false }, anilist: { enabled: false }, omdb: { enabled: false },
  } } as PublicProviderCapabilities;
}
function render(openlibrary = false) {
  state.cursor = 0;
  return GlobalSearch({ capabilities: capabilities(openlibrary), getLibraryStatus: () => ({ isInLibrary: false, hasAddableParts: false }), onAddToLibrary: () => undefined });
}
async function search(openlibrary = false) {
  let tree = render(openlibrary);
  const input = nodes(tree).find(node => node.type === "input")!;
  (input.props.onChange as (event: unknown) => void)({ target: { value: "Breaking Bad" } });
  tree = render(openlibrary);
  await (nodes(tree).find(node => node.type === "form")!.props.onSubmit as () => Promise<void>)();
  return render(openlibrary);
}
beforeEach(() => { state.values = []; state.cursor = 0; vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => vi.unstubAllGlobals());

describe("public search HTTP and UI outcomes (local hook harness)", () => {
  it.each([503, 502, 429])("shows a retry error for HTTP %s, never empty results", async status => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ code: "PRIVATE_CANARY" }, { status, headers: { "Retry-After": "5" } }));
    const tree = await search();
    expect(nodes(tree).some(node => node.props.role === "alert")).toBe(true);
    expect(text(tree)).toContain("5 saniye sonra tekrar deneyin.");
    expect(text(tree)).toContain("Tekrar Dene");
    expect(text(tree)).not.toContain("Sonuç bulunamadı");
    expect(text(tree)).not.toContain("PRIVATE_CANARY");
    const retry = nodes(tree).find(node => node.type === "button" && text(node) === "Tekrar Dene")!;
    vi.mocked(fetch).mockResolvedValue(Response.json({ results: [] }));
    await (retry.props.onClick as () => Promise<void>)();
    expect(text(render())).toContain("Sonuç bulunamadı");
    expect(nodes(render()).some(node => node.props.role === "alert")).toBe(false);
  });
  it("keeps successful provider results visible alongside a partial failure", async () => {
    vi.mocked(fetch).mockImplementation(async url => String(url).includes("tvmaze")
      ? Response.json({ code: "upstream_error" }, { status: 502 })
      : Response.json({ results: [{ externalId: "1", title: "Book", type: "book" }] }));
    const tree = await search(true);
    expect(nodes(tree).some(node => node.props.role === "alert")).toBe(true);
    expect(nodes(tree).some(node => (node.props.result as { title?: string } | undefined)?.title === "Book")).toBe(true);
    expect(text(tree)).not.toContain("Sonuç bulunamadı");
  });
  it("shows a connection error for network failures", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("PRIVATE_NETWORK_CANARY"));
    const tree = await search();
    expect(text(tree)).toContain("ulaşılamadı");
    expect(text(tree)).not.toContain("Sonuç bulunamadı");
    expect(text(tree)).not.toContain("PRIVATE_NETWORK_CANARY");
  });
  it("shows empty state only after a successful empty response", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ results: [] }));
    const tree = await search();
    expect(text(tree)).toContain("Sonuç bulunamadı");
    expect(nodes(tree).some(node => node.props.role === "alert")).toBe(false);
  });
  it("also distinguishes TVMaze panel errors from empty results", async () => {
    function panel() { state.cursor = 0; return TvmazeSearch({ isInLibrary: () => false, onAddToLibrary: () => undefined }); }
    let tree = panel();
    (nodes(tree).find(node => node.type === "button")!.props.onClick as () => void)();
    tree = panel();
    (nodes(tree).find(node => node.type === "input")!.props.onChange as (event: unknown) => void)({ target: { value: "Breaking Bad" } });
    tree = panel();
    vi.mocked(fetch).mockResolvedValue(Response.json({}, { status: 503 }));
    await (nodes(tree).find(node => node.type === "button" && text(node).trim() === "Ara")!.props.onClick as () => Promise<void>)();
    tree = panel();
    expect(text(tree)).toContain("geçici olarak kullanılamıyor");
    expect(text(tree)).toContain("Tekrar Dene");
    expect(text(tree)).not.toContain("Sonuç bulunamadı");
  });
  it.each([null, {}, { results: null }])("rejects malformed successful response %j", async body => {
    await expect(readSearchResponse(Response.json(body))).rejects.toThrow("yanıtı okunamadı");
  });
  it("bounds retry text and ignores upstream error messages", async () => {
    await expect(readSearchResponse(Response.json({ error: "PRIVATE_CANARY" }, { status: 503, headers: { "Retry-After": "9999999" } })))
      .rejects.toThrow("Bir süre sonra tekrar deneyin.");
  });
});
