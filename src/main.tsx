import React from "react";
import ReactDOM from "react-dom/client";
import WalletRoot from "./wallet/WagmiProvider";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WalletRoot>
      <App />
    </WalletRoot>
  </React.StrictMode>
);
