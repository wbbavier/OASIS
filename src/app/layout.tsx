import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OASIS",
  description: "A weekly turn-based civilization simulation game",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-stone-950 text-stone-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
