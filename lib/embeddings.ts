import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY! });

export interface MultimodalPart {
  text?: string;
  inlineData?: {
    data: string;
    mimeType: string;
  };
}

export async function getEmbedding(input: string | MultimodalPart[]): Promise<number[] | null> {
  const multimodalModel = "gemini-embedding-2-preview";
  
  let parts: any[] = [];
  if (typeof input === 'string') {
    parts = [{ text: input }];
  } else {
    parts = input;
  }

  try {
    const response = await ai.models.embedContent({
      model: multimodalModel,
      contents: [{ parts }],
      config: {
        outputDimensionality: 768
      }
    });
    
    const values = response.embeddings?.[0]?.values;
    if (!values) {
      throw new Error("No embeddings returned from API");
    }
    
    // Normalize the embedding for better quality at smaller dimensions
    return normalizeVector(values);
  } catch (error) {
    console.error("Embedding error:", error);
    throw error;
  }
}

export async function getBatchEmbeddings(inputs: (string | MultimodalPart[])[]) {
  const multimodalModel = "gemini-embedding-2-preview";
  
  try {
    const response = await ai.models.embedContent({
      model: multimodalModel,
      contents: inputs.map(input => {
        const parts = typeof input === 'string' ? [{ text: input }] : input;
        return { parts };
      }),
      config: {
        outputDimensionality: 768
      }
    });
    
    if (!response.embeddings) {
      throw new Error("No embeddings returned from API");
    }
    return response.embeddings.map(e => e.values ? normalizeVector(e.values) : null);
  } catch (error) {
    console.error("Batch embedding error:", error);
    throw error;
  }
}

function normalizeVector(vector: number[]): number[] {
  let sumOfSquares = 0;
  for (const val of vector) {
    sumOfSquares += val * val;
  }
  const magnitude = Math.sqrt(sumOfSquares);
  if (magnitude === 0) return vector;
  return vector.map(val => val / magnitude);
}

export function cosineSimilarity(vecA: number[] | null | undefined, vecB: number[] | null | undefined) {
  if (!vecA || !vecB) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
