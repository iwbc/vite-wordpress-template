module.exports = {
  '*.ts': () => 'tsc -p tsconfig.json --noEmit',
  '*.{html,php}': 'markuplint',
  '*.{js,cjs,mjs,ts}': 'eslint',
  '*.{css,scss}': 'stylelint',
};
