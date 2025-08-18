import { useEffect, useRef } from 'react';
import { useApi } from '@/contexts/ApiContext';
import { useToast } from '@/components/ui/use-toast';
import type { Message, StreamingMessage } from '@/types/conversation';
import type { ChatOptions } from '@/components/ChatInput';
import { demoConversations, getDemoMessages } from '@/democonversations';
import { use$ } from '@legendapp/state/react';
import {
  conversations$,
  updateConversation,
  setGenerating,
  setConnected,
  setPendingTool,
  setExecutingTool,
  addMessage,
  initConversation,
  selectedConversation$,
} from '@/stores/conversations';
import { playChime } from '@/utils/audio';
import { notifyGenerationComplete, notifyToolConfirmation } from '@/utils/notifications';

const MAX_CONNECTED_CONVERSATIONS = 3;

export function useConversation(conversationId: string) {
  const api = useApi();
  const { toast } = useToast();
  const conversation$ = conversations$.get(conversationId);
  const isConnected = use$(api.isConnected$);

  const messageJustCompleted = useRef(false);

  // Initialize conversation in store if needed
  useEffect(() => {
    if (!conversation$) {
      console.log(`[useConversation] Initializing conversation ${conversationId}`);
      initConversation(conversationId);
    }
  }, [conversationId, conversation$]);

  // Load conversation data and connect to event stream
  useEffect(() => {
    if (!isConnected || conversation$?.isConnected.get()) {
      return;
    }

    const loadAndConnect = async () => {
      try {
        // Check if this is a demo conversation
        const demoConv = demoConversations.find((conv) => conv.id === conversationId);
        if (demoConv) {
          // Initialize with demo data
          const messages = getDemoMessages(demoConv.id);
          updateConversation(conversationId, {
            data: {
              id: conversationId,
              name: demoConv.name,
              log: messages,
              logfile: conversationId,
              branches: {},
              workspace: demoConv.workspace || '/demo/workspace',
            },
          });
          return;
        }

        // Load conversation data from API
        const data = await api.getConversation(conversationId);
        updateConversation(conversationId, { data });

        // Check number of connected conversations
        const connectedConvs = Array.from(conversations$.get().entries())
          .filter(([_, state]) => state.isConnected)
          .map(([id]) => id);

        // If we're at the limit, disconnect the oldest one that isn't selected
        if (connectedConvs.length >= MAX_CONNECTED_CONVERSATIONS) {
          const selectedId = selectedConversation$.get();
          const toDisconnect = connectedConvs
            .filter((id) => id !== selectedId)
            .slice(0, connectedConvs.length - MAX_CONNECTED_CONVERSATIONS + 1);

          console.log(`[useConversation] Disconnecting old conversations:`, toDisconnect);
          for (const id of toDisconnect) {
            api.closeEventStream(id);
            setConnected(id, false);
          }
        }

        // Connect to event stream
        console.log(`[useConversation] Connecting to ${conversationId}`);
        api.subscribeToEvents(conversationId, {
          onMessageStart: () => {
            console.log('[useConversation] Generation started');
            setGenerating(conversationId, true);
            setExecutingTool(conversationId, null, null); // Clear executing tool when starting new generation
            messageJustCompleted.current = false;

            // Add empty message placeholder if needed
            const messages$ = conversation$?.data.log;
            const lastMessage$ = messages$?.[messages$.length - 1];
            if (lastMessage$.role.get() !== 'assistant' || lastMessage$.content.get() !== '') {
              const streamingMessage: StreamingMessage = {
                role: 'assistant',
                content: '',
                timestamp: new Date().toISOString(),
                isComplete: false,
              };
              addMessage(conversationId, streamingMessage);
            }
          },
          onToken: (token) => {
            const messages$ = conversation$?.data.log;
            const lastMessage$ = messages$?.[messages$.length - 1];
            if (lastMessage$?.role.get() === 'assistant') {
              lastMessage$.content.set((prev) => prev + token);
            }
          },
          onMessageComplete: (message) => {
            console.log('[useConversation] Generation complete');
            messageJustCompleted.current = true;

            // Update the last message
            const messages$ = conversation$?.data.log;
            const lastMessage$ = messages$?.[messages$.length - 1];
            if (lastMessage$?.role.get() === 'assistant') {
              lastMessage$.content.set(message.content);
              if ('isComplete' in lastMessage$) {
                lastMessage$.isComplete.set(true);
              }
            }

            // Use setTimeout with 100ms delay to allow potential onToolPending to fire first
            // Increased from 0ms to give API events more breathing room
            setTimeout(() => {
              if (messageJustCompleted.current) {
                setGenerating(conversationId, false);
                playChime().catch((error) => {
                  console.warn('Failed to play completion chime:', error);
                });
                notifyGenerationComplete(conversation$?.data.name.get()).catch((error) => {
                  console.warn('Failed to show completion notification:', error);
                });
              }
            }, 100);
          },
          onMessageAdded: (message) => {
            console.log('[useConversation] Message added:', message);
            // Check if this message already exists (ignoring timestamp)
            const messages$ = conversation$?.data.log;
            const lastMessage$ = messages$?.[messages$.length - 1];
            if (
              lastMessage$?.role.get() === message.role &&
              lastMessage$?.content.get() === message.content
            ) {
              console.log('[useConversation] Skipping duplicate message');
              return;
            }
            addMessage(conversationId, message);
          },
          onToolPending: (toolId, tooluse, auto_confirm) => {
            console.log('[useConversation] Tool pending:', { toolId, tooluse, auto_confirm });

            if (messageJustCompleted.current) {
              messageJustCompleted.current = false;
              // Keep generating true as we're continuing with tool execution
            }

            // Always set pending tool state so onToolExecuting can find it
            setPendingTool(conversationId, toolId, tooluse);

            if (!auto_confirm) {
              // Always set generating to false and play chime for manual confirmation
              setGenerating(conversationId, false);
              playChime().catch((error) => {
                console.warn('Failed to play tool confirmation chime:', error);
              });
              notifyToolConfirmation(tooluse?.tool, conversation$?.data.name.get()).catch(
                (error) => {
                  console.warn('Failed to show tool confirmation notification:', error);
                }
              );
            } else {
              api.confirmTool(conversationId, toolId, 'confirm').catch((error) => {
                console.error('[useConversation] Error auto-confirming tool:', error);
              });
            }
          },
          onToolExecuting: (toolId) => {
            console.log('[useConversation] Tool executing:', { toolId });

            // Get the pending tool to move it to executing state
            const pendingTool = conversation$?.pendingTool.get();
            if (pendingTool && pendingTool.id === toolId) {
              // Move from pending to executing (generating stays false - tools can't be interrupted)
              setPendingTool(conversationId, null, null);
              setExecutingTool(conversationId, toolId, pendingTool.tooluse);
            } else {
              console.warn(
                '[useConversation] No matching pending tool found for executing tool:',
                toolId
              );
            }
          },
          onInterrupted: () => {
            console.log('[useConversation] Generation interrupted');
            setGenerating(conversationId, false);
            setPendingTool(conversationId, null, null);
            setExecutingTool(conversationId, null, null);
            messageJustCompleted.current = false;

            // Mark the last message as interrupted
            const messages$ = conversation$?.data.log;
            const lastMessage$ = messages$?.[messages$.length - 1];
            if (lastMessage$?.role.get() === 'assistant') {
              const content = lastMessage$.content.get();
              if (!content.toLowerCase().includes('[interrupted]')) {
                lastMessage$.content.set(content + ' [INTERRUPTED]');
              }
            }
          },
          onError: (error) => {
            console.error('[useConversation] Error:', error);
            toast({
              variant: 'destructive',
              title: 'Error',
              description: error,
            });
          },
        });

        setConnected(conversationId, true);
      } catch (error) {
        console.error('Error loading conversation:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load conversation',
        });
      }
    };

    void loadAndConnect();

    // Cleanup function - only disconnect if page is being unloaded
    return () => {
      if (document.hidden) {
        console.log(`[useConversation] Page hidden, disconnecting from ${conversationId}`);
        api.closeEventStream(conversationId);
        setConnected(conversationId, false);
      }
    };
  }, [conversationId, isConnected, api, conversation$, toast]);

  const sendMessage = async ({ message, options }: { message: string; options?: ChatOptions }) => {
    if (!conversation$) {
      throw new Error('Conversation not initialized');
    }

    console.log('[useConversation] Sending message:', { message, options });

    // Clear any pending or executing tool when sending a new message
    const pendingTool = conversation$?.pendingTool.get();
    const executingTool = conversation$?.executingTool.get();
    if (pendingTool) {
      console.log('[useConversation] Clearing pending tool due to new message');
      setPendingTool(conversationId, null, null);
    }
    if (executingTool) {
      console.log('[useConversation] Clearing executing tool due to new message');
      setExecutingTool(conversationId, null, null);
    }

    // Create user message
    const userMessage: Message = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };

    // Add message to conversation
    addMessage(conversationId, userMessage);

    try {
      // Send the message
      await api.sendMessage(conversationId, userMessage);

      // Start generation
      await api.step(conversationId, options?.model, options?.stream);
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to send message',
      });
      throw error;
    }
  };

  const confirmTool = async (
    action: 'confirm' | 'edit' | 'skip' | 'auto',
    options?: { content?: string; count?: number }
  ) => {
    const pendingTool = conversation$?.pendingTool.get();
    if (!pendingTool) {
      console.warn('No pending tool to confirm');
      return;
    }

    const confirmWithRetry = async (attempt: number): Promise<void> => {
      try {
        await api.confirmTool(conversationId, pendingTool.id, action, options);
        // Only clear pending tool state for 'skip' action
        // For 'confirm', 'edit', and 'auto', let onToolExecuting handle the transition
        if (action === 'skip') {
          setPendingTool(conversationId, null, null);
        }
      } catch (error) {
        console.error(`Error confirming tool (attempt ${attempt}):`, error);

        // Check if it's the specific "Tool not found" 404 error
        const is404ToolNotFound =
          error instanceof Error &&
          error.message.includes('Tool not found') &&
          error.message.includes('404');

        if (is404ToolNotFound && attempt < 3) {
          console.log(`Retrying tool confirmation in 500ms (attempt ${attempt + 1}/3)`);
          // Small delay to let any server-side initialization complete
          await new Promise((resolve) => setTimeout(resolve, 500));
          return confirmWithRetry(attempt + 1);
        }

        // Clear pending tool state on final failure, but only for actions that won't execute
        if (action === 'skip') {
          setPendingTool(conversationId, null, null);
        }

        toast({
          variant: 'destructive',
          title: 'Error',
          description:
            attempt > 1
              ? `Failed to confirm tool after ${attempt} attempts`
              : 'Failed to confirm tool',
        });

        throw error;
      }
    };

    await confirmWithRetry(1);
  };

  const interruptGeneration = async () => {
    try {
      await api.interruptGeneration(conversationId);
    } catch (error) {
      console.error('Error interrupting generation:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to interrupt generation',
      });
    }
  };

  return {
    conversation$,
    sendMessage,
    confirmTool,
    interruptGeneration,
  };
}
