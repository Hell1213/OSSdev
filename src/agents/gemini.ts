import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

export class GeminiService {
  private static instance: GeminiService;

  private constructor() { }

  static getModel(modelName: 'gemini-2.0-flash-exp' | 'gemini-1.5-pro' = 'gemini-2.0-flash-exp', temperature = 0) {
    return new ChatGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
      model: modelName,
      temperature,
    });
  }
}

