import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.lineage.foldable',
  appName: 'Lineage Foldable',
  webDir: 'dist',
  plugins: {
    CapacitorSQLite: {
      // Default location for the file-based on-device database.
      iosDatabaseLocation: 'Library/LineageFoldable',
      androidIsEncryption: false,
    },
  },
};

export default config;
