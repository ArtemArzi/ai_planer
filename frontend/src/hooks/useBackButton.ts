import { useEffect } from "react";
import { backButton, useSignal } from "@telegram-apps/sdk-react";

export function useBackButton(onBack: () => void, enabled = true) {
  const isVisible = useSignal(backButton.isVisible);

  useEffect(() => {
    if (backButton.mount.isAvailable()) {
      backButton.mount();
    }

    if (!enabled) {
      if (backButton.hide.isAvailable()) {
        backButton.hide();
      }
      return;
    }

    if (backButton.show.isAvailable()) {
      backButton.show();
    }

    let cleanup: VoidFunction | undefined;
    if (backButton.onClick.isAvailable()) {
      cleanup = backButton.onClick(onBack);
    }

    return () => {
      cleanup?.();
      if (backButton.hide.isAvailable()) {
        backButton.hide();
      }
    };
  }, [enabled, onBack]);

  return { isVisible };
}
