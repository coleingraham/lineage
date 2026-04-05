import baseConfig from '@lineage/eslint-config';

export default [{ ignores: ['src-tauri/**', 'server-sidecar/**', 'scripts/**'] }, ...baseConfig];
