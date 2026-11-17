import type { Preview } from "@storybook/react-vite";
import { MotionConfig } from "motion/react";
import { LocaleProvider } from "../src/i18n/LocaleProvider";
import "../src/ui/styles.css";

const preview: Preview = {
  initialGlobals: {
    reducedMotion: "user",
  },
  globalTypes: {
    reducedMotion: {
      description: "Reduced motion",
      toolbar: {
        title: "Motion",
        icon: "play",
        items: [
          { value: "user", title: "System" },
          { value: "always", title: "Reduce" },
          { value: "never", title: "Motion" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const raw = context.globals.reducedMotion;
      const mode = raw === "always" || raw === "never" ? raw : "user";
      return (
        <LocaleProvider>
          <MotionConfig reducedMotion={mode}>
            <div data-reduced-motion={mode}>
              <Story />
            </div>
          </MotionConfig>
        </LocaleProvider>
      );
    },
  ],
  parameters: {
    layout: "padded",
  },
};

export default preview;
