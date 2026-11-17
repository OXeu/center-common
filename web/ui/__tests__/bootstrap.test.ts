import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { afterAll, test } from 'vite-plus/test'
import assert from 'node:assert/strict'

mkdirSync('.tmp', { recursive: true })
const scratch = mkdtempSync(resolve('.tmp/bootstrap-test-'))
const remote = join(scratch, 'source')
const consumer = join(scratch, 'consumer')
const bootstrap = resolve('tools/bootstrap.ts')
afterAll(() => rmSync(scratch, { recursive: true, force: true }))
mkdirSync(remote)
mkdirSync(consumer)
function git(...args: string[]) {
  return execFileSync('git', ['-C', remote, ...args], { encoding: 'utf8' }).trim()
}
git('init', '--quiet')
git('config', 'user.name', 'Common bootstrap test')
git('config', 'user.email', 'common-test@example.invalid')
writeFileSync(join(remote, 'package.json'), '{"name":"@oxeu/center-common"}\n')
writeFileSync(join(remote, 'go.mod'), 'module example.invalid/common\n')
writeFileSync(join(remote, '.gitignore'), 'node_modules/\n.tmp/\n')
writeFileSync(join(remote, 'value'), 'pinned')
git('add', 'package.json', 'go.mod', '.gitignore', 'value')
git('commit', '--quiet', '-m', 'feat: add fixture')
const revision = git('rev-parse', 'HEAD')
function lock(sha = revision) {
  writeFileSync(
    join(consumer, 'common.lock.json'),
    JSON.stringify({ repository: remote, revision: sha }),
  )
}
lock()
function run(args: string[] = [], ci = '') {
  return spawnSync(process.execPath, [bootstrap, ...args], {
    cwd: consumer,
    encoding: 'utf8',
    env: { ...process.env, CI: ci },
  })
}
const active = join(consumer, '.tmp/common')

test('links live local edits and builds the locked revision independently', () => {
  assert.equal(run(['--local', remote]).status, 0)
  writeFileSync(join(remote, 'value'), 'local edit')
  assert.equal(readFileSync(join(active, 'value'), 'utf8'), 'local edit')
  assert.equal(run().status, 0)
  assert.equal(realpathSync(active), remote)
  assert.equal(run(['--locked']).status, 0)
  assert.equal(readFileSync(join(active, 'value'), 'utf8'), 'pinned')
  assert.equal(readFileSync(join(remote, 'value'), 'utf8'), 'local edit')
  assert.equal(run().status, 0)
  assert.equal(realpathSync(active), remote)
  assert.equal(run([], 'true').status, 0)
  assert.equal(readFileSync(join(active, 'value'), 'utf8'), 'pinned')
  assert.notEqual(run(['--local', remote], 'true').status, 0)
})

test('rejects mutated cached source instead of silently deploying it', () => {
  assert.equal(run(['--locked']).status, 0)
  writeFileSync(join(active, 'value'), 'unexpected edit')
  assert.notEqual(run(['--locked']).status, 0)
  writeFileSync(join(active, 'value'), 'pinned')
  writeFileSync(join(active, 'untracked'), 'unexpected source')
  assert.notEqual(run(['--locked']).status, 0)
  rmSync(join(active, 'untracked'))
})

test('rejects floating revisions, missing commits and unknown options', () => {
  lock('main')
  assert.notEqual(run(['--locked']).status, 0)
  lock('1'.repeat(40))
  assert.notEqual(run(['--locked']).status, 0)
  lock()
  assert.notEqual(run(['--lockd']).status, 0)
})

test('does not replace an unrelated directory', () => {
  unlinkSync(active)
  mkdirSync(active)
  writeFileSync(join(active, 'keep'), 'user data')
  assert.notEqual(run(['--locked']).status, 0)
  assert.equal(readFileSync(join(active, 'keep'), 'utf8'), 'user data')
})
