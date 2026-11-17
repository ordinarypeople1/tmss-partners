import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

export const spring = { type: "spring" as const, stiffness: 460, damping: 32, mass: 0.7 };

export const press = {
  whileHover: { y: -2 },
  whileTap: { scale: 0.97 },
  transition: spring,
};

export const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.02 } },
};

export const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: spring },
};

export function useMotionReady() {
  const reduce = useReducedMotion();
  return !reduce;
}

export function CountUp({ value, format }: { value: number; format: (next: number) => string }) {
  const reduce = useReducedMotion();
  const from = useRef(value);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (reduce || start === value) {
      setShown(value);
      return;
    }
    const controls = animate(start, value, {
      duration: 0.65,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (next) => setShown(next),
    });
    return () => controls.stop();
  }, [reduce, value]);
  return <>{format(shown)}</>;
}
