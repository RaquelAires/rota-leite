import { build } from 'vite';
import vue from '@vitejs/plugin-vue';

await build({
  configFile: false,
  publicDir: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __VUE_OPTIONS_API__: false,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false
  },
  plugins: [vue({ template: { transformAssetUrls: false } })],
  build: {
    outDir: '.generated',
    emptyOutDir: true,
    lib: { entry: 'src/main.js', name: 'RotaLeite', formats: ['iife'], fileName: () => 'app.js' }
  }
});
