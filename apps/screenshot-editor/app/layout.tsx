import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Link previews (iMessage, Slack, Teams…) need the preview image's full
// address, so the site's origin is set here; Next adds the base path.
const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://brookesdigied.bitbucket.io";

const DESCRIPTION =
  "Turn any screenshot into a clear, polished image: backgrounds, frames, numbered steps, arrows, blur and more. Runs in your browser.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: "Screenshot Editor",
    template: "%s · Screenshot Editor",
  },
  description: DESCRIPTION,
  // The preview image is app/opengraph-image.png, which Next adds itself.
  openGraph: {
    type: "website",
    siteName: "Screenshot Editor",
    title: "Screenshot Editor",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the mobile tab bar pad itself clear of the iPhone home indicator.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script changes <html>'s class and style before React hydrates.
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        {/* Inline and blocking on purpose: it sets the saved theme before the
            first paint, so a dark page never flashes light. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
