import type { Metadata, Viewport } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import DownloadAlertModal from "./components/DownloadAlertModal";
import { Inter } from "next/font/google";
const font = Inter({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Nexus-AI",
  description: "Nexus-AI-Frontend",
};

export const viewport: Viewport = {
  themeColor: "#080711",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn(
        "min-h-dvh bg-[#080711] antialiased",
        "font-sans",
        font.variable,
      )}
    >
      <body className="min-h-dvh flex flex-col bg-gradient-to-b from-black via-[#0d091a] to-[#080711] bg-no-repeat text-white">
        <DownloadAlertModal />
        {children}
      </body>
    </html>
  );
}
