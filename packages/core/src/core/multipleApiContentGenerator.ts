/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
} from '@google/genai';
import { GoogleGenAI } from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import type { Config } from '../config/config.js';
import type { UserTierId } from '../code_assist/types.js';
import { LoggingContentGenerator } from './loggingContentGenerator.js';
import { InstallationManager } from '../utils/installationManager.js';
import type { ContentGenerator } from './contentGenerator.js';

export interface ApiConfig {
  id: string;
  name: string;
  apiKey: string;
  type: 'gemini' | 'vertex';
  enabled: boolean;
}

export interface MultipleApiContentGeneratorConfig {
  apis: ApiConfig[];
  currentApiIndex: number;
  retryDelay: number;
  maxRetries: number;
}

export class MultipleApiContentGenerator implements ContentGenerator {
  private config: MultipleApiContentGeneratorConfig;
  private generators: Map<string, ContentGenerator> = new Map();
  private failedApis: Set<string> = new Set();
  private lastFailureTime: number = 0;
  private retryCooldown: number = 60000; // 1 minute

  constructor(config: MultipleApiContentGeneratorConfig) {
    this.config = config;
    this.initializeGenerators();
  }

  private initializeGenerators(): void {
    for (const api of this.config.apis) {
      if (api.enabled && api.apiKey) {
        try {
          const generator = this.createGeneratorForApi(api);
          this.generators.set(api.id, generator);
        } catch (error) {
          console.warn(`Failed to initialize generator for API ${api.name}:`, error);
        }
      }
    }
  }

  private createGeneratorForApi(api: ApiConfig): ContentGenerator {
    if (api.type === 'gemini') {
      const genai = new GoogleGenAI(api.apiKey);
      return new LoggingContentGenerator(genai);
    } else if (api.type === 'vertex') {
      // For Vertex AI, we would need additional configuration
      // For now, treat as Gemini API
      const genai = new GoogleGenAI(api.apiKey);
      return new LoggingContentGenerator(genai);
    }
    throw new Error(`Unsupported API type: ${api.type}`);
  }

  private getCurrentGenerator(): ContentGenerator | null {
    const enabledApis = this.config.apis.filter(api => api.enabled && !this.failedApis.has(api.id));
    
    if (enabledApis.length === 0) {
      // All APIs failed, check if we should reset the failed list
      const now = Date.now();
      if (now - this.lastFailureTime > this.retryCooldown) {
        this.failedApis.clear();
        this.lastFailureTime = 0;
        return this.getCurrentGenerator();
      }
      return null;
    }

    const currentApi = enabledApis[this.config.currentApiIndex % enabledApis.length];
    return this.generators.get(currentApi.id) || null;
  }

  private async handleApiError(apiId: string, error: any): Promise<void> {
    console.warn(`API ${apiId} failed:`, error);
    this.failedApis.add(apiId);
    this.lastFailureTime = Date.now();
    
    // Move to next API
    this.config.currentApiIndex = (this.config.currentApiIndex + 1) % this.config.apis.length;
  }

  private isRpmError(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || '';
    const errorCode = error?.code || '';
    const status = error?.status || '';
    
    return (
      errorMessage.includes('rate limit') ||
      errorMessage.includes('quota exceeded') ||
      errorMessage.includes('too many requests') ||
      errorMessage.includes('requests per minute') ||
      errorMessage.includes('requests per day') ||
      errorMessage.includes('rpm') ||
      errorMessage.includes('rpd') ||
      errorCode === '429' ||
      status === 429 ||
      errorMessage.includes('resource_exhausted') ||
      errorMessage.includes('quota_exceeded')
    );
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    let lastError: any = null;
    let attempts = 0;

    while (attempts < this.config.maxRetries) {
      const generator = this.getCurrentGenerator();
      
      if (!generator) {
        throw new Error('No available API generators. All APIs have failed or are disabled.');
      }

      try {
        const response = await generator.generateContent(request, userPromptId);
        
        // Check if response indicates an error
        if (this.isErrorResponse(response)) {
          throw new Error('Invalid response from API');
        }

        return response;
      } catch (error) {
        lastError = error;
        
        if (this.isRpmError(error)) {
          const currentApi = this.config.apis[this.config.currentApiIndex];
          await this.handleApiError(currentApi.id, error);
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
        } else {
          // Non-RPM error, don't retry
          throw error;
        }
        
        attempts++;
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    let lastError: any = null;
    let attempts = 0;

    while (attempts < this.config.maxRetries) {
      const generator = this.getCurrentGenerator();
      
      if (!generator) {
        throw new Error('No available API generators. All APIs have failed or are disabled.');
      }

      try {
        const stream = await generator.generateContentStream(request, userPromptId);
        
        // Create a wrapper that checks for errors in the stream
        return this.wrapStreamWithErrorHandling(stream, userPromptId);
      } catch (error) {
        lastError = error;
        
        if (this.isRpmError(error)) {
          const currentApi = this.config.apis[this.config.currentApiIndex];
          await this.handleApiError(currentApi.id, error);
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
        } else {
          // Non-RPM error, don't retry
          throw error;
        }
        
        attempts++;
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  private async *wrapStreamWithErrorHandling(
    stream: AsyncGenerator<GenerateContentResponse>,
    userPromptId: string,
  ): AsyncGenerator<GenerateContentResponse> {
    try {
      for await (const response of stream) {
        if (this.isErrorResponse(response)) {
          throw new Error('Invalid response from API');
        }
        yield response;
      }
    } catch (error) {
      if (this.isRpmError(error)) {
        const currentApi = this.config.apis[this.config.currentApiIndex];
        await this.handleApiError(currentApi.id, error);
        
        // Retry with new generator
        const newGenerator = this.getCurrentGenerator();
        if (newGenerator) {
          const newStream = await newGenerator.generateContentStream(
            // We need to reconstruct the request, but for now just throw
            {} as GenerateContentParameters,
            userPromptId
          );
          yield* newStream;
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }
  }

  private isErrorResponse(response: GenerateContentResponse): boolean {
    // Check if response contains error indicators
    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) {
      return true;
    }

    const candidate = candidates[0];
    if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'RECITATION') {
      return true;
    }

    return false;
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    const generator = this.getCurrentGenerator();
    if (!generator) {
      throw new Error('No available API generators');
    }
    return generator.countTokens(request);
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    const generator = this.getCurrentGenerator();
    if (!generator) {
      throw new Error('No available API generators');
    }
    return generator.embedContent(request);
  }

  get userTier(): UserTierId | undefined {
    const generator = this.getCurrentGenerator();
    return generator?.userTier;
  }

  // Public methods for monitoring and management
  getCurrentApiId(): string | null {
    const enabledApis = this.config.apis.filter(api => api.enabled && !this.failedApis.has(api.id));
    if (enabledApis.length === 0) return null;
    
    const currentApi = enabledApis[this.config.currentApiIndex % enabledApis.length];
    return currentApi.id;
  }

  getFailedApis(): string[] {
    return Array.from(this.failedApis);
  }

  getAvailableApis(): string[] {
    return this.config.apis
      .filter(api => api.enabled && !this.failedApis.has(api.id))
      .map(api => api.id);
  }

  resetFailedApis(): void {
    this.failedApis.clear();
    this.lastFailureTime = 0;
  }
}