import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

export async function compressDirectory(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true })
  await Promise.all(
    entries.map(async (entry) => {
      if (entry.name.startsWith('.')) return
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        await compressDirectory(path)
      } else if (/\.(js|css|svg|json)$/u.test(entry.name)) {
        await writeFile(path + '.gz', gzipSync(await readFile(path), { level: 9 }))
      }
    }),
  )
}
