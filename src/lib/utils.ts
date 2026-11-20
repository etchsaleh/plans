import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** Our iOS Dynamic Type sizes are `text-*` utilities; teach tailwind-merge they're font sizes, not colours. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "large-title", "title1", "title2", "title3", "headline", "body",
            "callout", "subhead", "footnote", "caption1", "caption2",
          ],
        },
      ],
    },
  },
});

/** Tailwind class merge helper (also what vendored Spell UI components import). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
