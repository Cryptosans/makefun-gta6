// config.js — the world of Solara Bay: layout, palette, tuning, names.
// Solara Bay is an original sun-soaked coastal city invented for this game:
// no street, person or place here is taken from any commercial game.
(function () {
  'use strict';

  var U = window.SB.util;

  var CONFIG = {
    worldSize: 640,            // playable ground, x/z in [-320, 320]
    roadSpacing: 80,           // grid pitch
    roadWidth: 14,
    roadCoords: [-240, -160, -80, 0, 80, 160, 240],
    beachZ: 272,               // sand starts here (south edge)
    waterZ: 312,               // ocean starts here
    blockHalf: 29,             // half-size of a buildable block
    gravity: 26,
    walkSpeed: 4.6,
    runSpeed: 8.4,
    jumpSpeed: 9.5,
    carAccel: 26,
    carBrake: 42,
    carMaxSpeed: 38,           // ~137 km/h
    carMaxReverse: 12,
    carTurn: 1.9,
    trafficCount: 14,
    pedCount: 26,
    maxWanted: 5,
    wantedDecayDelay: 22,      // seconds quiet before a star drops
    wantedDecayStep: 9,        // seconds per star after that
    bustCashLoss: 0.10,
    bustFlatLoss: 150,
    startCash: 250,
    saveKey: 'solara-bay-save-v1',
  };

  var PALETTE = {
    skyTop: 0x3f8fd2, skyBottom: 0xbfd9ea,
    sun: 0xfff2d0, fog: 0xcfe0ea,
    ground: 0x9aa578, sidewalk: 0xb9b3a4, road: 0x3a3d42,
    roadLine: 0xf5d76e, beach: 0xe8d29a, water: 0x2e7fa8,
    buildingGlass: 0x8fb8c9,
  };

  // Original district names, invented for this game.
  var DISTRICTS = [
    { name: 'Marina Point', cx: 0, cz: 240, kind: 'marina' },
    { name: 'Old Coral Row', cx: -160, cz: 160, kind: 'lowrise' },
    { name: 'Palmera Heights', cx: 160, cz: 160, kind: 'midrise' },
    { name: 'Downtown Solara', cx: 0, cz: 0, kind: 'tower' },
    { name: 'Cactus Flats', cx: -160, cz: -80, kind: 'lowrise' },
    { name: 'Northgate', cx: 160, cz: -160, kind: 'midrise' },
    { name: 'Lighthouse Hill', cx: -240, cz: -240, kind: 'park' },
  ];

  var FIRST_NAMES = ['Rico', 'Mara', 'Dante', 'Luz', 'Kiko', 'Tessa', 'Bruno', 'Ines', 'Marco', 'Sofia', 'Paco', 'Nina', 'Hector', 'Lena', 'Vic', 'Rosa'];
  var LAST_NAMES = ['Vale', 'Solis', 'Marsh', 'Delgado', 'Reyes', 'Costa', 'Ferro', 'Luna', 'Vega', 'Ortiz', 'Prado', 'Mendez'];

  var CAR_COLORS = [0xd23b2e, 0x2e6fd2, 0xe8b93b, 0x3fae6a, 0xe8e4da, 0x22242a, 0x7a4fd0, 0xd27a2e, 0x37b8b0, 0xb8c4cc];
  var CAR_NAMES = ['Comet GT', 'Sunrunner', 'Bayliner', 'Coral Coupe', 'Dune Buggy', 'Harbor Van', 'Palmera Sedan', 'Stingray S', 'Cactus Pickup', 'Marina Cruiser'];

  var PED_SHIRTS = [0xe84a5f, 0x3fa7d6, 0xf2c14e, 0x7bc47f, 0x9b59b6, 0xe67e22, 0xeeeeee, 0x2c3e50, 0x16a085, 0xc0392b];
  var PED_SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xa0663a];

  // Player and story characters — all original.
  var CHARACTERS = {
    player: { name: 'Rico Vale', role: 'New in town, quick hands, quicker feet.' },
    mara: { name: 'Mara Solis', role: 'Fixer. Runs jobs out of a garage on Coral Row.' },
    dante: { name: 'Dante Marsh', role: 'Dock Rats crew boss. Owes Mara money and respect.' },
  };

  window.SB.CONFIG = CONFIG;
  window.SB.PALETTE = PALETTE;
  window.SB.DISTRICTS = DISTRICTS;
  window.SB.CHARACTERS = CHARACTERS;
  window.SB.FIRST_NAMES = FIRST_NAMES;
  window.SB.LAST_NAMES = LAST_NAMES;
  window.SB.CAR_COLORS = CAR_COLORS;
  window.SB.CAR_NAMES = CAR_NAMES;
  window.SB.PED_SHIRTS = PED_SHIRTS;
  window.SB.PED_SKINS = PED_SKINS;
  window.SB.rng = U.mulberry32(20261117);
})();
