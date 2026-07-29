// ============================================
// i18n - Internationalization Module
// ============================================

const I18n = (() => {
  let currentLang = localStorage.getItem('quizmaster-lang') || 'vi';

  const translations = {
    vi: {
      // Navigation
      'nav.dashboard': 'Danh sách Quiz',
      'nav.play': 'Chơi Quiz',
      'nav.create': 'Tạo Quiz',
      'nav.import': 'Import',
      'nav.community': 'Cộng đồng chia sẻ',
      'nav.sessions': 'Phiên chơi',
      'nav.settings': 'Cài đặt',
      'nav.enterCode': 'Nhập mã Quiz',

      // Auth
      'auth.loginNav': '🔑 Đăng nhập / Đăng ký',
      'auth.loginTitle': '🔑 Đăng nhập QuizMaster',
      'auth.registerTitle': '📝 Đăng ký tài khoản',
      'auth.loginSubtitle': 'Nhập tài khoản để quản lý quiz, lưu phiên chơi và học tập',
      'auth.registerSubtitle': 'Tạo tài khoản mới để bắt đầu học tập ngay',
      'auth.username': 'Tên tài khoản',
      'auth.usernamePlaceholder': 'Nhập tên tài khoản...',
      'auth.password': 'Mật khẩu',
      'auth.passwordPlaceholder': 'Nhập mật khẩu...',
      'auth.loginBtn': '🚀 Đăng nhập',
      'auth.registerBtn': '✨ Tạo tài khoản',
      'auth.quickAdmin': '⚡ Đăng nhập nhanh làm Admin',
      'auth.noAccount': 'Chưa có tài khoản?',
      'auth.hasAccount': 'Đã có tài khoản?',
      'auth.registerLink': 'Đăng ký ngay',
      'auth.loginLink': 'Đăng nhập',
      'auth.defaultNotice': '💡 Admin mặc định: <b>admin</b> / <b>admin</b>',
      'auth.logout': '🚪 Đăng xuất',
      'auth.loginSuccess': 'Đăng nhập thành công!',
      'auth.registerSuccess': 'Đăng ký tài khoản thành công!',
      'auth.adminSuccess': '🎉 Đăng nhập thành công với tài khoản Admin!',
      'auth.confirmPassword': 'Nhập lại mật khẩu',
      'auth.confirmPasswordPlaceholder': 'Nhập lại mật khẩu...',
      'auth.passwordMismatch': 'Mật khẩu nhập lại không khớp',
      'auth.fillRequired': 'Vui lòng điền đầy đủ tên tài khoản và mật khẩu',
      'auth.loggedOut': 'Đã đăng xuất',

      // Community
      'community.title': 'Cộng đồng chia sẻ',
      'community.subtitle': 'Khám phá và sao chép các bộ Quiz công khai từ cộng đồng người dùng QuizMaster',
      'community.searchPlaceholder': '🔍 Tìm kiếm quiz theo tên, mô tả hoặc mã code...',
      'community.filterAll': 'Tất cả',
      'community.filterVocab': '🔤 Từ vựng',
      'community.filterQuestion': '📝 Câu hỏi',
      'community.refresh': '🔄 Refresh',
      'community.totalQuizzes': '🌐 Tổng số Quiz: {total}',
      'community.authors': '👤 Tác giả: {count}',
      'community.authorLabel': '👤 Tác giả: {name}',
      'community.questionCount': '📚 {count} câu',
      'community.playNow': '▶ Chơi ngay',
      'community.clone': '📥 Sao chép',
      'community.emptyTitle': 'Chưa có Quiz công khai nào',
      'community.emptySearchTitle': 'Không tìm thấy Quiz công khai nào khớp với từ khóa',
      'community.emptyHint': 'Hãy chia sẻ Quiz của bạn lên cộng đồng bằng cách chọn quyền riêng tư thành 🌐 Công khai (Public) khi tạo hoặc sửa Quiz!',
      'community.cloneSuccess': 'Đã sao chép Quiz về bộ sưu tập của bạn!',
      'community.cloneTitle': 'Tải về bộ sưu tập cá nhân',
      'community.publicBadge': '🌐 Công khai',
      'community.noDescription': 'Chưa có mô tả',

      // Sessions
      'sessions.title': '🎮 Phiên chơi dở',
      'sessions.subtitle': 'Quản lý và chơi tiếp các bài học dở dang của bạn theo từng loại câu hỏi trong Quiz',
      'sessions.emptyTitle': 'Chưa có phiên chơi dở nào',
      'sessions.emptyHint': 'Khi bạn luyện tập trong Chế độ Từ vựng và tạm dừng, quá trình làm bài theo từng loại câu hỏi sẽ tự động được lưu tại đây.',
      'sessions.viewQuizzes': '📚 Xem danh sách Quiz',
      'sessions.progress': '📊 Tiến độ: <b>{current}/{total} câu</b> ({percent}%)',
      'sessions.updated': '🕒 Cập nhật: {time}',
      'sessions.resume': '▶ Chơi tiếp',
      'sessions.delete': '🗑️ Xóa',
      'sessions.deleteTooltip': 'Xóa phiên chơi dở',
      'sessions.deleteConfirm': 'Bạn có chắc chắn muốn xóa phiên chơi dở này?',
      'sessions.deleted': 'Đã xóa phiên chơi dở',
      'sessions.totalInQuiz': 'Tổng cộng: {count} loại câu hỏi đang chơi dở',
      'sessions.collapse': 'Thu nhỏ',
      'sessions.expand': 'Mở rộng',
      'sessions.modeVocab': '🔤 Từ vựng',
      'sessions.modeQuestion': '📝 Câu hỏi',

      // Privacy
      'privacy.private': '🔒 Riêng tư',
      'privacy.unlisted': '🔗 Không công khai',
      'privacy.public': '🌐 Công khai',
      'code.privateTitle': 'Quiz Riêng tư (Đã ẩn mã code)',
      'code.clickToCopy': 'Click để sao chép mã',

      // Dashboard
      'dashboard.title': 'Danh sách Quiz',
      'dashboard.subtitle': 'Quản lý tất cả các bộ câu hỏi của bạn',
      'dashboard.empty': 'Chưa có quiz nào',
      'dashboard.emptyHint': 'Tạo quiz mới hoặc import từ file Excel để bắt đầu',
      'dashboard.createFirst': 'Tạo Quiz đầu tiên',
      'dashboard.search': 'Tìm kiếm quiz...',

      // Table
      'table.title': 'Tên Quiz',
      'table.code': 'Mã',
      'table.questions': 'Số câu hỏi',
      'table.created': 'Ngày tạo',
      'table.actions': 'Thao tác',

      // Create/Edit
      'create.title': 'Tạo Quiz mới',
      'create.editTitle': 'Chỉnh sửa Quiz',
      'create.quizTitle': 'Tên Quiz',
      'create.quizTitlePlaceholder': 'Nhập tên quiz...',
      'create.description': 'Mô tả',
      'create.descriptionPlaceholder': 'Nhập mô tả (tùy chọn)...',
      'create.addQuestion': 'Thêm câu hỏi',
      'create.questionText': 'Câu hỏi',
      'create.questionPlaceholder': 'Nhập câu hỏi...',
      'create.correctAnswer': 'Đáp án đúng',
      'create.answerPlaceholder': 'Nhập đáp án...',
      'create.addAnswer': '＋ Thêm đáp án',
      'create.addImage': '🖼 Thêm ảnh',
      'create.addAudio': '🔊 Thêm audio',
      'create.save': 'Lưu Quiz',
      'create.cancel': 'Hủy',
      'create.questions': 'Danh sách câu hỏi',
      'create.noQuestions': 'Chưa có câu hỏi nào. Nhấn "Thêm câu hỏi" để bắt đầu.',
      'create.deleteConfirm': 'Bạn có chắc muốn xóa câu hỏi này?',
      'create.saved': 'Quiz đã được lưu thành công!',

      // Import
      'import.title': 'Import từ Excel',
      'import.subtitle': 'Tải lên file Excel (.xlsx, .xls, .csv) để tạo quiz nhanh',
      'import.dropText': 'Kéo thả file Excel vào đây',
      'import.dropHint': 'hoặc click để chọn file (.xlsx, .xls, .csv)',
      'import.preview': 'Xem trước',
      'import.previewCount': 'câu hỏi tìm thấy',
      'import.quizName': 'Tên Quiz',
      'import.quizNamePlaceholder': 'Nhập tên quiz cho bộ câu hỏi import...',
      'import.confirm': 'Import',
      'import.success': 'Import thành công! Đã thêm {count} câu hỏi.',
      'import.formatHint': 'File Excel cần có cột "Question Text" và "Correct Answer"',

      // Settings
      'settings.title': 'Cài đặt',
      'settings.subtitle': 'Tùy chỉnh trải nghiệm quiz',
      'settings.gameplay': 'Gameplay',
      'settings.shuffleQuestions': 'Đảo thứ tự câu hỏi',
      'settings.shuffleQuestionsDesc': 'Câu hỏi sẽ được hiển thị ngẫu nhiên',
      'settings.allowDuplicates': 'Cho phép lặp lại đáp án',
      'settings.allowDuplicatesDesc': 'Có thể nhập lại đáp án đúng đã nhập trước đó cho cùng một câu hỏi',
      'settings.maxRetries': 'Lặp lại câu sai',
      'settings.maxRetriesDesc': 'Số lần lặp lại câu sai. Câu sai sẽ tự động hiện lại sau 7 câu khác.',
      'settings.unlimited': 'Không giới hạn',
      'settings.noRetry': 'Không lặp lại',
      'settings.retryTimes': '{count} lần',
      'settings.swapQA': 'Hoán đổi Câu hỏi ↔ Đáp án',
      'settings.swapQADesc': 'Đáp án sẽ trở thành câu hỏi và ngược lại',
      'settings.language': 'Ngôn ngữ',
      'settings.langLabel': 'Ngôn ngữ giao diện',
      'settings.langDesc': 'Chọn ngôn ngữ hiển thị cho ứng dụng',
      'settings.appearance': 'Giao diện',
      'settings.themeLabel': 'Chế độ giao diện',
      'settings.themeDesc': 'Chọn giao diện Sáng hoặc Tối cho ứng dụng',
      'settings.themeDark': 'Giao diện Tối (Dark Mode)',
      'settings.themeLight': 'Giao diện Sáng (Light Mode)',
      'settings.chineseFontLabel': 'Font tiếng Trung khi làm bài',
      'settings.chineseFontDesc': 'Chọn font chữ hiển thị cho tiếng Trung khi làm bài',
      'settings.fontDefault': 'Default (Mặc định)',
      'settings.fontSimSun': 'SimSun (宋体)',
      'settings.audio': 'Âm thanh & Phát âm',
      'settings.volumeLabel': 'Âm lượng đọc từ',
      'settings.volumeDesc': 'Điều chỉnh mức âm lượng khi nghe đọc từ vựng',
      'settings.testVolume': 'Thử giọng đọc',

      // Change Password
      'settings.changePasswordTitle': '🔒 Đổi mật khẩu',
      'settings.changePasswordDesc': 'Thay đổi mật khẩu đăng nhập cho tài khoản {username}',
      'settings.currentPassword': 'Mật khẩu hiện tại',
      'settings.currentPasswordPlaceholder': 'Nhập mật khẩu hiện tại...',
      'settings.newPassword': 'Mật khẩu mới',
      'settings.newPasswordPlaceholder': 'Nhập mật khẩu mới (tối thiểu 3 ký tự)...',
      'settings.savePassword': '💾 Lưu mật khẩu mới',
      'settings.passwordChanged': 'Đổi mật khẩu thành công!',
      'settings.passwordFailed': 'Đổi mật khẩu thất bại',

      // Quiz Code
      'code.title': 'Nhập mã Quiz',
      'code.subtitle': 'Nhập mã 6 chữ số để truy cập quiz',
      'code.placeholder': 'Nhập mã quiz...',
      'code.submit': 'Truy cập',
      'code.notFound': 'Không tìm thấy quiz với mã này',
      'code.invalid': 'Mã quiz phải có 6 chữ số',

      // Play
      'play.title': 'Chọn Quiz',
      'play.subtitle': 'Chọn một bộ quiz để bắt đầu chơi',
      'play.start': 'Bắt đầu',
      'play.questionOf': 'Câu {current} / {total}',
      'play.retries': 'Số lần thử',
      'play.submit': 'Kiểm tra',
      'play.next': 'Tiếp theo',
      'play.answerPlaceholder': 'Nhập câu trả lời...',
      'play.alreadyAnswered': '⚠️ Bạn đã trả lời đáp án này rồi!',
      'play.correct': '✅ Chính xác!',
      'play.incorrect': '❌ Sai rồi! Đáp án đúng: {answer}',
      'play.finish': 'Hoàn thành!',
      'play.typeHintLabel': 'Yêu cầu',
      'play.retryAttempt': 'Làm lại lần {count}',
      'play.dontRemember': 'Không nhớ',
      'play.dontRememberFeedback': '❓ Đã chọn Không nhớ! Đáp án đúng: {answer}',
      'play.dontRememberLabel': 'Không nhớ',
      'play.questionList': 'Danh sách câu',
      'play.current': 'Hiện tại',
      'quiz.pinned': 'Ghim',

      // Results
      'results.title': '📊 Kết quả Quiz',
      'results.correct': 'Đúng',
      'results.incorrect': 'Sai',
      'results.total': 'Tổng câu hỏi',
      'results.accuracy': 'Tỉ lệ đúng',
      'results.filterAll': 'Tất cả',
      'results.filterCorrect': '✅ Đúng',
      'results.filterIncorrect': '❌ Sai',
      'results.yourAnswer': 'Câu trả lời của bạn',
      'results.correctAnswer': 'Đáp án đúng',
      'results.retries': 'lần thử',
      'results.playAgain': 'Chơi lại',
      'results.backToList': 'Về danh sách',
      'results.noAnswer': '(không trả lời)',
      'results.firstTry': 'Đúng ngay lần đầu',

      // Common
      'common.edit': 'Sửa',
      'common.delete': 'Xóa',
      'common.play': 'Chơi',
      'common.save': 'Lưu',
      'common.cancel': 'Hủy',
      'common.confirm': 'Xác nhận',
      'common.close': 'Đóng',
      'common.loading': 'Đang tải...',
      'common.error': 'Đã có lỗi xảy ra',
      'common.deleteQuizConfirm': 'Bạn có chắc muốn xóa quiz "{title}"? Hành động này không thể hoàn tác.',
      'common.copied': 'Đã sao chép mã quiz!',

      // Vocab
      'vocab.createTitle': 'Tạo bộ từ vựng',
      'vocab.editTitle': 'Sửa bộ từ vựng',
      'vocab.vocabLang': 'Ngôn ngữ Từ vựng',
      'vocab.meaningLang': 'Ngôn ngữ cột Nghĩa',
      'vocab.ipa': 'Phiên âm (IPA)',
      'vocab.count': 'Số từ: {count}',
      'vocab.textareaWord': 'Mỗi dòng 1 từ',
      'vocab.textareaMeaning': 'Mỗi dòng 1 nghĩa',
      'vocab.textareaIpa': 'Có thể để trống',
      'vocab.addToList': 'Thêm vào danh sách',
      'vocab.colNum': '#',
      'vocab.colWord': 'Từ',
      'vocab.colMeaning': 'Nghĩa',
      'vocab.colIpa': 'Phiên âm',
      'vocab.colAction': 'Thao tác',
      'vocab.save': 'Lưu thành Quiz',

      // MCQ
      'mcq.listenAgain': 'Nghe lại',
      'mcq.nextQuestion': 'Câu tiếp theo',

      // Question type selector
      'qtype.all': 'Tất cả',
      'qtype.mcq_word_meaning': 'Trắc nghiệm',
      'qtype.mcq_word_meaning_desc': 'Từ → chọn Nghĩa',
      'qtype.mcq_meaning_word': 'Trắc nghiệm',
      'qtype.mcq_meaning_word_desc': 'Nghĩa → chọn Từ',
      'qtype.mcq_word_ipa': 'Trắc nghiệm',
      'qtype.mcq_word_ipa_desc': 'Từ → chọn Phiên âm',
      'qtype.mcq_meaning_ipa': 'Trắc nghiệm',
      'qtype.mcq_meaning_ipa_desc': 'Nghĩa → chọn Phiên âm',
      'qtype.mcq_ipa_word': 'Trắc nghiệm',
      'qtype.mcq_ipa_word_desc': 'Phiên âm → chọn Từ',
      'qtype.mcq_ipa_meaning': 'Trắc nghiệm',
      'qtype.mcq_ipa_meaning_desc': 'Phiên âm → chọn Nghĩa',
      'qtype.mcq_listen_word': 'Trắc nghiệm',
      'qtype.mcq_listen_word_desc': 'Nghe → chọn Từ',
      'qtype.mcq_listen_meaning': 'Trắc nghiệm',
      'qtype.mcq_listen_meaning_desc': 'Nghe → chọn Nghĩa',
      'qtype.fill_word_meaning': 'Điền từ',
      'qtype.fill_word_meaning_desc': 'Từ → điền Nghĩa',
      'qtype.fill_meaning_word': 'Điền từ',
      'qtype.fill_meaning_word_desc': 'Nghĩa → điền Từ',
      'qtype.fill_ipa_word': 'Điền từ',
      'qtype.fill_ipa_word_desc': 'Phiên âm → điền Từ',
      'qtype.fill_ipa_meaning': 'Điền từ',
      'qtype.fill_ipa_meaning_desc': 'Phiên âm → điền Nghĩa',
      'qtype.fill_listen_word': 'Điền từ',
      'qtype.fill_listen_word_desc': 'Nghe → điền Từ',
      'qtype.fill_listen_meaning': 'Điền từ',
      'qtype.fill_listen_meaning_desc': 'Nghe → điền Nghĩa',

      // Settings auto-advance
      'settings.autoAdvance': 'Thời gian tự chuyển câu',
      'settings.autoAdvanceDesc': 'Thời gian chờ để tự động chuyển sang câu tiếp theo khi trả lời đúng',
      'settings.custom': 'Tùy chỉnh',
      'settings.instant': 'Ngay lập tức (0s)',

      // Dashboard
      'dashboard.modeQuestion': 'Chế độ Câu hỏi',
      'dashboard.modeVocab': 'Chế độ Từ vựng',
      'dashboard.typeQuestion': '📝 Câu hỏi',
      'dashboard.typeVocab': '🔤 Từ vựng',

      // Export/Import
      'export.downloadExcel': 'Xuất Excel',
      'import.modeQuestion': 'Câu hỏi',
      'import.modeVocab': 'Từ vựng',
      'import.vocabFormatHint': 'File Excel cần có các cột "Từ vựng", "Nghĩa", và "Phiên âm" (tùy chọn)',
      'import.downloadTemplateQuestion': 'Tải file Excel mẫu cho Câu hỏi',
      'import.downloadTemplateVocab': 'Tải file Excel mẫu cho Từ vựng',

      // Create Modal
      'createModal.title': 'Chọn chế độ tạo Quiz',
      'createModal.subtitle': 'Vui lòng chọn loại Quiz bạn muốn tạo',
      'createModal.questionDesc': 'Tạo câu hỏi điền từ hoặc trắc nghiệm kèm hình ảnh và âm thanh',
      'createModal.vocabDesc': 'Tạo bộ từ vựng với phiên âm IPA, nghĩa và phát âm tự động',

      // Resume Progress
      'resume.title': 'Khôi phục tiến trình chơi',
      'resume.message': 'Bạn có tiến trình chơi dở ở câu {current} / {total}. Bạn có muốn tiếp tục không?',
      'resume.continue': 'Tiếp tục chơi',
      'resume.startNew': 'Chơi từ đầu',
      'resume.savedNotice': 'Đã khôi phục tiến trình chơi!',
      'resume.badge': 'Đang dở (câu {current}/{total})'
    },

    en: {
      // Navigation
      'nav.dashboard': 'Quiz List',
      'nav.play': 'Play Quiz',
      'nav.create': 'Create Quiz',
      'nav.import': 'Import',
      'nav.community': 'Community Hub',
      'nav.sessions': 'Game Sessions',
      'nav.settings': 'Settings',
      'nav.enterCode': 'Enter Quiz Code',

      // Auth
      'auth.loginNav': '🔑 Login / Register',
      'auth.loginTitle': '🔑 Login to QuizMaster',
      'auth.registerTitle': '📝 Create an Account',
      'auth.loginSubtitle': 'Log in to manage quizzes, save progress, and study',
      'auth.registerSubtitle': 'Create a new account to start learning right away',
      'auth.username': 'Username',
      'auth.usernamePlaceholder': 'Enter username...',
      'auth.password': 'Password',
      'auth.passwordPlaceholder': 'Enter password...',
      'auth.loginBtn': '🚀 Log In',
      'auth.registerBtn': '✨ Create Account',
      'auth.quickAdmin': '⚡ Quick Login as Admin',
      'auth.noAccount': "Don't have an account?",
      'auth.hasAccount': 'Already have an account?',
      'auth.registerLink': 'Register now',
      'auth.loginLink': 'Log In',
      'auth.defaultNotice': '💡 Default Admin: <b>admin</b> / <b>admin</b>',
      'auth.logout': '🚪 Log Out',
      'auth.loginSuccess': 'Logged in successfully!',
      'auth.registerSuccess': 'Account registered successfully!',
      'auth.adminSuccess': '🎉 Logged in as Admin!',
      'auth.confirmPassword': 'Confirm Password',
      'auth.confirmPasswordPlaceholder': 'Re-enter password...',
      'auth.passwordMismatch': 'Passwords do not match',
      'auth.fillRequired': 'Please fill in both username and password',
      'auth.loggedOut': 'Logged out',

      // Community
      'community.title': 'Community Hub',
      'community.subtitle': 'Explore and clone public quizzes shared by the QuizMaster community',
      'community.searchPlaceholder': '🔍 Search quizzes by title, description or code...',
      'community.filterAll': 'All',
      'community.filterVocab': '🔤 Vocabulary',
      'community.filterQuestion': '📝 Questions',
      'community.refresh': '🔄 Refresh',
      'community.totalQuizzes': '🌐 Total Quizzes: {total}',
      'community.authors': '👤 Authors: {count}',
      'community.authorLabel': '👤 Author: {name}',
      'community.questionCount': '📚 {count} questions',
      'community.playNow': '▶ Play Now',
      'community.clone': '📥 Clone',
      'community.emptyTitle': 'No public quizzes yet',
      'community.emptySearchTitle': 'No public quizzes matching your search',
      'community.emptyHint': 'Share your quizzes with the community by setting privacy to 🌐 Public when creating or editing a quiz!',
      'community.cloneSuccess': 'Quiz cloned to your collection!',
      'community.cloneTitle': 'Download to personal collection',
      'community.publicBadge': '🌐 Public',
      'community.noDescription': 'No description provided',

      // Sessions
      'sessions.title': '🎮 Saved Sessions',
      'sessions.subtitle': 'Manage and resume your in-progress learning sessions for each question type',
      'sessions.emptyTitle': 'No saved sessions yet',
      'sessions.emptyHint': 'When you practice in Vocabulary mode and pause, your progress for each question type will be automatically saved here.',
      'sessions.viewQuizzes': '📚 View Quiz Library',
      'sessions.progress': '📊 Progress: <b>{current}/{total} questions</b> ({percent}%)',
      'sessions.updated': '🕒 Updated: {time}',
      'sessions.resume': '▶ Resume',
      'sessions.delete': '🗑️ Delete',
      'sessions.deleteTooltip': 'Delete saved session',
      'sessions.deleteConfirm': 'Are you sure you want to delete this saved session?',
      'sessions.deleted': 'Session deleted',
      'sessions.totalInQuiz': 'Total: {count} in-progress question types',
      'sessions.collapse': 'Collapse',
      'sessions.expand': 'Expand',
      'sessions.modeVocab': '🔤 Vocabulary',
      'sessions.modeQuestion': '📝 Questions',

      // Privacy
      'privacy.private': '🔒 Private',
      'privacy.unlisted': '🔗 Unlisted',
      'privacy.public': '🌐 Public',
      'code.privateTitle': 'Private Quiz (Code Hidden)',
      'code.clickToCopy': 'Click to copy code',

      // Dashboard
      'dashboard.title': 'Quiz Library',
      'dashboard.subtitle': 'Manage all your quiz collections',
      'dashboard.empty': 'No quizzes yet',
      'dashboard.emptyHint': 'Create a new quiz or import from Excel to get started',
      'dashboard.createFirst': 'Create Your First Quiz',
      'dashboard.search': 'Search quizzes...',

      // Table
      'table.title': 'Quiz Name',
      'table.code': 'Code',
      'table.questions': 'Questions',
      'table.created': 'Created',
      'table.actions': 'Actions',

      // Create/Edit
      'create.title': 'Create New Quiz',
      'create.editTitle': 'Edit Quiz',
      'create.quizTitle': 'Quiz Title',
      'create.quizTitlePlaceholder': 'Enter quiz title...',
      'create.description': 'Description',
      'create.descriptionPlaceholder': 'Enter description (optional)...',
      'create.addQuestion': 'Add Question',
      'create.questionText': 'Question',
      'create.questionPlaceholder': 'Enter question...',
      'create.correctAnswer': 'Correct Answer',
      'create.answerPlaceholder': 'Enter answer...',
      'create.addAnswer': '＋ Add Answer',
      'create.addImage': '🖼 Add Image',
      'create.addAudio': '🔊 Add Audio',
      'create.save': 'Save Quiz',
      'create.cancel': 'Cancel',
      'create.questions': 'Questions List',
      'create.noQuestions': 'No questions yet. Click "Add Question" to start.',
      'create.deleteConfirm': 'Are you sure you want to delete this question?',
      'create.saved': 'Quiz saved successfully!',

      // Import
      'import.title': 'Import from Excel',
      'import.subtitle': 'Upload an Excel file (.xlsx, .xls, .csv) to quickly create a quiz',
      'import.dropText': 'Drag & drop your Excel file here',
      'import.dropHint': 'or click to select a file (.xlsx, .xls, .csv)',
      'import.preview': 'Preview',
      'import.previewCount': 'questions found',
      'import.quizName': 'Quiz Name',
      'import.quizNamePlaceholder': 'Enter a name for the imported quiz...',
      'import.confirm': 'Import',
      'import.success': 'Import successful! Added {count} questions.',
      'import.formatHint': 'Excel file must have "Question Text" and "Correct Answer" columns',

      // Settings
      'settings.title': 'Settings',
      'settings.subtitle': 'Customize your quiz experience',
      'settings.gameplay': 'Gameplay',
      'settings.shuffleQuestions': 'Shuffle Questions',
      'settings.shuffleQuestionsDesc': 'Questions will be displayed in random order',
      'settings.allowDuplicates': 'Allow Duplicate Answers',
      'settings.allowDuplicatesDesc': 'Allow entering a previously entered correct answer for the same question',
      'settings.maxRetries': 'Retry Wrong Answers',
      'settings.maxRetriesDesc': 'Max retries for wrong answers. Wrong questions will reappear after 7 questions.',
      'settings.unlimited': 'Unlimited',
      'settings.noRetry': 'No Retries',
      'settings.retryTimes': '{count} times',
      'settings.swapQA': 'Swap Question ↔ Answer',
      'settings.swapQADesc': 'Answers become questions and vice versa',
      'settings.language': 'Language',
      'settings.langLabel': 'Interface Language',
      'settings.langDesc': 'Choose the display language for the app',
      'settings.appearance': 'Appearance',
      'settings.themeLabel': 'Theme Mode',
      'settings.themeDesc': 'Choose Light or Dark theme for the app',
      'settings.themeDark': 'Dark Theme (Dark Mode)',
      'settings.themeLight': 'Light Theme (Light Mode)',
      'settings.chineseFontLabel': 'Chinese Quiz Font',
      'settings.chineseFontDesc': 'Select display font for Chinese text during quiz',
      'settings.fontDefault': 'Default',
      'settings.fontSimSun': 'SimSun (宋体)',
      'settings.audio': 'Audio & Speech',
      'settings.volumeLabel': 'TTS Speech Volume',
      'settings.volumeDesc': 'Adjust the audio volume level when listening to words',
      'settings.testVolume': 'Test Sound',

      // Change Password
      'settings.changePasswordTitle': '🔒 Change Password',
      'settings.changePasswordDesc': 'Change login password for account {username}',
      'settings.currentPassword': 'Current Password',
      'settings.currentPasswordPlaceholder': 'Enter current password...',
      'settings.newPassword': 'New Password',
      'settings.newPasswordPlaceholder': 'Enter new password (min 3 characters)...',
      'settings.savePassword': '💾 Save New Password',
      'settings.passwordChanged': 'Password changed successfully!',
      'settings.passwordFailed': 'Password change failed',

      // Quiz Code
      'code.title': 'Enter Quiz Code',
      'code.subtitle': 'Enter the 6-digit code to access a quiz',
      'code.placeholder': 'Enter quiz code...',
      'code.submit': 'Access',
      'code.notFound': 'No quiz found with this code',
      'code.invalid': 'Quiz code must be 6 digits',

      // Play
      'play.title': 'Choose a Quiz',
      'play.subtitle': 'Select a quiz to start playing',
      'play.start': 'Start',
      'play.questionOf': 'Question {current} / {total}',
      'play.retries': 'Retries',
      'play.submit': 'Check',
      'play.next': 'Next',
      'play.answerPlaceholder': 'Type your answer...',
      'play.alreadyAnswered': '⚠️ You have already given this answer!',
      'play.correct': '✅ Correct!',
      'play.incorrect': '❌ Wrong! Correct answer: {answer}',
      'play.finish': 'Finish!',
      'play.typeHintLabel': 'Requirement',
      'play.retryAttempt': 'Retry #{count}',
      'play.dontRemember': 'Don\'t remember',
      'play.dontRememberFeedback': '❓ Selected Don\'t remember! Correct answer: {answer}',
      'play.dontRememberLabel': 'Don\'t remember',
      'play.questionList': 'Question List',
      'play.current': 'Current',
      'quiz.pinned': 'Pinned',

      // Results
      'results.title': '📊 Quiz Results',
      'results.correct': 'Correct',
      'results.incorrect': 'Incorrect',
      'results.total': 'Total Questions',
      'results.accuracy': 'Accuracy',
      'results.filterAll': 'All',
      'results.filterCorrect': '✅ Correct',
      'results.filterIncorrect': '❌ Incorrect',
      'results.yourAnswer': 'Your answer',
      'results.correctAnswer': 'Correct answer',
      'results.retries': 'retries',
      'results.playAgain': 'Play Again',
      'results.backToList': 'Back to List',
      'results.noAnswer': '(no answer)',
      'results.firstTry': 'Correct on first try',

      // Common
      'common.edit': 'Edit',
      'common.delete': 'Delete',
      'common.play': 'Play',
      'common.save': 'Save',
      'common.cancel': 'Cancel',
      'common.confirm': 'Confirm',
      'common.close': 'Close',
      'common.loading': 'Loading...',
      'common.error': 'An error occurred',
      'common.deleteQuizConfirm': 'Are you sure you want to delete quiz "{title}"? This action cannot be undone.',
      'common.copied': 'Quiz code copied!',

      // Vocab
      'vocab.createTitle': 'Create Vocabulary',
      'vocab.editTitle': 'Edit Vocabulary',
      'vocab.vocabLang': 'Vocabulary Language',
      'vocab.meaningLang': 'Meaning Language',
      'vocab.ipa': 'Pronunciation (IPA)',
      'vocab.count': 'Words: {count}',
      'vocab.textareaWord': 'One word per line',
      'vocab.textareaMeaning': 'One meaning per line',
      'vocab.textareaIpa': 'Optional',
      'vocab.addToList': 'Add to list',
      'vocab.colNum': '#',
      'vocab.colWord': 'Word',
      'vocab.colMeaning': 'Meaning',
      'vocab.colIpa': 'IPA',
      'vocab.colAction': 'Actions',
      'vocab.save': 'Save as Quiz',

      // MCQ
      'mcq.listenAgain': 'Listen again',
      'mcq.nextQuestion': 'Next question',

      // Question type selector
      'qtype.all': 'All',
      'qtype.mcq_word_meaning': 'MCQ',
      'qtype.mcq_word_meaning_desc': 'Word → Meaning',
      'qtype.mcq_meaning_word': 'MCQ',
      'qtype.mcq_meaning_word_desc': 'Meaning → Word',
      'qtype.mcq_word_ipa': 'MCQ',
      'qtype.mcq_word_ipa_desc': 'Word → IPA',
      'qtype.mcq_meaning_ipa': 'MCQ',
      'qtype.mcq_meaning_ipa_desc': 'Meaning → IPA',
      'qtype.mcq_ipa_word': 'MCQ',
      'qtype.mcq_ipa_word_desc': 'IPA → Word',
      'qtype.mcq_ipa_meaning': 'MCQ',
      'qtype.mcq_ipa_meaning_desc': 'IPA → Meaning',
      'qtype.mcq_listen_word': 'MCQ',
      'qtype.mcq_listen_word_desc': 'Listen → Word',
      'qtype.mcq_listen_meaning': 'MCQ',
      'qtype.mcq_listen_meaning_desc': 'Listen → Meaning',
      'qtype.fill_word_meaning': 'Fill',
      'qtype.fill_word_meaning_desc': 'Word → Meaning',
      'qtype.fill_meaning_word': 'Fill',
      'qtype.fill_meaning_word_desc': 'Meaning → Word',
      'qtype.fill_ipa_word': 'Fill',
      'qtype.fill_ipa_word_desc': 'IPA → Word',
      'qtype.fill_ipa_meaning': 'Fill',
      'qtype.fill_ipa_meaning_desc': 'IPA → Meaning',
      'qtype.fill_listen_word': 'Fill',
      'qtype.fill_listen_word_desc': 'Listen → Word',
      'qtype.fill_listen_meaning': 'Fill',
      'qtype.fill_listen_meaning_desc': 'Listen → Meaning',

      // Settings auto-advance
      'settings.autoAdvance': 'Auto-advance Delay',
      'settings.autoAdvanceDesc': 'Time to wait before automatically advancing to next question after correct answer',
      'settings.custom': 'Custom',
      'settings.instant': 'Instant (0s)',

      // Dashboard
      'dashboard.modeQuestion': 'Question Mode',
      'dashboard.modeVocab': 'Vocabulary Mode',
      'dashboard.typeQuestion': '📝 Question',
      'dashboard.typeVocab': '🔤 Vocabulary',

      // Export/Import
      'export.downloadExcel': 'Export Excel',
      'import.modeQuestion': 'Questions',
      'import.modeVocab': 'Vocabulary',
      'import.vocabFormatHint': 'Excel file must have "Word", "Meaning", and "IPA" (optional) columns',
      'import.downloadTemplateQuestion': 'Download Excel Template for Questions',
      'import.downloadTemplateVocab': 'Download Excel Template for Vocabulary',

      // Create Modal
      'createModal.title': 'Select Quiz Creation Mode',
      'createModal.subtitle': 'Please select the type of Quiz you want to create',
      'createModal.questionDesc': 'Create fill-in-the-blank or MCQ questions with images & audio',
      'createModal.vocabDesc': 'Create vocabulary lists with IPA, meanings & auto TTS',

      // Resume Progress
      'resume.title': 'Resume Saved Progress',
      'resume.message': 'You have saved progress at question {current} / {total}. Would you like to resume?',
      'resume.continue': 'Resume Quiz',
      'resume.startNew': 'Start New',
      'resume.savedNotice': 'Progress resumed!',
      'resume.badge': 'Saved ({current}/{total})'
    }
  };

  function t(key, params = {}) {
    let text = translations[currentLang]?.[key] || translations['en']?.[key] || key;
    // Replace {param} placeholders
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    });
    return text;
  }

  function setLang(lang) {
    if (translations[lang]) {
      currentLang = lang;
      localStorage.setItem('quizmaster-lang', lang);
      updateDOM();
    }
  }

  function getLang() {
    return currentLang;
  }

  function updateDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = t(key);
    });
  }

  return { t, setLang, getLang, updateDOM };
})();
