// DB 행 타입 (supabase/migrations/0001_init.sql 과 일치)

export type ImageRights = "own" | "licensed" | "partners_provided" | "unknown";
export type ContentType = "problem_solving" | "feature" | "checklist" | "comparison" | "seasonal";
export type ContentStatus = "draft" | "approved" | "rejected" | "scheduled" | "published" | "failed";
export type JobStatus = "pending" | "processing" | "published" | "failed" | "cancelled";
export type DataSource = "threads_api" | "csv" | "manual" | "tracker" | "mock";

export const CONTENT_TYPES: { value: ContentType; label: string; hint: string }[] = [
  { value: "problem_solving", label: "불편함 해결", hint: "소비자가 겪는 불편함과 이 상품이 그것을 어떻게 다루는지" },
  { value: "feature", label: "특징 설명", hint: "등록된 상품 특징을 쉽게 풀어 설명" },
  { value: "checklist", label: "구매 전 체크", hint: "구매 전에 확인할 사항(사이즈, 호환성, 관리법 등)" },
  { value: "comparison", label: "유사 상품 비교", hint: "비슷한 종류의 상품을 고를 때 비교 기준" },
  { value: "seasonal", label: "계절·상황 추천", hint: "계절과 생활 상황에 맞춘 활용 제안" },
];

export const contentTypeLabel = (t: ContentType) =>
  CONTENT_TYPES.find((c) => c.value === t)?.label ?? t;

export const IMAGE_RIGHTS_LABEL: Record<ImageRights, string> = {
  own: "직접 촬영/제작",
  licensed: "사용 허락 받음",
  partners_provided: "쿠팡 파트너스 제공 이미지",
  unknown: "확인 안 됨",
};

export interface Product {
  id: string;
  user_id: string;
  name: string;
  category: string;
  price: number | null;
  features: string[];
  coupang_url: string;
  affiliate_url: string;
  image_url: string | null;
  image_rights: ImageRights;
  info_verified_at: string | null;
  notes: string;
  is_mock: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReferencePost {
  id: string;
  user_id: string;
  body: string;
  note: string;
  is_mock: boolean;
  created_at: string;
}

export type CheckLevel = "pass" | "warn" | "fail";
export interface CheckResult {
  key: CheckKey;
  label: string;
  level: CheckLevel;
  messages: string[];
}
export type CheckKey = "accuracy" | "duplicate" | "exaggeration" | "disclosure" | "image_rights" | "link";

export interface LinkCheck {
  checked: boolean;
  ok?: boolean;
  status?: number;
  message?: string;
  /** 봇 차단 등으로 판단 불가 → 경고로 표시 */
  inconclusive?: boolean;
}

export interface Review {
  link?: LinkCheck;
  checks?: CheckResult[];
  checked_at?: string;
  /** 사용자가 직접 확인했다고 체크한 항목 */
  confirmed?: Partial<Record<CheckKey, boolean>>;
  reviewer_note?: string;
}

export interface GenerationMeta {
  model?: string;
  mock?: boolean;
  generated_at?: string;
  angle?: string;
}

export interface Content {
  id: string;
  user_id: string;
  product_id: string;
  content_type: ContentType;
  body: string;
  reply_text: string;
  image_url: string | null;
  status: ContentStatus;
  content_hash: string;
  tracking_code: string;
  review: Review;
  generation: GenerationMeta;
  is_mock: boolean;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublishJob {
  id: string;
  user_id: string;
  content_id: string;
  content_hash: string;
  scheduled_at: string;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  threads_media_id: string | null;
  threads_reply_id: string | null;
  reply_error: string | null;
  permalink: string | null;
  published_at: string | null;
  is_mock: boolean;
  created_at: string;
  updated_at: string;
}

export interface Settings {
  user_id: string;
  timezone: string;
  daily_limit: number;
  posting_times: string[];
  autopublish_paused: boolean;
  post_affiliate_reply: boolean;
  updated_at: string;
}

export interface ThreadsAccount {
  user_id: string;
  threads_user_id: string;
  username: string | null;
  access_token_enc: string;
  token_expires_at: string | null;
  scopes: string[];
  connected_at: string;
  updated_at: string;
}

export interface PostInsight {
  id: string;
  user_id: string;
  job_id: string;
  content_id: string;
  views: number | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  source: DataSource;
  fetched_at: string;
}

export interface AffiliateMetric {
  id: string;
  user_id: string;
  metric_date: string;
  product_id: string | null;
  content_id: string | null;
  sub_id: string | null;
  clicks: number | null;
  orders: number | null;
  commission: number | null;
  source: DataSource;
  import_batch: string | null;
  created_at: string;
}

export interface ApiLog {
  id: string;
  user_id: string | null;
  provider: string;
  action: string;
  ok: boolean;
  status_code: number | null;
  message: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  level: "info" | "warning" | "error";
  message: string;
  read: boolean;
  created_at: string;
}

export interface TableMap {
  products: Product;
  reference_posts: ReferencePost;
  contents: Content;
  publish_jobs: PublishJob;
  settings: Settings;
  threads_accounts: ThreadsAccount;
  post_insights: PostInsight;
  affiliate_metrics: AffiliateMetric;
  api_logs: ApiLog;
  notifications: Notification;
  oauth_states: { state: string; user_id: string; created_at: string };
}
export type TableName = keyof TableMap;

export const DEFAULT_SETTINGS: Omit<Settings, "user_id" | "updated_at"> = {
  timezone: "Asia/Seoul",
  daily_limit: 3,
  posting_times: ["09:00", "13:00", "20:00"],
  autopublish_paused: false,
  post_affiliate_reply: true,
};

/** Threads 텍스트 게시물 최대 길이 */
export const THREADS_MAX_CHARS = 500;
/** MVP 기준 하루 최대 게시물 수 */
export const MAX_DAILY_LIMIT = 3;
