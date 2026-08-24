import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Calculator from "../app/Calculator";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Calculator />
  </StrictMode>,
);
