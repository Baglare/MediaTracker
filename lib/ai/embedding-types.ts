export interface EmbeddingVectorPayload {
  id: string;
  text: string;
  hash: string;
  signals?: string[];
  metadata?: Record<string, string | number | boolean | null>;
}

export interface EmbeddingVectorResult {
  id: string;
  hash: string;
  vector: number[];
  dimensions: number;
  provider: string;
}

export interface EmbeddingProvider {
  name: string;
  embedMany(payloads: EmbeddingVectorPayload[], options?: { timeoutMs?: number }): Promise<EmbeddingVectorResult[]>;
}
