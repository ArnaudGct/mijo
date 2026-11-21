import next from 'eslint-config-next/core-web-vitals';
export default [
  ...next,
  { ignores: ['.next/**', 'data/**', 'test-results/**'] },
  { rules: { '@next/next/no-img-element': 'off' } },
];
