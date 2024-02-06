module.exports = {
  parser: {
    '\\.php$': '@markuplint/php-parser',
  },
  extends: ['markuplint:recommended'],
  rules: {
    'required-h1': false,
    'character-reference': false,
  },
  nodeRules: [
    {
      selector: 'html',
      rules: {
        'invalid-attr': false,
        'required-attr': false,
      },
    },
    {
      selector: 'head',
      rules: {
        'permitted-contents': false,
        'required-element': false,
      },
    },
  ],
};
