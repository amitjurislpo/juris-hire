"use client";

import { PortalProvider, Shell } from "../portal";

export default function PortalLayout({ children }) {
  return <PortalProvider><Shell>{children}</Shell></PortalProvider>;
}
