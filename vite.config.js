import { defineConfig } from 'vite';

export default defineConfig({
  // 根目录下的 index.html 为入口
  root: '.',
  // 静态资源目录
  publicDir: 'public',
  // 构建输出到 dist/
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    open: true,
  },
});
