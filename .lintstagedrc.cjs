module.exports = {
  '*.ts': () => 'tsc -p tsconfig.json --noEmit',
  '*.{js,cjs,mjs,ts}': 'eslint',
  '*.{css,scss}': 'stylelint',
};
