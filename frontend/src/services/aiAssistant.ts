import api from "./api";

export interface AIChatRequest {
  message: string;
}

export interface AIChatResponse {
  status: "success" | "error";
  answer?: string;
  message?: string;
}

export const aiAssistantService = {
  sendMessage: async (message: string): Promise<AIChatResponse> => {
    const payload: AIChatRequest = {
      message: message,
    };
    
    const response = await api.post("/api/ai-assistant/chat", payload);
    return response.data;
  },
};

export default aiAssistantService;