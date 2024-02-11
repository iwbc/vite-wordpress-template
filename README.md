# Vite WordPress

WordPressテーマ開発用環境

## 要件

- Docker
- Node.js >=20.11.0

## 機能

- Adminer
- Mailpit
- TypeScript
- SCSS
- SVG Sprite
- 画像最適化
  - AVIF / WebP 自動変換、Rewrite対応

## セットアップ

```sh
npm run init
```

## WordPress

### 開発

```sh
npm run dev
```

http://localhost:3000

### プレビュー

```sh
npm run preview
```

http://localhost:8000

### 管理画面

http://localhost:8000/wp-admin

- User: admin
- Password: password

## Adminer

http://localhost:8080

- Server: mysql
- User: root
- Password: password
- DB: wordpress

## Mailpit

http://localhost:8025
