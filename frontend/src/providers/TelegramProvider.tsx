import { useEffect, type ReactNode } from "react";
import { init, miniApp, themeParams, viewport, swipeBehavior } from "@telegram-apps/sdk-react";

type TelegramProviderProps = {
  children: ReactNode;
};

export function TelegramProvider({ children }: TelegramProviderProps) {
  useEffect(() => {
    const cleanupInit = init();
    let cleanupThemeVars: VoidFunction | undefined;
    let cleanupViewportVars: VoidFunction | undefined;
    let disposed = false;

    if (miniApp.mount.isAvailable()) {
      miniApp.mount();
    }

    if (themeParams.mount.isAvailable()) {
      themeParams.mount();
    }

    if (themeParams.bindCssVars.isAvailable()) {
      cleanupThemeVars = themeParams.bindCssVars();
    }

    if (swipeBehavior.mount.isAvailable()) {
      swipeBehavior.mount();
    }

    if (swipeBehavior.disableVertical.isAvailable()) {
      swipeBehavior.disableVertical();
    }

    const mountViewport = async () => {
      try {
        if (viewport.mount.isAvailable()) {
          await viewport.mount();
        }

        if (disposed) {
          return;
        }

        if (viewport.bindCssVars.isAvailable()) {
          cleanupViewportVars = viewport.bindCssVars();
        }

        if (viewport.expand.isAvailable()) {
          viewport.expand();
        }

        if (viewport.requestFullscreen.isAvailable()) {
          try {
            await viewport.requestFullscreen();
          } catch {
            // ignore unsupported fullscreen on some clients
          }
        }

        setTimeout(() => {
          if (disposed) {
            return;
          }

          if (viewport.expand.isAvailable()) {
            viewport.expand();
          }

          if (viewport.requestFullscreen.isAvailable()) {
            void viewport.requestFullscreen().catch(() => undefined);
          }
        }, 250);
      } catch {
        return;
      }
    };

    void mountViewport();

    if (miniApp.ready.isAvailable()) {
      miniApp.ready();
    }

    return () => {
      disposed = true;
      cleanupViewportVars?.();
      cleanupThemeVars?.();
      cleanupInit?.();
    };
  }, []);

  return <>{children}</>;
}
