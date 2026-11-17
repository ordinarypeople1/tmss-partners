import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bookmark, ChevronRight, Pause } from "lucide-react";
import { IconButton, Rating } from "../src/ui/widgets";

const meta = { title: "Shell" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Controls: Story = {
  render: () => (
    <div className="workspace">
      <div className="top-actions">
        <IconButton label="멈춤">
          <Pause size={18} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
        <IconButton label="2배" pressed>
          <span className="chevs" aria-hidden="true">
            <ChevronRight size={14} strokeWidth={1.75} />
            <ChevronRight size={14} strokeWidth={1.75} />
          </span>
        </IconButton>
        <button type="button" className="btn-primary continue">
          계속
        </button>
        <IconButton label="관심" pressed>
          <Bookmark size={18} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
      </div>
      <div className="rating-row">
        <Rating score={16} label="성장 16" />
        <Rating score={11} label="해자 11" />
        <Rating score={null} label="경영" />
      </div>
    </div>
  ),
};
