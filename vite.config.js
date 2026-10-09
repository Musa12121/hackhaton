import react from '@vitejs/plugin-react'
import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'

// Brauzerdə giriş ekranı yoxdur: dev server backend-ə .env-dəki hesabla özü qoşulur və tokeni
// hər /api sorğusuna əlavə edir. VITE_ prefiksi olmayan dəyişənlər brauzer koduna düşmür.
async function backendToken(env, target) {
  if (env.HESABCHECK_TOKEN) return env.HESABCHECK_TOKEN
  if (!env.HESABCHECK_USERNAME || !env.HESABCHECK_PASSWORD) {
    console.warn('[hesabcheck] .env-də HESABCHECK_USERNAME/HESABCHECK_PASSWORD yoxdur; API sorğuları 401 qaytaracaq.')
    return ''
  }
  try {
    const response = await fetch(`${target}/api/auth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: env.HESABCHECK_USERNAME, password: env.HESABCHECK_PASSWORD }),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return (await response.json()).token
  } catch (error) {
    console.warn(`[hesabcheck] Backend girişi alınmadı (${error.message}); .env-dəki istifadəçi adı və şifrəni yoxlayın.`)
    return ''
  }
}

// https://vite.dev/config/
export default defineConfig(async ({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_TARGET || 'https://hesabcheck.testgrelo.online'
  // Token yalnız dev/preview serverində lazımdır; build və testlər backend-ə qoşulmur.
  const token = command === 'serve' && mode !== 'test' ? await backendToken(env, target) : ''
  const proxy = {
    // /api sorğuları backend domeninə ötürülür; brauzer üçün eyni origin olduğundan CORS tələb olunmur.
    '/api': {
      target,
      changeOrigin: true,
      secure: true,
      timeout: 660000,
      proxyTimeout: 660000,
      headers: token ? { Authorization: `Token ${token}` } : {},
    },
  }

  return {
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.js'],
      restoreMocks: true,
      unstubGlobals: true,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{js,jsx}'],
        exclude: ['src/test/**', 'src/**/*.test.{js,jsx}', 'src/main.jsx'],
        reporter: ['text', 'html'],
      },
    },
  }
})
