import "./globals.css";
import { ToastProvider } from "./components/ui";

export const metadata = {
  title: "Juris Screening — HR Portal & Employee Assessment",
  description: "Hiring screening and candidate review for Juris Consultants.",
};

export const viewport = { themeColor: "#F7F5F0" };

export default function RootLayout({ children }) {
  return <html lang="en">
    <body><ToastProvider>{children}</ToastProvider></body>
  </html>;
}
