import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "ApplyPilot",
  description: "Verified resume intelligence and careful job application automation"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
