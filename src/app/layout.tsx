import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cert-Ed Academia",
  icons: {
    icon: [
      { url: "/favicon/favicon_32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon/favicon_96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: "/favicon/favicon_152.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
