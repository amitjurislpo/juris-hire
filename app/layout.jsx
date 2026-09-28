import "./globals.css";
import "./future.css";

export const metadata = {
  title: "Juris Hire | Screening workspace",
  description: "College hiring screening and candidate review workspace for Juris Consultants.",
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}