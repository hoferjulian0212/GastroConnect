import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installErrorReporter } from "./lib/errorReporter";

installErrorReporter();

// Register the service worker app-wide (not just from the push-notification
// settings) so the app shell & assets are cached and a cold PWA restart is
// near-instant even on a slow connection.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(<App />);
