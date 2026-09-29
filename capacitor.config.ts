import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.gp3gp.converter",
  appName: "3GP Converter",
  // webDir is only a placeholder — the app loads the published site below,
  // and all conversion happens on-device in the web layer.
  webDir: "public",
  server: {
    url: "https://convert3gp.lovable.app",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
