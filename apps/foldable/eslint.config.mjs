import baseConfig from '@lineage/eslint-config';

export default [
  // Generated / bundled output — not source we lint.
  { ignores: ['dist/**', 'android/**', 'ios/**', 'public/**'] },
  ...baseConfig,
];
