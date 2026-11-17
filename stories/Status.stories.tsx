import type { Meta, StoryObj } from "@storybook/react-vite";
import { CompanyStatus } from "../src/ui/companyStatus";

const meta = {
  title: "Company status",
  component: CompanyStatus,
  args: { state: "loading" },
} satisfies Meta<typeof CompanyStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};

export const Empty: Story = {
  args: { state: "empty" },
};

export const Error: Story = {
  args: { state: "error" },
};
