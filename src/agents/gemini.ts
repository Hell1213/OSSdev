import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

export class GeminiService {
  private static instance: GeminiService;

  private constructor() { }

  private static PRICES = {
    'gemini-1.5-pro': { input: 3.5 / 1_000_000, output: 10.5 / 1_000_000 },
    'gemini-2.0-flash-exp': { input: 0.1 / 1_000_000, output: 0.4 / 1_000_000 },
  };

  private static usage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cost: 0
  };

  static getModel(modelName: 'gemini-2.0-flash-exp' | 'gemini-1.5-pro' = 'gemini-2.0-flash-exp', temperature = 0) {
    return new ChatGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
      model: modelName,
      temperature,
      maxRetries: 2,
    });
  }

  static trackUsage(modelName: string, promptTokens: number, completionTokens: number) {
    this.usage.promptTokens += promptTokens;
    this.usage.completionTokens += completionTokens;
    this.usage.totalTokens += promptTokens + completionTokens;
    this.usage.cost += this.calculateCost(modelName, promptTokens, completionTokens);
  }

  static getSessionUsage() {
    return this.usage;
  }

  private static calculateCost(modelName: string, promptTokens: number, completionTokens: number): number {
    const prices = (this.PRICES as any)[modelName] || this.PRICES['gemini-2.0-flash-exp'];
    return (promptTokens * prices.input) + (completionTokens * prices.output);
  }
}

