import type { Metadata } from "next";
import { Space_Grotesk, Lilita_One } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import VersionBadge from "@/components/layout/VersionBadge";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

// Chunky rounded display face for the in-game HUD (counters, buttons) —
// the bubbly look idle games use for big numbers.
const lilita = Lilita_One({
  variable: "--font-lilita",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://flexgames.vercel.app"),
  title: "Rubble",
  description: "Smash your way through an endless demolition site.",
  openGraph: {
    title: "Rubble",
    description: "Smash your way through an endless demolition site.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${lilita.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <main className="flex flex-1 flex-col">{children}</main>
        <Toaster />
        <VersionBadge />
      </body>
    </html>
  );
}
