<?php

class Vite
{
  public bool $is_development;
  private string $dev_server;
  private array $manifest;
  private array $entry_points;
  public string $script_dir;
  public string $style_dir;
  public string $image_dir;


  public function __construct()
  {
    $vite_env = json_decode(file_get_contents(get_theme_file_path('.vite/env.json')), true);

    if ($vite_env === false) {
      throw new Exception('".vite/env.json" does not exist.');
    }

    $is_development = $vite_env['IS_DEVELOPMENT'];
    $manifest_exists = file_exists(get_theme_file_path($vite_env['MANIFEST_PATH']));

    $this->is_development = $is_development;
    $this->dev_server = $vite_env['VITE_DEV_SERVER'];
    $this->manifest = $manifest_exists ? json_decode(file_get_contents(get_theme_file_path($vite_env['MANIFEST_PATH'])), true) ?? [] : [];
    $this->entry_points = $vite_env['ENTRY_POINTS'];
    $this->script_dir = $vite_env['SCRIPT_DIR'];
    $this->style_dir = $vite_env['STYLE_DIR'];
    $this->image_dir = $vite_env['IMAGE_DIR'];

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

  /**
   * 空要素のHTMLを生成する
   *
   * @param string $tag HTMLタグ名
   * @param array $attrs 属性の連想配列
   * @return string HTML Void element
   */
  private function build_void_element(string $tag, array $attrs = [])
  {
    $attrs_str = '';
    foreach ($attrs as $key => $value) {
      if ($value === null) {
        continue;
      }
      $attrs_str .= sprintf(' %s="%s"', esc_attr($key), esc_attr($value));
    }
    return "<{$tag} {$attrs_str}>";
  }

  /**
   * 画像の情報を取得する
   *
   * @param string $src 画像のパス
   * @return array{file: string, src: string, width?: int, height?:int } 画像の情報
   * @throws Exception
   */
  public function get_image(string $src): array
  {
    $image = $this->manifest[ltrim($src, '/')] ?? null;

    if (!$image) {
      throw new Exception("Image '{$src}' does not exist in the manifest.");
    }

    return $image;
  }

  /**
   * スプライト画像のURLを取得する
   *
   * @param string $name スプライトの名前
   * @return string スプライト画像のURL
   * @throws Exception
   */
  public function get_sprite_url(string $name): string
  {
    $image = $this->get_image(path_join($this->image_dir, 'sprite.svg'));

    if (!$image) {
      throw new Exception("Sprite image does not exist in the manifest.");
    }

    $sprite_url = $this->is_development ? $image['file'] : get_theme_file_uri($image['file']);
    return $sprite_url . '#' . $name;
  }

  /**
   * imgタグを出力する
   *
   * @param string $src 画像のパス
   * @param string $alt 代替テキスト
   * @param array{width?: int, height?: int, loading?: string, class?: string, id?: string } $attrs imgタグの属性
   */
  public function image(string $src, string $alt = '', array $attrs = [])
  {
    $image = $this->get_image($src);

    $image_attrs = [
      'src' => $this->is_development ? $src : get_theme_file_uri($image['file']),
      'alt' => $alt,
    ] + $attrs + [
      'width' => $image['width'] ?? null,
      'height' => $image['height'] ?? null,
      'loading' => 'lazy',
    ];

    echo $this->build_void_element('img', $image_attrs);
  }

  /**
   * pictureタグを出力する
   *
   * @param string $src 画像のパス
   * @param array{src: string, width?: int, height?: int, media?: string}[] $sources sourceタグの情報の配列
   * @param string $alt 代替テキスト
   * @param array{width?: int, height?: int, loading?: string, class?: string, id?: string } $attrs imgタグの属性
   */
  public function picture(string $src, array $sources, string $alt = '', array $attrs = [])
  {
    echo '<picture>';

    foreach ($sources as $source) {
      $source_image = $this->get_image($source['src']);
      $source_attrs = [
        'srcset' => $this->is_development ? $source['src'] : get_theme_file_uri($source_image['file']),
      ] + $source + [
        'width' => $source_image['width'] ?? null,
        'height' => $source_image['height'] ?? null,
      ];
      unset($source_attrs['src']);
      echo $this->build_void_element('source', $source_attrs);
    }

    $this->image($src, $alt, $attrs);

    echo '</picture>';
  }
}

$vite = new Vite();
