import { createRoot } from "react-dom/client";
import "./index.css";
import LandingPage from "./pages/LandingPage";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found");
}

createRoot(rootElement).render(<LandingPage />);
