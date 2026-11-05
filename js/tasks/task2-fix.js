/**
 * TASK 2: THE UNEXPECTED JOURNEY (🎯 Nhiệm vụ 2: Chuyến đi bất ngờ)
 * Problem scenario: Robot travels 1.2 km at constant speed 4 m/s. Student finds time in minutes.
 * Standardized initial trial run: 4 m/s in 240 s -> stops at 960 m (short of 1200 m).
 * Follow-up lookback uses open, neutral questions without spoiler guidance:
 * - What do you observe?
 * - Did the result reach the target?
 * - Why do you think this happened?
 * - What would you like to adjust?
 * Adjusted run: 4 m/s for 300 s -> reaches 1200 m (1.2 km = 1200 m, 300 s = 5 minutes).
 */

window.Task2Fix = {
  id: 'task2-fix',
  title: 'Task 2: The Unexpected Journey',
  titleVi: 'Nhiệm vụ 2: Chuyến đi bất ngờ',
  badge: '🎯 Level 2',
  tagline: 'Check, detect, explain, and adjust',
  taglineVi: 'Kiểm tra, phát hiện, giải thích và điều chỉnh',

  // Problem description: neutral, accurate
  descriptionEn: 'A robot travels a [distance]* of 1.2 [kilometer]* (1,2 km) at a constant [speed]* of 4 [meter]* per second (4 m/s). How many minutes does the [robot]* need to [reach]* the [destination]*?',
  descriptionVi: 'Một rô-bốt đi quãng đường 1,2 km với vận tốc không đổi 4 m/s. Hỏi rô-bốt cần bao nhiêu phút để đến đích?',

  // Problem parameters
  trackLength: 1400, // 1400m track on canvas (allows clear view of 960m stop and 1200m target)
  targetDistance: 1200, // 1.2 km = 1200 m
  robotSpeed: 4, // 4 m/s
  trialTime: 240, // standardized initial simulation: 4 * 240 = 960 m
  correctTime: 300, // 1200 / 4 = 300 s = 5 minutes
  unit: 'm',
  speedUnit: 'm/s',
  timeUnit: 's',
  timeScale: 50.0, // 240s runs in 4.8s, 300s runs in 6s real time

  // Step 1: Understand
  step1: {
    promptEn: 'Identify the given quantities from the problem:',
    promptVi: 'Xác định các dữ kiện từ đề bài:',
    fields: [
      { key: 'distance_km', label: 'Given Distance (km)', unit: 'km', expected: 1.2 },
      { key: 'speed', label: 'Speed (v)', unit: 'm/s', expected: 4 }
    ],
    targetQuestionEn: 'What is the required target quantity and unit to find?',
    targetQuestionVi: 'Đại lượng và đơn vị cần tìm trong đề bài là gì?',
    targetOptions: [
      { id: 'time_minutes', label: 'Time in minutes (Thời gian tính bằng phút)', correct: true },
      { id: 'speed_ms', label: 'Speed in m/s (Vận tốc tính bằng m/s)', correct: false },
      { id: 'distance_km', label: 'Distance in km (Quãng đường tính bằng km)', correct: false }
    ]
  },

  // Step 2: Plan
  step2: {
    promptEn: 'Calculate the mathematical time required to travel 1200 m (1.2 km):',
    promptVi: 'Tính toán thời gian lý thuyết cần thiết để đi hết 1200 m (1,2 km):',
    proposedNoteEn: '📋 Unit conversion: 1.2 km = 1200 m.',
    proposedNoteVi: '📋 Phép đổi đơn vị: 1,2 km = 1200 m.',
    formulaOptions: [
      { id: 'f1', text: 'Time = 1200 ÷ 4  (t = s ÷ v)', formula: 't = s ÷ v', correct: true },
      { id: 'f2', text: 'Time = 1200 × 4 = 4800 s  (t = s × v)', formula: 't = s × v', correct: false },
      { id: 'f3', text: 'Time = 1200 - 4 = 1196 s  (t = s - v)', formula: 't = s - v', correct: false }
    ],
    calcPromptEn: 'Enter the calculated time in seconds (1200 ÷ 4):',
    calcPromptVi: 'Nhập thời gian tính bằng giây (1200 ÷ 4):',
    expectedResult: 300,
    resultUnit: 's',
    projectedParamsEn: 'Theoretical time needed for 1200m:',
    projectedParamsVi: 'Thời gian lý thuyết cần để tới mốc 1200m:'
  },

  // Step 3: Execute (Initial Trial Run)
  step3: {
    promptEn: 'Test the proposed trial run (Time = 240 s) on the Virtual Robot Track to observe the outcome:',
    promptVi: 'Chạy thử phương án đề xuất (Thời gian = 240 giây) trên Virtual Robot Track để quan sát kết quả:',
    defaultSpeed: 4,
    defaultTime: 240, // 240 seconds standardized trial run
    canEditSpeed: false,
    canEditTime: false,
    noteEn: 'Watch the track ruler carefully: observe where the robot stops and compare it with the 1200m destination marker.',
    noteVi: 'Quan sát kỹ thước đo đường chạy: xem rô-bốt dừng lại ở mốc nào và đối chiếu với vạch đích 1200 m.'
  },

  // Step 4: Look Back
  step4: {
    checkQuestionEn: 'Did the robot reach the 1200m destination on this run?',
    checkQuestionVi: 'Kết quả có đạt mục tiêu (đích 1200 m) không?',

    // Neutral observation questions after run
    observationQuestionEn: 'What do you observe on the track?',
    observationQuestionVi: 'Em nhận thấy điều gì trên đường chạy?',
    discrepancyQuestionEn: 'What do you observe on the track?',
    discrepancyQuestionVi: 'Em nhận thấy điều gì trên đường chạy?',
    discrepancyOptions: [
      { id: 'shortfall_960m', label: 'The robot stopped at 960m (before the 1200m marker)', correct: true },
      { id: 'overshot_1200m', label: 'The robot traveled beyond the 1200m marker', correct: false },
      { id: 'stopped_start', label: 'The robot stopped at the start line', correct: false }
    ],

    reasonQuestionEn: 'Why do you think this happened?',
    reasonQuestionVi: 'Theo em, tại sao điều này xảy ra?',
    diagnosisQuestionEn: 'Why do you think this happened?',
    diagnosisQuestionVi: 'Theo em, tại sao điều này xảy ra?',
    diagnosisOptions: [
      { id: 'ran_240s_only', label: 'At 4 m/s for only 240s, the robot travels 4 × 240 = 960m (short of 1200m)', correct: true },
      { id: 'target_moved', label: 'The target destination moved further away', correct: false },
      { id: 'speed_slowed', label: 'The robot stopped because the battery drained', correct: false }
    ],

    adjustmentQuestionEn: 'What would you like to adjust?',
    adjustmentQuestionVi: 'Em muốn thay đổi điều gì?',
    revisionPromptEn: 'Enter the adjusted Time parameter for the robot (in seconds):',
    revisionPromptVi: 'Nhập giá trị Thời gian đã điều chỉnh cho rô-bốt (đơn vị: giây):',
    correctedTimeExpected: 300,

    reflectionPromptEn: 'How did adjusting the time parameter from 240s to 300s (5 minutes) allow the robot to reach the 1200m destination?',
    reflectionPromptVi: 'Việc điều chỉnh thời gian từ 240 giây lên 300 giây (5 phút) đã giúp rô-bốt đi đến đúng đích 1200 m như thế nào?',

    getMathProof: (inputs, isVi) => {
      const v = inputs.step3?.speed !== undefined ? inputs.step3.speed : 4;
      const t = inputs.step3?.time !== undefined ? inputs.step3.time : 300;
      const s = Number((v * t).toFixed(1));
      return `<strong>s = v × t</strong> = ${v} m/s × ${t} s = <strong>${s} m = 1,2 km</strong> &nbsp; (300 s = 5 phút)`;
    }
  },

  // Tiered Hints
  hints: [
    {
      level: 1,
      title: 'Đổi đơn vị và quan sát điểm dừng',
      en: '1.2 km = 1200 m. Look at the canvas ruler: The robot stopped at 960m. Did it reach the 1200m destination marker?',
      vi: '1,2 km = 1200 m. Nhìn vào thước đo đường chạy: Rô-bốt dừng ở mốc 960 m. Đã đến vạch đích 1200 m chưa?'
    },
    {
      level: 2,
      title: 'Khoảng cách còn thiếu',
      en: 'With speed = 4 m/s in 240 seconds, the robot travels: 4 × 240 = 960m. It is still 1200 - 960 = 240m short. How many seconds does it need for all 1200m?',
      vi: 'Với vận tốc 4 m/s trong 240 giây, rô-bốt đi được: 4 × 240 = 960 m. Còn thiếu 1200 - 960 = 240 m. Cần bao nhiêu giây để rô-bốt đi hết 1200 m?'
    },
    {
      level: 3,
      title: 'Thời gian chính xác và điều chỉnh',
      en: 'Time needed: t = 1200 ÷ 4 = 300 seconds = 5 minutes. Adjust the robot running time to 300 seconds to reach the 1200m goal!',
      vi: 'Thời gian cần thiết: t = 1200 ÷ 4 = 300 giây = 5 phút. Hãy điều chỉnh thời gian chạy thành 300 giây để rô-bốt đến đúng mốc 1200 m!'
    }
  ]
};
