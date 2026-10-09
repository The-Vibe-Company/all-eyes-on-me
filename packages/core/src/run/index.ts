export { comparePages, scorePages, type PageComparison, type PageScore } from "./compare.js";
export { ConfigError, loadConfig, type ProjectConfig } from "./config.js";
export { isInside, snapshot, SnapshotPathError } from "./snapshot.js";
export { STYLE_PRINCIPLES, verdictOf, type Failure, type RunVerdict } from "./verdict.js";
export { pageVerdicts, readRun, resultHtml, RunReportError, type PageVerdict, type ResultPage, type SavedVerdict } from "./report.js";
export { BLOCKING_PRINCIPLES, blockedJourneys, type BlockedJourney } from "./features.js";
export { addFeedback, aeomHome, agreementRates, FEEDBACK_CATEGORIES, readFeedback, runKey, type Feedback, type FeedbackCategory } from "./taste.js";
