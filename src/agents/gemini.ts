import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiAgent {
  private model: any;

  constructor(apiKey: string, modelName = 'gemini-2.5-flash') {
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ model: modelName });
  }

  async generate(prompt: string, temperature = 0.2): Promise<string> {
    const result = await this.model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: 4000 },
    });

    return result.response.text();
  }

  async generateJSON<T>(prompt: string): Promise<T> {
    const response = await this.generate(
      prompt + '\n\nRespond with ONLY valid JSON. No markdown, no explanations, no additional text.'
    );

    // Remove markdown code blocks
    let cleaned = response.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    
    // Find the first { or [ and last } or ]
    const openBrace = cleaned.indexOf('{');
    const openBracket = cleaned.indexOf('[');
    const closeBrace = cleaned.lastIndexOf('}');
    const closeBracket = cleaned.lastIndexOf(']');
    
    // Determine which comes first
    let start = -1;
    let end = -1;
    
    if (openBrace !== -1 && (openBracket === -1 || openBrace < openBracket)) {
      start = openBrace;
      end = closeBrace;
    } else if (openBracket !== -1) {
      start = openBracket;
      end = closeBracket;
    }
    
    if (start !== -1 && end !== -1 && end > start) {
      cleaned = cleaned.substring(start, end + 1);
    }

    try {
      return JSON.parse(cleaned) as T;
    } catch (error) {
      console.error('Failed to parse JSON. Raw response:', response);
      console.error('Cleaned JSON:', cleaned);
      throw new Error(`JSON parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
