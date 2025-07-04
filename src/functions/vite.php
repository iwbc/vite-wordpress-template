<?php
class Vite
{
  private $manifest;
  private $entry_points;
  private $dev_server;
  public $is_development;

  function __construct()
  {
    $vite_env = json_decode(file_get_contents(get_theme_file_path('.vite/env.json')), true);

    if ($vite_env === false) {
      throw new Exception('".vite/env.json" does not exist.');
    }

    $is_development = $vite_env['IS_DEVELOPMENT'];

    $manifest_exists = file_exists(get_theme_file_path($vite_env['MANIFEST_PATH']));
    $this->manifest = !$is_development && $manifest_exists ? json_decode(file_get_contents(get_theme_file_path($vite_env['MANIFEST_PATH'])), true) ?? [] : [];
    $this->dev_server = $vite_env['VITE_DEV_SERVER'];
    $this->entry_points = $vite_env['ENTRY_POINTS'];
    $this->is_development = $is_development;

    define('THEME_URL', $is_development ? '' : get_theme_file_uri());

    $this->init();
  }

  private function init()
  {
    /**
     * グローバルなエントリーポイントを読み込む
     */
    add_action('wp_enqueue_scripts', function () {
      // for dev
      if ($this->is_development) {
        foreach ($this->entry_points as $name => $entry_point) {
          if (isset($entry_point['global']) && $entry_point['global']) {
            $ext = pathinfo($entry_point['path'], PATHINFO_EXTENSION);

            // エントリーポイントのスクリプトを読み込む
            if ($entry_point['type'] === 'script') {
              wp_enqueue_script_module("{$name}", "//{$this->dev_server}/{$entry_point['path']}", [], null, true);
            }
            // エントリーポイントのスタイルを読み込む
            elseif ($entry_point['type'] === 'style') {
              wp_enqueue_style($name, "//{$this->dev_server}/{$entry_point['path']}", [], null);
            }
          }
        }
      }
      // for not dev
      else {
        $scriptStyles = [];

        foreach ($this->entry_points as $name => $entry_point) {
          if (isset($entry_point['global']) && $entry_point['global']) {
            if (isset($this->manifest[$entry_point['path']])) {
              $manifest_entry_point = $this->manifest[$entry_point['path']];
              $ext = pathinfo($entry_point['path'], PATHINFO_EXTENSION);

              // エントリーポイントのスクリプトを読み込む
              if ($entry_point['type'] === 'script') {
                wp_enqueue_script_module($name, get_theme_file_uri($manifest_entry_point['file']), [], null, true);
                if (isset($manifest_entry_point['css'])) {
                  // スクリプトに関連付けられたCSSは最後に読み込むため一旦配列に入れておく
                  foreach ($manifest_entry_point['css'] as $key => $css) {
                    $scriptStyles["{$name}-{$key}"] = $css;
                  }
                }
              }
              // エントリーポイントのスタイルを読み込む
              elseif ($entry_point['type'] === 'style') {
                wp_enqueue_style($name, get_theme_file_uri($manifest_entry_point['file']), [], null);
              }
            }
          }
        }

        // スクリプトに関連付けられたCSSを読み込む
        foreach ($scriptStyles as $name => $file) {
          wp_enqueue_style($name, get_theme_file_uri($file), [], null);
        }
      }
    });

    /**
     * dev用の設定
     */
    if ($this->is_development) {
      // HMRスクリプトを読み込む
      add_action('wp_enqueue_scripts', function () {
        wp_enqueue_script_module('vite-dev-server', "//{$this->dev_server}/@vite/client", [], null, true);
      });
      // 正規のURLへのリダイレクトを無効化
      // 公開画面でのページ遷移でVite開発サーバーからからwp-envのサーバーにリダイレクトされてしまうのを防止
      remove_action('template_redirect', 'redirect_canonical');
      // URLを開発サーバーに書き換える
      add_filter('option_home', function ($url) {
        return is_admin() ? $url : 'http://' . $this->dev_server;
      }, 10, 1);
      // ImagickではなくGDを使用する（サイズの大きい画像でタイムアウトしてしまうため）
      add_filter('wp_image_editors', function () {
        return array('WP_Image_Editor_GD', 'WP_Image_Editor_Imagick');
      });
    }

    /**
     * ブロックエディタのスタイルを読み込む
     */
    add_action('enqueue_block_assets', function () {
      if (is_admin() && isset($this->entry_points['wp-editor'])) {
        if ($this->is_development) {
          wp_enqueue_style('custom-editor-style', "//{$this->dev_server}/{$this->entry_points['wp-editor']['path']}", [], null);
        } else {
          if (isset($this->manifest[$this->entry_points['wp-editor']['path']])) {
            $manifest_entry_point = $this->manifest[$this->entry_points['wp-editor']['path']];
            wp_enqueue_style('custom-editor-style', get_theme_file_uri($manifest_entry_point['file']), [], null);
          }
        }
      }
    });
  }

  public function load_script($name)
  {
    if (!isset($this->entry_points[$name])) {
      throw new Exception("Entry point '{$name}' does not exist.");
    }

    add_action('wp_enqueue_scripts', function () use ($name) {
      $script = $this->entry_points[$name];

      if ($this->is_development) {
        wp_enqueue_script_module($name, "//{$this->dev_server}/{$script['path']}", [], null, true);
      } else {
        if (isset($this->manifest[$script['path']])) {
          $manifest_entry_point = $this->manifest[$script['path']];
          wp_enqueue_script_module($name, get_theme_file_uri($manifest_entry_point['file']), [], null, true);
        }
      }
    });
  }

  public function load_style($name)
  {
    if (!isset($this->entry_points[$name])) {
      throw new Exception("Entry point '{$name}' does not exist.");
    }

    add_action('wp_enqueue_scripts', function () use ($name) {
      $style = $this->entry_points[$name];

      if ($this->is_development) {
        wp_enqueue_style($name, "//{$this->dev_server}/{$style['path']}", [], null);
      } else {
        if (isset($this->manifest[$style['path']])) {
          $manifest_entry_point = $this->manifest[$style['path']];
          wp_enqueue_style($name, get_theme_file_uri($manifest_entry_point['file']), [], null);
        }
      }
    });
  }
}

$vite = new Vite();
