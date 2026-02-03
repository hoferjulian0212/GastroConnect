import { createContext, useContext, useState, ReactNode } from "react";

interface ChatContextType {
  isInChat: boolean;
  setIsInChat: (value: boolean) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isInChat, setIsInChat] = useState(false);

  return (
    <ChatContext.Provider value={{ isInChat, setIsInChat }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
