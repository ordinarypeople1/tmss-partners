import type { Meta, StoryObj } from "@storybook/react-vite";
import { BuildingMark } from "../src/ui/BuildingMark";

function Marks() {
  return (
    <ul className="map-legend">
      {[1, 2, 3, 4, 5].map((tier) => (
        <li key={tier}>
          <BuildingMark tier={tier} />
          <span>{["소형", "중형", "대형", "타워", "캠퍼스"][tier - 1]}</span>
        </li>
      ))}
      <li>
        <BuildingMark tier={3} kind="warehouse" />
        <span>창고</span>
      </li>
      <li>
        <BuildingMark tier={3} kind="store" />
        <span>점포</span>
      </li>
      <li>
        <BuildingMark tier={4} tone="live" />
        <span>진행·보유</span>
      </li>
    </ul>
  );
}

const meta = {
  title: "Map marks",
  component: Marks,
} satisfies Meta<typeof Marks>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tiers: Story = {};
