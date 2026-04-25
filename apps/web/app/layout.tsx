import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Source_Serif_4, Inter, JetBrains_Mono, Caveat } from "next/font/google";
import "./globals.css";

const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif", display: "swap" });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
const hand = Caveat({ subsets: ["latin"], variable: "--font-hand", display: "swap", weight: ["500", "600"] });

export const metadata: Metadata = {
  title: "Grade Sight",
  description: "Diagnostic grading for secondary math. Not just what — why.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${serif.variable} ${sans.variable} ${mono.variable} ${hand.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}
