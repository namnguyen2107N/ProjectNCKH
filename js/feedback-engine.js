/**
 * ROBOT MATH LAB - FEEDBACK ENGINE
 * Generates evidence-grounded, multi-stakeholder diagnostic feedback (Student, Teacher, Parent).
 * 
 * Core Pedagogical Principles:
 * 1. Data-grounded: Every feedback point traces back to empirical actions in session telemetry
 *    (mistakes, vocab lookups, hint unlocks, simulation attempts, lookback accuracy).
 * 2. Non-judgmental & Growth Mindset: No generalized capability labels (e.g. "weak student", "slow learner").
 * 3. Differentiated Stakeholders:
 *    - Student: Brief, encouraging, highlights specific strengths, areas to practice, and follow-up challenge.
 *    - Teacher: Detailed problem-solving indicators (PS1-PS11), performance quality, scaffolding usage, error patterns, and pedagogical interventions.
 *    - Parent: Accessible, warm, strengths-based, home support tips, no research codes, no labels.
 * 4. Bilingual: Full English and Vietnamese support based on active interface language.
 */

(function () {
  const FeedbackEngine = {
    /**
     * Generate diagnostic feedback objects from a session
     */
    analyzeSession(session, lang = 'vi') {
      if (!session) {
        session = window.LogEngine?.currentSession || {
          taskId: 'task1-reach',
          studentName: 'Explorer',
          events: [],
          supportUsage: { vocabLookups: [], mathHints: [] },
          summary: { totalAttempts: 1, totalTimeSeconds: 45, finalSuccess: true, backwardStepsCount: 0 },
          stepTimings: {}
        };
      }

      const isVi = lang === 'vi';
      const events = session.events || [];
      const support = session.supportUsage || { vocabLookups: [], mathHints: [] };
      const summary = session.summary || { totalAttempts: 1, totalTimeSeconds: 60 };

      // Telemetry Data Extraction
      const vocabWords = Array.from(new Set((support.vocabLookups || []).map(v => v.word)));
      const hintsOpened = support.mathHints || [];
      const maxHintLevel = hintsOpened.length > 0 ? Math.max(...hintsOpened.map(h => h.level || 1)) : 0;
      const totalAttempts = summary.totalAttempts || 1;
      const totalTimeSec = summary.totalTimeSeconds || 60;
      const backwardSteps = summary.backwardStepsCount || 0;

      // Check specific PS milestones
      const step1Mistakes = events.filter(e => e.code === 'STEP1_MISMATCH');
      const step2Mistakes = events.filter(e => e.code === 'STEP2_MISTAKE');
      const ps8Event = events.find(e => e.code === 'PS8' || e.code === 'PS8_RESPONSE');
      const ps8FirstAttemptAccurate = ps8Event?.data?.accurate !== false;
      const ps9Event = events.find(e => e.code === 'PS9');
      const ps10Event = events.find(e => e.code === 'PS10');
      const reflectionText = events.find(e => e.code === 'TASK_REFLECTION')?.data?.reflection || '';

      const taskId = session.taskId || 'task1-reach';
      // Names are rendered inside the feedback modal HTML; strip tag delimiters
      // so a locally edited name cannot inject markup.
      const safeStudentName = String(session.studentName || 'Học sinh')
        .replace(/[<>]/g, '')
        .trim()
        .slice(0, 50) || 'Học sinh';

      return {
        // Raw Metrics for Grounding
        metrics: {
          taskId,
          studentName: safeStudentName,
          totalAttempts,
          totalTimeSec,
          vocabWords,
          maxHintLevel,
          hintsCount: hintsOpened.length,
          backwardSteps,
          step1Errors: step1Mistakes.length,
          step2Errors: step2Mistakes.length,
          ps8FirstAttemptAccurate,
          hasReflection: !!reflectionText.trim(),
          reflectionText
        },

        // 1. STUDENT VIEW
        student: this.buildStudentFeedback({
          isVi,
          taskId,
          totalAttempts,
          vocabWords,
          maxHintLevel,
          step1Errors: step1Mistakes.length,
          step2Errors: step2Mistakes.length,
          ps8FirstAttemptAccurate
        }),

        // 2. TEACHER VIEW
        teacher: this.buildTeacherFeedback({
          isVi,
          taskId,
          events,
          totalAttempts,
          totalTimeSec,
          backwardSteps,
          vocabWords,
          hintsOpened,
          maxHintLevel,
          step1Mistakes,
          step2Mistakes,
          ps8Event,
          ps9Event,
          ps10Event
        }),

        // 3. PARENT VIEW
        parent: this.buildParentFeedback({
          isVi,
          taskId,
          studentName: safeStudentName,
          totalAttempts,
          vocabWords,
          hintsCount: hintsOpened.length
        }),

        // 4. NEXT STEP AND PRACTICE RECOMMENDATIONS
        nextChallenge: this.buildNextChallenge(taskId, isVi),
        practiceRecommendations: this.buildPracticeRecommendations({
          isVi,
          taskId,
          totalAttempts,
          maxHintLevel,
          step1Errors: step1Mistakes.length,
          step2Errors: step2Mistakes.length,
          ps8FirstAttemptAccurate
        })
      };
    },

    /**
     * Build Student Feedback
     */
    buildStudentFeedback({ isVi, taskId, totalAttempts, vocabWords, maxHintLevel, step1Errors, step2Errors, ps8FirstAttemptAccurate }) {
      const strengths = [];
      const improvements = [];

      // Strengths based on evidence
      if (step1Errors === 0) {
        strengths.push(isVi
          ? 'Đọc hiểu đề bài xuất sắc: Em xác định chính xác các số liệu đã cho và đại lượng cần tìm ngay từ đầu.'
          : 'Great Problem Reading: You identified all given parameters and target quantities accurately on your first try.');
      }

      if (step2Errors === 0) {
        strengths.push(isVi
          ? 'Lập kế hoạch toán học chuẩn: Em chọn đúng công thức và tính toán kết quả rất chính xác.'
          : 'Solid Mathematical Planning: You chose the right formula and completed the arithmetic calculation with precision.');
      }

      if (maxHintLevel === 0) {
        strengths.push(isVi
          ? 'Tính tự chủ cao: Em tự mình tìm ra cách giải bài toán mà không cần mở các gợi ý hỗ trợ.'
          : 'High Autonomy: You worked through the problem independently without needing scaffolding hints.');
      } else {
        strengths.push(isVi
          ? `Biết cách tìm kiếm hỗ trợ: Khi cần thiết, em đã chủ động mở gợi ý Mức ${maxHintLevel} để vượt qua phần khó.`
          : `Effective Help-Seeking: You proactively used Tier ${maxHintLevel} hints when needed to progress steadily.`);
      }

      if (vocabWords.length > 0) {
        strengths.push(isVi
          ? `Chủ động học từ vựng: Em đã tra cứu từ tiếng Anh [${vocabWords.join(', ')}] để hiểu rõ tình huống bài toán.`
          : `Active Bilingual Learner: You checked key vocabulary terms [${vocabWords.join(', ')}] in the problem.`);
      }

      if (taskId === 'task2-fix') {
        if (ps8FirstAttemptAccurate) {
          strengths.push(isVi
            ? 'Quan sát mô phỏng tốt: Em đã đối chiếu vị trí robot dừng với mốc đích.'
            : 'Keen Track Observation: You compared the robot’s stopping point with the destination marker.');
        }
        strengths.push(isVi
          ? 'Tư duy điều chỉnh tốt: Em đã xem lại phương án, thử điều chỉnh và kiểm tra kết quả mới.'
          : 'Adaptive Problem Solver: You reviewed the plan, tried an adjustment, and checked the new result.');
      } else if (totalAttempts === 1) {
        strengths.push(isVi
          ? 'Thực thi xuất sắc: Robot của em đã cập bến đích chuẩn xác ngay trong lần chạy thử nghiệm đầu tiên!'
          : 'First-Try Success: Your calculated plan landed the robot right on the destination marker on the first attempt!');
      }

      // Areas to strengthen based on evidence
      if (vocabWords.length > 0) {
        improvements.push(isVi
          ? `Ghi nhớ từ vựng chuyển động: Hãy ghi nhớ các từ [${vocabWords.join(', ')}] để lần sau đọc đề tiếng Anh nhanh và tự tin hơn nhé!`
          : `Vocabulary Mastery: Review the terms [${vocabWords.join(', ')}] to boost your English problem-reading speed!`);
      }

      if (maxHintLevel >= 2) {
        const formula = taskId === 'task3-new' ? 'v = s ÷ t' : 't = s ÷ v';
        improvements.push(isVi
          ? `Củng cố công thức chuyển động: Hãy luyện cách dùng ${formula} và kiểm tra đơn vị trước khi tính.`
          : `Reinforce the motion formula: Practice using ${formula} and check the units before calculating.`);
      }

      if (step1Errors > 0 || step2Errors > 0) {
        improvements.push(isVi
          ? 'Kiểm tra kỹ trước khi xác nhận: Đối chiếu số liệu và đổi đơn vị phù hợp (km ↔ m, phút ↔ giây) trước khi tiếp tục nhé.'
          : 'Double-Check Habit: Verify the values and convert units (km ↔ m, minutes ↔ seconds) before continuing.');
      }

      if (improvements.length === 0) {
        improvements.push(isVi
          ? 'Duy trì phong độ: Cách giải của em rất toàn diện. Hãy sẵn sàng cho thử thách nâng cao tiếp theo!'
          : 'Keep Excelling: Your workflow was thorough and accurate. You are ready for the advanced challenge!');
      }

      return {
        strengths,
        improvements
      };
    },

    /**
     * Build Teacher Feedback
     */
    buildTeacherFeedback({ isVi, taskId, events, totalAttempts, totalTimeSec, backwardSteps, vocabWords, hintsOpened, maxHintLevel, step1Mistakes, step2Mistakes, ps8Event, ps9Event, ps10Event }) {
      // 1. Problem Solving Indicators (PS1 - PS11)
      const extractionSummary = taskId === 'task3-new'
        ? (isVi ? 'Trích xuất quãng đường và thời gian; đại lượng cần tìm là vận tốc.' : 'Extracted distance and time; target quantity is speed.')
        : (isVi ? 'Trích xuất vận tốc và quãng đường; đại lượng cần tìm là thời gian.' : 'Extracted speed and distance; target quantity is time.');
      const planFormula = taskId === 'task3-new' ? 'v = s ÷ t' : 't = s ÷ v';
      const indicators = [
        {
          activity: isVi ? 'Dữ kiện bài toán' : 'Problem Information',
          status: step1Mistakes.length === 0 ? 'Optimal' : 'Needs Reinforcement',
          details: `${extractionSummary} ${isVi ? `Số lần thử: ${step1Mistakes.length + 1}.` : `Submissions: ${step1Mistakes.length + 1}.`}`
        },
        {
          activity: isVi ? 'Phương án tính toán' : 'Calculation Plan',
          status: step2Mistakes.length === 0 ? 'Optimal' : 'Scaffolded',
          details: isVi
            ? `Mô hình hóa toán học. Đã chọn công thức và tính toán. Số lần chỉnh sửa: ${step2Mistakes.length}.`
            : `Mathematical modeling. Formula selection and arithmetic calculation. Corrections: ${step2Mistakes.length}.`
        },
        {
          activity: isVi ? 'Mô phỏng robot' : 'Robot Simulation',
          status: 'Completed',
          details: isVi
            ? `Nạp tham số và kích hoạt mô phỏng đường chạy ảo. Tổng số lần chạy robot: ${totalAttempts}.`
            : `Set robot parameters and triggered virtual simulation. Total simulation runs: ${totalAttempts}.`
        },
        {
          activity: isVi ? 'Kiểm tra kết quả' : 'Result Check',
          status: ps8Event?.data?.response === 'no' || totalAttempts === 1 ? 'Optimal' : 'Guided',
          details: isVi
            ? `Đối chiếu kết quả mô phỏng với mục tiêu; ghi nhận phản hồi và điều chỉnh thông số nếu cần.`
            : `Compared the simulation with the target; recorded the response and parameter changes when needed.`
        }
      ];

      // 2. Performance Quality & Autonomy
      let autonomyLevel = isVi ? 'Tự chủ cao (High Autonomy)' : 'High Autonomy';
      if (maxHintLevel >= 3 || hintsOpened.length >= 3) {
        autonomyLevel = isVi ? 'Cần giàn giáo nhiều mức (Extensive Scaffolding)' : 'Extensively Scaffolded';
      } else if (maxHintLevel > 0 || vocabWords.length > 0) {
        autonomyLevel = isVi ? 'Tự chủ có hỗ trợ hợp lý (Guided Autonomy)' : 'Guided Autonomy';
      }

      // 3. Observed Difficulties & Remediation
      const observedErrors = [];
      const pedagogicalInterventions = [];

      if (vocabWords.length > 0) {
        observedErrors.push(isVi
          ? `Rào cản thuật ngữ tiếng Anh: Tra cứu các từ [${vocabWords.join(', ')}].`
          : `Language barrier: Looked up vocabulary terms [${vocabWords.join(', ')}].`);
        pedagogicalInterventions.push(isVi
          ? `Tạo thẻ ghi nhớ (flashcard) kết hợp hình ảnh mô phỏng cho thuật ngữ chuyển động: speed, distance, destination.`
          : `Provide visual flashcards linking robotics motion terms with concrete simulation graphics.`);
      }

      if (step2Mistakes.length > 0) {
        observedErrors.push(isVi
          ? `Nhầm lẫn trong việc chọn biểu thức toán học hoặc thao tác số học ban đầu.`
          : `Initial confusion in selecting algebraic relationship or arithmetic computation.`);
        pedagogicalInterventions.push(isVi
          ? `Dùng sơ đồ các đại lượng để củng cố công thức ${planFormula} và mối liên hệ giữa quãng đường, vận tốc, thời gian.`
          : `Use a relationship diagram to reinforce ${planFormula} and the connection between distance, speed, and time.`);
      }

      if (totalAttempts > 1) {
        observedErrors.push(isVi
          ? `Cần qua ${totalAttempts} lần chạy thử nghiệm để đưa robot về đúng đích.`
          : `Required ${totalAttempts} simulation iterations to achieve the destination target.`);
        pedagogicalInterventions.push(isVi
          ? `Củng cố kỹ năng đọc thước đo, so sánh với mục tiêu và giải thích lựa chọn thông số tiếp theo.`
          : `Practice reading the ruler, comparing it with the target, and explaining the next parameter choice.`);
      }

      if (observedErrors.length === 0) {
        observedErrors.push(isVi ? 'Không phát hiện sai sót đáng kể.' : 'No significant misconceptions observed.');
        pedagogicalInterventions.push(isVi
          ? 'Học sinh sẵn sàng tiếp nhận các bài toán chuyển động có điều kiện phức tạp hơn (nhiều giai đoạn hoặc hai robot).'
          : 'Student demonstrates readiness for multi-phase uniform motion or two-body relative motion problems.');
      }

      return {
        indicators,
        autonomyLevel,
        totalTimeSec,
        hintsUsedCount: hintsOpened.length,
        maxHintLevel,
        vocabLookupsCount: vocabWords.length,
        vocabWords,
        observedErrors,
        pedagogicalInterventions
      };
    },

    /**
     * Build Parent Feedback
     */
    buildParentFeedback({ isVi, taskId, studentName, totalAttempts, vocabWords, hintsCount }) {
      const strengths = [];
      const homeFocus = [];
      const conversationStarters = [];

      strengths.push(isVi
        ? `${studentName} đã thể hiện sự kiên nhẫn và tập trung rất tốt khi tương tác với môi trường robot ảo.`
        : `${studentName} demonstrated wonderful patience and focus while working in the virtual robotics environment.`);

      strengths.push(isVi
        ? `Con biết vận dụng phép toán số học vào tình huống thực tế để điều khiển robot đi đến đúng mục tiêu.`
        : `Applied mathematical thinking into a realistic robotics scenario to guide the robot safely to its goal.`);

      if (vocabWords.length > 0) {
        strengths.push(isVi
          ? `Con rất chủ động tra cứu khi gặp từ vựng tiếng Anh chưa rõ, thể hiện tinh thần tự học rất đáng khen.`
          : `Proactively explored English vocabulary when needed, showing great independent learning initiative.`);
      }

      // Home focus
      homeFocus.push(isVi
        ? `Cùng con rèn luyện thêm kỹ năng tính nhẩm các phép chia đơn giản trong các hoạt động hàng ngày (chia bánh kẹo, chia đồ chơi).`
        : `Practice simple mental division during daily activities (e.g., sharing snacks, organizing toys into equal groups).`);

      homeFocus.push(isVi
        ? `Cùng con trò chuyện về khái niệm vận tốc: "Cứ 1 giây robot đi được bao nhiêu mét?" để con liên hệ toán học với đời sống.`
        : `Talk about the speed concept together: "How many meters does the robot move in one second?" to connect math with real life.`);

      // Parent conversation starters
      conversationStarters.push(isVi
        ? '🤖 "Hôm nay con đã điều khiển robot Sparky đi được quãng đường bao nhiêu mét vậy?"'
        : '🤖 "How many meters did you program Sparky the robot to travel today?"');

      conversationStarters.push(isVi
        ? '💡 "Làm thế nào mà con biết được robot dừng lại đã đúng đích hay chưa?"'
        : '💡 "How did you check whether the robot stopped right on the destination line?"');

      conversationStarters.push(isVi
        ? '🚀 "Nếu muốn robot chạy nhanh gấp đôi thì con sẽ cần thay đổi điều gì hả con?"'
        : '🚀 "If you wanted the robot to run twice as fast, what would you change?"');

      return {
        strengths,
        homeFocus,
        conversationStarters
      };
    },

    /**
     * Recommend short exercise types using the student's recorded interactions.
     */
    buildPracticeRecommendations({ isVi, taskId, totalAttempts, maxHintLevel, step1Errors, step2Errors, ps8FirstAttemptAccurate }) {
      const recommendations = [];
      const seen = new Set();
      const add = (key, icon, title, description) => {
        if (seen.has(key)) return;
        seen.add(key);
        recommendations.push({ key, icon, title, description });
      };

      if (step1Errors > 0) {
        add('read-problem', '🔎',
          isVi ? 'Đọc đề và tìm ẩn số' : 'Read the problem and find the unknown',
          isVi
            ? 'Gạch chân dữ kiện, ghi đơn vị cạnh từng số và khoanh đại lượng cần tìm.'
            : 'Underline the givens, write each unit beside its value, and circle the unknown.');
      }

      if (step2Errors > 0 || maxHintLevel >= 2) {
        const formula = taskId === 'task3-new' ? 'v = s ÷ t' : 't = s ÷ v';
        add('choose-formula', '🧮',
          isVi ? 'Chọn công thức phù hợp' : 'Choose the right formula',
          isVi
            ? `Luyện nhận biết khi nào dùng ${formula}; thay số vào công thức rồi ước lượng kết quả.`
            : `Practice when to use ${formula}; substitute the values and estimate the result.`);
      }

      if (taskId === 'task2-fix' || taskId === 'task3-new') {
        add('unit-conversion', '📏',
          isVi ? 'Luyện đổi đơn vị' : 'Practice unit conversion',
          isVi
            ? 'Đổi km sang m và phút sang giây trước khi tính hoặc nạp thông số cho robot.'
            : 'Convert kilometers to meters and minutes to seconds before calculating or setting the robot.');
      }

      if (taskId === 'task2-fix' || !ps8FirstAttemptAccurate || totalAttempts > 1) {
        add('compare-and-adjust', '🏁',
          isVi ? 'So sánh và kiểm tra kết quả' : 'Compare and verify results',
          isVi
            ? 'Đọc mốc robot dừng, so sánh với đích, giải thích độ lệch rồi thử một phương án mới.'
            : 'Read the stopping marker, compare it with the target, explain the difference, and test a revised plan.');
      }

      if (taskId === 'task3-new') {
        add('solve-for-speed', '⚡',
          isVi ? 'Tìm vận tốc từ quãng đường và thời gian' : 'Find speed from distance and time',
          isVi
            ? 'Luyện xác định vận tốc bằng v = s ÷ t, sau đó kiểm tra lại bằng s = v × t.'
            : 'Practice finding speed with v = s ÷ t, then verify with s = v × t.');
      } else {
        add('solve-for-time', '⏱️',
          isVi ? 'Tính thời gian di chuyển' : 'Calculate travel time',
          isVi
            ? 'Thử bài toán với quãng đường và vận tốc khác nhau, rồi kiểm tra bằng s = v × t.'
            : 'Try new distance-and-speed examples, then check your answer with s = v × t.');
      }

      if (recommendations.length < 2) {
        add('explain-reasoning', '💬',
          isVi ? 'Giải thích cách làm' : 'Explain your reasoning',
          isVi
            ? 'Nói vì sao em chọn công thức đó và kết quả mô phỏng có khớp dự đoán không.'
            : 'Explain why you chose the formula and whether the simulation matched your prediction.');
      }

      return recommendations.slice(0, 3);
    },

    /**
     * Build Next Advanced Challenge
     */
    buildNextChallenge(currentTaskId, isVi) {
      if (currentTaskId === 'task1-reach') {
        return {
          targetTaskId: 'task2-fix',
          badge: isVi ? 'Thử thách tiếp theo' : 'Next Mission',
          title: isVi ? 'Nhiệm vụ 2: Chuyến đi bất ngờ' : 'Task 2: The Unexpected Journey',
          subtitle: isVi ? 'Kiểm tra, phát hiện, giải thích và điều chỉnh' : 'Check, detect, explain, and adjust',
          description: isVi
            ? 'Quan sát kết quả mô phỏng, đối chiếu với mục tiêu và tự quyết định cách kiểm tra phương án.'
            : 'Observe the simulation, compare it with the goal, and decide how to review the plan.',
          actionText: isVi ? 'Bắt đầu Nhiệm vụ 2 ➔' : 'Start Mission 2 ➔'
        };
      }

      if (currentTaskId === 'task2-fix') {
        return {
          targetTaskId: 'task3-new',
          badge: isVi ? 'Thử thách nâng cao' : 'Advanced Mission',
          title: isVi ? 'Nhiệm vụ 3: Thử thách đúng giờ' : 'Task 3: The On-Time Challenge',
          subtitle: isVi ? 'Thích ứng điều kiện mới, lập kế hoạch và hoàn thành' : 'Adapt to new conditions, re-plan, and succeed',
          description: isVi
            ? 'Luyện đổi đơn vị và xác định vận tốc khi đã biết quãng đường cùng thời gian.'
            : 'Practice unit conversions and find speed when distance and time are given.',
          actionText: isVi ? 'Bắt đầu Nhiệm vụ 3 ➔' : 'Start Mission 3 ➔'
        };
      }

      // The three-mission sequence is complete; send the learner back to the hub.
      return {
        targetTaskId: null,
        badge: isVi ? 'Luyện tập củng cố' : 'Keep Practicing',
        title: isVi ? 'Chọn một dạng bài để luyện thêm' : 'Choose a skill to practice next',
        subtitle: isVi ? 'Ôn công thức, đổi đơn vị và kiểm tra kết quả' : 'Review formulas, unit conversions, and result checks',
        description: isVi
          ? 'Dựa vào gợi ý luyện tập bên dưới hoặc quay lại danh sách nhiệm vụ để chọn bài muốn làm lại.'
          : 'Use the practice ideas below or return to the mission list to choose a task to repeat.',
        actionText: isVi ? 'Về danh sách nhiệm vụ' : 'Return to missions'
      };
    },

    /**
     * Render the Full Feedback Modal
     */
    showModal(session = null) {
      if (!session && window.LogEngine) {
        session = window.LogEngine.currentSession;
      }
      const lang = window.I18N ? window.I18N.currentLang : 'vi';
      const isVi = lang === 'vi';
      const analysis = this.analyzeSession(session, lang);

      let modal = document.getElementById('feedback-diagnostic-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'feedback-diagnostic-modal';
        modal.className = 'modal-backdrop feedback-modal-backdrop animate-fade-in';
        document.body.appendChild(modal);
      }

      modal.innerHTML = `
        <div class="modal-card feedback-modal-card animate-scale-up" role="dialog" aria-modal="true" aria-labelledby="fb-title">
          
          <!-- Header -->
          <div class="feedback-modal-header">
            <div class="fb-header-left">
              <span class="fb-badge">📊 ${isVi ? 'Nhận Xét & Đánh Giá Quá Trình' : 'Process Diagnostic Feedback'}</span>
              <h2 class="fb-title" id="fb-title">
                ${isVi ? 'Báo Cáo Phản Hồi Học Tập Toàn Diện' : 'Comprehensive Learning Feedback Report'}
              </h2>
              <div class="fb-meta-row">
                <span class="fb-meta-item">🧑‍🎓 <strong>${analysis.metrics.studentName}</strong></span>
                <span class="fb-meta-item">⏱️ ${analysis.metrics.totalTimeSec}s</span>
                <span class="fb-meta-item">🔄 ${analysis.metrics.totalAttempts} ${isVi ? 'lần thử' : 'trials'}</span>
                ${analysis.metrics.vocabWords.length > 0 ? `<span class="fb-meta-item">📖 ${analysis.metrics.vocabWords.length} ${isVi ? 'từ tra cứu' : 'words looked up'}</span>` : ''}
              </div>
            </div>
            <button type="button" class="btn-close-modal" id="btn-close-feedback" aria-label="Close">✕</button>
          </div>

          <!-- Multi-Stakeholder Tabs -->
          <div class="feedback-tabs-nav" role="tablist">
            <button type="button" class="fb-tab-btn active" id="tab-btn-student" role="tab" aria-selected="true" data-tab="student">
              <span class="fb-tab-icon">🧑‍🎓</span>
              <span class="fb-tab-label">${isVi ? 'Dành cho Học Sinh' : 'For Student'}</span>
            </button>
            <button type="button" class="fb-tab-btn" id="tab-btn-teacher" role="tab" aria-selected="false" data-tab="teacher">
              <span class="fb-tab-icon">👩‍🏫</span>
              <span class="fb-tab-label">${isVi ? 'Dành cho Giáo Viên' : 'For Teacher'}</span>
            </button>
            <button type="button" class="fb-tab-btn" id="tab-btn-parent" role="tab" aria-selected="false" data-tab="parent">
              <span class="fb-tab-icon">👨‍👩‍👧</span>
              <span class="fb-tab-label">${isVi ? 'Dành cho Phụ Huynh' : 'For Parents'}</span>
            </button>
          </div>

          <!-- Tab Content Container -->
          <div class="feedback-tab-content-wrapper">
            
            <!-- 1. TAB STUDENT -->
            <div class="fb-pane active animate-fade-in" id="fb-pane-student">
              <div class="fb-section-card card-strengths">
                <div class="fb-section-title">
                  <span class="sec-icon">🌟</span>
                  <h3>${isVi ? 'Những Điều Em Đã Làm Rất Tốt' : 'What You Did Great'}</h3>
                </div>
                <ul class="fb-list">
                  ${analysis.student.strengths.map(s => `<li>${s}</li>`).join('')}
                </ul>
              </div>

              <div class="fb-section-card card-improve">
                <div class="fb-section-title">
                  <span class="sec-icon">🎯</span>
                  <h3>${isVi ? 'Điểm Em Cần Luyện Thêm Để Giỏi Hơn' : 'Areas to Strengthen & Practice'}</h3>
                </div>
                <ul class="fb-list">
                  ${analysis.student.improvements.map(i => `<li>${i}</li>`).join('')}
                </ul>
              </div>

              <div class="fb-practice-section">
                <div class="fb-practice-heading">
                  <div>
                    <span class="journal-eyebrow">${isVi ? 'GỢI Ý TIẾP THEO' : 'NEXT SUGGESTIONS'}</span>
                    <h3>${isVi ? 'Gợi ý luyện tập' : 'Practice recommendations'}</h3>
                  </div>
                  <span class="fb-practice-heading-icon">✨</span>
                </div>
                <div class="fb-practice-grid">
                  ${analysis.practiceRecommendations.map(item => `
                    <article class="fb-practice-card">
                      <span class="fb-practice-icon" aria-hidden="true">${item.icon}</span>
                      <div>
                        <h4>${item.title}</h4>
                        <p>${item.description}</p>
                      </div>
                    </article>
                  `).join('')}
                </div>
              </div>

              <!-- Recommended Next Challenge -->
              <div class="fb-next-challenge-box">
                <div class="challenge-header">
                  <span class="challenge-badge">${analysis.nextChallenge.badge}</span>
                  <h4 class="challenge-title">${analysis.nextChallenge.title}</h4>
                  <p class="challenge-sub">${analysis.nextChallenge.subtitle}</p>
                </div>
                <p class="challenge-desc">${analysis.nextChallenge.description}</p>
                <div class="challenge-action-row">
                  <button type="button" class="btn-primary btn-launch-challenge" id="btn-launch-challenge">
                    ${analysis.nextChallenge.actionText}
                  </button>
                </div>
              </div>
            </div>

            <!-- 2. TAB TEACHER -->
            <div class="fb-pane hidden animate-fade-in" id="fb-pane-teacher">
              <div class="teacher-metrics-banner">
                <div class="t-stat">
                  <span class="t-label">${isVi ? 'Mức độ tự chủ' : 'Autonomy Level'}</span>
                  <strong class="t-val">${analysis.teacher.autonomyLevel}</strong>
                </div>
                <div class="t-stat">
                  <span class="t-label">${isVi ? 'Tổng thời gian' : 'Total Duration'}</span>
                  <strong class="t-val">${analysis.teacher.totalTimeSec}s</strong>
                </div>
                <div class="t-stat">
                  <span class="t-label">${isVi ? 'Mức gợi ý cao nhất' : 'Max Hint Level'}</span>
                  <strong class="t-val">${analysis.teacher.maxHintLevel > 0 ? `Level ${analysis.teacher.maxHintLevel}` : (isVi ? 'Không dùng' : 'None')}</strong>
                </div>
                <div class="t-stat">
                  <span class="t-label">${isVi ? 'Từ tra cứu' : 'Vocab Lookups'}</span>
                  <strong class="t-val">${analysis.teacher.vocabLookupsCount}</strong>
                </div>
              </div>

              <div class="fb-section-card card-indicators">
                <div class="fb-section-title">
                  <span class="sec-icon">📐</span>
                  <h3>${isVi ? 'Phân Tích Tiến Trình Giải Quyết Vấn Đề' : 'Problem-Solving Process Indicators'}</h3>
                </div>
                <div class="indicators-table-wrap">
                  <table class="fb-table">
                    <thead>
                      <tr>
                        <th>${isVi ? 'Nội dung nhiệm vụ' : 'Task Area'}</th>
                        <th>${isVi ? 'Đánh giá' : 'Status'}</th>
                        <th>${isVi ? 'Biểu hiện & Dữ liệu ghi nhận' : 'Observed Behaviors & Telemetry'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${analysis.teacher.indicators.map(ind => `
                        <tr>
                          <td><strong>${ind.activity}</strong></td>
                          <td><span class="badge-status ${ind.status === 'Optimal' ? 'status-opt' : 'status-guided'}">${ind.status}</span></td>
                          <td>${ind.details}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>

              <div class="teacher-two-col-grid">
                <div class="fb-section-card card-errors">
                  <div class="fb-section-title">
                    <span class="sec-icon">🔍</span>
                    <h3>${isVi ? 'Dạng Lỗi / Khó Khăn Đã Xuất Hiện' : 'Observed Difficulties & Error Types'}</h3>
                  </div>
                  <ul class="fb-list">
                    ${analysis.teacher.observedErrors.map(e => `<li>${e}</li>`).join('')}
                  </ul>
                </div>

                <div class="fb-section-card card-interventions">
                  <div class="fb-section-title">
                    <span class="sec-icon">💡</span>
                    <h3>${isVi ? 'Khuyến Nghị Can Thiệp Sư Phạm' : 'Pedagogical Interventions & Prompts'}</h3>
                  </div>
                  <ul class="fb-list">
                    ${analysis.teacher.pedagogicalInterventions.map(i => `<li>${i}</li>`).join('')}
                  </ul>
                </div>
              </div>
            </div>

            <!-- 3. TAB PARENT -->
            <div class="fb-pane hidden animate-fade-in" id="fb-pane-parent">
              <div class="fb-section-card card-parent-warmth">
                <div class="fb-section-title">
                  <span class="sec-icon">❤️</span>
                  <h3>${isVi ? 'Điểm Sáng Của Con Trong Buổi Học Hôm Nay' : 'Highlights of Your Child’s Learning Today'}</h3>
                </div>
                <ul class="fb-list">
                  ${analysis.parent.strengths.map(s => `<li>${s}</li>`).join('')}
                </ul>
              </div>

              <div class="fb-section-card card-parent-home">
                <div class="fb-section-title">
                  <span class="sec-icon">🏡</span>
                  <h3>${isVi ? 'Nội Dung Ba Mẹ Cùng Con Rèn Thêm Tại Nhà' : 'Suggested Home Practice Topics'}</h3>
                </div>
                <ul class="fb-list">
                  ${analysis.parent.homeFocus.map(h => `<li>${h}</li>`).join('')}
                </ul>
              </div>

              <div class="fb-section-card card-parent-prompts">
                <div class="fb-section-title">
                  <span class="sec-icon">💬</span>
                  <h3>${isVi ? '3 Câu Hỏi Gợi Mở Để Trò Chuyện Cùng Con' : '3 Natural Questions to Ask Your Child Tonight'}</h3>
                </div>
                <ul class="fb-list prompt-bubbles">
                  ${analysis.parent.conversationStarters.map(c => `<li>${c}</li>`).join('')}
                </ul>
              </div>
            </div>

          </div>

          <!-- Modal Footer Actions -->
          <div class="feedback-modal-footer">
            <div class="footer-right-actions">
              <button type="button" class="btn-secondary" id="btn-fb-return-hub">
                🏠 ${isVi ? 'Về Danh Sách Nhiệm Vụ' : 'Return to Missions Hub'}
              </button>
              <button type="button" class="btn-primary" id="btn-fb-continue">
                ${isVi ? 'Tiếp tục rèn luyện ➔' : 'Continue Practicing ➔'}
              </button>
            </div>
          </div>

        </div>
      `;

      modal.classList.add('active');
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';

      // Bind Tab Switching
      const tabs = modal.querySelectorAll('.fb-tab-btn');
      tabs.forEach(tab => {
        tab.onclick = () => {
          tabs.forEach(t => {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
          });
          tab.classList.add('active');
          tab.setAttribute('aria-selected', 'true');

          const targetTab = tab.getAttribute('data-tab');
          modal.querySelectorAll('.fb-pane').forEach(p => {
            p.classList.add('hidden');
            p.classList.remove('active');
          });
          const activePane = modal.querySelector(`#fb-pane-${targetTab}`);
          if (activePane) {
            activePane.classList.remove('hidden');
            activePane.classList.add('active');
          }
          if (window.SoundFX) window.SoundFX.playPop();
        };
      });

      // Bind Close
      const closeModal = () => {
        modal.classList.remove('active');
        modal.style.display = 'none';
        document.body.style.overflow = '';
      };
      
      // Close on button click, X icon click, or backdrop click
      modal.onclick = (e) => {
        if (e.target === modal || e.target.closest('#btn-close-feedback') || e.target.closest('.btn-close-modal')) {
          e.preventDefault();
          e.stopPropagation();
          closeModal();
        }
      };

      const closeBtn = modal.querySelector('#btn-close-feedback') || document.getElementById('btn-close-feedback');
      if (closeBtn) {
        closeBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          closeModal();
        };
      }

      // Support Escape key to close
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          closeModal();
          window.removeEventListener('keydown', escHandler);
        }
      };
      window.addEventListener('keydown', escHandler);

      // Bind Return Hub
      const returnHubBtn = document.getElementById('btn-fb-return-hub');
      if (returnHubBtn) {
        returnHubBtn.onclick = () => {
          closeModal();
          if (window.App) window.App.renderTaskSelection();
        };
      }

      // Common helper to transition to next lesson or return to hub
      const goToNextTaskOrHub = () => {
        closeModal();
        const currentId = analysis.metrics?.taskId || (window.App && window.App.activeTaskId) || 'task1-reach';
        let targetId = analysis.nextChallenge?.targetTaskId;
        if (!targetId || targetId === 'task-extra') {
          if (currentId === 'task1-reach') targetId = 'task2-fix';
          else if (currentId === 'task2-fix') targetId = 'task3-new';
          else targetId = null;
        }

        if (targetId && targetId !== 'task-extra') {
          if (window.App) window.App.navigateToTask(targetId);
        } else {
          if (window.App) window.App.renderTaskSelection();
        }
      };

      // Bind Continue / Next Lesson
      const continueBtn = document.getElementById('btn-fb-continue');
      if (continueBtn) {
        continueBtn.onclick = (e) => {
          e.preventDefault();
          goToNextTaskOrHub();
        };
      }

      // Bind Next Challenge Launch
      const challengeBtn = document.getElementById('btn-launch-challenge');
      if (challengeBtn) {
        challengeBtn.onclick = (e) => {
          e.preventDefault();
          goToNextTaskOrHub();
        };
      }

    }
  };

  if (typeof window !== 'undefined') {
    window.FeedbackEngine = FeedbackEngine;
  }
  if (typeof global !== 'undefined') {
    global.FeedbackEngine = FeedbackEngine;
  }
})();
