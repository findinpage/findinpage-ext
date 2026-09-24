import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Find in Page',
    description:
      'A free, open-source browser extension that improves Cmd/Ctrl + F with a contextual list of every match.',
    minimum_chrome_version: '105',
    action: {
      default_title: 'Toggle Find in Page',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
      },
    },
  },
});
