import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { queryClient } from "./api/queryClient";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TelegramProvider } from "./providers/TelegramProvider";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <TelegramProvider>
          <App />
        </TelegramProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
);
