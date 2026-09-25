import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import "./globals.css";
import "./label.css";
import "./invoice.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  description: "CMS operasional pengiriman gerai",
  title: { default: "GeraiCUAN", template: "%s · GeraiCUAN" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html className={cn("font-sans", inter.variable)} lang="id">
      <body>
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
