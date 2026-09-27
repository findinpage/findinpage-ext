import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser }) => ({
    name: 'Find in Page',
    description:
      'A free, open-source browser extension that improves Cmd/Ctrl + F with a contextual list of every match.',
    homepage_url: 'https://findin.page',
    minimum_chrome_version: '105',
    permissions: ['storage'],
    ...(browser === 'chrome' && {
      key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvMYb12keWRFN9U6FlxFSEMvPY3zGI+46YYCBe0SoVqFgyp1iCIIYqrkdywjdXo/buqmtiQH/jjIqq/LIiTxRhlu8h3zQ6p2jAHf/NpRxK+SdTeJRydzJxE2T5vfX+Xis3g/MqQIgSGfoHfqlyuzJ67rrQwons5o6DgcPOTYA/RaEubhZ9sUQZ+EgtnD67+lx9HF+jBwlL83ryvlO9AabvMF8JKUXDADmHycHUI4Uo3DFoE869VcUJ8zb+5DbRcYua7Zpd/wSv6L7Up/mOBjjea+Gnnz1V3lQD6bZ4zAn9z1nUJXkvHXZUDm9+qA3z7WnS5eGq/r8czqPgtzlQwq5/wIDAQAB',
    }),
    action: {
      default_title: 'Toggle Find in Page',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
      },
    },
  }),
});
