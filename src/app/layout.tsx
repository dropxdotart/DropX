import type { Metadata } from "next";
import { Space_Grotesk, Orbitron } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import Navbar from "@/components/layout/Navbar";
import BottomNav from "@/components/layout/BottomNav";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

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
  metadataBase: new URL("https://dropdotx.vercel.app"),
  title: "DropX",
  description: "A new challenge drops every day.",
  openGraph: {
    title: "DropX",
    description: "A new challenge drops every day.",
    images: ["/dropx-logo-full.png"],
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Navbar/BottomNav used to learn who's signed in via a client-side
  // useEffect fetch, which meant every page load flashed "signed out"
  // (no streak badge, a "Sign in" link) before that resolved — even though
  // the server rendering this exact request already knows the answer.
  // Fetching it once here and seeding both components with it removes that
  // flash entirely; they still listen for auth changes after mount for the
  // rare case a session changes without a full navigation.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("*").eq("id", user.id).single()
    : { data: null };

  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${orbitron.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <div className="ambient-glow pointer-events-none fixed inset-0 -z-10" />
        <Navbar initialUser={user} initialProfile={profile as Profile | null} />
        <main className="flex flex-1 flex-col pb-16">{children}</main>
        <BottomNav initialSignedIn={!!user} />
        <Toaster />
      </body>
    </html>
  );
}
