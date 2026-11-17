import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { AlertList, AssetCard, ClockBar, DataTable, NewsList, Stat } from "../src/ui/widgets";

const meta = {
  title: "Ledger",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Figures: Story = {
  render: () => (
    <div className="stat-strip">
      <Stat label="순자산가치" value="512억" tone="key" />
      <Stat label="미소진 약정" value="480억" />
      <Stat label="현금" value="−15억" tone="loss" />
    </div>
  ),
};

export const Table: Story = {
  render: () => (
    <DataTable
      columns={[
        { id: "name", label: "이름" },
        { id: "ebitda", label: "EBITDA", numeric: true },
        { id: "mark", label: "마크", numeric: true },
      ]}
      rows={[
        {
          id: "co-001",
          onOpen: () => undefined,
          cells: { name: "주식회사 라온제분", ebitda: "43억", mark: "338억" },
        },
        {
          id: "co-002",
          cells: { name: "주식회사 바르베어링", ebitda: "98억", mark: "662억" },
        },
      ]}
    />
  ),
};

export const Headlines: Story = {
  render: () => (
    <div className="split">
      <NewsList
        items={[
          {
            id: 1,
            template: "news.opening",
            week: 0,
            company_id: "",
            company_ko: "",
            period: "",
            tone: "neutral",
          },
          {
            id: 2,
            template: "news.ebitda_down",
            week: 13,
            company_id: "co-001",
            company_ko: "주식회사 라온제분",
            period: "2026Q1",
            tone: "down",
          },
        ]}
      />
      <AlertList
        items={[
          { template: "alert.fee", company_id: "", company_ko: "", deal_id: "" },
          {
            template: "alert.counter",
            company_id: "co-001",
            company_ko: "주식회사 라온제분",
            deal_id: "dl-001",
          },
        ]}
        onOpen={() => undefined}
      />
    </div>
  ),
};

export const Sites: Story = {
  render: () => (
    <div className="asset-grid">
      <AssetCard kind="factory" name="가온 식품단지 1공장" meta="장부 120억" />
      <AssetCard kind="warehouse" name="서부 냉장창고" meta="장부 40억" />
      <AssetCard kind="store" name="북안 점포" meta="장부 6억" />
    </div>
  ),
};

function ClockStory() {
  const [paused, setPaused] = useState(true);
  const [speed, setSpeed] = useState(1);
  return (
    <ClockBar
      year={2026}
      quarter={1}
      week={0}
      paused={paused}
      speed={speed}
      onToggle={() => setPaused((value) => !value)}
      onSpeed={setSpeed}
    />
  );
}

export const Clock: Story = {
  render: () => <ClockStory />,
};
