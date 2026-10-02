import "./globals.css";
import { ToastProvider } from "./components/ui";

export const metadata = {
  title: "Juris Screening — HR Portal & Employee Assessment",
  description: "College hiring screening and candidate review for Juris Consultants.",
};

export default function RootLayout({ children }) {
  return <html lang="en">
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" />
    </head>
    <body><ToastProvider>{children}</ToastProvider></body>
  </html>;
}
