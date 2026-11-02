import type { Metadata } from "next";
import "../styles/globals.css";
import { LanguageProvider } from "../context/LanguageContext";
import { AuthProvider } from "../context/AuthContext";

export const metadata: Metadata = {
  title: "GRS Web Dashboard — Door-to-Door Skills Campaign 2026",
  description:
    "National and district field campaign monitoring, enumeration management, and progress reporting dashboard for the Democratic Socialist Republic of Sri Lanka.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.png" />
      </head>
      <body>
        <LanguageProvider>
          <AuthProvider>{children}</AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
