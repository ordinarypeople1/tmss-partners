import type { Meta, StoryObj } from "@storybook/react-vite";
import { useT } from "../src/i18n/useT";
import {
  Bridge,
  CycleClock,
  Donut,
  Funnel,
  Gauge,
  LineChart,
  Meter,
  Radar,
  Rating,
  Ring,
  Sparkline,
  StackBar,
  Stat,
  Tag,
  Tower,
  Treemap,
} from "../src/ui/charts";
import { useFormat } from "../src/ui/format";

/** The chart kit on sample numbers. Labels come from the Korean catalog. */
function Kit() {
  const t = useT();
  const f = useFormat();
  const revenue = [8200, 8350, 8300, 8600, 8900, 9100, 9050, 9400, 9800, 10100, 10050, 10400];
  const ebitda = revenue.map((value, index) => Math.round(value * (0.13 + index * 0.003)));
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <div className="card grid cols-4">
        <Stat label={t("term.revenue")} value={f.money(118_000)} delta={f.signedPct(640)} tone="good" />
        <Stat label={t("term.ebitda")} value={f.money(17_400)} delta={f.signedPct(-210)} tone="bad" />
        <Stat label={t("term.moic")} value={f.multiple(2_300, 2)} tone="good" />
        <Stat label={t("term.irr")} value={f.pct(2_140)} hint={t("term.ttm")} />
      </div>
      <div className="card row">
        <Sparkline values={revenue} fill />
        <Sparkline values={ebitda} color="var(--good)" />
        <Ring fraction={0.6}>3</Ring>
        <Ring fraction={0.2} tone="bad">
          1
        </Ring>
        <Tag tone="good">{t("outcome.approved")}</Tag>
        <Tag tone="warn">{t("outcome.held")}</Tag>
        <Tag tone="bad">{t("outcome.rejected")}</Tag>
        <Tag tone="accent">{t("stage.bidding")}</Tag>
      </div>
      <div className="card">
        <LineChart
          series={[
            { label: t("term.revenue"), values: revenue },
            { label: t("term.ebitda"), values: ebitda },
          ]}
          format={f.money}
        />
      </div>
      <div className="card grid cols-2">
        <StackBar
          title={t("term.ev")}
          total={f.money(130_000)}
          parts={[
            { label: t("term.debt"), value: 60_000, note: f.money(60_000) },
            { label: t("term.equity"), value: 70_000, note: f.money(70_000) },
          ]}
        />
        <Tower
          parts={[
            { label: t("term.debt"), value: 60_000, note: f.multiple(3_500) },
            { label: t("term.equity"), value: 70_000, note: f.pct(5_400) },
          ]}
        />
      </div>
      <div className="card">
        <Bridge
          start={{ label: t("term.equity"), value: 70_000 }}
          steps={[
            { label: t("term.ebitda"), value: 38_000 },
            { label: t("term.multiple"), value: -9_000 },
            { label: t("term.debt"), value: 24_000 },
          ]}
          end={{ label: t("term.nav"), value: 123_000 }}
          format={f.money}
        />
      </div>
      <div className="card row">
        <Gauge value={4_600} max={8_000} limit={5_500} label={t("term.leverage")} text={f.multiple(4_600)} limitText={f.multiple(5_500)} />
        <Gauge value={6_100} max={8_000} limit={5_500} label={t("term.leverage")} text={f.multiple(6_100)} limitText={f.multiple(5_500)} />
        <Gauge value={2_400} max={6_000} limit={1_500} higherIsWorse={false} label={t("term.cover")} text={f.multiple(2_400)} />
        <Donut
          parts={[
            { label: t("term.debt"), value: 40 },
            { label: t("term.cash"), value: 35 },
            { label: t("term.fcf"), value: 25 },
          ]}
        >
          <b>{f.money(1_200)}</b>
        </Donut>
        <CycleClock
          phases={["expansion", "slowdown", "recession", "recovery"].map((id) => ({ id, label: t(`phase.${id}`) }))}
          current="slowdown"
          progress={0.4}
        />
      </div>
      <div className="card grid cols-2">
        <div className="stack">
          <Meter value={62} max={100} label={t("term.relationship")} text="62" marker={60} tone="good" />
          <Rating value={14} label={t("partner.4.role")} />
          <Rating value={7} label={t("partner.1.role")} />
          <Rating value={null} label={t("term.unknown")} />
        </div>
        <Radar
          axes={[
            { label: t("term.margin"), value: 0.7 },
            { label: t("term.growth"), value: 0.5 },
            { label: t("term.leverage"), value: 0.4 },
            { label: t("term.cover"), value: 0.8 },
            { label: t("term.fcf"), value: 0.6 },
          ]}
        />
      </div>
      <div className="card grid cols-2">
        <Treemap
          items={["US-MI", "US-OH", "US-IL", "US-TX", "US-CA", "US-GA"].map((code, index) => ({
            id: code,
            label: t(`admin1.${code}`),
            value: 90 - index * 12,
            note: f.pct((90 - index * 12) * 40),
          }))}
        />
        <Funnel
          stages={["preparing", "marketing", "bidding", "exclusive"].map((id, index) => ({
            id,
            label: t(`stage.${id}`),
            count: 9 - index * 2,
          }))}
          active="bidding"
        />
      </div>
    </div>
  );
}

const meta = {
  title: "Chart kit",
  component: Kit,
} satisfies Meta<typeof Kit>;

export default meta;
type Story = StoryObj<typeof meta>;

export const All: Story = {};
