import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { THEME_COOKIE } from "@/lib/constants";

export const metadata: Metadata = {
  title: {
    default: "SH-DOS Control Center",
    template: "%s · SH-DOS Control Center",
  },
  description: "Star Hindis Digital Operating System control center",
};

export const viewport: Viewport = {
  themeColor: "light",
  colorScheme: "light dark",
};

const themeScript = `(function(){try{var t=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);var theme=t?decodeURIComponent(t[1]):null;if(theme!=='dark'&&theme!=='light'){theme=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=theme;}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
