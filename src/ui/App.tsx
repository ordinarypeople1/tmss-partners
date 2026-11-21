import { useEffect } from "react";
import { useT } from "../i18n/useT";
import { CompanyPanel } from "./CompanyPanel";
import { GameProvider, useGame } from "./game";
import { MapHub } from "./MapHub";
import { Shell } from "./Shell";
import { Title } from "./Title";
import { Career } from "./screens/Career";
import { Deals } from "./screens/Deals";
import { FundScreen } from "./screens/FundScreen";
import { Inbox } from "./screens/Inbox";
import { League } from "./screens/League";
import { Market } from "./screens/Market";
import { Portfolio } from "./screens/Portfolio";

function Screens() {
  const { screen } = useGame();
  switch (screen) {
    case "map":
      return <MapHub />;
    case "inbox":
      return <Inbox />;
    case "deals":
      return <Deals />;
    case "portfolio":
      return <Portfolio />;
    case "market":
      return <Market />;
    case "league":
      return <League />;
    case "fund":
      return <FundScreen />;
    case "career":
      return <Career />;
  }
}

export function App() {
  const t = useT();
  useEffect(() => {
    document.title = t("app.title");
  }, [t]);
  return (
    <GameProvider loading={<p className="boot">{t("app.loading")}</p>} failed={<p className="boot">{t("app.loadError")}</p>}
      title={(controls) => <Title {...controls} />}
    >
      <Shell panel={<CompanyPanel />}>
        <Screens />
      </Shell>
    </GameProvider>
  );
}
