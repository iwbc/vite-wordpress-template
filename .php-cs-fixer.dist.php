<?php

$finder = (new PhpCsFixer\Finder())
    ->in(__DIR__);

return (new PhpCsFixer\Config())
    ->setRules([
        '@PSR12' => true,
        'trailing_comma_in_multiline' => ['after_heredoc' => true, 'elements' => ['arguments', 'array_destructuring', 'arrays', 'match', 'parameters']],
    ])
    ->setFinder($finder);
