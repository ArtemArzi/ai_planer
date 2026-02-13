import { AnimatePresence, motion } from "framer-motion";
import type { Task } from "../api/tasks";
import { SwipeCard } from "./SwipeCard";

type SwipeDirection = "left" | "right" | "up" | "down";

type CardStackProps = {
  tasks: Task[];
  onSwipe: (taskId: string, direction: SwipeDirection) => void;
};

const PREVIEW_CARDS = 2;
const SCALE_FACTOR = 0.04;
const Y_OFFSET = 10;

export function CardStack({ tasks, onSwipe }: CardStackProps) {
  const visibleTasks = tasks.slice(0, PREVIEW_CARDS + 1);

  return (
    <div className="relative h-64 w-full px-5">
      <AnimatePresence mode="popLayout">
        {visibleTasks.map((task, index) => (
          <motion.div
            key={task.id}
            className="absolute inset-x-5"
            initial={{ opacity: 0, y: 30, scale: 0.92 }}
            animate={{
              scale: 1 - index * SCALE_FACTOR,
              y: index * Y_OFFSET,
              zIndex: visibleTasks.length - index,
              opacity: 1,
            }}
            exit={{
              opacity: 0,
              scale: 0.9,
              transition: { duration: 0.2 },
            }}
            transition={{ 
              type: "spring", 
              stiffness: 350, 
              damping: 28,
              mass: 0.8,
            }}
          >
            <SwipeCard
              task={task}
              isTop={index === 0}
              onSwipeComplete={(direction) => onSwipe(task.id, direction)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
