
export interface SearchResult {
  title: string;
  url: string;
  domain: string;
  content: string;
  publishedDate: string | null;
  score: number | null;
}

export interface WebSearchResponse {
  query: string;
  requestId: string | null;
  searchedAt: string;
  results: SearchResult[];
}
