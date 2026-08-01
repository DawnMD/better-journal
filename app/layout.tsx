import Providers from "@/components/providers";
import { TimeZoneSync } from "@/components/timezone-sync";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Geist_Mono, Inter, Newsreader } from "next/font/google";
import "../lib/orpc.server";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * The display and editor-body face.
 *
 * Newsreader over a display-only serif like Instrument Serif: it ships real text
 * weights, a true italic and an optical-size axis, so the *same* family can set a
 * 36px note title and the 18px body underneath it without either looking like a
 * headline font pressed into paragraph duty. That matters because the editor is
 * the screen this app exists for.
 *
 * Aliased in globals.css as `--font-serif` / `--font-heading`; the variable is
 * named after the family here so the @theme mapping is not a cycle.
 */
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Better Journal",
  description:
    "A clean, private journal to capture your thoughts, track your growth, and build better habits.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        geistMono.variable,
        newsreader.variable,
        "font-sans",
        inter.variable,
      )}
      suppressHydrationWarning
    >
      <body className="min-h-dvh flex flex-col">
        <NextThemesProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>
            {/* Publishes the browser's timezone so server prefetches can build
                the same query keys the client will. Renders nothing. */}
            <TimeZoneSync />
            {children}
            <Toaster />
          </Providers>
        </NextThemesProvider>
      </body>
    </html>
  );
}
