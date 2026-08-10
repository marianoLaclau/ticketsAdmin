import { createRoot } from "react-dom/client";

import App from "./App";
import { purgeLegacyAdminCredentialsFromBrowser } from "./lib/legacy-admin-credential-purge";

import "./index.css";

purgeLegacyAdminCredentialsFromBrowser(window);

createRoot(document.getElementById("root")!).render(<App />);
