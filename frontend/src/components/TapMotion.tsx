import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface TapMotionProps {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

export function TapMotion({ children, className, disabled }: TapMotionProps) {
  if (disabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      whileTap={{ scale: 0.96, opacity: 0.9 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={`gpu-accelerated ${className ?? ""}`}
    >
      {children}
    </motion.div>
  );
}
