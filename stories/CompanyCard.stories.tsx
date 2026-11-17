import type { Meta, StoryObj } from "@storybook/react-vite";
import { CompanyCardView } from "../src/ui/companyCardView";
import { quoteCompany } from "../src/sim/wasm";
import { quotedFood, sampleCards, sampleSeed } from "./sample";

const meta = {
  title: "Company card",
  component: CompanyCardView,
  args: {
    card: sampleCards[0],
    seed: sampleSeed,
    quoted: quotedFood,
    error: false,
  },
} satisfies Meta<typeof CompanyCardView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Pending: Story = {
  args: { quoted: null, error: false },
};

export const Failed: Story = {
  args: { quoted: null, error: true },
};

export const LongName: Story = {
  args: {
    card: {
      ...sampleCards[0],
      legal_name_ko: "주식회사 아주긴이름의발효식품과냉장물류복합법인",
      complex_name_ko: "서부 아주긴 식품 제조 단지 제2",
      region_label_ko: "경기도 서부 연안 산업단지 인근",
    },
  },
};

export const Reduced: Story = {
  globals: { reducedMotion: "always" },
};

export const FromSimulator: Story = {
  args: { quoted: null },
  loaders: [
    async () => {
      const card = sampleCards[0];
      const quoted = await quoteCompany(
        card.ebitda,
        card.model_multiple_millis,
        card.debt,
        card.cash,
      );
      return { quoted };
    },
  ],
  render: (args, context) => (
    <CompanyCardView {...args} quoted={context.loaded.quoted} error={false} />
  ),
};
