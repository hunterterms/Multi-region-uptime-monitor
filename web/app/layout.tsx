import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "flaky-target status",
  description:
    "live status of flaky-target, check every min from 3 AWS regions",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
