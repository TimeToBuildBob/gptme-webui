import { createApiClient } from '@/utils/api';
import type { ApiClient } from '@/utils/api';
import { type Observable, observable } from '@legendapp/state';
import { use$, useObserveEffect } from '@legendapp/state/react';
import type { QueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { toast } from 'sonner';

import { isTauriEnvironment } from '@/utils/tauri';

interface ConnectionConfig {
  baseUrl: string;
  authToken: string | null;
  useAuthToken: boolean;
}

interface ApiContextType {
  api: ApiClient;
  isConnecting$: Observable<boolean>;
  isConnected$: Observable<boolean>;
  isAutoConnecting$: Observable<boolean>;
  connectionConfig: ConnectionConfig;
  updateConfig: (config: Partial<ConnectionConfig>) => void;
  connect: (config?: Partial<ConnectionConfig>) => Promise<void>;
  stopAutoConnect: () => void;
  // Methods from ApiClient that are used in components
  getConversation: ApiClient['getConversation'];
  createConversation: ApiClient['createConversation'];
  sendMessage: ApiClient['sendMessage'];
  step: ApiClient['step'];
  confirmTool: ApiClient['confirmTool'];
  interruptGeneration: ApiClient['interruptGeneration'];
  cancelPendingRequests: ApiClient['cancelPendingRequests'];
  // Add event stream methods
  subscribeToEvents: ApiClient['subscribeToEvents'];
  closeEventStream: ApiClient['closeEventStream'];
  getChatConfig: ApiClient['getChatConfig'];
  updateChatConfig: ApiClient['updateChatConfig'];
  deleteConversation: ApiClient['deleteConversation'];
}

const ApiContext = createContext<ApiContextType | null>(null);

export function connectionConfigFromHash(hash: string) {
  const params = new URLSearchParams(hash);

  // Get values from fragment
  const fragmentBaseUrl = params.get('baseUrl');
  const fragmentUserToken = params.get('userToken');

  // Save fragment values to localStorage if present
  if (fragmentBaseUrl) {
    localStorage.setItem('gptme_baseUrl', fragmentBaseUrl);
  }
  if (fragmentUserToken) {
    localStorage.setItem('gptme_userToken', fragmentUserToken);
  }

  // Clean fragment from URL if parameters were found
  if (fragmentBaseUrl || fragmentUserToken) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // Get stored values
  const storedBaseUrl = localStorage.getItem('gptme_baseUrl');
  const storedUserToken = localStorage.getItem('gptme_userToken');

  return {
    baseUrl:
      fragmentBaseUrl || storedBaseUrl || import.meta.env.VITE_API_URL || 'http://127.0.0.1:5700',
    authToken: fragmentUserToken || storedUserToken || null,
    useAuthToken: Boolean(fragmentUserToken || storedUserToken),
  };
}

const connectionConfig$ = observable(connectionConfigFromHash(window.location.hash.substring(1)));

let api = createApiClient(
  connectionConfig$.baseUrl.get(),
  connectionConfig$.useAuthToken.get() && connectionConfig$.authToken.get()
    ? `Bearer ${connectionConfig$.authToken.get()}`
    : null
);
const isConnecting$ = observable(false);
const isAutoConnecting$ = observable(false);

// Auto-connect state management
let autoConnectTimer: ReturnType<typeof setTimeout> | null = null;
let autoConnectAttempts = 0;
const MAX_AUTO_CONNECT_ATTEMPTS = 10;
const INITIAL_RETRY_DELAY = 1000; // 1 second

const stopAutoConnect = () => {
  if (autoConnectTimer) {
    clearTimeout(autoConnectTimer);
    autoConnectTimer = null;
  }
  isAutoConnecting$.set(false);
  autoConnectAttempts = 0;
};

const updateConfig = (newConfig: Partial<ConnectionConfig>) => {
  connectionConfig$.set((prev) => {
    const updated = { ...prev, ...newConfig };

    // Update localStorage
    localStorage.setItem('gptme_baseUrl', updated.baseUrl);
    if (updated.authToken && updated.useAuthToken) {
      localStorage.setItem('gptme_userToken', updated.authToken);
    } else {
      localStorage.removeItem('gptme_userToken');
    }

    return updated;
  });
};

export function ApiProvider({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient: QueryClient;
}) {
  // Connect to API
  const connect = useCallback(
    async (config?: Partial<ConnectionConfig>) => {
      // Stop any ongoing auto-connect attempts when manually connecting
      stopAutoConnect();

      if (config) {
        // Update config if provided
        updateConfig(config);

        // Update API client if config has changed
        const { baseUrl, authToken, useAuthToken } = config;
        if (
          api.baseUrl !== baseUrl ||
          api.authHeader !== (useAuthToken && authToken ? `Bearer ${authToken}` : null)
        ) {
          console.log('[ApiContext] Creating new API client');
          api = createApiClient(baseUrl, useAuthToken && authToken ? `Bearer ${authToken}` : null);
          isConnecting$.set(false);
        }
      }

      if (api.isConnected$.get()) {
        console.log('[ApiContext] Already connected, skipping connection');
        return;
      }

      if (isConnecting$.get()) {
        console.log('[ApiContext] Already connecting, skipping connection');
        return;
      }

      console.log('[ApiContext] Connecting to API');
      isConnecting$.set(true);
      try {
        // Test connection
        const connected = await api.checkConnection();
        console.log('[ApiContext] Connected:', connected);
        if (!connected) {
          throw new Error('Failed to connect to API');
        }

        // Update state
        api.setConnected(true);

        // Refresh queries
        await queryClient.invalidateQueries();
        await queryClient.refetchQueries({
          queryKey: ['conversations'],
          type: 'active',
        });

        toast.success('Connected to gptme server');
      } catch (error) {
        console.error('Failed to connect to API:', error);
        api.setConnected(false);

        let errorMessage = 'Could not connect to gptme instance.';
        if (error instanceof Error) {
          if (error.message.includes('NetworkError') || error.message.includes('CORS')) {
            errorMessage +=
              ' CORS issue detected - ensure the server has CORS enabled and is accepting requests from ' +
              window.location.origin;
          } else {
            errorMessage += ' Error: ' + error.message;
          }
        }
        toast.error(errorMessage);
        throw error;
      } finally {
        isConnecting$.set(false);
      }
    },
    [queryClient]
  );

  // Auto-connect with retry logic
  const autoConnect = useCallback(
    async (isInitialAttempt: boolean = false) => {
      if (api.isConnected$.get()) {
        console.log('[ApiContext] Already connected, stopping auto-connect');
        stopAutoConnect();
        return;
      }

      if (autoConnectAttempts >= MAX_AUTO_CONNECT_ATTEMPTS) {
        console.log('[ApiContext] Max auto-connect attempts reached, stopping');
        stopAutoConnect();
        if (!isInitialAttempt) {
          toast.error('Unable to connect to gptme server after multiple attempts');
        }
        return;
      }

      autoConnectAttempts++;
      isAutoConnecting$.set(true);

      console.log(
        `[ApiContext] Auto-connect attempt ${autoConnectAttempts}/${MAX_AUTO_CONNECT_ATTEMPTS}`
      );

      try {
        const connected = await api.checkConnection();
        if (connected) {
          console.log('[ApiContext] Auto-connect successful');
          api.setConnected(true);
          stopAutoConnect();

          // Refresh queries
          await queryClient.invalidateQueries();
          await queryClient.refetchQueries({
            queryKey: ['conversations'],
            type: 'active',
          });

          // Only show success toast if not the initial attempt
          if (!isInitialAttempt) {
            toast.success('Connected to gptme server');
          }
          return;
        }
      } catch (error) {
        console.log(`[ApiContext] Auto-connect attempt ${autoConnectAttempts} failed:`, error);
      }

      // Schedule next retry with exponential backoff
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, autoConnectAttempts - 1);
      const maxDelay = 30000; // Cap at 30 seconds
      const nextDelay = Math.min(delay, maxDelay);

      console.log(`[ApiContext] Scheduling next auto-connect attempt in ${nextDelay}ms`);

      autoConnectTimer = setTimeout(() => {
        autoConnect(false);
      }, nextDelay);
    },
    [queryClient]
  );

  // Attempt initial connection
  useEffect(() => {
    const attemptInitialConnection = async () => {
      console.log('[ApiContext] Attempting initial connection');

      // In Tauri environment, use autoconnect for better UX
      if (isTauriEnvironment()) {
        console.log('[ApiContext] Tauri environment detected, starting auto-connect');
        await autoConnect(true);
      } else {
        // In web environment, try once and let user manually connect if needed
        try {
          await connect();
        } catch (error) {
          console.error('Initial connection attempt failed:', error);
          // Don't show toast for initial connection failure in web environment
        }
      }
    };

    void attemptInitialConnection();
  }, [connect, autoConnect]);

  // Reconnect on config change
  useObserveEffect(connectionConfig$, async ({ value }) => {
    console.log('[ApiContext] Reconnecting on config change', value);
    await connect(value);
  });

  const connectionConfig = use$(connectionConfig$);

  return (
    <ApiContext.Provider
      value={{
        api,
        isConnecting$,
        isConnected$: api.isConnected$,
        isAutoConnecting$,
        connectionConfig,
        updateConfig,
        connect,
        stopAutoConnect,
        // Forward methods from the API client
        getConversation: api.getConversation.bind(api),
        createConversation: api.createConversation.bind(api),
        sendMessage: api.sendMessage.bind(api),
        step: api.step.bind(api),
        confirmTool: api.confirmTool.bind(api),
        interruptGeneration: api.interruptGeneration.bind(api),
        cancelPendingRequests: api.cancelPendingRequests.bind(api),
        subscribeToEvents: api.subscribeToEvents.bind(api),
        closeEventStream: api.closeEventStream.bind(api),
        getChatConfig: api.getChatConfig.bind(api),
        updateChatConfig: api.updateChatConfig.bind(api),
        deleteConversation: api.deleteConversation.bind(api),
      }}
    >
      {children}
    </ApiContext.Provider>
  );
}

export function useApi() {
  const context = useContext(ApiContext);
  if (!context) {
    throw new Error('useApi must be used within an ApiProvider');
  }
  return context;
}
