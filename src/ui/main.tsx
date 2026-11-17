import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { App } from "./App";
import { GameProvider } from "./game/session";
import { applyTheme, readTheme } from "./theme";
import "./styles.css";

applyTheme(readTheme());

const root = document.getElementById("root");
if (!root) {
  throw new Error("root element missing");
}

createRoot(root).render(
  <StrictMode>
    <LocaleProvider>
      <GameProvider>
        <App />
      </GameProvider>
    </LocaleProvider>
  </StrictMode>,
);
