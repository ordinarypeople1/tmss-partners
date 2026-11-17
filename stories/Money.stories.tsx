import type { Meta, StoryObj } from "@storybook/react-vite";
import { MoneySamples } from "../src/ui/moneySamples";

const meta = {
  title: "Money",
  component: MoneySamples,
} satisfies Meta<typeof MoneySamples>;

export default meta;
type Story = StoryObj<typeof meta>;

export const KoreanCatalog: Story = {};
