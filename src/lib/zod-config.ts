import { z } from 'zod';

// Zod v4 probes `Function('')` to decide whether it may compile faster object
// parsers. Under our CSP (no 'unsafe-eval') that probe is reported as a
// violation on every page that loads a schema. Skip the probe: parsing falls
// back to the interpreted path, which is plenty fast here.
// Imported first in src/router.tsx so it runs before any schema is built.
z.config({ jitless: true });
