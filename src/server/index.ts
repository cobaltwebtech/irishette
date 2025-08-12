import { createHonoApp } from '../integrations/hono/config'

const app = createHonoApp()

export default {
  fetch: app.fetch,
}
