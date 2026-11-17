import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Spark } from "../src/ui/rails";
import { ChoiceBar } from "../src/ui/widgets";

const meta = {
  title: "Terminal",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Board: Story = {
  render: function BoardStory() {
    const [board, setBoard] = useState("public");
    return (
      <div className="workspace">
        <p className="eyebrow">밸류에이션 지수</p>
        <p className="index-figure">104</p>
        <p className="muted">보통 100</p>
        <Spark values={[100, 102, 99, 104, 107, 103]} />
        <ChoiceBar
          label="보드"
          layoutId="story-board"
          value={board}
          onChange={setBoard}
          options={[
            { value: "public", label: "공개 보드 · 8" },
            { value: "firm", label: "하우스 소싱" },
          ]}
        />
        <ol className="created-list">
          <li>
            <span>나래정제</span>
            <span className="bar-track">
              <span className="bar-fill" style={{ transform: "scaleX(0.62)" }} />
            </span>
            <span className="num">120억 원</span>
          </li>
          <li>
            <span className="badge">급매</span>
            <span className="badge">실사 필요</span>
          </li>
        </ol>
      </div>
    );
  },
};
