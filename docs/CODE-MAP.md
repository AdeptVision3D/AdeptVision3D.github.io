# Карта кода Decard Studio

Автогенерируемый указатель: где что лежит. Нужен, чтобы находить нужное место без чтения больших файлов.
Обновление: `powershell -ExecutionPolicy Bypass -File scripts/make-code-map.ps1` после крупных правок.

## Устройство
- Сайт статический (GitHub Pages) + Supabase (база, вход, Edge-функция `supabase/functions/bright-api`).
- Каждая страница = `страница.html` (разметка) + `css/страница.css` + `js/страница.js`. Общее лежит в корне.
- Общие файлы: `common.js` (вход, роли, права, журнал ошибок, тосты, тема), `icons.js` (иконки `ICON`), `reminders.js` (колокольчик и напоминания), `styles.css` (базовые стили), `glass.css` + `glass.js` + `glass-fx.js` (дизайн «жидкое стекло», поиск Ctrl+K, подсказки, эффекты).
- Версии файлов — в query-параметрах `?v=...` в HTML (при правке файла поднимать версию во всех страницах).
- База: `supabase/migrations/*.sql` (по порядку имён). Права — через RLS-политики + функции `canXxx()` в `common.js`.
- Бэкап базы: `.github/workflows/backup.yml` + `scripts/backup-supabase.js` (ежедневно, в репозиторий `decard-backups`).
- Роли: artist, lead, art_director, ceo, manager, marketer (+ флаг `is_admin`). Таблица ролей: `public.roles`.

## Страницы
### analytics.html — Аналитика
Файлы: `analytics.html` · `css/analytics.css` · `js/analytics.js`
Таблицы: clients, deal_payments, deals, employee_leaves, frame_activity_log, frame_stages, frames, marketing_expenses, profiles, projects
Функции (60 КБ, формат имя:строка): requireAuth:3, loadAllData:11, renderStats:92, renderOnTimeDelivery:132, renderDeadlines:183, renderActivityByPerson:205, renderRevisions:231, renderHours:282, renderWorkload:322, renderRecentActivity:350, renderNewClients:376, renderOnHoldProjects:412, renderPendingApprovals:435, renderDealManagers:465, renderCategoryBreakdown:507, renderOnLeaveToday:533, renderFinanceSummary:558, renderFinanceByMonth:582, renderFinanceReceivables:612, populateExpenseChannelSelect:645, toggleAddExpenseForm:650, addMarketingExpense:660, deleteMarketingExpense:675, renderMarketingExpenses:682, renderQualityRevisions:741, renderQualityRating:778, csvEscape:806, downloadCSV:810, exportCurrentTabCSV:820, switchAnalyticsTab:885

### bugs.html — Сообщить об ошибке
Файлы: `bugs.html` · `css/bugs.css` · `js/bugs.js`
Таблицы: bug_reports, profiles
Функции (10 КБ, формат имя:строка): requireAuth:16, loadBugs:23, bugCardHtml:41, renderBugs:70, guessCurrentPage:91, openBugFormModal:101, closeBugFormModal:110, submitBugForm:114, setBugStatus:129, deleteBug:138

### calendar.html — Календарь
Файлы: `calendar.html` · `css/calendar.css` · `js/calendar.js`
Таблицы: company_event_invitees, company_events, company_holidays, profiles
Функции (24 КБ, формат имя:строка): employeeName:13, canCreateEvents:22, canPickAnyOrganizer:29, requireAuth:33, toIso:40, loadEmployeesAndProfiles:44, peopleEventsForIso:64, loadMonthEvents:84, getGridStart:113, renderCalendar:121, shiftMonth:168, goToday:175, openEventFormModal:186, renderEventViewOnly:202, renderEventEditForm:220, findOrganizerConflicts:275, updateOrganizerBusyHint:287, fmtRuDate:308, closeEventFormModal:313, submitEventForm:318, deleteEvent:360

### cases.html — Кейсы
Файлы: `cases.html` · `css/cases.css` · `js/cases.js`
Таблицы: clients, projects
Функции (7 КБ, формат имя:строка): requireAuth:6, setCaseFilter:17, loadCases:24, clientNameById:38, renderCases:43, toggleCase:81, saveCaseText:88, copyCaseText:97

### clients.html — Клиенты
Файлы: `clients.html` · `css/clients.css` · `js/clients.js`
Таблицы: clients, deals, projects
Функции (10 КБ, формат имя:строка): requireAuth:6, loadClients:19, renderClients:51, openClientFormModal:101, closeClientFormModal:114, submitClientForm:119, deleteClient:147

### content-plan.html — Контент-план
Файлы: `content-plan.html` · `css/content-plan.css` · `js/content-plan.js`
Таблицы: content_plan
Функции (6 КБ, формат имя:строка): requireAuth:13, loadPlan:24, renderBoard:31, openPlanModal:53, closePlanModal:65, submitPlanForm:70, deletePlanItem:92

### deals.html — Сделки
Файлы: `deals.html` · `css/deals.css` · `js/deals.js`
Таблицы: clients, deal_activities, deal_payments, deal_templates, deals, profiles, projects
Функции (42 КБ, формат имя:строка): requireAuth:22, setViewMode:34, loadAll:39, clientNameById:65, managerNameById:69, renderBoard:74, renderDealCard:103, populateClientSelect:127, onDealClientChange:134, onDealClientNewPhoneInput:144, populateManagerSelect:162, populateTemplateSelect:178, onDealTemplateChange:182, renderFreeItemsList:191, addFreeItemRow:201, removeFreeItemRow:202, renderChecklistList:204, toggleChecklistItem:217, populateSourceSelect:227, onDealSourceChange:233, populateLostReasonSelect:236, renderStageRow:242, changeDealStage:249, saveLostReason:257, renderApprovalBox:267, approveDeal:288, rejectDeal:295, renderPaymentsSection:305, addDealPayment:335, deleteDealPayment:348, renderActivityFeed:356, addActivity:374, deleteActivity:383, openDealModal:390, closeDealModal:443, submitDealForm:452, deleteDealFromModal:512, convertDealToProject:522, openTemplatesModal:553, closeTemplatesModal:557, renderTemplatesList:560, renderTemplateItemsList:576, addTemplateItemRow:584, removeTemplateItemRow:585, openTemplateEditForm:587, closeTemplateEditForm:596, submitTemplateForm:600, deleteTemplate:618

### error-console.html — Консоль ошибок
Файлы: `error-console.html` · `css/error-console.css` · `js/error-console.js`
Таблицы: error_logs, profiles
Функции (9 КБ, формат имя:строка): requireAuth:5, loadErrors:21, refreshErrors:40, fmtErrTime:46, setErrorFilter:51, renderErrors:57, toggleErrorResolved:103, toggleStack:115, deleteErrorLog:120, clearOldErrors:127

### frame.html — Кадр
Файлы: `frame.html` · `css/frame.css` · `js/frame.js`
Таблицы: frame_activity_log, frame_comments, frame_stages, frame_tasks, frames, profiles
Функции (51 КБ, формат имя:строка): requireAuth:3, canManageStages:7, canDeleteComments:8, toggleWarnings:47, loadWarningsPref:52, updateWarningsToggleLabel:57, getFrame:64, loadProfilesForMentions:71, completeFrame:77, maybeAutoUpdateFrameStatus:90, seedFrameStagesIfNeeded:109, loadStagesData:133, reloadAndRender:161, logActivity:167, openLogModal:172, closeLogModal:184, exportFramePDF:187, toggleStageExpand:208, expandAll:221, collapseAll:226, searchStages:232, getStageStatus:243, updateStageProgress:251, updateOverallProgress:264, refreshStageStatusBadge:275, toggleTask:290, editTaskText:305, addTask:318, deleteTask:333, markAllTasks:349, confirmResetStage:359, resetStage:365, openAddStageModal:375, closeAddStageModal:380, submitAddStage:382, confirmDeleteStage:417, deleteStage:424, openCommentsModal:438, closeCommentsModal:446, renderCommentsInto:448, deleteComment:461, addModalComment:471, openTaskCommentModal:488, closeTaskCommentModal:497, addTaskComment:499, refreshCommentsButtonLabel:518, refreshTaskCommentButton:525, renderStageCard:534, renderStages:594

### index.html — Главная
Файлы: `index.html` · `css/index.css` · `js/index.js`
Таблицы: clients, company_news, deals, frames, profiles, project_members, projects
Функции (70 КБ, формат имя:строка): requireAuth:5, applyRolePermissions:12, openAddEmployeeModal:34, fillTeamGroupOptions:60, fillClientOptions:69, openEditEmployeeModal:84, closeAddEmployeeModal:107, submitEmployeeForm:115, openEmployeesModal:157, closeEmployeesModal:161, renderEmployeeRow:166, renderEmployeesGrouped:190, toggleEmpGroup:230, loadAndRenderEmployees:235, setEmployeeActive:245, confirmDeactivateEmployee:262, reactivateEmployee:268, openProjectTeamModal:278, closeProjectTeamModal:320, saveProjectTeam:325, loadProjectsWithFrames:359, openProjectFormModal:404, onProjectFormClientChange:419, closeProjectFormModal:426, submitProjectForm:431, deleteProject:477, openRatingModal:491, closeRatingModal:499, renderRatingStars:503, setRatingValue:509, submitRating:513, completeProject:525, getProjectFlags:553, sortProjects:562, restoreProjectsControls:586, onProjectsControlsChange:593, toggleProjectHold:602, onGlobalSearchInput:612, renderHotDeadlines:642, renderProjectApprovalPanel:672, approveProjectLaunch:705, rejectProjectLaunch:712, cancelPendingProject:721, renderProjects:729, updateStats:817, isAnyModalOpen:838, refreshLiveStats:844, loadNewsWidget:854, dismissNewsNotice:878, loadTodayWidget:888

### login.html — Вход
Файлы: `login.html` · `css/login.css` · `js/login.js`
Таблицы: profiles
Функции (8 КБ, формат имя:строка): loadPeople:9, renderGroups:30, renderPeopleList:72, toggleGroup:87, togglePin:92, doLogin:101

### my.html — Моё
Файлы: `my.html` · `css/my.css` · `js/my.js`
Таблицы: company_event_invitees, company_events, frame_comments, frame_stages, frames, project_members, projects
Функции (12 КБ, формат имя:строка): requireAuth:3, getFrameStatusLabel:7, getFrameStatusClass:12, loadMyProjects:19, renderMyProjects:36, loadMyFrames:58, renderMyFrames:72, loadMyEvents:95, renderMyEvents:117, loadMyMentions:142, renderMyMentions:174

### news.html — Новости
Файлы: `news.html` · `css/news.css` · `js/news.js`
Таблицы: company_news, profiles
Функции (7 КБ, формат имя:строка): requireAuth:5, loadNews:12, renderNews:33, openNewsFormModal:62, closeNewsFormModal:73, submitNewsForm:78, toggleNewsPin:96, deleteNews:102

### project.html — Проект
Файлы: `project.html` · `css/project.css` · `js/project.js`
Таблицы: frame_activity_log, frame_stages, frames, profiles, project_members, projects
Функции (37 КБ, формат имя:строка): requireAuth:3, applyRolePermissions:10, checkProjectAccess:23, getProject:47, loadProfilesCache:66, assignFrame:73, editFrameDueDate:87, getFrames:110, getFramesProgress:127, createFrame:149, deleteFrame:168, setFrameStatus:180, toggleFramePriority:201, getFrameStatusLabel:216, getFrameStatusClass:221, renderFrames:227, renderFramesList:232, openProjectLogModal:326, closeProjectLogModal:365, updateProjectHolstLink:372, editProjectHolst:379, editFrameHolst:391, parseHours:405, logFrameHours:409, setFrameEstimate:422, openBulkFrames:436, closeBulkFrames:442, bulkNames:443, submitBulkFrames:446, renderBoard:466, boardCardHtml:481, boardDragStart:501, boardDragEnd:502, boardDragOver:503, boardDragLeave:504, boardDrop:505, setFrameView:514, applyFrameView:519

### vacations.html — Отпуска
Файлы: `vacations.html` · `css/vacations.css` · `js/vacations.js`
Таблицы: company_holidays, employee_leaves, profiles
Функции (35 КБ, формат имя:строка): requireAuth:14, fmtDate:18, loadAdminView:25, renderAdminView:43, empName:177, renderApprovalPanel:182, approveLeaveStage:240, rejectLeave:257, cancelMyRequest:268, toggleTeamGroup:275, setAllTeamsCollapsed:289, shiftMonth:294, goToday:301, handleLeaveCellClick:308, deleteLeave:317, openLeaveFormModal:326, closeLeaveFormModal:346, submitLeaveForm:350, openLeaveNormModal:386, closeLeaveNormModal:393, submitLeaveNorm:398, openHolidaysModal:429, closeHolidaysModal:436, renderHolidaysList:440, addHoliday:457, deleteHoliday:474, loadMyView:484

## Общие файлы: функции
### common.js (53 КБ)
logClientError:55, hasAdminAccess:125, safeHttpUrl:127, newsSeenKey:135, getNewsSeen:136, markNewsSeen:137, canManageProjectsRole:145, canManageEmployeesRole:148, canAccessClients:155, canAccessDeals:160, canApproveCommercial:168, canManageDealTemplates:172, canAddDealPayment:178, canEditDealPayment:181, canViewAnalytics:191, canManageNews:199, canManageMarketing:205, leaveDaysCount:254, todayIso:259, fetchCurrentLeaveMap:266, calcVacationBalance:282, findOrCreateClientByName:300, normalizePhoneDigits:323, findClientsByPhone:326, changePin:336, escapeHtml:348, showToast:358, setTheme:374, applyTheme:379, updateThemeButtons:387, loadTheme:393, doLogout:399, getDeadlineStatus:405, getDeadlineLabel:414, formatDateRu:419, extractMentions:431, highlightMentions:445, attachMentionAutocomplete:460, closeDropdown:463, runGlobalSearch:503, getEffectiveDueDate:530, getDeliveryStatus:537, logFrameActivity:559, logProjectActivity:568, ensureBanner:580, showOffline:589, showReconnected:594, isNetworkError:610, withRetry:621, inject:637, randomLoadingPhrase:664, initAuthedPage:701, renderUserBox:719, initAppSidebar:752, updateSidebarActiveState:809

### reminders.js (25 КБ)
daysUntilDate:17, reminderLabel:24, isoDatePlusDays:31, fetchUpcomingMyEvents:40, pluralYearsRu:75, nextAnnualOccurrence:85, fetchUpcomingPeopleEvents:98, fetchOpenBugReportsForBell:127, fetchPendingCommercialApprovalsForBell:141, fetchMyDealFollowupsForBell:153, initDeadlineReminders:165, _ensureReminderAudioCtx:291, _playReminderToneNow:297, _unlockReminderAudio:318, isReminderSoundEnabled:336, setReminderSoundEnabled:339, playReminderSound:343, reminderItemKey:364, notifyIfNewReminderItems:372, toggleReminderSoundSetting:390, renderReminderBell:395

### glass.js (22 КБ)
esc:17, fillIcons:24, enhanceSegmented:35, scanSegmented:61, countUp:90, addSkeletons:124, pageItems:144, loadProjects:153, buildPalette:173, renderPalette:202, movePalette:228, openPaletteItem:236, openPalette:241, closePalette:255, addPaletteTrigger:266, tourDone:289, visible:291, endTour:293, placeTour:299, showTourStep:315, startTour:327, maybeAutoTour:346, addTourReplay:359, checkNewsDot:371, onMutations:385, init:409

### glass-fx.js (13 КБ)
ensureGlow:25, hideGlow:34, placeGlow:39, releaseMagnet:78, wrapTheme:103, ensureDefs:135, bevelMap:148, applyLens:182, watchLens:221, scanLens:233, init:257

## Миграции базы
20260928_add_profile_admin_active.sql
20260928b_rls_respect_is_admin.sql
20260928c_open_stages_insert.sql
20260929_project_members.sql
20260929b_add_team_group.sql
20260929c_add_frame_priority.sql
20260929d_my_mentions.sql
20260929e_project_on_hold.sql
20260929f_frame_due_dates_and_log.sql
20260929g_project_client_notes.sql
20260929h_fix_function_search_path.sql
20260929i_employee_leaves.sql
20260929j_company_news.sql
20260929k_crm_clients.sql
20260929l_company_events.sql
20260929m_event_invitees.sql
20260929n_leave_approval_workflow.sql
20260929o_bug_reports.sql
20260929p_manager_role.sql
20260929q_manager_create_projects.sql
20260929r_bug_reports_structured.sql
20260929s_project_launch_approval.sql
20260929t_personal_meetings.sql
20260929u_error_logs.sql
20260929v_company_holidays.sql
20260929w_birthdays_anniversaries.sql
20260930_crm_deals.sql
20260930b_deals_source_reason_nextaction.sql
20260930c_deal_source_note.sql
20260930d_finance_quality.sql
20260930e_fix_profiles_role_check.sql
20260930f_marketer_role.sql
20260930g_marketer_features.sql
20260930h_error_logs_resolved.sql
20260930i_drop_dead_assigned_artist_id.sql
20260930k_restrict_deal_payments_read.sql
20260930l_trusted_activity_log_actor.sql
20260930m_roles_table.sql
20261002_close_anonymous_access.sql
20261002b_holst_links_and_hours.sql
