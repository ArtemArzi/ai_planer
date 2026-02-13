import { hapticFeedback } from "@telegram-apps/sdk-react";

type ImpactStyle = "light" | "medium" | "heavy" | "rigid" | "soft";
type NotificationType = "success" | "warning" | "error";

export function useHaptic() {
  return {
    impact: (style: ImpactStyle = "light") => {
      if (hapticFeedback.impactOccurred.isAvailable()) {
        hapticFeedback.impactOccurred(style);
      }
    },
    notification: (type: NotificationType) => {
      if (hapticFeedback.notificationOccurred.isAvailable()) {
        hapticFeedback.notificationOccurred(type);
      }
    },
    selection: () => {
      if (hapticFeedback.selectionChanged.isAvailable()) {
        hapticFeedback.selectionChanged();
      }
    },
  };
}
