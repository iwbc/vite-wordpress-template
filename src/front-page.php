<?php
global $vite;
$vite->load_script('top.ts');
$vite->load_style('top.scss');
get_header(); ?>

<div class="top_main">
  <div>
    <h1>Vite WordPress</h1>

    <h2>img</h2>
    <?php $vite->image('assets/images/sample.jpg', 'alt', ['class' => 'image']); ?>

    <h2>picture</h2>
    <?php $vite->picture(
      src: 'assets/images/sample.jpg',
      sources: [
        ['src' => 'assets/images/sample.jpg', 'media' => '(768px <= width)']
      ],
      alt: 'alt',
      attrs: []
    ); ?>
  </div>
</div>

<?php get_footer(); ?>
