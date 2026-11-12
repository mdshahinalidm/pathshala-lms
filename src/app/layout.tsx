import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { cache } from "react";
import { cookies } from "next/headers";
/* Self-hosted Bangla fonts (no CDN dependency — always load, super fast).
 * Noto Sans Bengali: complete Bengali Unicode — perfect juktakkhor (ক্ষ ত্র জ্ঞ ্র ্য …)
 * and crisp, beautiful Bengali numerals ০১২৩৪৫৬৭৮৯.
 * Baloo Da 2: rounded, friendly display face for headings/brand. */
import "@fontsource/noto-sans-bengali/400.css";
import "@fontsource/noto-sans-bengali/500.css";
import "@fontsource/noto-sans-bengali/600.css";
import "@fontsource/noto-sans-bengali/700.css";
import "@fontsource/baloo-da-2/600.css";
import "@fontsource/baloo-da-2/700.css";
import "@fontsource/baloo-da-2/800.css";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";
import { db } from "@/lib/db";
import { NetworkGuard } from "@/components/system/network-guard";
import { ServerSettingsBridge } from "@/components/layout/server-settings-bridge";
import { pickPublicSettings } from "@/lib/public-settings";
import { serverOrigin } from "@/lib/site-origin";

/**
 * domain-agnostic metadata base. The static module-level
 * `new URL(env || "http://localhost:3000")` could never follow the real
 * deployment host: on any other domain every canonical / og:url / og:image
 * would have pointed back to localhost. The base is now resolved PER REQUEST
 * from the proxy-aware request headers (see src/lib/site-origin.ts), so
 * canonical + Open Graph + Twitter URLs automatically sync to whichever
 * domain serves the request. NEXT_PUBLIC_SITE_URL still wins when set.
 */
const META_BASE: Metadata = {
  title: {
    default: "পাঠশালা | PathShala — অনলাইন লার্নিং প্ল্যাটফর্ম",
    template: "%s | পাঠশালা PathShala",
  },
  description:
    "বাংলাদেশের সেরা অনলাইন লার্নিং প্ল্যাটফর্ম। এসএসসি, এইচএসসি, ভর্তি পরীক্ষা ও স্কিল ডেভেলপমেন্ট কোর্স, ফ্রি সাজেশন, লাইভ পরীক্ষা ও রেজাল্ট বিশ্লেষণ।",
  keywords: [
    "পাঠশালা",
    "অনলাইন কোর্স",
    "এসএসসি",
    "এইচএসসি",
    "ভর্তি পরীক্ষা",
    "ফ্রি সাজেশন",
    "লাইভ পরীক্ষা",
    "অনলাইন শিক্ষা বাংলাদেশ",
    "online course bangladesh",
    "online exam",
    "LMS",
    "PathShala",
  ],
  authors: [{ name: "PathShala Team" }],
  creator: "PathShala",
  publisher: "PathShala",
  formatDetection: { telephone: false },
  // NOTE: the favicon is admin-configurable and versioned —
  // generateMetadata() below merges the icons in per request.
  openGraph: {
    type: "website",
    locale: "bn_BD",
    siteName: "পাঠশালা — PathShala",
    title: "পাঠশালা | PathShala — অনলাইন লার্নিং প্ল্যাটফর্ম",
    description: "দেশসেরা শিক্ষকদের কোর্স, পরীক্ষা ও ফ্রি সাজেশন — সব এক প্ল্যাটফর্মে।",
    images: [
      {
        url: "/images/og-image.jpg",
        width: 1440,
        height: 704,
        alt: "পাঠশালা PathShala — অনলাইন লার্নিং প্ল্যাটফর্ম",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "পাঠশালা | PathShala — অনলাইন লার্নিং প্ল্যাটফর্ম",
    description: "দেশসেরা শিক্ষকদের কোর্স, পরীক্ষা ও ফ্রি সাজেশন — সব এক প্ল্যাটফর্মে।",
    images: ["/images/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  alternates: { canonical: "/" },
};

/**
 * Read the FULL SiteSetting row safely (null on any DB hiccup). Shared by
 * pickPublicSettings(), generateMetadata() and the custom CSS/code
 * injection. React cache() dedupes every per-request caller into ONE SQLite
 * read (previously layout + metadata each re-queried).
 */
const readSettingsRow = cache(async (): Promise<Record<string, unknown> | null> => {
  try {
    const row = await db.siteSetting.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });
    return row as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
});

/**
 * accept either the bare verification code or a pasted full
 * <meta name="…" content="…"> tag; return the content value.
 */
function metaVerificationCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const s = raw.trim();
  if (!s) return "";
  const m = s.match(/content\s*=\s*["']([^"']+)["']/i);
  return (m ? m[1] : s).trim();
}

/**
 * GA4 measurement-id sanitizer. Strict charset (no quotes,
 * angle brackets, semicolons…) so the id is safe to interpolate into the
 * inline gtag init snippet. Invalid input → no analytics script at all.
 */
function safeMeasurementId(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const s = raw.trim();
  return /^[A-Za-z0-9_-]{6,32}$/.test(s) ? s : "";
}

/**
 * dynamic metadata. Merged from the DB per request:
 *  • search-engine verification (Google / Bing) when the admin set them,
 *  • a version-busted favicon URL (?v=<updatedAt epoch>) so a newly saved
 *    favicon ALWAYS produces a different URL — browsers can never serve the
 *    stale one (the endpoint itself is also `no-store`).
 */
export async function generateMetadata(): Promise<Metadata> {
  const row = await readSettingsRow();
  const google = metaVerificationCode(row?.googleSiteVerification);
  const bing = metaVerificationCode(row?.bingSiteVerification);
  const updatedAtMs =
    row?.updatedAt instanceof Date ? row.updatedAt.getTime() : null;
  const faviconUrl = updatedAtMs ? `/api/favicon?v=${updatedAtMs}` : "/api/favicon";

  // admin-authored global SEO meta (Settings → SEO) now truly
  // drives the served <head> when set: title.default, description and the
  // keywords list all come from the DB. Empty fields fall back to the
  // built-in brand defaults below, so the site renders exactly as before.
  const seoTitle =
    typeof row?.seoTitle === "string" ? row.seoTitle.trim() : "";
  const seoDescription =
    typeof row?.seoDescription === "string" ? row.seoDescription.trim() : "";
  const seoKeywords =
    typeof row?.seoKeywords === "string" ? row.seoKeywords.trim() : "";
  const dbKeywords = seoKeywords
    ? seoKeywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
    : [];

  return {
    ...META_BASE,
    metadataBase: new URL(await serverOrigin()),
    ...(seoTitle
      ? { title: { ...META_BASE.title, default: seoTitle } }
      : {}),
    ...(seoDescription ? { description: seoDescription } : {}),
    ...(dbKeywords.length ? { keywords: dbKeywords } : {}),
    icons: {
      icon: [{ url: faviconUrl }],
      shortcut: [{ url: faviconUrl }],
      apple: [{ url: faviconUrl }],
    },
    ...(google || bing
      ? {
          verification: {
            ...(google ? { google } : {}),
            ...(bing ? { other: { "msvalidate.01": bing } } : {}),
          },
        }
      : {}),
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0e7a5f",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // HYDRATION SAFETY: the chosen language lives in a cookie and is read per
  // request so the server HTML and the first client render always agree
  // (see src/store/ui-store.tsx). Defaults to বাংলা (bn).
  const cookieLang = (await cookies()).get("ps_lang")?.value;
  const lang = cookieLang === "en" ? "en" : "bn";
  // ONE deduped settings read per request feeds the public bridge, the GA4
  // id and the custom CSS/code injection below.
  const settingsRow = await readSettingsRow();
  const publicSettings = settingsRow ? pickPublicSettings(settingsRow) : null;
  // GA4 — empty/invalid id renders nothing at all.
  const gaMeasurementId = safeMeasurementId(settingsRow?.gaMeasurementId);
  // admin-authored custom CSS / custom code (raw strings). Empty
  // means nothing is injected: the site renders exactly as before.
  const customCss =
    typeof settingsRow?.customCss === "string" ? settingsRow.customCss : "";
  const customCode =
    typeof settingsRow?.customCode === "string" ? settingsRow.customCode : "";
  return (
    <html lang={lang} suppressHydrationWarning data-scroll-behavior="smooth">
      <body className="antialiased bg-background text-foreground min-h-screen">
        {/* custom CSS. First child of <body> so the rules cascade
            AFTER every head stylesheet (admin overrides win ties); rendered
            server-side → zero extra network requests, no FOUC, and nothing
            at all is added while the field stays empty. */}
        {customCss ? (
          <style
            id="ps-custom-css"
            dangerouslySetInnerHTML={{ __html: customCss }}
          />
        ) : null}
        <NetworkGuard />
        {gaMeasurementId ? (
          <>
            {/* Standard GA4 gtag.js — loads after hydration, never blocks. */}
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaMeasurementId}');`}
            </Script>
          </>
        ) : null}
        <Providers initialLang={lang}>
          <ServerSettingsBridge initial={publicSettings}>
            {children}
          </ServerSettingsBridge>
          <Toaster />
        </Providers>
        {/* custom code (raw HTML/JS), injected at the very end of
            <body> like a hand-pasted "before </body>" snippet. Server-rendered:
            the browser's HTML parser executes inline/external scripts on first
            load; the root layout never remounts during SPA navigations, so
            snippets never double-fire. display:contents keeps the wrapper
            invisible to layout. */}
        {customCode ? (
          <div
            style={{ display: "contents" }}
            dangerouslySetInnerHTML={{ __html: customCode }}
          />
        ) : null}
      </body>
    </html>
  );
}
