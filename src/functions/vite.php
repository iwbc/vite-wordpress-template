<?php

define('VITE_ENV', json_decode(file_get_contents(get_theme_file_path('.vite/env.json')), true));
if (VITE_ENV === false) {
  throw new Exception('".vite/env.json" does not exist.');
}

define('VITE_IS_DEVELOPMENT', VITE_ENV['IS_DEVELOPMENT']);

class Vite
{
  private $manifest;

  function __construct()
  {
    $manifest_exists = file_exists(get_theme_file_path(VITE_ENV['MANIFEST_PATH']));

    $this->manifest = !VITE_IS_DEVELOPMENT && $manifest_exists ? json_decode(file_get_contents(get_theme_file_path(VITE_ENV['MANIFEST_PATH'])), true) ?? [] : [];
    $this->init();
  }

  private function init()
  {
    add_action('wp_enqueue_scripts', function () {
      $server = VITE_ENV['VITE_DEV_SERVER'];
      $entry_point = VITE_ENV['ENTRY_POINT'];

      if (VITE_IS_DEVELOPMENT) {
        wp_enqueue_script('main', "//{$server}/{$entry_point}", [], null, true);
      } else {
        if (isset($this->manifest[$entry_point])) {
          $manifest_entry_point = $this->manifest[$entry_point];
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
    } else {
      add_action('wp_footer', function () {
        $spritemapsvg_path = get_theme_file_path($this->manifest['spritemap.svg']['file']);
        if (file_exists($spritemapsvg_path)) {
          echo str_replace('<svg', '<svg aria-hidden="true" style="position: absolute; width: 0; height: 0; overflow: hidden;"', file_get_contents($spritemapsvg_path));
        }
      });
    }
  }

  public static function theme_url()
  {
    return VITE_IS_DEVELOPMENT ? '' : get_theme_file_uri();
  }

  public static function home_url($path = '')
  {
    $url = parse_url(home_url());
    $server = $url['host'] . (isset($url['port']) ? ":{$url['port']}" : '');
    return VITE_IS_DEVELOPMENT
      ? str_replace($server, VITE_ENV['VITE_DEV_SERVER'], home_url($path))
      : home_url($path);
  }
}

$Vite = new Vite();
