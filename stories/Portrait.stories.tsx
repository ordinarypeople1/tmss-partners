import type { Meta, StoryObj } from "@storybook/react-vite";
import { useT } from "../src/i18n/useT";
import { Portrait, type Mood } from "../src/ui/Portrait";

const MOODS: Mood[] = ["neutral", "for", "hold", "against"];
const SEATS = [0, 1, 2, 3, 4, 5];

/** Seeds only: a face follows the hash of its seed, not the meaning of a name. */
const CROWD = Array.from({ length: 24 }, (_, index) => `seat ${index + 1}`);

const cell = { display: "grid", justifyItems: "center", gap: 4 } as const;

/** The six committee seats in each mood, at card size and at table size. */
function Committee() {
  const t = useT();
  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      {SEATS.map((seat) => (
        <div key={seat} className="card row" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: 120 }}>
            <strong>{t(`partner.${seat}.name`)}</strong>
            <div className="muted">{t(`partner.${seat}.role`)}</div>
          </div>
          {MOODS.map((mood) => (
            <Portrait key={mood} partner={seat} mood={mood} size={104} />
          ))}
          {MOODS.map((mood) => (
            <Portrait key={mood} partner={seat} mood={mood} size={52} />
          ))}
          {MOODS.map((mood) => (
            <Portrait key={mood} partner={seat} mood={mood} size={40} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Seeded faces: management teams, owners and colleagues. */
function Crowd({ size }: { size: number }) {
  return (
    <div className="card" style={{ maxWidth: 860 }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${size + 16}px, 1fr))`, gap: 12 }}>
        {CROWD.map((seed) => (
          <div key={seed} style={cell}>
            <Portrait seed={seed} size={size} />
          </div>
        ))}
        <div style={cell}>
          <Portrait size={size} />
        </div>
      </div>
    </div>
  );
}

const meta: Meta = { title: "Portrait" };
export default meta;

export const Partners: StoryObj = { render: () => <Committee /> };
export const Faces: StoryObj = { render: () => <Crowd size={96} /> };
export const FacesSmall: StoryObj = { render: () => <Crowd size={40} /> };
