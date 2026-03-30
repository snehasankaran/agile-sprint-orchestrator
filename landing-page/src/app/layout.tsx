import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Agile Sprint Orchestrator — Agents for Impact",
  description:
    "A multi-agent AI system that automates all 7 Agile sprint phases. From backlog refinement to intelligence reporting.",
  openGraph: {
    title: "Agile Sprint Orchestrator — Agents for Impact",
    description:
      "We built 5 AI agents that run your entire sprint lifecycle.",
    images: ["/architecture.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: "dark" }}>
      <body
        className={inter.className}
        style={{ backgroundColor: "#030712", color: "#ffffff" }}
      >
        {children}
      </body>
    </html>
  );
}
