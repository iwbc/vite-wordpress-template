<?php

define('VITE_ENV', json_decode(file_get_contents(get_theme_file_path('.vite/env.json')), true));
if (VITE_ENV === false) {
  throw new Exception('".vite/env.json" does not exist.');
}

define('VITE_IS_DEVELOPMENT', VITE_ENV['IS_DEVELOPMENT']);
define('THEME_URL', VITE_IS_DEVELOPMENT ? '' : get_theme_file_uri());

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

      // main.ts(js)とcssを読み込む
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
      // devではmain.tsをmoduleとして読み込む
      add_filter('script_loader_tag', function ($tag, $handle, $src) {
        if ($handle !== 'main') {
          return $tag;
        }
        $tag = '<script type="module" src="' . esc_url($src) . '"></script>';
        return $tag;
      }, 10, 3);
      // 正規のURLへのリダイレクトを無効化
      // 公開画面でのページ遷移でVite開発サーバーからからwp-envのサーバーにリダイレクトされてしまうのを防止
      remove_action('template_redirect', 'redirect_canonical');
      // URLを開発サーバーに書き換える
      add_filter('option_home', function ($url) {
        return is_admin() ? $url : 'http://' . VITE_ENV['VITE_DEV_SERVER'];
      }, 10, 1);
    }
  }
}

$Vite = new Vite();
