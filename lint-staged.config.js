export default {
  '*.ts': () => 'tsc -p tsconfig.json --noEmit',
  '*.{js,ts}': 'eslint',
  '*.{css,scss}': 'stylelint',
};
