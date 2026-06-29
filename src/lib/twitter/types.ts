export interface TwitterUser {
  id: string;
  userName: string;
  name: string;
  description?: string;
  location?: string;
  url?: string;
  profilePicture?: string;
  followers: number;
  following: number;
  isBlueVerified: boolean;
  createdAt?: string;
}

export interface Tweet {
  id: string;
  url: string;
  text: string;
  createdAt: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  viewCount: number;
  bookmarkCount: number;
  isReply: boolean;
  author: TwitterUser;
  retweeted_tweet?: unknown;
  quoted_tweet?: unknown;
}

export interface SearchPage {
  tweets: Tweet[];
  has_next_page: boolean;
  next_cursor: string;
}
