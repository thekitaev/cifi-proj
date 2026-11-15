// Test harness for the 'Maximize Project Rate' feature.
// Run with: node test-feature.mjs
import fs from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const realLog = console.log

// saveData.js reads localStorage at load time
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

// Concatenate all sources into ONE script: top-level let/const declarations
// (GameDB, playerData, portalPanel, classes, ...) would collide if evaluated
// as separate scripts. No document/$ globals are defined, so any load-time
// DOM or jQuery access throws here — which is exactly the load-time check.
const files = [
  'utils.js',
  'GameDB.js',
  'saveData.js',
  'AcademyPortal.js',
  'AcademyFarms.js',
]
const bundle = files
  .map((f) => fs.readFileSync(path.join(root, f), 'utf8'))
  .join('\n;\n')

let loadError = null
try {
  vm.runInThisContext(bundle, { filename: 'cifi-bundle.js' })
} catch (e) {
  loadError = e
}

// playerData, GameDB etc. live in the context's global lexical scope, so all
// reads/writes go through small eval snippets
const run = (code) => vm.runInThisContext(code, { filename: 'test-eval.js' })
const freshPlayer = () =>
  run('playerData = JSON.parse(JSON.stringify(blankPlayer))')

// silence the site's own chatty logging (GetStaticMatBonus logs per call)
console.log = () => {}

let failures = 0
let checks = 0
const check = (name, cond, detail = '') => {
  checks++
  if (cond) {
    realLog(`PASS ${name}`)
  } else {
    failures++
    realLog(`FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const approx = (a, b, eps = 1e-9) =>
  Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b))
const arrApprox = (a, b, eps = 1e-9) =>
  a.length === b.length && a.every((v, i) => approx(v, b[i], eps))

const farmSpecs = () => run('GameDB.academy.farms')
const farmStates = () => run('playerData.academy.farms')
const farmsJson = () => run('JSON.stringify(playerData.academy.farms)')

const setTestPersonnel = () =>
  run(`
  playerData.academy.personnel = [
    { power: 1, population: 50 },
    { power: 4, population: 30 },
    { power: 12, population: 10 },
    { power: 16, population: 5 },
  ]
`)

const totalHeadsOf = (s) =>
  (s.pods || 0) + (s.fireteams || 0) + (s.titans || 0) + (s.corvettes || 0)

// ---------------------------------------------------------------------------
// harness sanity
// ---------------------------------------------------------------------------
try {
  check(
    'harness: sources load in one vm script without any DOM access',
    loadError === null,
    loadError ? String(loadError) : '',
  )
  check(
    'harness: $ (jQuery) and document are undefined in this context',
    typeof globalThis.$ === 'undefined' && typeof document === 'undefined',
  )
  check(
    'harness: feature functions are globally available after load',
    typeof globalThis.GetProjectPlanNeeds === 'function' &&
      typeof globalThis.GetFarmMatRates === 'function' &&
      typeof globalThis.EstimateProjectCompletionTime === 'function' &&
      typeof globalThis.GetMaxProjectRate === 'function' &&
      typeof globalThis.maximizeProjectRate === 'function' &&
      typeof globalThis.updateProjectRateInfo === 'function',
  )
} catch (e) {
  failures++
  realLog('FAIL harness sanity — ' + e.message)
}

// ---------------------------------------------------------------------------
// a) GetProjectPlanNeeds
// ---------------------------------------------------------------------------
try {
  freshPlayer()
  run('playerData.academy.projectGoals[0] = 2')

  // expected: sum of the first two Storage Facility level costs, computed
  // manually via projectNextLevelCost (blank data: costDiv = 1, no ouro)
  const expected = [0, 0, 0, 0, 0, 0, 0, 0]
  for (let level = 0; level < 2; level++) {
    const costs = run(
      `GameDB.academy.projectNextLevelCost(0, ${level}, 1, false)`,
    )
    for (let m = 0; m < 8; m++) expected[m] += costs[m]
  }

  const res = globalThis.GetProjectPlanNeeds()
  check(
    'a) needs: hasGoals is true with a storage goal of 2',
    res.hasGoals === true,
  )
  check(
    'a) needs: needed equals sum of first two Storage level costs',
    arrApprox(res.needed, expected),
    `got ${res.needed.join(',')} expected ${expected.join(',')}`,
  )

  run(
    'playerData.academy.stock = [1e12, 1e12, 1e12, 1e12, 1e12, 1e12, 1e12, 1e12]',
  )
  const resBig = globalThis.GetProjectPlanNeeds()
  check(
    'a) needs: huge stock makes the plan affordable (all needed zero)',
    resBig.hasGoals === true && resBig.needed.every((n) => n === 0),
  )

  freshPlayer()
  const resNone = globalThis.GetProjectPlanNeeds()
  check(
    'a) needs: blank goals give hasGoals false',
    resNone.hasGoals === false && resNone.needed.every((n) => n === 0),
  )
} catch (e) {
  failures++
  realLog('FAIL a) GetProjectPlanNeeds threw — ' + e.stack)
}

// ---------------------------------------------------------------------------
// b) GetFarmMatRates
// ---------------------------------------------------------------------------
try {
  freshPlayer()
  // farm 1-1 (index 0): baseTime 30 min, baseMats [38, 0, ...]
  // 10 pods at power 1 -> power 10; blank save: speed bonus 1, mat bonus 1
  run('playerData.academy.farms[0][0].pods = 10')
  // farm 1-1 additionally 1 corvette (power 16) -> power 26
  run('playerData.academy.farms[0][0].corvettes = 1')

  const msb = globalThis.GetMissionSpeedBonus()
  const matBonus = globalThis.GetCurrentMatBonus()

  const rates = globalThis.GetFarmMatRates()
  check('b) rates: returns 12 farm entries', rates.length === 12)

  const cycle10 = Math.max(2, (60 * 30) / (10 * msb))
  const cycle26 = Math.max(2, (60 * 30) / (26 * msb))
  const expectedPodsOnly = (38 * matBonus) / cycle10
  const expectedWithCorvette = (38 * matBonus) / cycle26

  check(
    'b) rates: farm 1-1 with 10 pods + 1 corvette has exact Difar rate',
    approx(rates[0][0], expectedWithCorvette, 1e-12),
    `got ${rates[0][0]} expected ${expectedWithCorvette} (sanity pods-only ${expectedPodsOnly})`,
  )
  check(
    'b) rates: farm 1-1 non-Difar materials are zero',
    rates[0].slice(1).every((r) => r === 0),
  )
  check(
    'b) rates: zero-head farm has all-zero rates',
    rates[1].every((r) => r === 0),
  )
} catch (e) {
  failures++
  realLog('FAIL b) GetFarmMatRates threw — ' + e.stack)
}

// ---------------------------------------------------------------------------
// c) GetMaxProjectRate — Difar-only goal, locked farm, capacity, improvement
// ---------------------------------------------------------------------------
try {
  freshPlayer()
  setTestPersonnel()
  run(`
    playerData.academy.projectGoals[0] = 1
    playerData.academy.stock[1] = 1e9
    playerData.academy.farms[1][0].pods = 5
    playerData.academy.farms[1][0].locked = true
    playerData.academy.farms[0][2].pods = 50
  `)

  const before = globalThis.EstimateProjectCompletionTime()
  check(
    'c) pre: suboptimal 50-pod farm 1-3 setup estimates finite eta',
    before.status === 'eta' && Number.isFinite(before.time),
    `status ${before.status} time ${before.time}`,
  )

  const result = globalThis.GetMaxProjectRate()
  check('c) opt: returns status ok', result.status === 'ok')
  check(
    'c) opt: returned time is finite and below pre-optimization time',
    Number.isFinite(result.time) && result.time < before.time,
    `got ${result.time} before ${before.time}`,
  )

  const after = globalThis.EstimateProjectCompletionTime()
  check(
    'c) opt: post-optimization estimate is eta and faster than before',
    after.status === 'eta' &&
      Number.isFinite(after.time) &&
      after.time < before.time,
    `status ${after.status} time ${after.time} before ${before.time}`,
  )

  const specs = farmSpecs()
  const states = farmStates()
  const pop = run('playerData.academy.personnel')

  let onlyDifarFarmsUsed = true
  let difarFarmed = false
  let maxPopOk = true
  const typeKeys = ['pods', 'fireteams', 'titans', 'corvettes']
  const sums = [0, 0, 0, 0]
  let unlockedPods = 0

  for (let p = 0; p < 4; p++) {
    for (let f = 0; f < 3; f++) {
      const spec = specs[p * 3 + f]
      const s = states[p][f]
      const heads = totalHeadsOf(s)

      if (heads > spec.maxPop) maxPopOk = false
      for (let t = 0; t < 4; t++) sums[t] += s[typeKeys[t]] || 0

      if (!s.locked && heads > 0) {
        if (spec.baseMats[0] <= 0) onlyDifarFarmsUsed = false
        if (spec.baseMats[0] > 0) difarFarmed = true
        unlockedPods += s.pods || 0
      }
    }
  }

  check(
    'c) opt: only farms producing Difar (1-1, 1-3, 4-1) received heads',
    onlyDifarFarmsUsed,
  )
  check('c) opt: at least one Difar farm received heads', difarFarmed)
  check('c) opt: no farm exceeds its maxPop', maxPopOk)
  check(
    'c) opt: no type over-assigned vs population',
    sums[0] <= 50 && sums[1] <= 30 && sums[2] <= 10 && sums[3] <= 5,
    `sums ${sums.join(',')} vs pops 50,30,10,5`,
  )
  check(
    'c) opt: locked farm 2-1 (5 pods) untouched and counted as used pods',
    states[1][0].pods === 5 &&
      states[1][0].fireteams === 0 &&
      states[1][0].titans === 0 &&
      states[1][0].corvettes === 0 &&
      states[1][0].locked === true &&
      unlockedPods <= 45,
    `unlocked pods ${unlockedPods}`,
  )
} catch (e) {
  failures++
  realLog('FAIL c) GetMaxProjectRate threw — ' + e.stack)
}

// ---------------------------------------------------------------------------
// d) tie case — plan needs two materials (Difar + Kento)
// ---------------------------------------------------------------------------
try {
  freshPlayer()
  setTestPersonnel()
  run('playerData.academy.projectGoals[0] = 1') // storage: Difar 600 + Kento 200

  const t0 = performance.now()
  const result = globalThis.GetMaxProjectRate()
  const elapsed = performance.now() - t0

  check('d) tie: optimizer terminates with status ok', result.status === 'ok')
  check(
    'd) tie: terminates quickly (no infinite loop)',
    elapsed < 2000,
    `elapsed ${elapsed.toFixed(1)}ms`,
  )

  const specs = farmSpecs()
  const states = farmStates()
  let difarFarmed = false
  let kentoFarmed = false
  for (let p = 0; p < 4; p++) {
    for (let f = 0; f < 3; f++) {
      const s = states[p][f]
      if (s.locked || totalHeadsOf(s) === 0) continue
      if (specs[p * 3 + f].baseMats[0] > 0) difarFarmed = true
      if (specs[p * 3 + f].baseMats[1] > 0) kentoFarmed = true
    }
  }
  check('d) tie: Difar has a producing farm', difarFarmed)
  check('d) tie: Kento has a producing farm', kentoFarmed)

  const after = globalThis.EstimateProjectCompletionTime()
  check(
    'd) tie: estimate is eta with finite time after optimization',
    after.status === 'eta' && Number.isFinite(after.time),
    `status ${after.status} time ${after.time}`,
  )
} catch (e) {
  failures++
  realLog('FAIL d) tie case threw — ' + e.stack)
}

// ---------------------------------------------------------------------------
// e) no-goals / affordable return without touching farms
// ---------------------------------------------------------------------------
try {
  freshPlayer()
  run(`
    playerData.academy.personnel[0].population = 10
    playerData.academy.farms[0][0].pods = 3
    playerData.academy.farms[2][2].titans = 2
  `)
  const before1 = farmsJson()
  const r1 = globalThis.GetMaxProjectRate()
  check('e) no-goals: returns status no-goals', r1.status === 'no-goals')
  check('e) no-goals: farms unchanged', farmsJson() === before1)

  freshPlayer()
  run(`
    playerData.academy.personnel[0].population = 10
    playerData.academy.farms[0][0].pods = 3
    playerData.academy.projectGoals[0] = 2
    playerData.academy.stock = [1e12, 1e12, 1e12, 1e12, 1e12, 1e12, 1e12, 1e12]
  `)
  const before2 = farmsJson()
  const r2 = globalThis.GetMaxProjectRate()
  check('e) affordable: returns status affordable', r2.status === 'affordable')
  check('e) affordable: farms unchanged', farmsJson() === before2)
} catch (e) {
  failures++
  realLog('FAIL e) early-return cases threw — ' + e.stack)
}

// ---------------------------------------------------------------------------
// f) performance — ~1e5 heads across all materials
// ---------------------------------------------------------------------------
try {
  freshPlayer()
  run(`
    playerData.academy.personnel = [
      { power: 1, population: 40000 },
      { power: 4, population: 30000 },
      { power: 12, population: 20000 },
      { power: 16, population: 10000 },
    ]
    playerData.academy.projectGoals = [50, 30, 20, 20, 10, 5, 1, 1, 1]
  `)

  const t0 = performance.now()
  const result = globalThis.GetMaxProjectRate()
  const elapsed = performance.now() - t0

  check('f) perf: returns status ok', result.status === 'ok')
  check(
    'f) perf: ~1e5 heads optimized well under a second',
    elapsed < 1000,
    `elapsed ${elapsed.toFixed(1)}ms`,
  )

  let assigned = 0
  const states = farmStates()
  for (let p = 0; p < 4; p++) {
    for (let f = 0; f < 3; f++) assigned += totalHeadsOf(states[p][f])
  }
  check(
    'f) perf: heads were actually assigned',
    assigned > 1000,
    `assigned ${assigned}`,
  )
  realLog(`     (perf info: ${elapsed.toFixed(1)}ms, ${assigned} heads assigned)`)
} catch (e) {
  failures++
  realLog('FAIL f) performance case threw — ' + e.stack)
}

// ---------------------------------------------------------------------------
console.log = realLog
realLog('')
if (failures === 0) {
  realLog(`ALL ${checks} CHECKS PASSED`)
  process.exit(0)
} else {
  realLog(`${failures} of ${checks} checks FAILED`)
  process.exit(1)
}
