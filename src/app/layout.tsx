import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Cert-Ed Academia",
  icons: {
    icon: [
      {
        url: "/icon/icon_color.svg?v=4",
        media: "(prefers-color-scheme: light)",
        type: "image/svg+xml",
      },
      {
        url: "/icon/icon_white.png?v=4",
        media: "(prefers-color-scheme: dark)",
        type: "image/png",
      },
      {
        url: "/favicon/favicon_96.png?v=4",
        sizes: "96x96",
        type: "image/png",
        media: "not all",
      },
    ],
    apple: "/favicon/favicon_152.png?v=4",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
