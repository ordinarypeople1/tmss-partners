import type { Meta, StoryObj } from "@storybook/react-vite";
import { CompanyList } from "../src/ui/companyList";
import { sampleCards } from "./sample";

const meta = {
  title: "Company list",
  component: CompanyList,
  args: {
    cards: sampleCards,
    selectedId: sampleCards[0]?.id ?? "",
    onSelect: () => undefined,
  },
} satisfies Meta<typeof CompanyList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Selected: Story = {};

export const SecondSelected: Story = {
  args: { selectedId: sampleCards[1]?.id ?? "" },
};

export const Empty: Story = {
  args: { cards: [], selectedId: "" },
};
