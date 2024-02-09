<?php

function vite_assets()
{
  $env = json_decode(file_get_contents(get_theme_file_path('.vite/env.json')), true);
  if ($env === false) {
    throw new Exception('".vite/env.json" does not exist.');
  }

  $manifest_path = get_theme_file_path($env['MANIFEST_PATH']);

  define('VITE_IS_DEVELOPMENT', !file_exists($manifest_path));

  add_action('wp_enqueue_scripts', function () use ($env, $manifest_path) {
    if (VITE_IS_DEVELOPMENT) {
      wp_enqueue_script('main', "//{$env['VITE_SERVER']}/{$env['ENTRY_POINT']}", [], null, true);
    } else {
      $manifest = json_decode(file_get_contents($manifest_path), true) ?: [];
      if (isset($manifest[$env['ENTRY_POINT']])) {
        $manifest_entry_point = $manifest[$env['ENTRY_POINT']];
        wp_enqueue_script('main', get_theme_file_uri($manifest_entry_point['file']), [], null, true);
        foreach ($manifest_entry_point['css'] as $key => $css) {
          wp_enqueue_style('main-' . $key, get_theme_file_uri($css), [], null);
        }
      }
    }
  });

  if (VITE_IS_DEVELOPMENT) {
    add_filter('script_loader_tag', function ($tag, $handle, $src) {
      if ($handle !== 'main') {
        return $tag;
      }
      $tag = '<script type="module" src="' . esc_url($src) . '"></script>';
      return $tag;
    }, 10, 3);
  }
}

vite_assets();
