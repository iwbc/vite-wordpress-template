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
    'script',
  ]);
});

/*---------------------------------------------------------------
 * 設定変更
 */

// 不要なダッシュボードウィジェットを非表示
add_action('wp_dashboard_setup', function () {
  // remove_meta_box('dashboard_site_health', 'dashboard', 'normal');
  remove_meta_box('dashboard_activity', 'dashboard', 'normal');
  remove_meta_box('dashboard_right_now', 'dashboard', 'normal');
  remove_meta_box('dashboard_quick_press', 'dashboard', 'side');
  remove_meta_box('dashboard_primary', 'dashboard', 'side');
  // remove_action('welcome_panel', 'wp_welcome_panel');
  remove_meta_box('wpseo-dashboard-overview', 'dashboard', 'normal');
  remove_meta_box('wpseo-wincher-dashboard-overview', 'dashboard', 'normal');
  remove_meta_box('wp_mail_smtp_reports_widget_lite', 'dashboard', 'normal');
});

// 管理バーを非表示
add_filter('show_admin_bar', '__return_false');

// 管理バーのメニューを非表示
add_action('admin_bar_menu', function ($wp_admin_bar) {
  $wp_admin_bar->remove_menu('wp-logo');
  $wp_admin_bar->remove_menu('comments');
  $wp_admin_bar->remove_menu('new-content');
  $wp_admin_bar->remove_menu('new-link');
  $wp_admin_bar->remove_menu('view');
  $wp_admin_bar->remove_menu('wpseo-menu');
}, 999);

// 大きい画像をリサイズしない
add_filter('big_image_size_threshold', '__return_false');

// body_classにスラッグを追加
add_filter('body_class', function ($classes) {
  $prefix = is_single() ? 'post-' : (is_page() ? 'page-' : '');
  if (is_single() || is_page()) {
    global $post;
    $classes[] = $prefix . $post->post_name;
  }
  return $classes;
});
