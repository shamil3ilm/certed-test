import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cert-Ed Academia | Online Tuition for CBSE & ICSE Students",
  description: "Cert-Ed Academia offers personalised one-to-one online tuition for CBSE and ICSE students. Expert tutors, flexible timings, and exam-focused learning for students in India and GCC.",
  keywords: [
    "online tuition",
    "CBSE tuition",
    "ICSE tuition",
    "one-to-one classes",
    "online classes India",
    "online tuition GCC",
    "personalised learning",
    "student mentoring"
  ],
  openGraph: {
    title: "Cert-Ed Academia",
    description: "Personalised online tuition for CBSE & ICSE students",
    url: "https://yourdomain.com",
    siteName: "Cert-Ed Academia",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.className} antialiased min-h-screen flex flex-col bg-white text-gray-900`}
      >
        <Navbar />
        <main className="flex-grow">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
