import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import Navbar from "@/components/layout/Navbar";
import { createClient } from "@/lib/supabase/server";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://dropdotx.vercel.app"),
  title: "FleX",
  description: "Party games with your friends, right from your phones.",
  openGraph: {
    title: "FleXGames",
    description: "Party games with your friends, right from your phones.",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Seeded from the server so Navbar has no signed-out flash on load — it
  // still listens for auth changes itself for the rare case a session
  // changes without a full navigation.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Navbar initialUser={user} />
        <main className="flex flex-1 flex-col">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
