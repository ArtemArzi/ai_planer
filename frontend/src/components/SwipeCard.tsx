import { useState } from "react";
import { motion, useMotionValue, useTransform, animate, type PanInfo, type MotionValue } from "framer-motion";
import type { Task } from "../api/tasks";
import { useHaptic } from "../hooks/useHaptic";
import { ConfirmSheet } from "./ConfirmSheet";
import { DeadlineIndicator } from "./DeadlineIndicator";
import { FolderBadge } from "./FolderBadge";

import { useUIStore } from "../stores/uiStore";

type SwipeDirection = "left" | "right" | "up" | "down";

type SwipeCardProps = {
  task: Task;
  onSwipeComplete: (direction: SwipeDirection) => void;
  isTop: boolean;
};

const SWIPE_THRESHOLD = 45;
const SWIPE_DOWN_THRESHOLD = 90;
const SWIPE_LOCK_THRESHOLD = 15;
const ROTATION_FACTOR = 12;
const EXIT_DISTANCE = 400;

function SwipeOverlay({
  opacity,
  className,
  icon,
}: {
  opacity: MotionValue<number>;
  className: string;
  icon: string;
}) {
  return (
    <motion.div
      style={{ opacity }}
      className={`pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl ${className}`}
    >
      <span className="material-symbols-outlined text-4xl">{icon}</span>
    </motion.div>
  );
}

export function SwipeCard({ task, onSwipeComplete, isTop }: SwipeCardProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-ROTATION_FACTOR, ROTATION_FACTOR]);
  const scale = useTransform(
    [x, y],
    ([latestX, latestY]: number[]) => {
      const distance = Math.sqrt(latestX * latestX + latestY * latestY);
      return Math.max(0.95, 1 - distance / 1000);
    }
  );
  
  const rightOverlay = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const leftOverlay = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);
  const upOverlay = useTransform(y, [-SWIPE_THRESHOLD, 0], [1, 0]);
  const downOverlay = useTransform(y, [0, SWIPE_DOWN_THRESHOLD], [0, 1]);

  const haptic = useHaptic();
  const setIsDraggingTask = useUIStore((state) => state.setIsDraggingTask);
  const [swipeLocked, setSwipeLocked] = useState<"horizontal" | "vertical" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const handleDrag = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (
      !swipeLocked &&
      (Math.abs(info.offset.x) > SWIPE_LOCK_THRESHOLD || Math.abs(info.offset.y) > SWIPE_LOCK_THRESHOLD)
    ) {
      if (Math.abs(info.offset.x) > Math.abs(info.offset.y)) {
        setSwipeLocked("horizontal");
      } else {
        setSwipeLocked("vertical");
      }
    }
  };

  const animateExit = (direction: SwipeDirection) => {
    setIsExiting(true);
    
    const exitX = direction === "right" ? EXIT_DISTANCE : direction === "left" ? -EXIT_DISTANCE : 0;
    const exitY = direction === "up" ? -EXIT_DISTANCE : direction === "down" ? EXIT_DISTANCE : 0;
    const exitRotate = direction === "right" ? 20 : direction === "left" ? -20 : 0;

    Promise.all([
      animate(x, exitX, { type: "spring", stiffness: 400, damping: 30 }),
      animate(y, exitY, { type: "spring", stiffness: 400, damping: 30 }),
      animate(rotate, exitRotate, { type: "spring", stiffness: 400, damping: 30 }),
    ]).then(() => {
      onSwipeComplete(direction);
    });
  };

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setSwipeLocked(null);

    if (isExiting) return;

    const { offset, velocity } = info;
    const swipeForce = Math.abs(offset.x) + Math.abs(velocity.x) * 0.3;
    const swipeForceY = Math.abs(offset.y) + Math.abs(velocity.y) * 0.3;
    
    let direction: SwipeDirection | null = null;

    if (offset.x > SWIPE_THRESHOLD || (offset.x > 25 && swipeForce > 100)) {
      direction = "right";
    } else if (offset.x < -SWIPE_THRESHOLD || (offset.x < -25 && swipeForce > 100)) {
      direction = "left";
    } else if (offset.y < -SWIPE_THRESHOLD || (offset.y < -25 && swipeForceY > 100)) {
      direction = "up";
    } else if (offset.y > SWIPE_DOWN_THRESHOLD || (offset.y > 60 && swipeForceY > 200)) {
      direction = "down";
    }

    if (!direction) {
      animate(x, 0, { type: "spring", stiffness: 500, damping: 30 });
      animate(y, 0, { type: "spring", stiffness: 500, damping: 30 });
      return;
    }

    if (direction === "down") {
      haptic.notification("warning");
      setConfirmOpen(true);
      animate(x, 0, { type: "spring", stiffness: 500, damping: 30 });
      animate(y, 0, { type: "spring", stiffness: 500, damping: 30 });
      return;
    }

    haptic.impact("medium");
    animateExit(direction);
  };

  return (
    <>
      <motion.div
        className="absolute w-full"
        style={{ x, y, rotate, scale }}
        drag={isTop && !isExiting}
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0.8}
        onDrag={handleDrag}
        onDragStart={() => setIsDraggingTask(true)}
        onDragEnd={(e, info) => {
          setIsDraggingTask(false);
          handleDragEnd(e, info);
        }}
        whileDrag={{ cursor: "grabbing" }}
      >
        <motion.div 
          className="relative overflow-hidden rounded-2xl border border-black/5 bg-tg-secondary-bg p-5 shadow-lg"
          initial={{ opacity: 1 }}
          animate={{ opacity: isExiting ? 0 : 1 }}
          transition={{ duration: 0.15, delay: 0.1 }}
        >
          <div className="mb-3">
            <FolderBadge folder={task.folder} size="sm" />
          </div>
          <p className="text-base leading-relaxed text-tg-text line-clamp-3">{task.content}</p>
          <div className="mt-3 flex items-center gap-2">
            {task.deadline && <DeadlineIndicator deadline={task.deadline} />}
          </div>

          <SwipeOverlay opacity={rightOverlay} className="bg-green-500/20 text-green-500" icon="check" />
          <SwipeOverlay opacity={leftOverlay} className="bg-yellow-500/20 text-yellow-500" icon="schedule" />
          <SwipeOverlay opacity={upOverlay} className="bg-blue-500/20 text-blue-500" icon="event" />
          <SwipeOverlay opacity={downOverlay} className="bg-red-500/20 text-red-500" icon="delete" />
        </motion.div>
      </motion.div>

      <ConfirmSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => animateExit("down")}
      />
    </>
  );
}
