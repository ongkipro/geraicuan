import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GeraiCUAN",
  description: "CMS operasional outlet pengiriman",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
