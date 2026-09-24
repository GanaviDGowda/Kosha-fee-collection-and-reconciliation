import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge must know the custom scales in tailwind.config.ts; otherwise it treats
// "text-md" as a colour and drops it when merged with "text-ink".
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["xs", "sm", "base", "md", "lg", "xl", "2xl"] }],
      rounded: [{ rounded: ["panel"] }],
      shadow: [{ shadow: ["overlay"] }],
    },
  },
});

/** Joins class names and lets later Tailwind classes override earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
