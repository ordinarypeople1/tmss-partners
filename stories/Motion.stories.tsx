import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { CountUp } from "../src/ui/motion";
import { Segment, Skeleton, Stat } from "../src/ui/widgets";

const meta = {
  title: "Motion",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Elevation: Story = {
  render: function ElevationStory() {
    const [speed, setSpeed] = useState(1);
    const [nav, setNav] = useState(51200);
    return (
      <div className="workspace">
        <div className="stat-strip">
          <Stat
            label="순자산가치"
            value=""
            amount={nav}
            format={(next) => `${Math.round(next)}`}
            tone="key"
          />
          <Stat label="현금" value="−15억" tone="loss" />
        </div>
        <button type="button" className="btn-primary" onClick={() => setNav((value) => value + 1800)}>
          숫자 올리기
        </button>
        <Segment
          label="재생 속도"
          value={speed}
          options={[
            { value: 1, label: "1배" },
            { value: 2, label: "2배" },
            { value: 4, label: "4배" },
          ]}
          onChange={setSpeed}
        />
        <p className="muted">
          <CountUp value={nav} format={(next) => `${Math.round(next)}`} />
        </p>
        <div className="card" style={{ padding: 16 }}>
          카드
        </div>
        <div className="glass" style={{ padding: 16, borderRadius: 28 }}>
          유리층
        </div>
        <Skeleton label="불러오는 중" />
      </div>
    );
  },
};
