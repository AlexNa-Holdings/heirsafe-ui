import { useEffect, useState } from "react";
import { SafeAppProvider } from "@safe-global/safe-apps-provider";
import SafeAppsSDK from "@safe-global/safe-apps-sdk";
import type { SafeInfo } from "@safe-global/safe-apps-sdk"; // <-- type-only import

export function useSafeApp() {
  const [isSafeApp, setIsSafeApp] = useState(false);
  const [sdk, setSdk] = useState<SafeAppsSDK | null>(null);
  const [safe, setSafe] = useState<SafeInfo | null>(null);
  const [provider, setProvider] = useState<any>(null); // EIP-1193

  useEffect(() => {
    if (window.parent !== window) {
      const s = new SafeAppsSDK();
      setSdk(s);
      s.safe
        .getInfo()
        .then((info) => {
          setIsSafeApp(true);
          setSafe(info);
          setProvider(new SafeAppProvider(info, s));
        })
        .catch(() => setIsSafeApp(false));
    }
  }, []);

  return { isSafeApp, sdk, safe, provider };
}
