import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import pkg from "../package.json";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: `Pository - v${pkg.version}`,
  description: "A lightweight Debian package artifact repository management dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
