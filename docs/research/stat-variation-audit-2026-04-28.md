# UltimateBuild artifact/container stat variation audit

Artifacts audited: 102
Main stat count distribution: {0: 2, 3: 25, 4: 34, 5: 30, 6: 5, 7: 2, 8: 4}
- main stats=0: 2 artifacts. Examples: Rubik, Regalia
- main stats=3: 25 artifacts. Examples: Pumpkin, Cycle, Crust, Static, Cursed Rose, Jelly, Cone, Fossil, Prima, Berry, Cryogen, Phlegm, Shard, Peg-Top, Firebird, Shrimp, Snail, Rose, Scallop, Hoop, Viburnum Branch, Proto-Onion, Candlelight, Heart, Egg
- main stats=4: 34 artifacts. Examples: Chilly, Loop, Magma, Colophony, Gills, Dark Crystal, Stress fest, Steel Hedgehog, Mug, Leech, Ice Hedgehog, Spiral, Inkwell, Sponge, White Rose, Larva, Timber, Veiner, Dumbbell, Onion, Prism, Bracelet, Swamp Rot, Sticky Burr, Lard, Rime, Sun, Rattle, Golden Prima, Disintegrator, Bismuth, Comet, Snak
- main stats=5: 30 artifacts. Examples: Coil, Snares, Scrubber, Acid Crystal, Wolf Tears, Heel, Burr, Lollipop, Helium, Lemna, Gum, Hedgehog, Frame, Frost, Kettlebell, Fahrenheit, Amberite, Red Crystal, Spectral Crystal, Transformer, Opal, Tallow, Raisin, Dark Viburnum, Crystal of Inside Out, Bubblegum, Ilyich Lamp, Battery, Black Hole, I
- main stats=6: 5 artifacts. Examples: Atom, Radiator, Embryo, Whirlwind, Retina
- main stats=7: 2 artifacts. Examples: Wicked Hedgehog, Leaded Glass
- main stats=8: 4 artifacts. Examples: Polyhedron, Eye of the Storm, Chicken God, Mirror

Additional stat count distribution: {0: 1, 3: 100, 24: 1}
- additional stats=0: 1 artifacts. Examples: Regalia
- additional stats=3: 100 artifacts. Examples: Chilly, Wicked Hedgehog, Pumpkin, Cycle, Crust, Coil, Static, Snares, Cursed Rose, Loop, Jelly, Scrubber, Acid Crystal, Magma, Cone, Fossil, Colophony, Wolf Tears, Prima, Gills, Berry, Cryogen, Dark Crystal, Stress fest, Steel Hedgehog, Polyhedron, Mug, Leech, Heel, Phlegm, Burr, Lollipop, Ice Hedge
- additional stats=24: 1 artifacts. Examples: Rubik

Additional stat names observed:
- Stamina regeneration: 37
- Stamina: 35
- Health regeneration: 30
- Movement speed: 28
- Carry weight: 23
- Bullet resistance: 23
- Vitality: 20
- Healing effectiveness: 18
- Laceration protection: 15
- Explosion protection: 14
- Bleeding: 13
- Bleeding protection: 8
- Resistance to electricity: 6
- Burning: 5
- Psy-emissions: 5
- Recoil: 5
- Resistance to fire: 4
- Biological infection: 3
- Resistance to chemicals: 3
- Bioinfection protection: 3
- Stability: 3
- Radiation protection: 3
- Radiation: 3
- Temperature: 3
- Thermal protection: 3
- Psy-Emission protection: 3
- Reaction to laceration: 2
- Sway: 2
- Periodic healing: 1
- Reaction to electricity: 1
- Reaction to burns: 1
- Reaction to chemical burns: 1

Containers audited: 54
Container stat count distribution: {0: 25, 1: 16, 2: 11, 3: 2}
- container stats=0: 25 containers. Examples: Apiary Container cap=5 prot=89.5 eff=120.00001; Berloga-6U Container cap=6 prot=78.5 eff=114; Barrel Container cap=7 prot=60.000004 eff=92.5; SMC Container cap=4 prot=95 eff=120.00001; Berloga — 6 Container cap=6 prot=78.5 eff=100; Hive Container cap=5 prot=89.5 eff=104.99999; Cell-U Container cap=4 prot=89.5 eff=110; KZS-MU Container cap=3 prot=95 eff=132.5; Berloga — 5U Container cap=5 prot=78.5 eff=100; Kega-RS Container cap=6 prot=60.000004 eff=90; IU-2 Container cap=3 prot=95 eff=139; Cell 
- container stats=1: 16 containers. Examples: Chitin Backpack cap=6 prot=60.000004 eff=115; Sheaf Container cap=7 prot=60.000004 eff=97; Overton Container cap=6 prot=60.000004 eff=100; Coffin Backpack cap=5 prot=78.5 eff=110; Secret Valley 35 Backpack cap=6 prot=60.000004 eff=92.5; Fridge Container cap=4 prot=78.5 eff=113; Jagdtasche cap=4 prot=78.5 eff=112.5; Soviet Travel Backpack cap=5 prot=60.000004 eff=90; Forager Container cap=4 prot=78.5 eff=113; NPA Backpack cap=4 prot=78.5 eff=101.5; MBSS Backpack cap=4 prot=60.000004 eff=83.5; Hel
- container stats=2: 11 containers. Examples: Freezer Container cap=6 prot=75 eff=102.5; CRAW-6 Container cap=6 prot=60.000004 eff=97; Utility vest ADR-WRBT cap=4 prot=89.5 eff=104.99999; ZIVCAS ArcticSafe-6 cap=6 prot=75 eff=102.5; Utility vest Black Eagle Y-73 cap=3 prot=89.5 eff=110; Shiver Container cap=5 prot=75 eff=102.5; Pouch Black Eagle B-33 cap=3 prot=89.5 eff=95; PROTECT 3B Waist Bag cap=2 prot=89.5 eff=110; Cool Container cap=5 prot=75 eff=92.5; Sports Bag cap=2 prot=89.5 eff=100; Transformer Bag cap=1 prot=89.5 eff=115
- container stats=3: 2 containers. Examples: Marathon bag cap=3 prot=78.5 eff=113; Saddlebag cap=3 prot=78.5 eff=113

Container stat names observed:
- Carry weight: 20
- Movement speed: 8
- Biological infection: 5
- Temperature: 4
- Frost: 2
- Bullet resistance: 1
- Laceration protection: 1
- Healing effectiveness: 1
- Psy-emissions: 1
- Radiation: 1

Implementation notes:
- Artifact-card display no longer truncates calculated main stat display to four rows.
- Web optimization now considers unlocked additional-stat variants relevant to requested objectives and harmful caps.
- Final build stats now include container/backpack stat rows in addition to artifact stats.
