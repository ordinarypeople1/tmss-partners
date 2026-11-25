import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { App } from "./App";
import { Studio } from "./Studio";
import "./styles.css";
import { applyTheme, currentTheme } from "./theme";

applyTheme(currentTheme());

const root = document.getElementById("root");
if (!root) {
  throw new Error("root element missing");
}

createRoot(root).render(
  <StrictMode>
    <LocaleProvider>
      <App />
      <Studio />
    </LocaleProvider>
  </StrictMode>,
);
