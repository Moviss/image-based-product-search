import Anthropic from "@anthropic-ai/sdk";

interface ApiError {
  status: number;
  message: string;
}

/**
 * Maps known error types to HTTP status codes and user-facing messages.
 * Used by Route Handler catch blocks to produce consistent error responses.
 */
export function mapApiError(error: unknown): ApiError {
  // Anthropic SDK errors — check subclasses before base classes
  if (error instanceof Anthropic.AuthenticationError) {
    return {
      status: 401,
      message: "Invalid API key. Please check your key and try again.",
    };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return {
      status: 429,
      message: "Rate limit exceeded. Please wait a moment and try again.",
    };
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return {
      status: 504,
      message: "AI service request timed out. Please try again.",
    };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { status: 502, message: "Could not connect to AI service." };
  }
  if (error instanceof Anthropic.InternalServerError) {
    return {
      status: 502,
      message: "AI service is temporarily unavailable. Please try again.",
    };
  }

  // JSON parse / response validation errors (from extractJSON or Zod in claude.ts)
  if (
    error instanceof Error &&
    error.message.startsWith("Failed to parse Claude response")
  ) {
    return { status: 502, message: "Unexpected response from AI service." };
  }

  // MongoDB connection errors
  if (error instanceof Error && error.name === "MongooseServerSelectionError") {
    return {
      status: 503,
      message: "Product catalog is temporarily unavailable.",
    };
  }

  // Fallback
  return { status: 500, message: "An unexpected error occurred." };
}
