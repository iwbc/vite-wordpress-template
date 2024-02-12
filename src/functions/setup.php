<?php

/*---------------------------------------------------------------
 * テーマの基本設定
 */

add_action('after_setup_theme', function () {
  // アイキャッチを有効化
  add_theme_support('post-thumbnails');

  // タイトルタグの自動出力を有効化
  add_theme_support('title-tag');

  // html5を有効化
  add_theme_support('html5', [
    'search-form',
    'comment-form',
    'comment-list',
    'gallery',
    'caption',
    'style',
    'script'
  ]);
});

/*---------------------------------------------------------------
 * 不要なタグの削除
 */

// shortlink
remove_action('wp_head', 'wp_shortlink_wp_head', 10, 0);

// wlwmanifest & xmlrpc
remove_action('wp_head', 'rsd_link');
remove_action('wp_head', 'wlwmanifest_link');

// WPのバージョン情報
function remove_assets_ver($src)
{
  if (strpos($src, 'ver=' . get_bloginfo('version'))) {
    $src = remove_query_arg('ver', $src);
  }
  return $src;
}
add_filter('style_loader_src', 'remove_assets_ver', 9999);
add_filter('script_loader_src', 'remove_assets_ver', 9999);
remove_action('wp_head', 'wp_generator');

// 絵文字
remove_action('wp_head', 'print_emoji_detection_script', 7);
remove_action('admin_print_scripts', 'print_emoji_detection_script');
remove_action('wp_print_styles', 'print_emoji_styles');
remove_action('admin_print_styles', 'print_emoji_styles');

// REST API
remove_action('wp_head', 'rest_output_link_wp_head');

// DNS Prefetch
add_filter('wp_resource_hints', function ($hints, $relation_type) {
  if ('dns-prefetch' === $relation_type) {
    return array_diff(wp_dependencies_unique_hosts(), $hints);
  }
  return $hints;
}, 10, 2);

// RSSフィード
remove_action('wp_head', 'feed_links', 2);
remove_action('wp_head', 'feed_links_extra', 3);

// global-styles-inline-css
// classic-theme-styles-inline-css
add_action('wp_enqueue_scripts', function () {
  wp_dequeue_style('global-styles');
  wp_dequeue_style('classic-theme-styles');
});

// Gutenberg用CSS
// add_action('wp_enqueue_scripts', function () {
//   wp_dequeue_style('wp-block-library');
// }, 9999);

/*---------------------------------------------------------------
 * 設定変更
 */

// 管理バーを非表示
add_filter('show_admin_bar', '__return_false');

// アップロード画像の圧縮を無効化
add_filter('jpeg_quality', function ($arg) {
  return 100;
});

// 大きい画像をリサイズしない
add_filter('big_image_size_threshold', '__return_false');
