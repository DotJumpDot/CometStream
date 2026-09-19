import React, { Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { AuthProvider } from "@/AuthContext";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import i18n from "./i18n";

import { PfpProvider } from "./PfpContext";
import { LogoProvider } from "./LogoContext";
import { FullScreenLoader } from "./components/Preloader";
import { ThemeProvider } from "./ThemeContext";
import { PWAModeProvider } from "./PWAContext";
import KeyboardShortcutsHelp from "@/components/KeyboardShortcutsHelp";
import ImageLightbox from "@/components/ImageLightbox";
import DesktopTitleBar from "@/components/DesktopTitleBar";
import CommandPalette from "@/components/CommandPalette";
import { ErrorBoundary } from "react-error-boundary";
import ErrorBoundaryFallback from "./components/ErrorBoundaryFallback";

export default function App() {
  const location = useLocation();
  return (
    <ErrorBoundary
      FallbackComponent={ErrorBoundaryFallback}
      onError={console.error}
      resetKeys={[location.pathname]}
    >
      <ThemeProvider>
        <PWAModeProvider>
          <Suspense fallback={<FullScreenLoader />}>
            <AuthProvider>
              <LogoProvider>
                <PfpProvider>
                  <I18nextProvider i18n={i18n}>
                    {/* Desktop shell only: themed title bar with window
                     * controls. Renders null in a normal browser. */}
                    <DesktopTitleBar />
                    {/* Keyed on the pathname so every route change remounts the
                     * wrapper and replays a short fade (see .page-transition-root
                     * in index.css). Opacity-only: transforms here would break
                     * position:fixed children (chat input bar, sidebars). */}
                    <div
                      key={location.pathname}
                      className="page-transition-root"
                    >
                      <Outlet />
                    </div>
                    <ToastContainer />
                    <KeyboardShortcutsHelp />
                    <ImageLightbox />
                    <CommandPalette />
                  </I18nextProvider>
                </PfpProvider>
              </LogoProvider>
            </AuthProvider>
          </Suspense>
        </PWAModeProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
