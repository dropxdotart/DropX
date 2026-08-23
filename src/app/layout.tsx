import type { Metadata } from "next";
import { Space_Grotesk, Orbitron } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import Navbar from "@/components/layout/Navbar";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "DropX",
  description: "A new challenge drops every day.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${orbitron.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <div className="ambient-glow pointer-events-none fixed inset-0 -z-10" />
        <Navbar />
        <main className="flex flex-1 flex-col">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
