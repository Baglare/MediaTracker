import "./helpers/admitted-rate-limit";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
// Installed 16.3.8 exports the old helper name despite the Proxy doc example.
import { unstable_doesMiddlewareMatch as doesProxyMatch } from "next/experimental/testing/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy, config } from "@/proxy";
import nextConfig from "@/next.config";
import { contentSecurityPolicy } from "@/lib/security/content-security-policy";
import { safeExternalUrl } from "@/lib/safe-external-url";
import { SearchResultDescription } from "@/components/search-result-description";
import GlobalSearchResultCard from "@/components/global-search-result-card";
import MediaDetailModal from "@/components/media-detail-modal";
import MediaModal from "@/components/media-modal";
import type { MediaItem } from "@/lib/types";
import { stripHtml } from "@/lib/anilist";
import { normalizeSearchResult } from "@/app/api/tvmaze/search/route";
import { normalizeCustomThemeInputs } from "@/lib/personalization/custom-theme-tokens";
import { resolveImageTransformStyle } from "@/lib/personalization/image-transform";
import type { TvmazeSearchItem } from "@/lib/tvmaze-types";

afterEach(() => vi.unstubAllEnvs());
const directive = (policy: string, name: string) => policy.split("; ").find((entry) => entry.startsWith(`${name} `));

describe("V1 CSP document boundary", () => {
  it("uses an unpredictable 256-bit nonce, overwrites caller headers and propagates only upstream", () => {
    vi.stubEnv("NODE_ENV", "production");
    const request = new NextRequest("https://app.example/privacy", { headers: {
      "x-nonce": "attacker", "content-security-policy": "script-src 'unsafe-inline'",
      "content-security-policy-report-only": "script-src 'unsafe-inline'",
    } });
    const first = proxy(request);
    const second = proxy(request);
    const policy = first.headers.get("content-security-policy")!;
    const nonce = policy.match(/'nonce-([^']+)'/)![1];
    expect(Buffer.from(nonce, "base64")).toHaveLength(32);
    expect(second.headers.get("content-security-policy")).not.toContain(nonce);
    expect(first.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(first.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
    expect(first.headers.get("x-middleware-request-content-security-policy-report-only")).toBeNull();
    expect(first.headers.get("x-nonce")).toBeNull();
    expect(directive(policy, "script-src")).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(directive(policy, "script-src")).toContain("'strict-dynamic'");
  });

  it.each([undefined, "", "attacker", "x' 'unsafe-inline", "a".repeat(44), "\n"])("fails closed for nonce %s", (nonce) => {
    expect(directive(contentSecurityPolicy({ nonce }), "script-src")).toBe("script-src 'none'");
  });

  it("permits eval only with an explicit development policy", () => {
    const nonce = randomBytes(32).toString("base64");
    expect(directive(contentSecurityPolicy({ nonce }), "script-src")).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(directive(contentSecurityPolicy({ nonce, development: true }), "script-src")).toContain("'unsafe-eval'");
    for (const mode of ["development", "production", "test"]) {
      vi.stubEnv("NODE_ENV", mode);
      const policy = proxy(new NextRequest("https://app.example/")).headers.get("content-security-policy")!;
      expect(policy.includes("'unsafe-eval'")).toBe(mode === "development");
      expect(directive(policy, "script-src")).not.toContain("'unsafe-inline'");
    }
  });

  it.each([
    ["purpose", "prefetch"], ["next-router-prefetch", "1"], ["accept", "text/x-component"],
  ])("does not generate/reuse a nonce for RSC/prefetch and fails closed for forged HTML %s: %s", (key, value) => {
    const response = proxy(new NextRequest("https://app.example/privacy", { headers: { [key]: value, "x-nonce": "attacker" } }));
    expect(response.headers.get("content-security-policy")).toContain("script-src 'none'");
    expect(response.headers.get("x-middleware-request-x-nonce")).toBeNull();
  });

  it.each(["/", "/privacy", "/profile", "/u/example.name", "/unknown.html", "/apiculture"])("covers document %s", (url) => {
    expect(doesProxyMatch({ config, nextConfig, url })).toBe(true);
  });
  it.each(["/api", "/api/tvmaze/search", "/_next/static/a.js", "/_next/image", "/favicon.ico", "/icon.png", "/apple-icon.png", "/brand/media-tracker-mark.svg", "/placeholders/book.svg", "/next.svg"])("does not run on API/static asset %s", (url) => {
    expect(doesProxyMatch({ config, nextConfig, url })).toBe(false);
  });

  it("has one CSP source and preserves the other security headers", async () => {
    const rules = await nextConfig.headers!();
    const headers = rules.flatMap((rule) => rule.headers);
    expect(headers.some((header) => header.key.toLowerCase() === "content-security-policy")).toBe(false);
    for (const key of ["Referrer-Policy", "Permissions-Policy", "X-Content-Type-Options", "X-Frame-Options"]) {
      expect(headers.filter((header) => header.key === key)).toHaveLength(1);
    }
    expect(readFileSync("app/layout.tsx", "utf8")).toContain("await cookies()");
  });

  it("limits browser connections to the exact configured Supabase origin and realtime endpoint", () => {
    const policy = contentSecurityPolicy({ supabaseUrl: "https://project.supabase.co" });
    expect(directive(policy, "connect-src")).toBe("connect-src 'self' https://project.supabase.co wss://project.supabase.co");
    expect(directive(policy, "img-src")).toContain("https://static.tvmaze.com");
    expect(policy).not.toContain("*");
    expect(policy).not.toMatch(/api\.tvmaze|api\.themoviedb|graphql\.anilist|openlibrary\.org\/search/);
  });
  it.each([undefined, "invalid", "http://project.supabase.co", "https://user:password@project.supabase.co", "https://project.supabase.co/?x=1", "https://project.supabase.co/path", "https://project.supabase.co/#x", "https://*.supabase.co", "https://host;script-src"])("omits malformed/missing Supabase origin %s", (supabaseUrl) => {
    expect(directive(contentSecurityPolicy({ supabaseUrl }), "connect-src")).toBe("connect-src 'self'");
  });
});

const payloads = [
  "<script>alert(1)</script>", "<img src=x onerror=alert(1)>",
  "<iframe><style>body{}</style><script>alert(1)</script></iframe>",
  "&lt;img src=x onerror=alert(1)&gt;", "&#x3c;script&#x3e;alert(1)&#x3c;/script&#x3e;",
  "javascript:alert(1)", "<script <img onerror=alert(1)>broken", "<svg><script>alert(1)</script></svg>",
  "\u0000\u0001\u001f\u007f<img onerror=alert(1)>",
];

describe("V1 XSS text, URL and style boundaries", () => {
  it.each(payloads)("escapes real media title/notes/overview/forms and blocks imported active source links: %s", (payload) => {
    const media: MediaItem = {
      id: "synthetic", title: payload, type: "tv", status: "planning",
      coverImage: "/placeholders/tv.svg", currentProgress: 0, totalProgress: 1,
      overview: payload, personalNotes: payload, siteUrl: "javascript:alert(1)",
    };
    const noop = () => {};
    const outputs = [
      renderToStaticMarkup(createElement(MediaDetailModal, {
        media, open: true, onClose: noop, onEdit: noop, onDelete: noop,
        onToggleFavorite: noop, onIncrementProgress: noop, onComplete: noop,
      })),
      renderToStaticMarkup(createElement(MediaModal, { isOpen: true, editingItem: media, onClose: noop, onSave: noop })),
    ];
    for (const html of outputs) {
      expect(html).not.toMatch(/<(?:script|iframe|style)\b|href="javascript:/i);
      for (const tag of html.match(/<[^>]*>/g) ?? []) {
        // Consume quoted values as a whole: onerror text inside an escaped
        // aria-label/alt/value is not an event-handler attribute.
        const attributes = [...tag.matchAll(/\s+([\w:-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/g)];
        expect(attributes.map((match) => match[1])).not.toEqual(expect.arrayContaining([expect.stringMatching(/^on/i)]));
      }
      const escaped = renderToStaticMarkup(createElement("span", null, payload)).slice(6, -7);
      expect(html).toContain(escaped);
    }
  });

  it.each(payloads)("renders provider/user payload only as escaped text: %s", (payload) => {
    const outputs = [
      renderToStaticMarkup(createElement(SearchResultDescription, { value: payload })),
      renderToStaticMarkup(createElement("p", null, stripHtml(payload))),
      renderToStaticMarkup(createElement("p", null, normalizeSearchResult({ show: {
        id: 1, name: "Synthetic", summary: payload, genres: [],
      } } as unknown as TvmazeSearchItem).overview)),
      renderToStaticMarkup(createElement("p", null, payload)),
    ];
    for (const html of outputs) {
      expect(html).not.toMatch(/<(?:script|img|iframe|style|svg)\b|<[^>]*\son(?:error|load|click)=/i);
      expect(html.match(/<[^>]*>/g) ?? []).toEqual(html ? [expect.stringMatching(/^<p(?: |>)*/), "</p>"] : []);
    }
  });

  it.each(["javascript:alert(1)", "java\nscript:alert(1)", "\u0000javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "//attacker.example", "https://user:password@example.com", "https://example.com/\u007f", "&colon;", ""])("rejects active/malformed URL %s", (url) => {
    expect(safeExternalUrl(url)).toBeUndefined();
    const html = renderToStaticMarkup(createElement(GlobalSearchResultCard, {
      result: { source: "tvmaze", externalId: "1", type: "tv", title: "Synthetic", sourceUrl: url },
      libraryStatus: { isInLibrary: false, hasAddableParts: false }, isAdding: false, onAdd: () => {},
    }));
    expect(html).not.toContain("<a ");
  });
  it.each(["https://www.tvmaze.com/shows/1", "https://openlibrary.org/works/OL1W", "http://example.com/path"])("preserves ordinary source navigation %s", (url) => {
    expect(safeExternalUrl(url)).toBe(url);
  });

  it("rejects arbitrary CSS and constructs focal/zoom values from bounded numbers", () => {
    for (const background of ["url(https://attacker.example)", "red; background:url(x)", "var(--attacker)", "<style>body{}</style>"]) {
      expect(normalizeCustomThemeInputs({ colorScheme: "dark", background, surface: "#111111", accent: "#aabbcc", secondaryAccent: "#ccbbaa" })).toBeNull();
    }
    expect(resolveImageTransformStyle({ focalX: "url(x)", focalY: Infinity, zoom: "1); color:red" }, "banner"))
      .toEqual({ objectPosition: "50% 50%", transformOrigin: "50% 50%", transform: "scale(1)" });
  });

  it("keeps raw HTML/eval sinks absent from browser runtime source", () => {
    const sinks: string[] = [];
    function visit(directory: string) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) visit(path);
        else if (/\.[jt]sx?$/.test(path)) {
          const source = readFileSync(path, "utf8");
          const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
          function walk(node: ts.Node) {
            const report = () => sinks.push(`${path}:${tree.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
            if (ts.isJsxAttribute(node) && ["dangerouslySetInnerHTML", "srcDoc"].includes(node.name.getText(tree))) report();
            if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ["script", "Script"].includes(node.tagName.getText(tree))) report();
            if (ts.isPropertyAccessExpression(node) && ["innerHTML", "outerHTML"].includes(node.name.text)) report();
            if (ts.isNewExpression(node) && ["Function", "DOMParser"].includes(node.expression.getText(tree))) report();
            if (ts.isCallExpression(node)) {
              const callee = node.expression.getText(tree);
              if (callee === "eval" || callee === "document.write" || callee.endsWith(".insertAdjacentHTML")) report();
              if (/(?:^|\.)(?:setTimeout|setInterval)$/.test(callee) && node.arguments[0]
                && (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))) report();
              if (callee.endsWith(".createElement") && node.arguments[0]
                && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "script") report();
            }
            ts.forEachChild(node, walk);
          }
          walk(tree);
        }
      }
    }
    for (const directory of ["app", "components", "features", "lib"]) visit(directory);
    expect(sinks).toEqual([]);
  });
});
