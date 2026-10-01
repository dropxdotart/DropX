import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import Navbar from "@/components/layout/Navbar";
import VersionBadge from "@/components/layout/VersionBadge";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
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
      className={`${spaceGrotesk.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Navbar />
        <main className="flex flex-1 flex-col">{children}</main>
        <Toaster />
        <VersionBadge />
      </body>
    </html>
  );
}
