/**
 * Package root, preferring the unpacked copy when the package is installed
 * inside an Electron asar archive.
 *
 * Helpers added after packaging are absent from the ASAR directory index even
 * when present in `app.asar.unpacked`, so both halves of the bundle resolve
 * their files through this module.
 */
import { existsSync } from 'node:fs';
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = dirname(fileURLToPath(import.meta.url))
const UNPACKED = SELF.replace(/app\.asar(?=[\\/]|$)/i, 'app.asar.unpacked')

/** Directory holding SKILL.md, bridge/ and code/. */
export const HERE = UNPACKED !== SELF && existsSync(UNPACKED) ? UNPACKED : SELF
