/** 인기 카드뉴스 탭 데이터 (매일 GitHub Actions 가 hot-data 브랜치에 저장) */
export type HotPost = {
  code: string;
  account: string;
  date: string;
  likes: number;
  comments: number;
  slides: number;
  caption: string;
  thumb: boolean;
  /** 기간별로 늘어난 좋아요·댓글 (역대 = 누적) */
  gain?: Record<HotPeriod, { likes: number; comments: number }>;
};
export type HotPeriod = "day" | "week" | "month" | "all";
export type HotSort = "likes" | "comments";
export type HotData = {
  updatedAt: string;
  accounts: { name: string; followers: number | null }[];
  lists: Record<HotPeriod, Record<HotSort, string[]>>;
  posts: Record<string, HotPost>;
};

const REPO = process.env.HOT_DATA_REPO || "commerce-netizen/cardnews-remixer";
const BRANCH = process.env.HOT_DATA_BRANCH || "hot-data";
export const hotRawUrl = (file: string) => `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${file}`;
