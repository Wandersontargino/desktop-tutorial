import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CoopSun | Propostas & Energia Solar",
  description: "Dimensione sistemas, construa propostas e mostre o valor da energia solar.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
