import { type Config } from '@react-router/dev/config';

export default {
  // Matches @cloudflare/vite-plugin's expected Worker/asset output layout (dist/client +
  // dist/<worker>), instead of React Router's Node-oriented default of `build/`.
  buildDirectory: 'dist',
} satisfies Config;
