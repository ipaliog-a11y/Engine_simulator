// ====== TEST TRACK: circuits, lap solver ======
// A circuit is a ring of control points (metres). A closed Catmull-Rom spline through them gives
// a smooth, guaranteed-closed centreline; sampling that yields both the distance/curvature
// profile the lap solver needs and the polyline the map draws — one source of truth for both, so
// the picture can never disagree with the physics.
const TRACKS={
  // `width` is the AVERAGE width; `wprof` are relative multipliers spread around the lap and
  // normalised to mean 1, so a circuit narrows and opens the way a real one does. Ashdown is an
  // old parkland course: wide at the gatehouse straight, pinched to a country lane through the
  // woods.
  tech: {label:'ASHDOWN PARK',  width:10,wprof:[1.30,1.22,1.05,0.88,0.80,0.78,0.86,1.00,1.12,1.18,1.05,0.90,0.80,0.76,0.82,0.95,1.10,1.24],
    names:['Gatehouse','The Kink','Beeches','Old Barn','Hollow','Chapel','Quarry','Farm Bend','Paddock','Coppice','Stables','The Dell','The Ford','Ash Corner','Millpond','Keeper\'s','Gate Loop'],
    blurb:'Tight and technical — second-gear corners, short straights. Grip, brakes and a light car matter more than power.',
    pts:[{x:60,y:250,z:4},{x:70,y:120,z:6},{x:150,y:60,z:2},{x:250,y:80,z:0},{x:290,y:160,z:6},{x:250,y:215,z:14},{x:300,y:265,z:20},{x:420,y:250,z:18},{x:470,y:150,z:12},{x:560,y:140,z:10},{x:610,y:220,z:16},{x:560,y:300,z:24},{x:600,y:380,z:26},{x:520,y:430,z:20},{x:380,y:410,z:10},{x:330,y:340,z:4},{x:250,y:360,z:-2},{x:210,y:440,z:-6},{x:110,y:420,z:-2}]},
  // A purpose-built speed bowl: broad and consistent, only pinching slightly through the harbour
  // infield.
  fast: {label:'CAPE SPEEDWAY', width:14,wprof:[1.14,1.16,1.12,1.06,1.02,0.98,0.94,0.90,0.88,0.90,0.96,1.04,1.10,1.14],
    names:['Lighthouse','Ocean Sweep','Windward','The Cape','Seawall','Harbour','Gull','Breakwater','Dunes','Marina','Pier'],
    blurb:'Long straights and fast sweepers. Power, gearing and low drag decide it; downforce pays for itself.',
    pts:[{x:80,y:400,z:6},{x:80,y:220,z:2},{x:140,y:110,z:-2},{x:320,y:70,z:-4},{x:700,y:60,z:-3},{x:980,y:80,z:0},{x:1120,y:170,z:4},{x:1150,y:330,z:6},{x:1080,y:470,z:5},{x:900,y:520,z:3},{x:700,y:500,z:2},{x:660,y:400,z:1},{x:700,y:300,z:0},{x:640,y:250,z:2},{x:480,y:270,z:5},{x:420,y:380,z:8},{x:300,y:470,z:10},{x:150,y:490,z:9}]},
  // No survey data ships with a GPX trace, so the width profile is DERIVED from the layout —
  // narrow through the twisty wooded sections, opening out on the fast ones — which is how the
  // road was actually built. Modelled width, not measured width, and said so in the blurb.
  nord: {label:'NORDSCHLEIFE',  width:9,wvar:[0.88,1.45],names:[],gps:true,
    blurb:'A 20 km road course through wooded hills: 290 m of elevation, blind crests, long descents and a 3 km straight. Geometry and gradients from a recorded GPX trace; corners are numbered, not named, because the detector cannot reliably align with the circuit\'s real corner names. Track width is modelled from the layout — tight sections narrow, fast sections open — not surveyed.',
    pts:[
         {x:3235.7,y:3888,z:236.1},{x:3216.5,y:3903.7,z:236.9},{x:3198.8,y:3920.7,z:237.7},{x:3179.7,y:3936.6,z:238.5},{x:3158.5,y:3951.1,z:239.5},{x:3136.7,y:3965.2,z:240.6},
         {x:3114.8,y:3979.3,z:241.6},{x:3092.9,y:3993.4,z:242.7},{x:3071.1,y:4007.5,z:243.7},{x:3049.2,y:4021.6,z:244.8},{x:3027.4,y:4035.7,z:245.8},{x:3005.5,y:4049.7,z:246.9},
         {x:2983.7,y:4063.8,z:247.9},{x:2961.8,y:4077.9,z:249},{x:2939.9,y:4092,z:250},{x:2918.1,y:4106.1,z:251.1},{x:2896.2,y:4120.2,z:252.1},{x:2874.4,y:4134.3,z:253.1},
         {x:2852.6,y:4148.4,z:253.6},{x:2831.1,y:4163,z:253.5},{x:2810.2,y:4178.4,z:253.1},{x:2790.3,y:4195.1,z:252.6},{x:2771.5,y:4212.9,z:252},{x:2753.3,y:4231.5,z:251.5},
         {x:2735.9,y:4250.7,z:250.9},{x:2719.1,y:4270.5,z:250.2},{x:2702.6,y:4290.6,z:249.6},{x:2686.1,y:4310.8,z:248.9},{x:2669.7,y:4330.9,z:248.3},{x:2653.3,y:4351.1,z:248},
         {x:2636.9,y:4371.3,z:248.4},{x:2620.6,y:4391.6,z:249.4},{x:2604.3,y:4411.8,z:250.8},{x:2588,y:4432.1,z:252.2},{x:2571.9,y:4452.4,z:253.6},{x:2556.4,y:4473.3,z:255},
         {x:2542,y:4494.9,z:256.5},{x:2528.5,y:4517.1,z:258.1},{x:2515.2,y:4539.4,z:259.6},{x:2501.7,y:4561.6,z:261.2},{x:2487.2,y:4583,z:262.8},{x:2470.9,y:4603,z:264.4},
         {x:2453.1,y:4621.8,z:266},{x:2434.7,y:4640.1,z:267.7},{x:2416.3,y:4658.5,z:269.3},{x:2398.7,y:4677.5,z:270.7},{x:2383.5,y:4698.1,z:271.7},{x:2370.5,y:4720.1,z:272.3},
         {x:2356.8,y:4740.7,z:272.8},{x:2338.7,y:4754.9,z:273.5},{x:2315.9,y:4760.9,z:274.6},{x:2291.2,y:4763.3,z:276},{x:2266.9,y:4768.9,z:277.4},{x:2243.9,y:4779.5,z:279},
         {x:2221.7,y:4791,z:280.6},{x:2199.3,y:4796.6,z:282.1},{x:2176.8,y:4792.3,z:283.5},{x:2155.1,y:4780.1,z:284.9},{x:2134.4,y:4764.6,z:286.2},{x:2114.6,y:4747.9,z:287.3},
         {x:2095.9,y:4730,z:288},{x:2078.7,y:4710.6,z:288.4},{x:2062.7,y:4690.2,z:288.7},{x:2047.1,y:4669.5,z:289.2},{x:2030.4,y:4650.8,z:289.7},{x:2011.4,y:4639.2,z:290},
         {x:1991.1,y:4640,z:289.8},{x:1972.7,y:4653.1,z:288.8},{x:1957.7,y:4673.1,z:287},{x:1944.6,y:4695.5,z:284.8},{x:1931.9,y:4718.2,z:282.7},{x:1918.8,y:4740.6,z:280.8},
         {x:1904.2,y:4761.8,z:279.1},{x:1887.1,y:4780.8,z:277.2},{x:1867.4,y:4797.4,z:275.3},{x:1846.1,y:4812.1,z:273.2},{x:1823.8,y:4825.4,z:270.6},{x:1800.8,y:4837.3,z:267.8},
         {x:1776.9,y:4846.7,z:265.1},{x:1752,y:4852.6,z:262.8},{x:1726.8,y:4853.6,z:260.9},{x:1702,y:4848.9,z:259.1},{x:1678,y:4839.9,z:257.2},{x:1654.7,y:4828.6,z:255.7},
         {x:1631.7,y:4816.5,z:254.8},{x:1608.5,y:4804.9,z:254.2},{x:1584.8,y:4794.3,z:253.6},{x:1560.4,y:4785.5,z:252.9},{x:1535.4,y:4778.9,z:252.2},{x:1509.9,y:4774.4,z:251.5},
         {x:1484.1,y:4771.4,z:251},{x:1458.2,y:4769.2,z:250.6},{x:1432.4,y:4768.1,z:250.2},{x:1406.8,y:4769.8,z:249.8},{x:1381.8,y:4774.8,z:248.9},{x:1357,y:4779.9,z:247.7},
         {x:1332.7,y:4779.6,z:246.5},{x:1310.2,y:4771,z:245.9},{x:1290.3,y:4755.7,z:246.2},{x:1273.3,y:4736.5,z:246.9},{x:1259.3,y:4715.1,z:247.7},{x:1246,y:4693.1,z:248.1},
         {x:1230.4,y:4673.3,z:248},{x:1211.4,y:4656.4,z:247.6},{x:1191.8,y:4640,z:247},{x:1175.3,y:4621.1,z:246.2},{x:1162.3,y:4599.5,z:245.1},{x:1148.9,y:4579,z:243.9},
         {x:1130.7,y:4563.9,z:242.9},{x:1107.6,y:4555.1,z:242.4},{x:1082.4,y:4549.9,z:242.5},{x:1056.7,y:4545.6,z:243.2},{x:1031.1,y:4541.2,z:244.1},{x:1006.2,y:4535.2,z:245},
         {x:983.7,y:4525.1,z:245.7},{x:966.7,y:4508.7,z:246},{x:956.1,y:4486.8,z:245.8},{x:948.9,y:4462.4,z:244.8},{x:939.8,y:4438.9,z:242.7},{x:925.8,y:4418.2,z:240.3},
         {x:907.4,y:4400.6,z:238.3},{x:886.8,y:4384.9,z:236.8},{x:865.7,y:4369.8,z:235.4},{x:844.5,y:4354.7,z:233.7},{x:823.2,y:4339.7,z:231.8},{x:802,y:4324.8,z:229.9},
         {x:780.6,y:4309.9,z:228.2},{x:759.3,y:4295.1,z:226.8},{x:738,y:4280.1,z:225.7},{x:716.8,y:4265,z:224.9},{x:695.8,y:4249.7,z:224.3},{x:675.1,y:4234,z:223.7},
         {x:654.8,y:4217.7,z:223.4},{x:635.3,y:4200.6,z:223.4},{x:616.9,y:4182.4,z:223.8},{x:599.6,y:4163.1,z:224.7},{x:582.8,y:4143.2,z:226.3},{x:566.3,y:4123.1,z:228.4},
         {x:549.8,y:4103,z:230.9},{x:533.4,y:4082.8,z:233.4},{x:517,y:4062.7,z:235.9},{x:500.5,y:4042.5,z:238.3},{x:484.1,y:4022.3,z:240.6},{x:467.8,y:4002.1,z:242.6},
         {x:451.8,y:3981.7,z:244.1},{x:436.7,y:3960.6,z:245.3},{x:424.3,y:3938.3,z:245.9},{x:415.9,y:3914.3,z:246.4},{x:411.2,y:3889,z:246.9},{x:409,y:3863.2,z:247.5},
         {x:408.9,y:3837.3,z:247.9},{x:411.9,y:3812,z:248.1},{x:418.6,y:3787.2,z:248.2},{x:427.5,y:3762.9,z:248.2},{x:437,y:3738.7,z:248.2},{x:446.3,y:3714.4,z:248.2},
         {x:454.7,y:3689.9,z:248.2},{x:461.9,y:3664.9,z:248.2},{x:467.6,y:3639.6,z:248.3},{x:472.2,y:3614,z:248.4},{x:476.1,y:3588.3,z:248.6},{x:479.8,y:3562.6,z:248.9},
         {x:482.9,y:3536.8,z:249.2},{x:485.1,y:3511,z:249.7},{x:486.1,y:3485,z:250.3},{x:486,y:3459.1,z:250.3},{x:484.7,y:3433.1,z:249.6},{x:482.8,y:3407.2,z:248.3},
         {x:480.6,y:3381.3,z:246.9},{x:478.2,y:3355.4,z:245.2},{x:474.9,y:3329.7,z:243.1},{x:470.6,y:3304.1,z:240.5},{x:465.7,y:3278.5,z:237.6},{x:460.5,y:3253.1,z:234.8},
         {x:454.5,y:3227.8,z:232.3},{x:447,y:3203,z:230.3},{x:438.4,y:3178.5,z:228.7},{x:429.2,y:3154.2,z:227.4},{x:419.6,y:3130.1,z:226.4},{x:409.6,y:3106.1,z:225.8},
         {x:399.4,y:3082.1,z:225.5},{x:389.1,y:3058.3,z:225.2},{x:378.8,y:3034.4,z:224.8},{x:368.5,y:3010.5,z:224.5},{x:358.2,y:2986.6,z:224.2},{x:348,y:2962.7,z:223.9},
         {x:337.7,y:2938.8,z:223.6},{x:327.6,y:2914.9,z:223.2},{x:317.7,y:2890.8,z:222.8},{x:307.9,y:2866.7,z:222.3},{x:298.1,y:2842.7,z:221.8},{x:287.4,y:2819.1,z:221.3},
         {x:275.1,y:2796.2,z:220.8},{x:261.1,y:2774.5,z:219.9},{x:245.2,y:2754.1,z:218.3},{x:227.5,y:2735.2,z:216.3},{x:208.4,y:2717.7,z:214.1},{x:187.9,y:2701.9,z:211.7},
         {x:166.2,y:2687.9,z:209.5},{x:143.4,y:2675.7,z:207.5},{x:119.9,y:2664.4,z:205.8},{x:96.3,y:2653.7,z:204.4},{x:72.5,y:2643.1,z:203.2},{x:49.1,y:2632,z:202.1},
         {x:27.2,y:2619,z:201.2},{x:9.7,y:2602.2,z:200.3},{x:0,y:2580.8,z:199.3},{x:0.2,y:2557.5,z:198},{x:10.1,y:2536,z:196.4},{x:27.6,y:2518.8,z:195.1},
         {x:49.6,y:2506,z:193.8},{x:73.3,y:2495.5,z:192.8},{x:97.3,y:2485.7,z:191.7},{x:121.3,y:2475.8,z:190.6},{x:145.3,y:2465.8,z:189.3},{x:169.3,y:2455.6,z:187.5},
         {x:193.1,y:2445.1,z:184.9},{x:216.6,y:2434.1,z:182.2},{x:239.7,y:2422.3,z:180},{x:261.8,y:2408.9,z:178.4},{x:282.4,y:2393.4,z:176.9},{x:302.1,y:2376.5,z:174.8},
         {x:321.9,y:2359.6,z:172},{x:342.3,y:2343.7,z:169},{x:363.4,y:2328.6,z:166.4},{x:384.3,y:2313.3,z:164.1},{x:404.3,y:2296.9,z:161.6},{x:423.3,y:2279.2,z:158.7},
         {x:441.7,y:2260.9,z:155.4},{x:459.8,y:2242.2,z:151.9},{x:477.9,y:2223.5,z:148.8},{x:496.1,y:2205,z:146.3},{x:514.9,y:2187,z:143.8},{x:534.2,y:2169.6,z:141.1},
         {x:553.9,y:2152.6,z:138.6},{x:573.5,y:2135.6,z:137},{x:592.7,y:2118.1,z:136.2},{x:611.2,y:2099.8,z:135.3},{x:628.8,y:2080.8,z:133.8},{x:645.3,y:2060.8,z:132.2},
         {x:659.9,y:2039.5,z:131.5},{x:672.6,y:2016.9,z:131.6},{x:683.8,y:1993.5,z:132},{x:694.1,y:1969.7,z:132.2},{x:704.1,y:1945.7,z:132.2},{x:713.9,y:1921.6,z:132.5},
         {x:722.9,y:1897.2,z:133.2},{x:729.9,y:1872.5,z:134.4},{x:733.5,y:1847.2,z:136},{x:734.2,y:1821.4,z:137.9},{x:733.8,y:1795.5,z:140},{x:734.7,y:1769.8,z:141.7},
         {x:739.6,y:1745.4,z:142.7},{x:750.9,y:1723.6,z:142.9},{x:767.8,y:1704.9,z:142.3},{x:786.8,y:1687.7,z:141.4},{x:803.5,y:1668.9,z:140.7},{x:813,y:1647.3,z:140.7},
         {x:812.5,y:1624.3,z:141.5},{x:804.4,y:1601.8,z:142.6},{x:797.2,y:1579.6,z:143},{x:798.7,y:1557.4,z:142.2},{x:809.9,y:1536.4,z:140.8},{x:826.8,y:1517.5,z:139.3},
         {x:846.1,y:1500.3,z:137.8},{x:866.3,y:1484,z:136.2},{x:886.8,y:1467.9,z:134.6},{x:907.3,y:1452,z:133.3},{x:927.7,y:1435.8,z:132.5},{x:947.4,y:1419,z:132.3},
         {x:966.1,y:1401,z:132.5},{x:984,y:1382.3,z:132.8},{x:1001.7,y:1363.2,z:133.2},{x:1019.4,y:1344.1,z:133.5},{x:1037.2,y:1325.2,z:133.7},{x:1055.4,y:1306.6,z:133.6},
         {x:1074,y:1288.5,z:133.1},{x:1092.8,y:1270.5,z:132.4},{x:1111.7,y:1252.7,z:131.7},{x:1130.5,y:1234.7,z:130.9},{x:1148.6,y:1216.1,z:130},{x:1165.8,y:1196.6,z:128.9},
         {x:1182.1,y:1176.4,z:128},{x:1197.8,y:1155.7,z:127.4},{x:1213,y:1134.6,z:127.1},{x:1227.2,y:1113,z:126.7},{x:1239.2,y:1090.3,z:125.9},{x:1247.1,y:1066.2,z:125},
         {x:1250,y:1040.9,z:124.1},{x:1248.4,y:1015.4,z:123.3},{x:1243.9,y:989.8,z:122.7},{x:1238.2,y:964.5,z:122.6},{x:1231.7,y:939.3,z:122.8},{x:1224,y:914.6,z:123.7},
         {x:1213.5,y:891.6,z:125.2},{x:1198,y:873,z:127},{x:1177.2,y:861.2,z:128.6},{x:1152.8,y:855.6,z:129.3},{x:1127.5,y:852,z:128.8},{x:1102.9,y:845.6,z:127.2},
         {x:1079.7,y:835.1,z:124.9},{x:1057.5,y:821.7,z:122},{x:1036,y:807.2,z:118.6},{x:1015,y:791.9,z:115.1},{x:995.3,y:775.2,z:111.9},{x:979.2,y:756.4,z:108.7},
         {x:970.9,y:735,z:105.8},{x:974,y:713.6,z:104},{x:988,y:695.3,z:103.6},{x:1008.4,y:680.9,z:104},{x:1031.1,y:668.5,z:104.7},{x:1054.1,y:656.4,z:105.4},
         {x:1076.7,y:643.7,z:105.6},{x:1098.4,y:629.5,z:104.8},{x:1119.2,y:614,z:103.3},{x:1139.1,y:597.4,z:101.5},{x:1157.2,y:579.2,z:99.7},{x:1171.8,y:558.6,z:97.3},
         {x:1181.4,y:535.4,z:94.1},{x:1187.8,y:510.7,z:90.2},{x:1194.8,y:486,z:86.6},{x:1204.7,y:462.4,z:83.5},{x:1217.2,y:439.7,z:80.6},{x:1231.1,y:417.8,z:77.5},
         {x:1246.3,y:396.9,z:74},{x:1263.8,y:378.4,z:70.8},{x:1284.5,y:363.7,z:68},{x:1307.7,y:353.3,z:65.5},{x:1332.4,y:347.7,z:62.9},{x:1357.6,y:347.6,z:60.9},
         {x:1382.7,y:352.4,z:59.8},{x:1406.9,y:361.1,z:58.8},{x:1429.9,y:372.7,z:57.6},{x:1452,y:386.2,z:56.2},{x:1473.7,y:400.6,z:54.5},{x:1495.1,y:415.4,z:52.8},
         {x:1516.3,y:430.4,z:51},{x:1537.3,y:445.7,z:49.2},{x:1557.5,y:461.7,z:47.5},{x:1575,y:480,z:46.5},{x:1589.6,y:500.6,z:46.2},{x:1604.2,y:519.7,z:46.3},
         {x:1621.6,y:529.7,z:45.7},{x:1640.3,y:525.7,z:43.5},{x:1657.9,y:510.9,z:40.2},{x:1676.3,y:494.3,z:37},{x:1697.9,y:482.1,z:34.5},{x:1722.3,y:475,z:32.4},
         {x:1747.8,y:470.9,z:30.5},{x:1773.6,y:468.2,z:28.6},{x:1799.5,y:466.3,z:26.5},{x:1825.5,y:464.6,z:24.3},{x:1851.5,y:463.2,z:21.9},{x:1877.4,y:461.8,z:19.6},
         {x:1903.4,y:460.9,z:17.2},{x:1929.3,y:461.3,z:14.9},{x:1955,y:463.9,z:12.8},{x:1980.5,y:468.5,z:10.9},{x:2005.9,y:474.1,z:9.2},{x:2031.2,y:479.8,z:7.5},
         {x:2056.4,y:483.8,z:5.8},{x:2080.7,y:482.2,z:3.9},{x:2102,y:472.2,z:2},{x:2119,y:454.6,z:0.5},{x:2132,y:432.8,z:0},{x:2141.4,y:408.9,z:0.5},
         {x:2146.7,y:384,z:1.5},{x:2148.4,y:358.4,z:2.5},{x:2149.1,y:332.7,z:3.5},{x:2153.3,y:308.4,z:5.3},{x:2164.6,y:287.7,z:7.9},{x:2183,y:271.6,z:11.1},
         {x:2205.2,y:259,z:14.5},{x:2228.8,y:248.3,z:17.7},{x:2252.9,y:238.3,z:20.3},{x:2277.2,y:229.1,z:22},{x:2301.8,y:220.7,z:23.2},{x:2326.6,y:213,z:23.9},
         {x:2351.6,y:205.8,z:24.3},{x:2376.7,y:199.1,z:24.5},{x:2401.8,y:192.3,z:24.7},{x:2426.9,y:185.6,z:24.9},{x:2452,y:178.8,z:25.2},{x:2477.1,y:172,z:26},
         {x:2502.3,y:165.6,z:27.3},{x:2527.6,y:160.2,z:29.1},{x:2553.2,y:156,z:31},{x:2579,y:152.4,z:33},{x:2604.6,y:148.6,z:34.9},{x:2629.7,y:143,z:36.4},
         {x:2653.5,y:134,z:37.1},{x:2675.6,y:121.3,z:37},{x:2696.7,y:106.3,z:36.7},{x:2717.4,y:90.5,z:36.7},{x:2737.9,y:74.5,z:37.1},{x:2758.2,y:58.3,z:37.4},
         {x:2778.5,y:42,z:37.1},{x:2799.1,y:26.3,z:36.5},{x:2820.8,y:12.5,z:36.3},{x:2844.1,y:2.8,z:36.4},{x:2868.2,y:0,z:36.5},{x:2890.5,y:6.6,z:36.7},
         {x:2907.8,y:22.4,z:37.8},{x:2919,y:44.4,z:39.8},{x:2925.3,y:69.2,z:42.2},{x:2928.6,y:94.8,z:44.4},{x:2929.3,y:120.7,z:45.9},{x:2928.3,y:146.6,z:46.8},
         {x:2926.4,y:172.5,z:47.5},{x:2924.4,y:198.5,z:48.1},{x:2922.8,y:224.4,z:48.7},{x:2922.3,y:250.3,z:49.2},{x:2923,y:276.3,z:49.8},{x:2924.6,y:302.2,z:50.4},
         {x:2926.7,y:328.1,z:51.2},{x:2929.3,y:354,z:52.3},{x:2932.7,y:379.7,z:53.9},{x:2937.6,y:405.2,z:55.9},{x:2944.3,y:430.2,z:57.9},{x:2952.6,y:454.8,z:59.8},
         {x:2962.1,y:479,z:62.2},{x:2973.2,y:502.3,z:64.6},{x:2986.7,y:524.2,z:66},{x:3002.8,y:544.4,z:66.4},{x:3020.6,y:563.2,z:67.2},{x:3039.9,y:580.5,z:69.5},
         {x:3060.4,y:596.4,z:72.7},{x:3081.8,y:611,z:75.3},{x:3103.9,y:624.5,z:76.6},{x:3126.8,y:636.7,z:76.4},{x:3150.3,y:647.7,z:75.4},{x:3174.2,y:657.9,z:75.1},
         {x:3198.3,y:667.8,z:76.6},{x:3222.5,y:677.3,z:79.4},{x:3246.8,y:686.4,z:82.9},{x:3271.3,y:695.1,z:86.7},{x:3296,y:702.9,z:90.3},{x:3321.1,y:708.6,z:93.3},
         {x:3346.7,y:711.3,z:95.3},{x:3372.6,y:711.6,z:96.7},{x:3398.6,y:711.2,z:98.1},{x:3424.6,y:710.8,z:99.6},{x:3450.6,y:710.5,z:101.3},{x:3476.5,y:710.9,z:102.8},
         {x:3502.5,y:712.2,z:103.9},{x:3528.4,y:714.3,z:104.8},{x:3554.2,y:717,z:105.4},{x:3580.1,y:720,z:106},{x:3605.9,y:723,z:106.8},{x:3631.7,y:726.1,z:107.6},
         {x:3657.5,y:729.1,z:108.6},{x:3683.4,y:732.1,z:109.8},{x:3709.2,y:735.4,z:111.5},{x:3734.8,y:739.3,z:113.7},{x:3760.2,y:744.5,z:116.3},{x:3785.4,y:750.7,z:119.3},
         {x:3810.5,y:757.7,z:122.7},{x:3835.4,y:764.9,z:126.1},{x:3860.3,y:772.5,z:129.1},{x:3885.1,y:780.5,z:131.7},{x:3909.3,y:789.5,z:133.4},{x:3932.8,y:800.3,z:134.5},
         {x:3955.2,y:813.3,z:135.2},{x:3976.4,y:828.1,z:135.9},{x:3996.7,y:844.3,z:137.4},{x:4016.8,y:860.7,z:140.1},{x:4037.4,y:876.4,z:143.2},{x:4059,y:890.9,z:146.2},
         {x:4081.3,y:904,z:148.7},{x:4104.3,y:916.2,z:150.7},{x:4127.6,y:927.7,z:152.5},{x:4151.1,y:938.9,z:154.6},{x:4174.9,y:949.2,z:157.1},{x:4199.3,y:957,z:159.7},
         {x:4224.4,y:960.5,z:162.2},{x:4250,y:959.5,z:164.3},{x:4275.3,y:954.8,z:166.1},{x:4299.9,y:947.2,z:167.7},{x:4323.7,y:936.9,z:169.8},{x:4346.8,y:925,z:172.7},
         {x:4369.5,y:912.4,z:175.9},{x:4392,y:899.4,z:178.7},{x:4414,y:885.6,z:180.3},{x:4435.3,y:870.8,z:181.1},{x:4456.3,y:855.4,z:181.7},{x:4477.1,y:839.8,z:182.8},
         {x:4497.9,y:824.2,z:184.5},{x:4518.4,y:808.3,z:186.3},{x:4538.6,y:792,z:187.8},{x:4559.2,y:776.3,z:188.8},{x:4581.1,y:763.1,z:189.7},{x:4604.9,y:753.6,z:190.7},
         {x:4629.9,y:747.4,z:192.1},{x:4655.4,y:742.8,z:193.8},{x:4681.1,y:738.8,z:195.7},{x:4706.8,y:735.1,z:197.8},{x:4732.6,y:731.7,z:199.9},{x:4758.4,y:728.4,z:202},
         {x:4784.1,y:724.7,z:204.1},{x:4809.7,y:720.1,z:205.9},{x:4835,y:714.7,z:207.3},{x:4860,y:711.1,z:208.3},{x:4883.4,y:713.9,z:208.9},{x:4901.9,y:725.8,z:209.2},
         {x:4911.6,y:745.7,z:209.4},{x:4911.2,y:768.9,z:209.8},{x:4901.8,y:791.3,z:210.4},{x:4886,y:810.7,z:210.9},{x:4866.8,y:827.9,z:211.2},{x:4846.5,y:844.1,z:211.3},
         {x:4826,y:860,z:211.6},{x:4805.6,y:876.1,z:212.3},{x:4785.9,y:892.8,z:213.6},{x:4766.5,y:909.7,z:215},{x:4746.4,y:926,z:216.4},{x:4725.4,y:941.3,z:217.4},
         {x:4703.7,y:955.6,z:218.1},{x:4682,y:969.4,z:218.8},{x:4663.6,y:985,z:219.9},{x:4654.4,y:1003.9,z:221.6},{x:4659,y:1022.6,z:223},{x:4674.9,y:1033.6,z:222.8},
         {x:4694.2,y:1031.4,z:221.6},{x:4710.5,y:1016.6,z:220.3},{x:4724,y:995.7,z:219.4},{x:4738.6,y:974.8,z:218.8},{x:4756.3,y:956.3,z:218.7},{x:4776.4,y:940.1,z:218.4},
         {x:4798.1,y:926.3,z:217.5},{x:4821.4,y:915.4,z:216.4},{x:4845.7,y:906.5,z:215.8},{x:4870.4,y:898.3,z:215.7},{x:4895.1,y:890.2,z:216.3},{x:4919.8,y:882.1,z:217.7},
         {x:4944.6,y:874.2,z:219.5},{x:4969.5,y:867,z:221.8},{x:4994.7,y:860.8,z:224.3},{x:5020,y:854.9,z:227.1},{x:5044.8,y:847.6,z:230.2},{x:5068.9,y:838.3,z:233.5},
         {x:5091.6,y:826.4,z:236.9},{x:5113.2,y:812.2,z:240.5},{x:5133.8,y:796.5,z:244},{x:5153.8,y:779.9,z:247.1},{x:5172.7,y:762.2,z:250.1},{x:5190.2,y:743.1,z:253.2},
         {x:5205.8,y:722.6,z:256.4},{x:5219.5,y:700.7,z:259.6},{x:5230.1,y:677.7,z:262.6},{x:5235.8,y:653.4,z:265.6},{x:5236.4,y:628,z:268.7},{x:5234.9,y:602.5,z:272},
         {x:5236.2,y:577.4,z:275.1},{x:5243.4,y:553.7,z:277.4},{x:5255.8,y:531.4,z:279.2},{x:5270.4,y:510,z:280.5},{x:5285.8,y:489.1,z:281.6},{x:5302.7,y:470.1,z:282.8},
         {x:5322.5,y:455.8,z:283.8},{x:5345.3,y:449.2,z:284.4},{x:5369.5,y:451.2,z:284.4},{x:5393.5,y:459.4,z:284.1},{x:5417.2,y:469.9,z:283.9},{x:5441.1,y:479.8,z:283.6},
         {x:5465.7,y:488.1,z:283.3},{x:5490.6,y:495,z:282.9},{x:5515.7,y:501.8,z:282.2},{x:5540.7,y:508.9,z:281.2},{x:5565.5,y:516.6,z:280.2},{x:5589.6,y:525.8,z:279},
         {x:5612,y:538.1,z:277.5},{x:5631.7,y:554.2,z:275.5},{x:5648.8,y:573.2,z:273.1},{x:5665.1,y:593.3,z:270.8},{x:5682.6,y:612.1,z:268.8},{x:5702.5,y:628,z:267},
         {x:5725,y:639.7,z:265.2},{x:5749.4,y:647.1,z:263.3},{x:5774.6,y:652,z:261.3},{x:5798.9,y:658.5,z:259.3},{x:5821,y:669.9,z:257.3},{x:5840.5,y:686.2,z:255.3},
         {x:5858.4,y:704.9,z:254},{x:5875.6,y:724.4,z:253.2},{x:5892.3,y:744.2,z:253},{x:5907.8,y:764.9,z:253.4},{x:5920.2,y:787.1,z:253.8},{x:5927.3,y:811.1,z:253.7},
         {x:5928,y:836.1,z:252.6},{x:5922.9,y:861,z:250.5},{x:5914.1,y:885.1,z:247.9},{x:5903.9,y:909,z:245},{x:5894,y:933,z:242.2},{x:5885.2,y:957.4,z:239.3},
         {x:5878,y:982.3,z:236.5},{x:5874.4,y:1007.2,z:233.9},{x:5877.7,y:1031.1,z:231.7},{x:5888.9,y:1052.7,z:229.9},{x:5905.9,y:1071.4,z:228.2},{x:5926.1,y:1086.7,z:226.2},
         {x:5948.9,y:1098,z:223.6},{x:5973.4,y:1106.1,z:220.5},{x:5998.1,y:1113.2,z:217.1},{x:6020.9,y:1123.1,z:213.9},{x:6038.6,y:1138.8,z:211.6},{x:6049.1,y:1160.4,z:209.7},
         {x:6054,y:1185.2,z:207.9},{x:6056.6,y:1211,z:206.5},{x:6058.9,y:1236.9,z:206},{x:6060.9,y:1262.8,z:206.3},{x:6061.7,y:1288.6,z:207.3},{x:6058.7,y:1313.6,z:209.2},
         {x:6048.9,y:1335.5,z:212},{x:6031.6,y:1351.2,z:214.8},{x:6008.7,y:1359.3,z:216.9},{x:5983.4,y:1361.5,z:218.2},{x:5957.5,y:1360.9,z:218.9},{x:5931.5,y:1359.4,z:219.1},
         {x:5905.6,y:1357.6,z:219.2},{x:5879.7,y:1355.7,z:219.1},{x:5853.8,y:1353.9,z:218.8},{x:5828.1,y:1353.6,z:218.7},{x:5803.8,y:1358,z:219.3},{x:5782.9,y:1369.5,z:221.1},
         {x:5767.6,y:1388,z:223.4},{x:5756.8,y:1410.6,z:225.4},{x:5746.6,y:1434,z:226.6},{x:5733.9,y:1456.3,z:227.1},{x:5718.9,y:1477.5,z:226.8},{x:5703.3,y:1498.2,z:225.8},
         {x:5688,y:1519.2,z:223.9},{x:5674.1,y:1541,z:221.3},{x:5662.2,y:1564,z:218.7},{x:5652.1,y:1587.8,z:216.4},{x:5644.1,y:1612.4,z:214.2},{x:5639.3,y:1637.5,z:212.1},
         {x:5637.9,y:1663.2,z:210},{x:5638.5,y:1689.1,z:208.1},{x:5639.5,y:1715.1,z:206.6},{x:5640.5,y:1741.1,z:205.4},{x:5641.3,y:1767.1,z:204.5},{x:5641.8,y:1793.1,z:203.8},
         {x:5642.3,y:1819.1,z:203.5},{x:5642.8,y:1845.1,z:203.4},{x:5642.5,y:1870.9,z:203.8},{x:5639.2,y:1895.9,z:204.6},{x:5630.6,y:1919.1,z:205.8},{x:5616.7,y:1940.1,z:207.2},
         {x:5599.2,y:1958.7,z:208.3},{x:5578.9,y:1974.1,z:209},{x:5556.2,y:1985.4,z:209.4},{x:5531.7,y:1993.4,z:209.8},{x:5506.7,y:2000.4,z:210.3},{x:5482.3,y:2008.6,z:210.8},
         {x:5459.4,y:2019.9,z:211.1},{x:5438.8,y:2034.8,z:211.2},{x:5419.9,y:2052.3,z:211.1},{x:5401.7,y:2071,z:210.8},{x:5383.8,y:2089.8,z:210.4},{x:5366.1,y:2108.8,z:209.9},
         {x:5349.3,y:2128.5,z:209.4},{x:5334.2,y:2149.4,z:209},{x:5321.1,y:2171.7,z:208.3},{x:5309.4,y:2194.8,z:207.2},{x:5298,y:2218.3,z:205.9},{x:5286.7,y:2241.7,z:204.6},
         {x:5275,y:2264.8,z:203.3},{x:5262.1,y:2287.2,z:202.3},{x:5247,y:2308.2,z:201.4},{x:5229.6,y:2327.2,z:200.4},{x:5209.9,y:2343.6,z:199.4},{x:5188.3,y:2357.5,z:198.7},
         {x:5165.8,y:2370.4,z:198.4},{x:5143.9,y:2384.2,z:198.2},{x:5123,y:2399.4,z:198.2},{x:5102.2,y:2414.8,z:198.1},{x:5080.4,y:2428.6,z:197.8},{x:5057.1,y:2439.8,z:197.1},
         {x:5032.7,y:2448.1,z:196.2},{x:5007.6,y:2454,z:195.3},{x:4982.2,y:2459.3,z:194.5},{x:4957,y:2465.6,z:193.9},{x:4932.1,y:2473.1,z:193.7},{x:4907.5,y:2481.3,z:193.9},
         {x:4883,y:2490.1,z:194.4},{x:4858.7,y:2499.3,z:195.1},{x:4834.4,y:2508.4,z:195.9},{x:4809.9,y:2517.1,z:196.5},{x:4785.1,y:2524.6,z:197},{x:4759.8,y:2530.3,z:197.2},
         {x:4734.2,y:2534.2,z:197.2},{x:4708.5,y:2535.8,z:197.3},{x:4683.1,y:2533.8,z:197.9},{x:4658.8,y:2526.7,z:199.2},{x:4636.2,y:2514.8,z:201},{x:4615.3,y:2499.7,z:202.7},
         {x:4595.1,y:2483.4,z:204.1},{x:4574.4,y:2468.2,z:205.4},{x:4552,y:2456.6,z:206.5},{x:4528,y:2451.3,z:207.2},{x:4503.5,y:2453.4,z:207.6},{x:4479.9,y:2462.1,z:208.1},
         {x:4457.3,y:2474.6,z:208.6},{x:4435.4,y:2488.4,z:209.2},{x:4413.7,y:2502.8,z:209.8},{x:4392.3,y:2517.5,z:210.7},{x:4371.6,y:2533,z:211.5},{x:4354,y:2550.6,z:212.4},
         {x:4343.5,y:2571.2,z:213.7},{x:4343.3,y:2593.9,z:215.1},{x:4352.8,y:2615.9,z:216.2},{x:4368.5,y:2635.8,z:216.6},{x:4387.3,y:2653.3,z:216.4},{x:4408.2,y:2668.4,z:215.9},
         {x:4430.7,y:2681.1,z:215.3},{x:4454.2,y:2691.8,z:214.8},{x:4478.3,y:2701.6,z:214.5},{x:4502.7,y:2710.7,z:214.6},{x:4527.2,y:2719.4,z:215.1},{x:4551.8,y:2727.8,z:215.9},
         {x:4576.4,y:2736,z:216.9},{x:4600.6,y:2745,z:218.2},{x:4623.1,y:2756.7,z:219.9},{x:4642.5,y:2772.7,z:222.3},{x:4658.3,y:2792.6,z:224.5},{x:4671,y:2814.9,z:225.8},
         {x:4681.3,y:2838.6,z:226.2},{x:4689.7,y:2863.1,z:226.5},{x:4696.1,y:2888.2,z:226.6},{x:4699.9,y:2913.7,z:226},{x:4700.2,y:2939.3,z:224.8},{x:4696.4,y:2964.6,z:223.5},
         {x:4688.3,y:2988.8,z:222.2},{x:4676,y:3011.1,z:221.2},{x:4659.8,y:3030.9,z:220.3},{x:4640.7,y:3048.2,z:219.7},{x:4619.7,y:3063.2,z:219.4},{x:4597.4,y:3076.4,z:219.4},
         {x:4574.5,y:3088.7,z:219.6},{x:4551.6,y:3100.9,z:219.8},{x:4528.6,y:3113.1,z:219.9},{x:4505.8,y:3125.6,z:219.9},{x:4483.2,y:3138.4,z:219.6},{x:4460.7,y:3151.5,z:219.2},
         {x:4438.3,y:3164.6,z:218.7},{x:4415.9,y:3177.9,z:218.2},{x:4393.7,y:3191.4,z:217.5},{x:4371.5,y:3205,z:216.8},{x:4349.3,y:3218.6,z:216},{x:4327.1,y:3232.1,z:214.9},
         {x:4304.9,y:3245.6,z:213.7},{x:4282.7,y:3259.1,z:212.4},{x:4260.4,y:3272.5,z:211.1},{x:4238.2,y:3286,z:209.9},{x:4215.9,y:3299.4,z:209},{x:4193.6,y:3312.8,z:208.5},
         {x:4171.3,y:3326.2,z:208.4},{x:4149,y:3339.5,z:208.5},{x:4126.6,y:3352.8,z:208.6},{x:4104.3,y:3366.1,z:208.7},{x:4081.9,y:3379.4,z:208.8},{x:4059.6,y:3392.7,z:208.9},
         {x:4037.3,y:3406,z:209.1},{x:4015,y:3419.4,z:209.2},{x:3992.7,y:3432.8,z:209.3},{x:3970.4,y:3446.3,z:209.5},{x:3948.2,y:3459.7,z:209.7},{x:3925.9,y:3473.2,z:209.9},
         {x:3903.7,y:3486.7,z:210.1},{x:3881.5,y:3500.2,z:210.3},{x:3859.3,y:3513.7,z:210.6},{x:3837.1,y:3527.2,z:210.9},{x:3814.9,y:3540.8,z:211.2},{x:3792.7,y:3554.3,z:211.6},
         {x:3770.5,y:3567.9,z:211.9},{x:3748.3,y:3581.5,z:212.4},{x:3726.2,y:3595.1,z:212.9},{x:3704,y:3608.7,z:213.5},{x:3681.9,y:3622.3,z:214.2},{x:3659.7,y:3636,z:214.8},
         {x:3637.6,y:3649.6,z:215.4},{x:3615.5,y:3663.3,z:216},{x:3593.3,y:3676.9,z:216.7},{x:3571.2,y:3690.6,z:217.6},{x:3549.2,y:3704.4,z:218.8},{x:3527.2,y:3718.3,z:220.2},
         {x:3505.2,y:3732.1,z:221.5},{x:3483.2,y:3746,z:222.9},{x:3461.2,y:3759.9,z:224.3},{x:3439.2,y:3773.7,z:225.7},{x:3417.2,y:3787.5,z:227},{x:3395,y:3801.1,z:228.3},
         {x:3372.5,y:3814.1,z:229.6},{x:3349.6,y:3826.4,z:230.7},{x:3326.6,y:3838.5,z:231.8},{x:3303.5,y:3850.4,z:232.9},{x:3280.4,y:3862.4,z:234},{x:3257.5,y:3874.6,z:235.1}]},
  // Modern GP layout: a very wide pit straight and stadium section, a noticeably tighter infield.
  mixed:{label:'RIVERSIDE GP',  width:12,wprof:[1.28,1.22,1.10,1.00,0.96,1.02,1.14,1.20,1.10,0.96,0.86,0.82,0.84,0.90,0.98,1.08,1.18,1.26],
    names:['Millrace','Weir','Ferryman','The Island','Boathouse','Willows','Lock','Bridge','Towpath','Reeds','Anglers','Bankside','Riverbend'],
    blurb:'A balanced grand-prix layout: a long back straight into heavy braking, then a technical infield.',
    pts:[{x:90,y:430,z:-2},{x:80,y:280,z:6},{x:160,y:180,z:14},{x:300,y:150,z:20},{x:420,y:190,z:22},{x:520,y:130,z:16},{x:660,y:100,z:8},{x:820,y:130,z:2},{x:880,y:250,z:-4},{x:840,y:370,z:-8},{x:720,y:420,z:-6},{x:640,y:350,z:-2},{x:560,y:380,z:0},{x:540,y:470,z:-6},{x:420,y:500,z:-14},{x:330,y:440,z:-20},{x:240,y:470,z:-18},{x:150,y:510,z:-10}]}
};
// Real circuits (build 123) ship in their own file, tracks/real-circuits.js, generated offline by
// tools/import-real-tracks.mjs: TUM's measured centreline and width, georeferenced and given heights
// from a terrain model. Separate because its data carries its sources' licences (LGPL-3.0, ODbL), and
// optional: without the file the app has its four test circuits and nothing breaks.
if(typeof window!=='undefined'&&window.REAL_TRACKS)Object.assign(TRACKS,window.REAL_TRACKS);
// Closed Catmull-Rom through the control points, sampled at roughly `step` metres.
// The centreline through the circuit's control points: a CENTRIPETAL Catmull-Rom spline (knots spaced by
// the square root of the distance between points), then resampled at a uniform step along its length
// (build 115). It was the uniform spline, stepped evenly in its parameter: with control points unevenly
// spaced (a 40 m gap beside a 10 m one) that one overshoots and nearly cusps, and its samples bunch
// and spread, so a 25 m corner carried 4 m kinks the racing line then had to drive. The centripetal
// form cannot cusp or loop (Yuksel, Schaefer & Keyser 2011).
// The V8 bug described at simulateLap: copy the result out of the loop-heavy function before it is held.
function simulateAccel(){const r=simulateAccelRun();return r&&detachResult(r);}
function catmullClosed(cp,step){
  const n=cp.length,dense=[];
  const lerp=(a,b,ta,tb,t)=>{const w=(tb-ta)>1e-9?(t-ta)/(tb-ta):0;return {x:a.x+(b.x-a.x)*w,y:a.y+(b.y-a.y)*w,z:(a.z||0)+((b.z||0)-(a.z||0))*w};};
  for(let i=0;i<n;i++){
    const p0=cp[(i-1+n)%n],p1=cp[i],p2=cp[(i+1)%n],p3=cp[(i+2)%n];
    const kn=(a,b)=>Math.max(1e-6,Math.sqrt(Math.hypot(b.x-a.x,b.y-a.y)));
    const t0=0,t1=t0+kn(p0,p1),t2=t1+kn(p1,p2),t3=t2+kn(p2,p3);
    const steps=Math.max(8,Math.ceil(Math.hypot(p2.x-p1.x,p2.y-p1.y)/step*4));
    for(let j=0;j<steps;j++){
      const t=t1+(t2-t1)*j/steps;
      const A1=lerp(p0,p1,t0,t1,t),A2=lerp(p1,p2,t1,t2,t),A3=lerp(p2,p3,t2,t3,t);
      const B1=lerp(A1,A2,t0,t2,t),B2=lerp(A2,A3,t1,t3,t);
      dense.push(lerp(B1,B2,t1,t2,t));
    }
  }
  // resample at a uniform step along the curve
  const m=dense.length;let total=0;const cum=[0];
  for(let i=0;i<m;i++){const a=dense[i],b=dense[(i+1)%m];total+=Math.hypot(b.x-a.x,b.y-a.y);cum.push(total);}
  const N=Math.max(8,Math.round(total/step)),out=[];
  let k=0;
  for(let j=0;j<N;j++){
    const want=j*total/N;
    while(cum[k+1]<want)k++;
    const a=dense[k],b=dense[(k+1)%m],seg=cum[k+1]-cum[k],w=seg>1e-9?(want-cum[k])/seg:0;
    out.push({x:a.x+(b.x-a.x)*w,y:a.y+(b.y-a.y)*w,z:(a.z||0)+((b.z||0)-(a.z||0))*w});
  }
  return out;
}
// ---- GPX import: turn a real recorded circuit into a track this sim can lap ----
// A GPX trace is lat/lon/elevation points at wildly uneven spacing. Three steps get it into the
// same shape as a hand-built circuit: project to metres, resample to a uniform step (so the
// spline isn't starved on long segments and over-fitted on short ones), and lightly smooth, since
// GPS jitter otherwise reads as curvature and invents corners that aren't there.
// Nothing about a road's shape is ours to ship — this imports the user's own file at runtime and
// stores it only in their browser.
function parseGPX(text){
  const out=[];
  const re=/<(?:trkpt|rtept|wpt)[^>]*?lat="([-\d.]+)"[^>]*?lon="([-\d.]+)"[^>]*?>([\s\S]*?)<\/(?:trkpt|rtept|wpt)>/g;
  let m;
  while((m=re.exec(text))){
    const ele=/<ele>([-\d.]+)<\/ele>/.exec(m[3]);
    out.push({lat:parseFloat(m[1]),lon:parseFloat(m[2]),ele:ele?parseFloat(ele[1]):0});
  }
  if(!out.length){   // self-closing points carry no elevation
    const re2=/<(?:trkpt|rtept|wpt)[^>]*?lat="([-\d.]+)"[^>]*?lon="([-\d.]+)"[^>]*?\/>/g;
    while((m=re2.exec(text)))out.push({lat:parseFloat(m[1]),lon:parseFloat(m[2]),ele:0});
  }
  return out;
}
function gpxTrackName(text){
  const m=/<name>([^<]{1,60})<\/name>/.exec(text);
  return m?m[1].trim().replace(/\s+/g,' '):'IMPORTED CIRCUIT';
}
// Build a track definition from GPX text. step = control-point spacing in metres.
function gpxToTrack(text,opts){
  opts=opts||{};
  const raw=parseGPX(text);
  if(raw.length<20)throw new Error('not enough track points');
  // Equirectangular projection about the centroid — at circuit scale the error is centimetres.
  const lat0=raw.reduce((a,p)=>a+p.lat,0)/raw.length, lon0=raw.reduce((a,p)=>a+p.lon,0)/raw.length;
  const R=6371000,rad=Math.PI/180,kx=rad*R*Math.cos(lat0*rad),ky=rad*R;
  let pts=raw.map(p=>({x:(p.lon-lon0)*kx,y:-(p.lat-lat0)*ky,z:p.ele}));
  // Drop consecutive duplicates, which break the spline.
  pts=pts.filter((p,i)=>i===0||Math.hypot(p.x-pts[i-1].x,p.y-pts[i-1].y)>0.5);
  // Resample the closed loop at a uniform step. The trace usually doesn't quite close, so the
  // last leg back to the start is included and bridged.
  const step=opts.step||22;
  const seg=[];let total=0;
  for(let i=0;i<pts.length;i++){
    const a=pts[i],b=pts[(i+1)%pts.length];
    const d=Math.hypot(b.x-a.x,b.y-a.y);
    seg.push(d);total+=d;
  }
  const nOut=Math.max(24,Math.round(total/step));
  const outPts=[];
  let idx=0,carry=0;
  for(let k=0;k<nOut;k++){
    let want=k*total/nOut;
    while(carry+seg[idx]<want&&idx<seg.length-1){carry+=seg[idx];idx++;}
    const a=pts[idx],b=pts[(idx+1)%pts.length];
    const t=seg[idx]>1e-9?clamp((want-carry)/seg[idx],0,1):0;
    outPts.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
  }
  // Light circular smoothing: GPS jitter reads as curvature, which would invent corners.
  const passes=opts.smooth!=null?opts.smooth:2,n=outPts.length;
  for(let s=0;s<passes;s++){
    const prev=outPts.map(p=>({x:p.x,y:p.y,z:p.z}));
    for(let i=0;i<n;i++){
      const a=prev[(i-1+n)%n],b=prev[i],c=prev[(i+1)%n];
      outPts[i].x=(a.x+2*b.x+c.x)/4;outPts[i].y=(a.y+2*b.y+c.y)/4;outPts[i].z=(a.z+2*b.z+c.z)/4;
    }
  }
  // Re-origin so coordinates are positive, matching the hand-built circuits.
  const minX=Math.min(...outPts.map(p=>p.x)),minY=Math.min(...outPts.map(p=>p.y));
  const zMin=Math.min(...outPts.map(p=>p.z));
  outPts.forEach(p=>{p.x=+(p.x-minX).toFixed(2);p.y=+(p.y-minY).toFixed(2);p.z=+(p.z-zMin).toFixed(2);});
  const gap=Math.hypot(pts[0].x-pts[pts.length-1].x,pts[0].y-pts[pts.length-1].y);
  return {
    label:(opts.name||gpxTrackName(text)).toUpperCase().slice(0,28),
    // A trace carries no width. Rather than pretend the road is a constant ribbon, derive the
    // profile from the layout — roads are wide where they are fast and narrow where they are
    // tight — and label it as modelled.
    width:opts.width||10,wvar:opts.wvar||[0.90,1.30],names:[],
    blurb:opts.blurb||'Imported from a GPX trace. Lap length, gradients and corner sequence come from the recorded data; track width is modelled from the layout, not measured.',
    pts:outPts,imported:true,srcPoints:raw.length,closureGap:gap
  };
}
// The track surface is drawn as a filled ribbon rather than a fat stroke, because the width now
// varies around the lap and a stroke can only ever be one width. Outer edge forward, inner edge
// back: the two loops wind opposite ways, so a non-zero fill covers exactly the tarmac and leaves
// the infield alone.
function trackRibbon(g,T,MX,MY,sc,minPx){
  const p=T.pts,n=p.length;
  const hw=q=>Math.max(minPx,(q.hw!=null?q.hw:T.width/2)*sc);
  g.beginPath();
  for(let i=0;i<=n;i++){const q=p[i%n],h=hw(q);
    const X=MX(q)+q.nx*h,Y=MY(q)+q.ny*h;
    if(i)g.lineTo(X,Y);else g.moveTo(X,Y);}
  for(let i=n;i>=0;i--){const q=p[i%n],h=hw(q);g.lineTo(MX(q)-q.nx*h,MY(q)-q.ny*h);}
  g.closePath();g.fill();
}
const trackCache={};
// A GPS trace is the road plus the receiver's error, and the error reads as curvature: a wobble of a
// couple of metres every 25 m invents corners the road does not have, and the lap slows for them.
// Smooth it (a [1 2 1] filter, repeated to convergence) but never move a point further from where it
// was recorded than the receiver's own accuracy, so every real bend survives (build 115). 2.5 m is a
// consumer GNSS receiver's horizontal accuracy (CEP); the curvature that remains is the road's.
const GPS_TOL=2.5;
function denoiseTrace(pts,tol){
  const n=pts.length,q=pts.map(p=>Object.assign({},p));
  for(let k=0;k<200;k++){
    const pr=q.map(p=>({x:p.x,y:p.y}));
    for(let i=0;i<n;i++){
      const a=pr[(i-1+n)%n],c=pr[(i+1)%n];
      let x=(a.x+2*pr[i].x+c.x)/4,y=(a.y+2*pr[i].y+c.y)/4;
      const dx=x-pts[i].x,dy=y-pts[i].y,d=Math.hypot(dx,dy);
      if(d>tol){x=pts[i].x+dx/d*tol;y=pts[i].y+dy/d*tol;}
      q[i].x=x;q[i].y=y;
    }
  }
  return q;
}
// Sample a circuit into {x,y,ds,s,r} points. Radius comes from the Menger curvature of a window
// of three samples — huge on a straight, small in a hairpin.
function buildTrack(key){
  if(trackCache[key])return trackCache[key];
  const def=TRACKS[key]||TRACKS.mixed;
  const p=catmullClosed(def.gps||def.imported?denoiseTrace(def.pts,GPS_TOL):def.pts,5),n=p.length;
  for(let i=0;i<n;i++){const q=p[(i+1)%n];p[i].ds=Math.hypot(q.x-p[i].x,q.y-p[i].y);}
  let s=0;for(let i=0;i<n;i++){p[i].s=s;s+=p[i].ds;}
  for(let i=0;i<n;i++){
    const a=p[(i-3+n)%n],b=p[i],c=p[(i+3)%n];
    const ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),ca=Math.hypot(a.x-c.x,a.y-c.y);
    const area=Math.abs((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y))/2;
    const k=(ab*bc*ca)>1e-6?4*area/(ab*bc*ca):0;
    p[i].r=k>1e-5?1/k:1e6;
  }
  // ---- Elevation. ds above is the horizontal step; the real distance travelled is the 3D one,
  // and the gradient is what gravity acts along. Vertical curvature is the interesting term: over
  // a crest the car is thrown light (normal load falls by m·v²/Rv), in a compression it is pressed
  // down. That is why a car goes light over a brow and can carry huge speed through a dip.
  for(let i=0;i<n;i++){
    const q=p[(i+1)%n],dz=(q.z||0)-(p[i].z||0);
    p[i].dz=dz;
    p[i].grade=p[i].ds>1e-6?dz/p[i].ds:0;          // rise over horizontal run
    const gg=p[i].grade;
    p[i].sinT=gg/Math.sqrt(1+gg*gg);
    p[i].cosT=1/Math.sqrt(1+gg*gg);
    p[i].ds3=Math.hypot(p[i].ds,dz);               // true distance along the surface
  }
  // Vertical curvature from the grade's rate of change: kv = d(grade)/ds / (1+grade²)^1.5.
  // Negative = crest (the grade falls away: convex, unloads), positive = compression (concave, loads).
  for(let i=0;i<n;i++){
    const a2=p[(i-3+n)%n],b2=p[(i+3)%n];
    let span=0;for(let k=-3;k<3;k++)span+=p[(i+k+n)%n].ds;
    const dg=(b2.grade-a2.grade)/Math.max(1e-6,span),gg=p[i].grade;
    p[i].kv=dg/Math.pow(1+gg*gg,1.5);
  }
  // ---- Track width. A circuit is not a constant-width ribbon. It narrows through the tight,
  // walled-in sections and opens out on the fast ones, and that changes the racing line directly:
  // a 7 m corner simply cannot be straightened as much as a 13 m one, no matter who is driving.
  // `width` stays the AVERAGE width — the profile below is a set of relative multipliers
  // normalised to mean 1 — so the number quoted on the map still reads true and scaling `width`
  // still scales the whole circuit.
  const W0=def.width||12;
  const mul=new Array(n).fill(1);
  if(def.wprof&&def.wprof.length>1){
    // Authored profile: multipliers spread uniformly around the lap, cosine-blended so the edge
    // never steps.
    const wp=def.wprof,M=wp.length;
    for(let i=0;i<n;i++){
      const f=p[i].s/s*M,j0=Math.floor(f)%M,t=f-Math.floor(f);
      const a=wp[j0],b=wp[(j0+1)%M];
      mul[i]=a+(b-a)*(1-Math.cos(Math.PI*t))/2;
    }
  }else if(def.wvar){
    // Derived profile, for traces where no survey exists: roads are built wide where they are
    // fast and narrow where they are tight, so the layout itself is the best available estimate.
    // This is a model of the width, not measured width data, and it is labelled as such.
    // The saturation radius is deliberately high (3 km). A road is one width through everything
    // except the sections that were actually built for speed, so only a genuinely long, open
    // alignment widens it — a 500 m sweeper through the trees is still a country road.
    const lo=def.wvar[0],hi=def.wvar[1];
    for(let i=0;i<n;i++)mul[i]=lo+(hi-lo)*clamp((p[i].r-400)/(3000-400),0,1);
    for(let k=0;k<80;k++){const prev=mul.slice();
      for(let i=0;i<n;i++)mul[i]=(prev[(i-1+n)%n]+2*prev[i]+prev[(i+1)%n])/4;}
  }
  const mAvg=mul.reduce((a,b)=>a+b,0)/n;
  let wMin=1e9,wMax=0;
  for(let i=0;i<n;i++){p[i].w=W0*mul[i]/mAvg;p[i].hw=p[i].w/2;wMin=Math.min(wMin,p[i].w);wMax=Math.max(wMax,p[i].w);}
  // Corner count comes from the same detector the report uses, so the two never disagree.
  let corners=0;
  const xs=p.map(q=>q.x),ys=p.map(q=>q.y);
  const T={key,label:def.label,blurb:def.blurb,names:def.names||[],pts:p,length:s,corners,width:W0,
    wMin,wMax,wLabel:(wMax-wMin<0.4?Math.round(W0)+' m':Math.round(wMin)+'–'+Math.round(wMax)+' m'),
    minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
  T.line=optimiseLine(T);       // minimum curvature over the whole width: the map's reference line and corner count
  T.corners=detectCorners(T.line).length;
  trackCache[key]=T;return T;
}
