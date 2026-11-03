import type { Metadata } from "next";
import "../styles/globals.css";
import { LanguageProvider } from "../context/LanguageContext";
import { AuthProvider } from "../context/AuthContext";

export const metadata: Metadata = {
  title: "GRS Web Dashboard — Door-to-Door Skills Campaign 2026",
  description:
    "National and district field campaign monitoring, enumeration management, and progress reporting dashboard for the Democratic Socialist Republic of Sri Lanka.",
};

const isProd = process.env.NODE_ENV === "production";
const apiOrigin =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  (isProd ? "http://localhost:3000" : "http://localhost:3000");

// In development, Next.js HMR requires 'unsafe-inline' and 'unsafe-eval'.
// In production, postbuild generation computes sha256 hashes for all static scripts,
// strictly disallowing 'unsafe-inline' and 'unsafe-eval', and restricting connect-src to the exact API origin.
const scriptSrc = isProd ? "'self'" : "'self' 'unsafe-inline' 'unsafe-eval'";
const cspPolicy = `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; connect-src 'self' ${apiOrigin}; font-src 'self' https://fonts.gstatic.com data:; object-src 'none';`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.png" />
        <meta httpEquiv="Content-Security-Policy" content={cspPolicy} />
      </head>
      <body>
        <LanguageProvider>
          <AuthProvider>{children}</AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
