import type { Metadata, Viewport } from "next";
import { SettingsProvider } from "@/context/SettingsContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Police Station Indoor Map",
  description: "Accessible indoor navigation for police stations in the UAE",
  manifest: "/manifest.json",
  icons: {
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1565c0",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <SettingsProvider>{children}</SettingsProvider>
      </body>
    </html>
  );
}
