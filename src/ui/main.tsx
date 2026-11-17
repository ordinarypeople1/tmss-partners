import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("root element missing");
}

createRoot(root).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>,
);
