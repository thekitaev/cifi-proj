function GetMissionSpeedBonus() {
  let missionSpeedBonus = Math.pow(1.0311, playerData.loopMods.swarm)
  missionSpeedBonus *= Math.pow(
    1.05,
    Math.floor((playerData.research.mission[2] + 1) / 2),
  )
  missionSpeedBonus *= (playerData.research.perfection[2] > 4) + 1
  missionSpeedBonus *= (playerData.research.perfection[3] > 4) + 1
  if (playerData.academy.badges.engineering) missionSpeedBonus *= 2
  missionSpeedBonus *= Math.pow(1.1, playerData.loopMods.productivity)
  missionSpeedBonus *= 1 + 0.03 * (playerData.relics.relic3 || 0)

  return missionSpeedBonus || 1
}

function CalculateFarmTimes(getRawTime = false) {
  let missionSpeedBonus = GetMissionSpeedBonus()

  let farmData = []
  for (let planet = 0; planet < GameDB.academy.planets; planet++) {
    for (let farm = 0; farm < 3; farm++) {
      const farmInfo = GameDB.academy.farms[planet * 3 + farm]
      const farmSetting = playerData.academy.farms[planet][farm]
      const personnelSetting = playerData.academy.personnel

      let power = 0
      let population = 0
      power += (farmSetting.pods || 0) * (personnelSetting[0].power || 0)
      population += farmSetting.pods || 0
      power += (farmSetting.fireteams || 0) * (personnelSetting[1].power || 0)
      population += farmSetting.fireteams || 0
      power += (farmSetting.titans || 0) * (personnelSetting[2].power || 0)
      population += farmSetting.titans || 0
      power += (farmSetting.corvettes || 0) * (personnelSetting[3].power || 0)
      population += farmSetting.corvettes || 0

      if (power === 0) {
        if (getRawTime) {
          farmData.push({ time: 1e10, personnel: population })
          continue
        }
        farmData.push({ time: '', personnel: 0 })
        continue
      }

      const MIN_TIME = 2

      const time = (60 * farmInfo.baseTime) / (power * missionSpeedBonus)
      const isCapped = time <= MIN_TIME
      const actualTime = isCapped
        ? MIN_TIME
        : farmInfo.isTimeRounded
        ? Math.ceil(time)
        : time

      if (getRawTime) {
        farmData.push({ time: actualTime, personnel: population })
        continue
      }

      farmData.push({
        time: formatDuration2(actualTime),
        rawTime: time.toFixed(2),
        isCapped,
        personnel: population,
      })
    }
  }

  return farmData
}

function GetMaxMissionRate() {
  let farms = [...GameDB.academy.farms]

  let missionSpeedBonus = GetMissionSpeedBonus()

  let personnel = [
    {
      power: playerData.academy.personnel[3].power,
      totalPop: playerData.academy.personnel[3].population,
      usedPop: 0,
      get availPop() {
        return this.totalPop - this.usedPop
      },
    },
    {
      power: playerData.academy.personnel[2].power,
      totalPop: playerData.academy.personnel[2].population,
      usedPop: 0,
      get availPop() {
        return this.totalPop - this.usedPop
      },
    },
    {
      power: playerData.academy.personnel[1].power,
      totalPop: playerData.academy.personnel[1].population,
      usedPop: 0,
      get availPop() {
        return this.totalPop - this.usedPop
      },
    },
    {
      power: playerData.academy.personnel[0].power,
      totalPop: playerData.academy.personnel[0].population,
      usedPop: 0,
      get availPop() {
        return this.totalPop - this.usedPop
      },
    },
  ]

  let farmDetails = []

  for (let planet = 0; planet < GameDB.academy.planets; planet++) {
    for (let farm = 0; farm < 3; farm++) {
      let farmSpecs = {
        id: farms[planet * 3 + farm].id,
        locked: false,
        maxPop: farms[planet * 3 + farm].maxPop,
        currentPop: 0,
        popDistro: [0, 0, 0, 0],
        power: 0,
        baseTime: farms[planet * 3 + farm].baseTime / missionSpeedBonus,
        get availSpace() {
          return this.maxPop - this.currentPop
        },
        get timeLimitPassed() {
          return !(this.power === 0 || (this.baseTime * 60) / this.power >= 2)
        },
      }

      if (playerData.academy.farms[planet][farm].locked) {
        farmSpecs.locked = true

        farmSpecs.popDistro = [
          playerData.academy.farms[planet][farm].pods,
          playerData.academy.farms[planet][farm].fireteams,
          playerData.academy.farms[planet][farm].titans,
          playerData.academy.farms[planet][farm].corvettes,
        ]
        farmSpecs.power =
          playerData.academy.farms[planet][farm].pods *
          playerData.academy.personnel[0].power
        farmSpecs.power +=
          playerData.academy.farms[planet][farm].fireteams *
          playerData.academy.personnel[1].power
        farmSpecs.power +=
          playerData.academy.farms[planet][farm].titans *
          playerData.academy.personnel[2].power
        farmSpecs.power +=
          playerData.academy.farms[planet][farm].corvettes *
          playerData.academy.personnel[3].power

        personnel[3].usedPop += playerData.academy.farms[planet][farm].pods
        personnel[2].usedPop += playerData.academy.farms[planet][farm].fireteams
        personnel[1].usedPop += playerData.academy.farms[planet][farm].titans
        personnel[0].usedPop += playerData.academy.farms[planet][farm].corvettes
      }

      farmDetails.push(farmSpecs)
    }
  }

  // console.table(personnel);
  // console.log(farmDetails);

  farmDetails.sort((a, b) => a.baseTime - b.baseTime)

  for (let i = 0; i < farmDetails.length; i++) {
    if (farmDetails[i].locked) continue

    let planet = Math.floor(farmDetails[i].id / 10)
    let farmNum = farmDetails[i].id - planet * 10

    playerData.academy.farms[planet - 1][farmNum - 1].pods = 0
    playerData.academy.farms[planet - 1][farmNum - 1].fireteams = 0
    playerData.academy.farms[planet - 1][farmNum - 1].titans = 0
    playerData.academy.farms[planet - 1][farmNum - 1].corvettes = 0

    for (let personnelNum = 0; personnelNum < 4; personnelNum++) {
      let populate = Math.min(
        farmDetails[i].availSpace,
        personnel[personnelNum].availPop,
      )
      farmDetails[i].currentPop += populate
      farmDetails[i].power += populate * personnel[personnelNum].power
      personnel[personnelNum].usedPop += populate
      playerData.academy.farms[planet - 1][farmNum - 1][
        GameDB.academy.personnel[3 - personnelNum]
      ] += populate

      while (farmDetails[i].timeLimitPassed) {
        farmDetails[i].currentPop--
        farmDetails[i].power -= personnel[personnelNum].power

        if (!farmDetails[i].timeLimitPassed && personnelNum === 3) {
          farmDetails[i].currentPop++
          farmDetails[i].power += personnel[personnelNum].power
          break
        }

        personnel[personnelNum].usedPop--
        playerData.academy.farms[planet - 1][farmNum - 1][
          GameDB.academy.personnel[3 - personnelNum]
        ]--
      }

      if (farmDetails[i].availSpace <= 0) break
    }
  }

  SavePlayerData()
}

function GetProjectPlanNeeds() {
  const total = [0, 0, 0, 0, 0, 0, 0, 0]
  let hasGoals = false

  for (let i = 0; i < GameDB.academy.projects.length; i++) {
    const goal = playerData.academy.projectGoals[i] || 0
    if (goal <= 0) continue

    hasGoals = true

    const startLevel = playerData.academy.projectLevels[i]
    const costDiv = new ProjectConfig(i, startLevel).getCostDiv()

    for (let level = startLevel; level < startLevel + goal; level++) {
      const costs = GameDB.academy.projectNextLevelCost(
        i,
        level,
        costDiv,
        playerData.ouro.enabled,
      )

      for (let m = 0; m < 8; m++) {
        total[m] += costs[m]
      }
    }
  }

  const needed = total.map((amount, m) =>
    Math.max(0, amount - (playerData.academy.stock[m] || 0)),
  )

  return { hasGoals, needed }
}

function GetFarmMatRates() {
  const missionSpeedBonus = GetMissionSpeedBonus()
  const matBonus = GetCurrentMatBonus()
  const rates = []

  for (let i = 0; i < GameDB.academy.farms.length; i++) {
    const farmInfo = GameDB.academy.farms[i]
    const farmSetting = playerData.academy.farms[Math.floor(i / 3)][i % 3]

    let power = 0
    power += (farmSetting.pods || 0) * playerData.academy.personnel[0].power
    power +=
      (farmSetting.fireteams || 0) * playerData.academy.personnel[1].power
    power += (farmSetting.titans || 0) * playerData.academy.personnel[2].power
    power +=
      (farmSetting.corvettes || 0) * playerData.academy.personnel[3].power

    const farmRate = [0, 0, 0, 0, 0, 0, 0, 0]

    if (power > 0) {
      const cycle = Math.max(
        2,
        (60 * farmInfo.baseTime) / (power * missionSpeedBonus),
      )

      for (let m = 0; m < 8; m++) {
        farmRate[m] = (farmInfo.baseMats[m] * matBonus) / cycle
      }
    }

    rates.push(farmRate)
  }

  return rates
}

function EstimateProjectCompletionTime() {
  const planNeeds = GetProjectPlanNeeds()
  if (!planNeeds.hasGoals) return { status: 'no-goals' }

  let affordable = true
  for (let m = 0; m < 8; m++) {
    if (planNeeds.needed[m] > 0) affordable = false
  }
  if (affordable) return { status: 'affordable' }

  const farmRates = GetFarmMatRates()
  const totalRates = [0, 0, 0, 0, 0, 0, 0, 0]

  for (let i = 0; i < farmRates.length; i++) {
    for (let m = 0; m < 8; m++) {
      totalRates[m] += farmRates[i][m]
    }
  }

  let time = 0
  let bottleneck = -1

  for (let m = 0; m < 8; m++) {
    if (planNeeds.needed[m] <= 0) continue

    const matTime =
      totalRates[m] === 0 ? Infinity : planNeeds.needed[m] / totalRates[m]

    if (matTime > time) {
      time = matTime
      bottleneck = m
    }
  }

  return {
    status: time === Infinity ? 'never' : 'eta',
    time,
    bottleneck,
  }
}

function GetMaxProjectRate() {
  const planNeeds = GetProjectPlanNeeds()
  if (!planNeeds.hasGoals) return { status: 'no-goals' }

  let affordable = true
  for (let m = 0; m < 8; m++) {
    if (planNeeds.needed[m] > 0) affordable = false
  }
  if (affordable) return { status: 'affordable' }

  const needed = planNeeds.needed
  const neededMats = []
  for (let m = 0; m < 8; m++) {
    if (needed[m] > 0) neededMats.push(m)
  }
  const neededCount = neededMats.length

  const missionSpeedBonus = GetMissionSpeedBonus()
  // Zeus-rank growth during the farming period is a second-order effect and is
  // intentionally ignored: it multiplies all farms' yields uniformly, so it
  // cannot change which farm a head is best placed on
  const matBonus = GetStaticMatBonus() * GetDynamicMatBonus()

  const unitPowers = [
    playerData.academy.personnel[0].power,
    playerData.academy.personnel[1].power,
    playerData.academy.personnel[2].power,
    playerData.academy.personnel[3].power,
  ]

  const available = [
    playerData.academy.personnel[0].population,
    playerData.academy.personnel[1].population,
    playerData.academy.personnel[2].population,
    playerData.academy.personnel[3].population,
  ]

  const farms = []

  for (let planet = 0; planet < GameDB.academy.planets; planet++) {
    for (let farm = 0; farm < 3; farm++) {
      const farmInfo = GameDB.academy.farms[planet * 3 + farm]
      const farmSetting = playerData.academy.farms[planet][farm]

      const state = {
        planet,
        farm,
        locked: !!farmSetting.locked,
        maxPop: farmInfo.maxPop,
        heads: [0, 0, 0, 0],
        totalHeads: 0,
        power: 0,
        rate: [0, 0, 0, 0, 0, 0, 0, 0],
        // rate[m] = min(rateCap[m], rateSlope[m] * power) is the shared
        // cycle formula cycle = max(2, cycleBase / power) folded per material
        cycleBase: (60 * farmInfo.baseTime) / missionSpeedBonus,
        rateSlope: [0, 0, 0, 0, 0, 0, 0, 0],
        rateCap: [0, 0, 0, 0, 0, 0, 0, 0],
      }

      for (let m = 0; m < 8; m++) {
        const perRun = farmInfo.baseMats[m] * matBonus
        state.rateSlope[m] = perRun / state.cycleBase
        state.rateCap[m] = perRun / 2
      }

      if (state.locked) {
        state.heads = [
          farmSetting.pods || 0,
          farmSetting.fireteams || 0,
          farmSetting.titans || 0,
          farmSetting.corvettes || 0,
        ]

        for (let t = 0; t < 4; t++) {
          state.totalHeads += state.heads[t]
          state.power += state.heads[t] * unitPowers[t]
          available[t] -= state.heads[t]
        }
      } else {
        farmSetting.pods = 0
        farmSetting.fireteams = 0
        farmSetting.titans = 0
        farmSetting.corvettes = 0
      }

      for (let m = 0; m < 8; m++) {
        state.rate[m] = Math.min(
          state.rateCap[m],
          state.rateSlope[m] * state.power,
        )
      }

      farms.push(state)
    }
  }

  const totalRate = [0, 0, 0, 0, 0, 0, 0, 0]
  for (let i = 0; i < farms.length; i++) {
    for (let m = 0; m < 8; m++) {
      totalRate[m] += farms[i].rate[m]
    }
  }

  const computeT = () => {
    let t = 0
    for (let mi = 0; mi < neededCount; mi++) {
      const m = neededMats[mi]
      t = Math.max(t, totalRate[m] === 0 ? Infinity : needed[m] / totalRate[m])
    }
    return t
  }

  const computeS = () => {
    let s = 0
    for (let mi = 0; mi < neededCount; mi++) {
      const m = neededMats[mi]
      s += totalRate[m] === 0 ? Infinity : needed[m] / totalRate[m]
    }
    return s
  }

  // While any needed material has no rate at all, T and S are Infinity for
  // every candidate, so the count of uncovered materials acts as the primary
  // comparison key; once every needed material has a rate this reduces to the
  // plain T / S comparison below
  const computeZeros = () => {
    let zeros = 0
    for (let mi = 0; mi < neededCount; mi++) {
      if (totalRate[neededMats[mi]] === 0) zeros++
    }
    return zeros
  }

  let currentT = computeT()
  let currentS = computeS()
  let currentZeros = computeZeros()

  // Greedy per-head allocation. Surplus heads that cannot reduce the
  // completion time any further are intentionally left unassigned.
  while (
    available[0] > 0 ||
    available[1] > 0 ||
    available[2] > 0 ||
    available[3] > 0
  ) {
    let bestFarm = null
    let bestType = -1
    let bestT = currentT
    let bestS = currentS
    let bestZeros = currentZeros

    for (let fi = 0; fi < farms.length; fi++) {
      const f = farms[fi]
      if (f.locked) continue
      if (f.totalHeads >= f.maxPop) continue
      if (f.power > 0 && f.cycleBase / f.power <= 2) continue

      for (let t = 0; t < 4; t++) {
        if (available[t] <= 0) continue

        const newPower = f.power + unitPowers[t]
        let candT = 0
        let candZeros = 0

        for (let mi = 0; mi < neededCount; mi++) {
          const m = neededMats[mi]
          const farmRate = Math.min(f.rateCap[m], f.rateSlope[m] * newPower)
          const matRate = totalRate[m] - f.rate[m] + farmRate
          if (matRate === 0) {
            candZeros++
            candT = Infinity
            continue
          }

          const matTime = needed[m] / matRate
          if (matTime > candT) candT = matTime
        }

        if (
          candZeros < bestZeros ||
          (candZeros === bestZeros && candT < bestT)
        ) {
          bestZeros = candZeros
          bestT = candT
          bestFarm = f
          bestType = t
        }
      }
    }

    if (!bestFarm) {
      // secondary objective: sum of per-material times, breaks exact
      // bottleneck ties the max objective cannot distinguish
      for (let fi = 0; fi < farms.length; fi++) {
        const f = farms[fi]
        if (f.locked) continue
        if (f.totalHeads >= f.maxPop) continue
        if (f.power > 0 && f.cycleBase / f.power <= 2) continue

        for (let t = 0; t < 4; t++) {
          if (available[t] <= 0) continue

          const newPower = f.power + unitPowers[t]
          let candS = 0
          let candZeros = 0

          for (let mi = 0; mi < neededCount; mi++) {
            const m = neededMats[mi]
            const farmRate = Math.min(f.rateCap[m], f.rateSlope[m] * newPower)
            const matRate = totalRate[m] - f.rate[m] + farmRate
            if (matRate === 0) {
              candZeros++
              candS = Infinity
              continue
            }

            candS += needed[m] / matRate
          }

          if (
            candZeros < bestZeros ||
            (candZeros === bestZeros && candS < bestS)
          ) {
            bestZeros = candZeros
            bestS = candS
            bestFarm = f
            bestType = t
          }
        }
      }
    }

    if (!bestFarm) break

    bestFarm.heads[bestType]++
    bestFarm.totalHeads++
    available[bestType]--
    bestFarm.power += unitPowers[bestType]

    for (let m = 0; m < 8; m++) {
      const newRate = Math.min(
        bestFarm.rateCap[m],
        bestFarm.rateSlope[m] * bestFarm.power,
      )
      totalRate[m] += newRate - bestFarm.rate[m]
      bestFarm.rate[m] = newRate
    }

    currentT = computeT()
    currentS = computeS()
    currentZeros = computeZeros()
  }

  for (let i = 0; i < farms.length; i++) {
    const state = farms[i]
    if (state.locked) continue

    const farmSetting = playerData.academy.farms[state.planet][state.farm]
    farmSetting.pods = state.heads[0]
    farmSetting.fireteams = state.heads[1]
    farmSetting.titans = state.heads[2]
    farmSetting.corvettes = state.heads[3]
  }

  SavePlayerData()

  return { status: 'ok', time: currentT }
}

const getMatBonusFromLoopMod = () => {
  return (
    Math.pow(1.01, playerData.loopMods.beyonders) *
    Math.pow(1.5111, playerData.loopMods.swarm) *
    Math.pow(1.01, playerData.loopMods.expansion) *
    Math.pow(1.05, playerData.loopMods.materialHauling) *
    Math.pow(1 + 0.0002 * playerData.loopMods.looping, playerData.loopsFilled) *
    Math.pow(1 + 0.002 * playerData.loopMods.productivity, playerData.level) *
    (playerData.ouro.enabled && playerData.loopMods.sekhur5 ? 1.25 : 1)
  )
}

const getMatBonusFromShardMilestone = () => {
  let bonus = 1

  const wonderous60 = Math.pow(
    1.044,
    Math.max(0, playerData.shardMilestones[25] - 55) *
      (playerData.shardMilestones[25] > 59),
  )
  bonus *= wonderous60
  const wonderous90 = Math.pow(
    1.068,
    Math.max(0, playerData.shardMilestones[25] - 84) *
      (playerData.shardMilestones[25] > 89),
  )
  bonus *= wonderous90
  bonus *= Math.pow(
    1.018,
    Math.max(0, playerData.shardMilestones[28] - 20) *
      (playerData.shardMilestones[28] > 24),
  )
  bonus *= Math.pow(
    1.028,
    Math.max(0, playerData.shardMilestones[28] - 45) *
      (playerData.shardMilestones[28] > 49),
  )

  return bonus
}

const getMatBonusFromResearch = () => {
  const bonus =
    Math.pow(1.5, Math.floor(playerData.research.mission[0] / 2)) *
    Math.pow(1.75, Math.floor(playerData.research.mission[1] / 2)) *
    (1 + 4 * (playerData.research.perfection[1] > 1)) *
    (playerData.research.mission[3] > 1 ? 2 : 1) *
    (playerData.research.mission[3] > 3 ? 3 : 1) *
    (playerData.research.mission[3] > 5 ? 4 : 1) *
    (1 + 4 * (playerData.research.perfection[2] > 1)) *
    (1 + 8 * (playerData.research.perfection[3] > 1)) *
    (playerData.research.mission[4] > 1 ? 3 : 1) *
    (playerData.research.mission[4] > 3 ? 4 : 1) *
    (playerData.research.mission[4] > 5 ? 5 : 1)

  return bonus
}

function GetStaticMatBonus() {
  const isOuroEnabled = playerData.ouro.enabled
  const zeus = playerData.fleet.zeus
  const ouro = playerData.fleet.ouro

  let staticMatBonus = 1

  // loop mods
  const matBonusFromLoopMod = getMatBonusFromLoopMod()
  console.log(
    'mat bonus from loop mods exclude zeus rank benefit',
    matBonusFromLoopMod.toExponential(2),
  )
  staticMatBonus *= matBonusFromLoopMod

  // zeus install
  const shipBonus =
    isOuroEnabled && playerData.academy.badges.darkInnovation ? 3 : 1
  const zeus3Bonus = 1 + 0.25 * zeus.installs[2] * (zeus.crew || 0) * shipBonus
  staticMatBonus *= zeus3Bonus
  console.log('zeus3Bonus', zeus3Bonus)
  const zeus6Bonus = 1 + 0.1 * zeus.installs[5] * (zeus.crew || 0) * shipBonus
  staticMatBonus *= zeus6Bonus
  console.log('zeus6Bonus', zeus6Bonus)

  // ouro install
  if (isOuroEnabled) {
    staticMatBonus *= Math.pow(8, playerData.relics.relic20 || 0)
    const ouro5Bonus =
      Math.pow(1 + 0.005 * (ouro.installs[4] || 0), ouro.crew || 0) *
      (ouro.installs[4] ? shipBonus : 1)
    staticMatBonus *= ouro5Bonus
    console.log('ouro5Bonus', ouro5Bonus)
  }

  // shard milestone
  const matBonusFromShardMilestone = getMatBonusFromShardMilestone()
  console.log('mat bonus from shard milestone', matBonusFromShardMilestone)
  staticMatBonus *= matBonusFromShardMilestone

  // research
  const bonusFromResearch = getMatBonusFromResearch()
  console.log('mat bonus from research', bonusFromResearch)
  staticMatBonus *= bonusFromResearch

  // diamond
  staticMatBonus *= Math.pow(1.05, playerData.diamonds.special.materials || 0)
  if (playerData.diamonds.ultima.materialBonus > 1)
    staticMatBonus *= playerData.diamonds.ultima.materialBonus
  if (playerData.diamonds.iapCollector) staticMatBonus *= 1.5

  // proj
  staticMatBonus *= Math.pow(1.75, playerData.academy.projectLevels[8])

  if (isOuroEnabled) {
    if (playerData.ouro.gemCreationNode3Bonus > 0)
      staticMatBonus *= playerData.ouro.gemCreationNode3Bonus

    staticMatBonus *= playerData.ouro.meltdown || 0
    staticMatBonus *= 0.0689 // ouro mat nerf
  }

  return staticMatBonus
}

function GetDynamicMatBonus() {
  return Math.pow(
    0.01 * playerData.loopMods.zeusRankBenefits + 1,
    playerData.fleet.zeus.rank.current,
  )
}

function GetCurrentMatBonus() {
  return GetStaticMatBonus() * GetDynamicMatBonus()
}

function CalculateFarmYields(giveTotal = false) {
  const getDuration = () => {
    let durationSetting = playerData.academy.farmYieldSelected || '1-h'
    const [d, u] = durationSetting.split('-')
    let duration = parseInt(d, 10) * 60 * 60
    if (u === 'd') {
      duration *= 24
    }

    return duration
  }

  let totalDuration = getDuration() || 60 * 60
  let duration = totalDuration

  let staticMatBonus = GetStaticMatBonus()
  let dynamicMatBonus = GetDynamicMatBonus()
  const matBonusPerRank = 0.01 * playerData.loopMods.zeusRankBenefits + 1

  let farmTimes = CalculateFarmTimes(true)

  let farms = []

  for (let i = 0; i < farmTimes.length; i++) {
    const farmDuration = farmTimes[i].time
    if (farmDuration <= duration) {
      let newFarm = {
        id: GameDB.academy.farms[i].id,
        staticMats: GameDB.academy.farms[i].baseMats.map(
          (mat) => mat * staticMatBonus,
        ),
        runTime: farmDuration,
        activeTime: farmDuration,
        farmCount: Math.floor(duration / farmDuration),
      }
      farms.push(newFarm)
    }
  }

  let missionYield = farms.reduce((acc, farm) => acc + farm.farmCount, 0)
  let missionContrib = farms.reduce((acc, farm) => {
    acc[farm.id] = farm.farmCount
    return acc
  }, {})
  let matYield = [0, 0, 0, 0, 0, 0, 0, 0]
  let matContrib = [{}, {}, {}, {}, {}, {}, {}, {}]
  if (giveTotal) {
    matYield = [...playerData.academy.stock]
  }
  let rankProgress = playerData.fleet.zeus.rank.progress
  let yieldRank = playerData.fleet.zeus.rank.current

  if (farms.length === 0) {
    return { missionYield, missionContrib, matYield, matContrib }
  }

  // use precise calculation if duration is less than 3 days
  if (totalDuration < 3 * 24 * 3600) {
    while (duration > 0) {
      farms.sort((a, b) => {
        return a.activeTime - b.activeTime
      })
      let subTime = farms[0].activeTime

      if (subTime > duration) break

      for (let i = 0; i < farms.length; i++) {
        farms[i].activeTime -= subTime

        if (farms[i].activeTime <= 0) {
          farms[i].activeTime = farms[i].runTime
          for (let mat = 0; mat < farms[i].staticMats.length; mat++) {
            const product = farms[i].staticMats[mat] * dynamicMatBonus
            matYield[mat] += product
            if (matContrib[mat][farms[i].id]) {
              matContrib[mat][farms[i].id] += product
            } else {
              matContrib[mat][farms[i].id] = product
            }
          }

          rankProgress++
        }
      }

      const rankReq = GameDB.fleet.zeus.rankRequirements[yieldRank]
      if (rankReq && rankProgress >= rankReq) {
        rankProgress -= rankReq
        yieldRank++
        dynamicMatBonus = Math.pow(matBonusPerRank, yieldRank)
      }

      duration -= subTime
    }
  } else {
    // use estimated calculation if duration is 3 days or longer

    const currentZeusRankBonus = Math.pow(matBonusPerRank, yieldRank)
    let incRank = 0
    let zeusRankBonusOverTime = 0

    let missionCount = missionYield
    while (missionCount > 0) {
      let toNextRank =
        GameDB.fleet.zeus.rankRequirements[yieldRank + incRank] || 1e30
      if (rankProgress > 0) {
        toNextRank -= rankProgress
        rankProgress = 0
      }

      zeusRankBonusOverTime +=
        (Math.pow(matBonusPerRank, incRank) *
          Math.min(toNextRank, missionCount)) /
        missionYield

      missionCount -= toNextRank
      incRank++
    }

    farms.forEach((farm) => {
      farm.staticMats.forEach((staticMat, mat) => {
        const totalMat =
          staticMat *
          currentZeusRankBonus *
          zeusRankBonusOverTime *
          farm.farmCount
        matYield[mat] += totalMat
        matContrib[mat][farm.id] = totalMat
      })
    })
  }

  return {
    missionYield,
    missionContrib,
    matYield,
    matContrib,
    duration: totalDuration,
  }
}

class StoreHouse {
  constructor(totalMats) {
    this.mats = []
    this.spent = []
    for (let i = 0; i < totalMats.length; i++) {
      this.mats.push(totalMats[i])
      this.spent.push(0)
    }
  }
}

class ProjectConfig {
  get gainedLevels() {
    return this.currentLevel - this.startLevel
  }

  get gainedBp() {
    return this.gainedLevels * GameDB.academy.projects[this.projectID].bpCount
  }

  constructor(_projectID, _currentLevel) {
    this.projectID = _projectID
    this.startLevel = _currentLevel
    this.currentLevel = _currentLevel
    this.testLevel = _currentLevel
  }

  MaxLevel(storeHouse) {
    this.testLevel = this.currentLevel

    let costDiv = 1
    costDiv =
      (playerData.research.construction[0] > 1 ? 1.5 : 1) *
      (playerData.research.construction[0] > 3 ? 2 : 1) *
      (playerData.research.construction[0] > 5 ? 2.5 : 1)
    costDiv *=
      (playerData.research.construction[1] > 1 ? 2 : 1) *
      (playerData.research.construction[1] > 2 ? 3 : 1) *
      (playerData.research.construction[1] > 3 ? 3 : 1) *
      (playerData.research.construction[1] > 4 ? 4 : 1) *
      (playerData.research.construction[1] > 5 ? 4 : 1)

    let accumCosts = [0, 0, 0, 0, 0, 0, 0, 0]
    while (true) {
      let searchEnd = false
      let nextCosts = GameDB.academy.projectNextLevelCost(
        this.projectID,
        this.testLevel,
        costDiv,
        playerData.ouro.enabled,
      )
      //   if (this.testLevel === this.startLevel)
      //   {
      //     console.log(`Project: ${this.projectID}, Level: ${this.testLevel}`);
      //     console.table(nextCosts);
      //   }

      for (let i = 0; i < storeHouse.mats.length; i++) {
        if (
          storeHouse.mats[i] - storeHouse.spent[i] <
          accumCosts[i] + nextCosts[i]
        ) {
          searchEnd = true
          break
        }
      }

      if (searchEnd) break

      for (let i = 0; i < storeHouse.mats.length; i++) {
        accumCosts[i] += nextCosts[i]
      }
      this.testLevel++

      //   console.count(`Project: ${this.projectID}`);
    }

    let result = {
      newLevels: this.testLevel - this.currentLevel,
      costs: accumCosts,
    }

    // console.log(result);

    return result
  }

  getCostDiv() {
    let costDiv = 1
    costDiv =
      (playerData.research.construction[0] > 1 ? 1.5 : 1) *
      (playerData.research.construction[0] > 3 ? 2 : 1) *
      (playerData.research.construction[0] > 5 ? 2.5 : 1)
    costDiv *=
      (playerData.research.construction[1] > 1 ? 2 : 1) *
      (playerData.research.construction[1] > 2 ? 3 : 1) *
      (playerData.research.construction[1] > 3 ? 3 : 1) *
      (playerData.research.construction[1] > 4 ? 4 : 1) *
      (playerData.research.construction[1] > 5 ? 4 : 1)

    return costDiv
  }

  get currentCost() {
    let costDiv = this.getCostDiv()

    let accumCosts = [0, 0, 0, 0, 0, 0, 0, 0]

    for (
      let spanLevel = this.startLevel;
      spanLevel < this.currentLevel;
      spanLevel++
    ) {
      let nextCosts = GameDB.academy.projectNextLevelCost(
        this.projectID,
        spanLevel,
        costDiv,
        playerData.ouro.enabled,
      )
      for (let i = 0; i < 8; i++) {
        accumCosts[i] += nextCosts[i]
      }
    }

    return accumCosts
  }

  getStartCost() {
    const costDiv = this.getCostDiv()
    return GameDB.academy.projectNextLevelCost(
      this.projectID,
      this.startLevel,
      costDiv,
      playerData.ouro.enabled,
    )
  }
}
