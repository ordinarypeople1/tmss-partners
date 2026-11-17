import type { Meta, StoryObj } from "@storybook/react-vite";
import { useIntl } from "react-intl";
import { shortName } from "../src/ui/game/format";
import { MapPin } from "../src/ui/mapPin";
import { sampleCards } from "./sample";

function PinStory({ selected, warehouse }: { selected: boolean; warehouse: boolean }) {
  const intl = useIntl();
  const card = warehouse ? sampleCards[2] : sampleCards[0];
  return (
    <MapPin
      selected={selected}
      glyph={intl.formatMessage({ id: warehouse ? "pin.warehouse" : "pin.factory" })}
      ariaLabel={intl.formatMessage({ id: "pin.select" }, { name: shortName(card.legal_name_ko) })}
      onSelect={() => undefined}
    />
  );
}

const meta = {
  title: "Map pin",
  component: PinStory,
  args: { selected: false, warehouse: false },
} satisfies Meta<typeof PinStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Factory: Story = {};

export const FactorySelected: Story = {
  args: { selected: true },
};

export const Warehouse: Story = {
  args: { warehouse: true },
};

export const WarehouseSelected: Story = {
  args: { selected: true, warehouse: true },
};

export const Reduced: Story = {
  args: { selected: true },
  globals: { reducedMotion: "always" },
};
