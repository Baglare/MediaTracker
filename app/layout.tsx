import type { Metadata } from "next";
import { cookies } from "next/headers";

import { AppearanceRuntime } from "@/components/personalization/appearance-runtime";
import { CustomThemesRuntime } from "@/components/personalization/custom-themes-runtime";
import { StartupRuntime } from "@/components/personalization/startup-runtime";
import { RouteAppShell } from "@/components/app-shell/route-app-shell";
import {
  APPEARANCE_COOKIE_NAME,
  parseAppearanceCookie,
} from "@/lib/personalization/appearance-cookie";
import {
  resolveRootAppearanceAttributes,
  themeTokensToCssVariables,
} from "@/lib/personalization/appearance-runtime";
import { DEFAULT_APP_APPEARANCE_PREFERENCES } from "@/lib/personalization/defaults";
import type { CustomThemeDefinition } from "@/lib/personalization/types";
import type { CSSProperties } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "MediaTracker - Medya Takip Uygulaması",
  description:
    "Film, dizi, anime, manga, manhwa ve kitaplarını tek yerden takip et.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialIdentity = parseAppearanceCookie(
    cookieStore.get(APPEARANCE_COOKIE_NAME)?.value,
  );
  const initialCustomTheme: CustomThemeDefinition | undefined = initialIdentity.customTheme
    ? {
        version: 1,
        id: initialIdentity.customTheme.id,
        name: "Aktif özel tema",
        createdAt: "1970-01-01T00:00:00.000Z",
        updatedAt: "1970-01-01T00:00:00.000Z",
        inputs: initialIdentity.customTheme.inputs,
        corrections: initialIdentity.customTheme.corrections,
      }
    : undefined;
  const initialAttributes = resolveRootAppearanceAttributes({
    ...DEFAULT_APP_APPEARANCE_PREFERENCES,
    theme: initialIdentity.theme,
    accentMode: initialIdentity.accentMode,
  }, "neutral", initialIdentity.resolvedTheme !== "porcelain", initialCustomTheme);
  const rootStyle = {
    colorScheme: initialAttributes.colorScheme,
    ...themeTokensToCssVariables(initialAttributes.inlineTokens),
  } as CSSProperties;

  return (
    <html
      lang="tr"
      className="h-full antialiased"
      data-theme={initialAttributes.theme}
      data-theme-source={initialAttributes.themeSource}
      data-theme-selection={initialAttributes.themeSelection.kind === "preset"
        ? initialAttributes.themeSelection.id
        : "custom"}
      data-base-theme={initialAttributes.themeSelection.kind === "preset"
        ? initialAttributes.themeSelection.id
        : "custom"}
      data-custom-theme-id={initialAttributes.customThemeId}
      data-accent-mode={initialAttributes.accentMode}
      data-resolved-accent={initialAttributes.resolvedAccent}
      data-effects={initialAttributes.effects}
      data-density={initialAttributes.density}
      style={rootStyle}
    >
      <body className="min-h-full flex flex-col font-sans">
        <CustomThemesRuntime>
          <AppearanceRuntime initialIdentity={initialIdentity}>
            <StartupRuntime>
              <RouteAppShell>{children}</RouteAppShell>
            </StartupRuntime>
          </AppearanceRuntime>
        </CustomThemesRuntime>
      </body>
    </html>
  );
}
