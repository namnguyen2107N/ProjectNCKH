/**
 * ROBOT MATH LAB - INTERNATIONALIZATION (I18N) ENGINE
 * Manages UI language switching (English / Tiếng Việt).
 * 
 * Rules:
 * 1. Default UI language is English ('en') on first launch.
 * 2. Switching language updates all interface controls, buttons, headers, steppers, and feedback.
 * 3. The mathematical problem statement itself ALWAYS remains in English (with interactive bilingual vocab popovers).
 *    A toggle button allows students to view the Vietnamese translation when needed.
 */

(function () {
  const STORAGE_KEY = 'rml_ui_language';
  let currentLang = 'en'; // Default to English as requested
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) {
      currentLang = localStorage.getItem(STORAGE_KEY);
    }
  } catch (_) { }

  const translations = {
    en: {
      // App Header
      brand_sub: 'KIDS FUN MATH & ROBOTICS LAB',
      student_tag_title: 'Active Student',
      student_default_name: 'Math Explorer',
      sound_btn: 'Sound',
      sound_muted: 'Muted',
      fullscreen_enter: 'Fullscreen',
      fullscreen_exit: 'Windowed',
      lang_switch_title: 'Switch Interface Language',
      settings_btn_title: 'Settings & Student Profile',
      settings_modal_title: '⚙️ Settings & Profile',
      settings_modal_subtitle: 'Customize student info and learning environment',
      settings_name_label: 'Student Name:',
      settings_name_hint: 'Displayed across your missions and certificates',
      settings_name_save: 'Save',
      settings_lang_label: 'Language:',
      settings_lang_hint: 'Switch between English and Vietnamese',
      settings_sound_label: 'Sound Effects:',
      settings_sound_hint: 'Cheerful feedback audio on actions and success',
      settings_fs_label: 'Fullscreen Mode:',
      settings_fs_hint: 'Maximize screen space for calculations',
      settings_done_btn: 'Done & Resume Learning ✨',

      // Welcome Hero & Robot Signboard
      hero_eyebrow: 'PROBLEM SOLVING & VIRTUAL ROBOTICS',
      hero_title: 'Robot Math Lab',
      hero_subtitle: 'Virtual Robotics Math Learning Environment for Elementary Students.',
      signboard_badge: 'INTERACTIVE CONTROL BOARD',
      signboard_title: 'Choose Interface Language',
      signboard_subtitle: 'Select how you want buttons and tools displayed:',
      lang_en: '🇬🇧 English',
      lang_vi: '🇻🇳 Tiếng Việt',
      btn_start: 'Start 🚀',
      student_name_label: 'Student Name / ID:',
      student_name_placeholder: 'Enter your name...',
      robot_bubble_welcome: "Hi! I'm Sparky the Robot 🤖 Choose your language on my tablet and click Start to explore! ✨",
      robot_easter_egg: 'Yay! Let\'s learn Math and code robots together! 🚀',
      scroll_down_hint: 'Click Start to enter missions!',
      btn_enter_missions: 'Start Exploring Missions ➔',
      hub_greeting: "Welcome, Explorer! Let's choose your learning mission:",
      btn_back_to_start: '⚙️ Welcome & Language Screen',

      // Tasks Hub
      hub_section_title: 'Choose Your Mission',
      hub_section_desc: 'Each mission focuses on key problem-solving strategies in uniform motion mathematics.',

      // Task 1 Card
      task1_badge: '🎯 Task 1',
      task1_title: 'Reach the Goal',
      task1_btn: 'Start Mission 1 ➔',

      // Task 2 Card
      task2_badge: '🔧 Task 2',
      task2_title: 'The Unexpected Journey',
      task2_btn: 'Start Mission 2 ➔',

      // Task 3 Card
      task3_badge: '🆕 Task 3',
      task3_title: 'The On-Time Challenge',
      task3_btn: 'Start Mission 3 ➔',

      // Workspace Common
      btn_back_hub: '← Missions Hub',
      btn_hint: '💡 Hint',
      btn_dict: '📖 Dictionary',
      btn_feedback: '📋 Feedback',
      btn_journal: '📒 Journal',
      confirm_leave_task: 'Are you sure you want to return to Missions Hub? Your progress has been logged.',

      // Problem Statement Card
      problem_card_title: 'Problem Statement',
      btn_trans_show: '🌐 Vietnamese Translation',
      btn_trans_hide: '🌐 Hide Translation',
      problem_hint_meta: '💡 Tip: Click or tap any underlined word to view pronunciation & Vietnamese translation.',

      // Simulation Card
      sim_track_title: 'Virtual Robot Track',
      sim_target_label: 'Target:',
      sim_speed_label: 'Speed (v)',
      sim_time_label: 'Time (t)',
      sim_dist_label: 'Distance (s)',
      sim_ready: 'Ready. Check your parameters and run the robot!',
      sim_moving: 'Robot is moving at {speed} m/s for {time} seconds...',
      sim_stopped: 'Robot stopped after traveling {dist} m.',

      // Dedicated Virtual Robot Track Sub-screen
      s3_btn_open_track: 'Open Virtual Robot Track ➔',
      track_view_title: 'Virtual Robot Track',
      track_btn_back_params: '← Back to Parameters',
      track_btn_back_step4: '← Back to Review',
      track_btn_run: '🚀 Run Robot',
      track_btn_running: '⏳ Robot Running...',
      track_btn_rerun: '🔄 Run Again',
      track_btn_continue_step4: 'Continue: Check Results ➔',
      track_instruction: 'Observe the robot motion, distance ruler, and destination marker.',
      track_camera_label: 'Camera',
      track_camera_overview: 'Overview',
      track_camera_follow: 'Follow robot',
      track_camera_rotate_left: 'Rotate left',
      track_camera_rotate_right: 'Rotate right',
      track_camera_reset: 'Reset view',
      track_camera_drag_hint: 'Drag to orbit around the robot',
      track_loading_3d: 'Preparing the 3D space lab...',
      track_3d_fallback: '3D is unavailable on this device — using the 2D track instead.',
      track_progress_badge: 'Robot Simulation',
      track_view_track_btn: '🔍 View Robot Track',
      track_status_ready: 'Ready! Check your robot parameters and click "🚀 Run Robot" to launch!',
      track_status_running: 'Robot is moving at {speed} {speedUnit} for {time} {timeUnit}...',
      track_status_finished: 'Simulation finished. Robot traveled {dist} {unit}.',
      track_result_match: '🎯 Target Reached! Robot traveled exactly {dist} {unit} to the destination!',
      track_result_mismatch: '⚠️ Target Missed: Robot traveled {dist} {unit} (Target is {target} {unit}).',

      s1_given_heading: 'Given Information in Problem:',
      s1_error_missing: 'Please enter all given quantities and choose the target to find!',
      s1_btn_next: 'Check & Continue',

      s2_error_missing: 'Please choose a formula and enter your calculation result!',
      s2_btn_back: '← Back',
      s2_btn_next: 'Confirm & Continue',

      s3_speed_label: 'Robot Speed:',
      s3_speed_locked: '🔒 Fixed by problem',
      s3_time_label: 'Running Time:',
      s3_time_locked: '🔒 Fixed by problem',
      s3_param_placeholder: 'Enter a value',
      s3_time_flawed_note: 'Proposed plan time for testing',
      s3_btn_back: '← Back',
      s3_btn_run: '🚀 Run Robot',
      s3_btn_running: '⏳ Robot Running...',
      s3_btn_rerun: '🔁 Re-run Robot',
      s3_btn_next: 'Check Results ➔',
      s3_obs_title: '📊 Simulation Observation:',
      s3_obs_traveled: 'The robot traveled <strong>{dist} m</strong> in {time} seconds.',
      s3_obs_target: 'Target destination: <strong>{target} m</strong>.',
      s3_val_error: 'Please enter valid parameters for the robot!',

      s4_banner_success: '🎉 Robot reached the destination!',
      s4_banner_retry: '⚠️ Robot did not land exactly on the target!',
      s4_btn_yes: '✅ Yes, reached {target}m exactly',
      s4_btn_no: '❌ No, did not reach {target}m',
      s4_btn_back: '← Back',
      s4_math_proof_title: 'Mathematical Verification:',
      s4_refl_placeholder: 'Share your thoughts or strategies about this problem...',
      s4_btn_complete: '🎉 Complete Mission!',
      s4_btn_retry: '🔁 Test New Plan ➔',
      s4_testing_new: '⏳ Robot Testing New Plan...',
      s4_testing_status: 'Verifying with revised parameters: {speed} m/s × {time} s...',
      s4_success_status: '🎉 Awesome! The robot reached the exact target <strong>{target} m</strong>!',
      s4_input_error: 'Please enter a valid revised parameter for the robot!',
      s4_obs_prompt: '👀 Look at where the robot stopped on the track, then select your answer above.',
      s4_obs_accurate: 'Accurate Observation!',
      s4_obs_shortfall: 'The robot stopped before reaching the target. Let us observe, analyze, and adjust the plan:',
      s4_obs_recheck: 'Take another close look at the track ruler! The robot stopped at {actual}m, while the target flag is at {target}m. Did the robot reach the destination marker?',

      // Mascot Sparky Cheer Messages
      sparky_step_1: "Read the problem carefully! Find what numbers are given! 🧐",
      sparky_step_2: "Choose the correct formula and calculate! You can do it! 📐",
      sparky_step_3: "Exciting! Check your parameters and click '🚀 Run Robot' to see it go! 🤖💨",
      sparky_step_4: "Check if the robot landed exactly on the target line! 🔍",
      sparky_victory: "Splendid! The robot hit the target! Continue to check the result! 🏆✨",
      sparky_oops: "The robot stopped before the target marker! Continue to observe and analyze the result! 🔍",

      // Dictionary Modal
      dict_title: 'Math & Robotics Dictionary',
      dict_subtitle: 'English - Vietnamese terms with pronunciation audio',
      dict_eyebrow: 'LEARN THE WORDS',
      dict_search_placeholder: 'Type word to search (e.g. speed, distance)...',
      dict_search_label: 'Search the dictionary',
      dict_filters_label: 'Filter words by topic',
      dict_count: 'Showing {count} words',
      dict_listen: 'Listen',
      dict_meaning_label: 'Vietnamese meaning',
      dict_category_all: 'All words',
      dict_category_measurement: 'Math & measurement',
      dict_category_robotics: 'Robot & movement',
      dict_category_reasoning: 'Problem-solving',
      dict_no_results: 'No matching words. Try another search.',
      dict_loading: 'Loading the word list…',
      dict_close: 'Close dictionary',

      // Hints Modal
      hints_title: 'Math Support Hints',
      hints_subtitle: 'Tiered scaffolding hints for mathematical problem solving',
      hints_intro: 'Try thinking on your own before unlocking each hint level! Every hint access is saved in the learning log.',
      hints_unlock_btn: '🔓 Unlock Level {level}',
      hints_level_prefix: 'Level {level}:'
    },

    vi: {
      // App Header
      brand_sub: 'BÉ VUI HỌC TOÁN & ROBOTICS',
      student_tag_title: 'Học sinh đang tham gia',
      student_default_name: 'Bé Yêu Toán',
      sound_btn: 'Âm thanh',
      sound_muted: 'Đã tắt tiếng',
      fullscreen_enter: 'Toàn màn hình',
      fullscreen_exit: 'Thu nhỏ',
      lang_switch_title: 'ngôn ngữ ',
      settings_btn_title: 'Cài đặt',
      settings_modal_title: '⚙️ Cài đặt',
      settings_modal_subtitle: 'Tùy chỉnh ',
      settings_name_label: 'Tên của bé:',
      settings_name_hint: 'Hiển thị trong toàn bộ hành trình làm bài',
      settings_name_save: 'Lưu',
      settings_lang_label: 'Ngôn ngữ ',
      settings_lang_hint: ' Tiếng Việt hoặc English',
      settings_sound_label: 'Hiệu ứng âm thanh:',
      settings_sound_hint: 'Âm thanh vui nhộn khi thao tác và hoàn thành bài',
      settings_fs_label: 'Toàn màn hình:',
      settings_fs_hint: 'Mở rộng tối đa không gian học tập',
      settings_done_btn: 'Xong & Tiếp tục học ✨',

      // Welcome Hero & Robot Signboard
      hero_eyebrow: 'TƯ DUY GIẢI QUYẾT VẤN ĐỀ  ',
      hero_title: 'Robot Math Lab',
      hero_subtitle: `Môi trường học tập Toán - Tiếng Anh qua mô phỏng Robotics dành cho học sinh tiểu học.`,
      signboard_badge: 'BẢNG ĐIỀU KHIỂN TƯƠNG TÁC',
      signboard_title: 'Chọn Ngôn Ngữ',
      signboard_subtitle: 'Chọn ngôn ngữ hiển thị cho các nút bấm và chức năng:',
      lang_en: ' English',
      lang_vi: ' Tiếng Việt',
      btn_start: 'Bắt đầu 🚀',
      student_name_label: 'Tên học sinh / Mã số:',
      student_name_placeholder: 'Nhập họ và tên...',
      robot_bubble_welcome: 'Xin chào bạn! Mình là robot Sparky 🤖 Hãy chọn ngôn ngữ trên bảng và bấm Bắt đầu nhé! ✨',
      robot_easter_egg: 'Tuyệt vời! Chúng mình cùng học Toán và lập trình robot nào! 🚀',
      scroll_down_hint: 'Bấm Bắt đầu để vào làm nhiệm vụ!',
      btn_enter_missions: 'Bắt đầu Khám phá Nhiệm vụ ➔',
      hub_greeting: 'Chào mừng bạn! Hãy chọn một nhiệm vụ học tập để bắt đầu:',
      btn_back_to_start: '⚙️ Màn hình Chào mừng & Cài đặt',

      // Tasks Hub
      hub_section_title: 'Chọn Nhiệm Vụ Học Tập',
      hub_section_desc: 'Mỗi nhiệm vụ tập trung vào các khía cạnh giải quyết vấn đề toán chuyển động đều.',

      // Task 1 Card
      task1_badge: '🎯 Nhiệm vụ 1',
      task1_title: 'Hành trình đến đích',
      task1_btn: 'Bắt đầu Nhiệm vụ 1 ➔',

      // Task 2 Card
      task2_badge: '🔧 Nhiệm vụ 2',
      task2_title: 'Chuyến đi bất ngờ',
      task2_btn: 'Bắt đầu Nhiệm vụ 2 ➔',

      // Task 3 Card
      task3_badge: '🆕 Nhiệm vụ 3',
      task3_title: 'Thử thách đúng giờ',
      task3_btn: 'Bắt đầu Nhiệm vụ 3 ➔',

      // Workspace Common
      btn_back_hub: '← Danh sách Nhiệm vụ',
      btn_hint: '💡 Gợi ý',
      btn_dict: '📖 Từ điển',
      btn_feedback: '📋 Xem nhận xét',
      btn_journal: '📒 Nhật ký',
      confirm_leave_task: 'Bạn có chắc muốn quay lại danh sách nhiệm vụ? Tiến trình hiện tại đã được lưu vào nhật ký.',

      // Problem Statement Card
      problem_card_title: 'Đề bài nhiệm vụ (Problem Statement)',
      btn_trans_show: '🌐 Xem dịch tiếng Việt',
      btn_trans_hide: '🌐 Ẩn bản dịch',
      problem_hint_meta: '💡 Gợi ý: Nhấp vào từ tiếng Anh có gạch chân để nghe phát âm & xem giải thích nghĩa tiếng Việt.',

      // Simulation Card
      sim_track_title: 'Đường chạy Robot Ảo',
      sim_target_label: 'Đích đến:',
      sim_speed_label: 'Vận tốc (v)',
      sim_time_label: 'Thời gian (t)',
      sim_dist_label: 'Quãng đường (s)',
      sim_ready: 'Sẵn sàng. Kiểm tra các thông số và cho robot chạy!',
      sim_moving: 'Robot đang di chuyển với vận tốc {speed} m/s trong {time} giây...',
      sim_stopped: 'Robot đã dừng lại sau khi đi được {dist} m.',

      // Dedicated Virtual Robot Track Sub-screen
      s3_btn_open_track: 'Mở Virtual Robot Track ➔',
      track_view_title: 'Virtual Robot Track',
      track_btn_back_params: '← Quay lại nhập thông số',
      track_btn_back_step4: '← Quay lại phần kiểm tra',
      track_btn_run: '🚀 Chạy Robot',
      track_btn_running: '⏳ Robot đang chạy...',
      track_btn_rerun: '🔄 Chạy lại mô phỏng',
      track_btn_continue_step4: 'Tiếp tục kiểm tra kết quả ➔',
      track_instruction: 'Quan sát chuyển động của robot, thước đo khoảng cách và vạch đích.',
      track_camera_label: 'Camera',
      track_camera_overview: 'Toàn cảnh',
      track_camera_follow: 'Theo robot',
      track_camera_rotate_left: 'Xoay trái',
      track_camera_rotate_right: 'Xoay phải',
      track_camera_reset: 'Đặt lại góc nhìn',
      track_camera_drag_hint: 'Kéo để xoay quanh robot',
      track_loading_3d: 'Đang chuẩn bị không gian 3D...',
      track_3d_fallback: 'Thiết bị chưa hỗ trợ 3D — đang dùng đường đua 2D.',
      track_progress_badge: 'Mô phỏng robot',
      track_view_track_btn: '🔍 Xem lại đường chạy Robot',
      track_status_ready: 'Sẵn sàng! Kiểm tra thông số đã nhập rồi bấm "🚀 Chạy Robot" để quan sát!',
      track_status_running: 'Robot đang di chuyển với vận tốc {speed} {speedUnit} trong {time} {timeUnit}...',
      track_status_finished: 'Mô phỏng hoàn thành. Robot đã đi được {dist} {unit}.',
      track_result_match: '🎯 Đúng vạch đích! Robot đã đi chính xác {dist} {unit} đến đích!',
      track_result_mismatch: '⚠️ Chưa đúng đích: Robot đi được {dist} {unit} (Vạch đích yêu cầu là {target} {unit}).',

      s1_given_heading: 'Xác định các dữ kiện đề bài đã cho:',
      s1_error_missing: 'Vui lòng điền đầy đủ các số liệu đã cho và chọn đại lượng cần tìm!',
      s1_btn_next: 'Kiểm tra & Tiếp tục',

      s2_error_missing: 'Vui lòng chọn công thức và điền kết quả tính toán!',
      s2_btn_back: '← Quay lại',
      s2_btn_next: 'Xác nhận & Tiếp tục',

      s3_speed_label: 'Vận tốc Robot:',
      s3_speed_locked: '🔒 Cố định theo bài toán',
      s3_time_label: 'Thời gian chạy:',
      s3_time_locked: '🔒 Cố định theo bài toán',
      s3_param_placeholder: 'Nhập giá trị',
      s3_time_flawed_note: 'Thời gian theo phương án đề xuất',
      s3_btn_back: '← Quay lại',
      s3_btn_run: '🚀 Chạy Robot',
      s3_btn_running: '⏳ Robot đang chạy...',
      s3_btn_rerun: '🔁 Chạy lại Robot',
      s3_btn_next: 'Kiểm tra kết quả ➔',
      s3_obs_title: '📊 Kết quả quan sát mô phỏng:',
      s3_obs_traveled: 'Robot đã di chuyển được <strong>{dist} m</strong> trong {time} giây.',
      s3_obs_target: 'Vạch đích yêu cầu: <strong>{target} m</strong>.',
      s3_val_error: 'Vui lòng nhập thông số hợp lệ cho rô-bốt!',

      s4_banner_success: '🎉 Rô-bốt đã đến đúng vạch đích!',
      s4_banner_retry: '⚠️ Rô-bốt chưa đến đúng vạch đích yêu cầu!',
      s4_btn_yes: '✅ Có, đến chính xác đích {target}m',
      s4_btn_no: '❌ Chưa đạt, chưa đến đích {target}m',
      s4_btn_back: '← Quay lại',
      s4_math_proof_title: 'Kiểm chứng Toán học (Mathematical Verification):',
      s4_refl_placeholder: 'Chia sẻ suy nghĩ hoặc bài học rút ra của bạn về bài toán này...',
      s4_btn_complete: '🎉 Hoàn thành Nhiệm vụ!',
      s4_btn_retry: '🔁 Thử nghiệm phương án mới ➔',
      s4_testing_new: '⏳ Rô-bốt đang thử nghiệm phương án mới...',
      s4_testing_status: 'Đang kiểm chứng với thông số mới: {speed} m/s × {time} s...',
      s4_success_status: '🎉 Tuyệt vời! Rô-bốt đã đến đúng mốc <strong>{target} m</strong>!',
      s4_input_error: 'Vui lòng nhập giá trị thông số đã điều chỉnh cho rô-bốt!',
      s4_obs_prompt: '👀 Hãy quan sát vị trí dừng của rô-bốt trên đường chạy rồi chọn câu trả lời ở trên nhé!',
      s4_obs_accurate: 'Nhận định chính xác!',
      s4_obs_shortfall: 'Rô-bốt chưa đến vạch đích. Hãy cùng quan sát, phân tích và điều chỉnh phương án:',
      s4_obs_recheck: 'Hãy quan sát kỹ lại thước đo trên đường chạy nhé! Rô-bốt dừng lại ở vạch {actual}m, còn lá cờ đích ở vạch {target}m. Như vậy rô-bốt đã đến đúng đích chưa?',

      // Mascot Sparky Cheer Messages
      sparky_step_1: 'Hãy đọc kỹ đề bài và tìm xem bài toán cho những số liệu nào nhé! 🧐',
      sparky_step_2: 'Chọn công thức và tính toán thật chuẩn xác nào! Bạn làm được mà! 📐',
      sparky_step_3: "Hồi hộp quá! Hãy kiểm tra thông số rồi bấm '🚀 Chạy Robot' để xem nhé! 🤖💨",
      sparky_step_4: 'Kiểm tra lại xem robot có về đúng vạch đích không nhé! 🔍',
      sparky_victory: 'Tuyệt đỉnh! Robot đã đi đúng đích rồi! Hãy tiếp tục kiểm tra kết quả nhé! 🏆✨',
      sparky_oops: 'Robot đã dừng trước vạch đích rồi! Hãy tiếp tục quan sát và đánh giá nhé! 🔍',

      // Dictionary Modal
      dict_title: 'Từ điển Toán - Tiếng Anh Robotics',
      dict_subtitle: 'Kho từ vựng song ngữ kèm phát âm audio giọng chuẩn bản ngữ',
      dict_eyebrow: 'CÙNG HỌC TỪ VỰNG',
      dict_search_placeholder: 'Gõ từ tiếng Anh cần tra (ví dụ: speed, distance)...',
      dict_search_label: 'Tìm trong từ điển',
      dict_filters_label: 'Lọc từ vựng theo chủ đề',
      dict_count: 'Đang hiển thị {count} từ vựng',
      dict_listen: 'Nghe phát âm',
      dict_meaning_label: 'Nghĩa tiếng Việt',
      dict_category_all: 'Tất cả từ',
      dict_category_measurement: 'Toán & đo lường',
      dict_category_robotics: 'Robot & chuyển động',
      dict_category_reasoning: 'Tư duy giải toán',
      dict_no_results: 'Chưa tìm thấy từ phù hợp. Em thử cách tìm khác nhé.',
      dict_loading: 'Đang tải danh sách từ vựng…',
      dict_close: 'Đóng từ điển',

      // Hints Modal
      hints_title: 'Gợi Ý Hỗ Trợ Tư Duy Toán Học',
      hints_subtitle: 'Hệ thống gợi ý giàn giáo theo từng mức độ nhận thức',
      hints_intro: 'Hãy cố gắng tự suy nghĩ trước khi mở từng mức gợi ý nhé! Mỗi lần mở gợi ý sẽ được ghi nhận vào nhật ký học tập.',
      hints_unlock_btn: '🔓 Mở Gợi Ý Mức {level}',
      hints_level_prefix: 'Mức {level}:'
    }
  };

  const I18N = {
    get currentLang() {
      return currentLang;
    },

    isVietnamese() {
      return currentLang === 'vi';
    },

    isEnglish() {
      return currentLang === 'en';
    },

    t(key, params = {}) {
      const dict = translations[currentLang] || translations.en;
      let str = dict[key] || translations.en[key] || key;
      if (typeof str === 'string') {
        Object.keys(params).forEach(k => {
          str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), params[k]);
        });
      }
      return str;
    },

    setLang(lang) {
      if (lang !== 'en' && lang !== 'vi') return;
      if (lang === currentLang) return;

      currentLang = lang;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, currentLang);
        }
      } catch (_) { }

      // Play cute click audio
      if (typeof window !== 'undefined' && window.SoundFX) {
        window.SoundFX.playPop();
      }

      // Notify entire app of language change
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: currentLang } }));
      }
    },

    toggleLang() {
      this.setLang(currentLang === 'en' ? 'vi' : 'en');
    }
  };

  if (typeof window !== 'undefined') {
    window.I18N = I18N;
  }
  if (typeof global !== 'undefined') {
    global.I18N = I18N;
  }
})();
