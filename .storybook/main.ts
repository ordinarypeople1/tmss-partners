import type { StorybookConfig } from "@storybook/react-vite";

function storybookBase(): string {
  const pages = process.env.VITE_BASE ?? "/";
  const normalized = pages.endsWith("/") ? pages : `${pages}/`;
  return `${normalized}storybook/`;
}

const config: StorybookConfig = {
  stories: ["../stories/**/*.stories.tsx"],
  framework: "@storybook/react-vite",
  async viteFinal(viteConfig, { configType }) {
    if (configType === "PRODUCTION") {
      viteConfig.base = storybookBase();
    }
    return viteConfig;
  },
};

export default config;
