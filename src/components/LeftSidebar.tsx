import { PenSquare, ExternalLink, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConversationList } from './ConversationList';
import { AgentsList } from './AgentsList';
import { WorkspaceList } from './WorkspaceList';
import CreateAgentDialog, { type CreateAgentRequest } from './CreateAgentDialog';
import { useApi } from '@/contexts/ApiContext';
import { useNavigate } from 'react-router-dom';
import type { ConversationSummary } from '@/types/conversation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { selectedWorkspace$, selectedAgent$ } from '@/stores/sidebar';

import type { FC } from 'react';
import { use$ } from '@legendapp/state/react';
import { type Observable } from '@legendapp/state';
import { useState, useMemo } from 'react';

interface Props {
  conversations: ConversationSummary[];
  selectedConversationId$: Observable<string | null>;
  onSelectConversation: (id: string) => void;
  isLoading?: boolean;
  isFetching?: boolean;
  isError?: boolean;
  error?: Error;
  onRetry?: () => void;
  fetchNextPage: () => void;
  hasNextPage?: boolean;
  route: string;
}

export const LeftSidebar: FC<Props> = ({
  conversations,
  selectedConversationId$,
  onSelectConversation,
  isLoading = false,
  isFetching = false,
  isError = false,
  error,
  onRetry,
  fetchNextPage,
  hasNextPage = false,
  route,
}) => {
  const { isConnected$, createAgent } = useApi();
  const isConnected = use$(isConnected$);
  const selectedWorkspace = use$(selectedWorkspace$);
  const selectedAgent = use$(selectedAgent$);
  const navigate = useNavigate();
  const [agentsCollapsed, setAgentsCollapsed] = useState(false);
  const [workspacesCollapsed, setWorkspacesCollapsed] = useState(true);
  const [showCreateAgentDialog, setShowCreateAgentDialog] = useState(false);

  // Filter conversations based on selected workspace and agent
  const filteredConversations = useMemo(() => {
    let filtered = conversations;

    if (selectedWorkspace) {
      filtered = filtered.filter((conv) => conv.workspace === selectedWorkspace);
    }

    if (selectedAgent) {
      filtered = filtered.filter((conv) => conv.agent_name === selectedAgent.name);
    }

    return filtered;
  }, [conversations, selectedWorkspace, selectedAgent]);

  const handleNewConversation = () => {
    // Clear the conversation parameter to show WelcomeView
    navigate(route);
    // Close the sidebar
    // onToggle();
  };

  const handleAgentCreated = async (agentData: CreateAgentRequest) => {
    try {
      return await createAgent(agentData);
      // The agent will be added to the list via API refresh or state update
    } catch (error) {
      console.error('Failed to create agent:', error);
      throw error; // Let the dialog handle the error
    }
  };

  return (
    <div className="h-full">
      <div className="flex h-full flex-col">
        <div className="flex h-12 shrink-0 items-center justify-between bg-background px-4">
          <h2 className="font-semibold">Conversations</h2>
          <div className="flex items-center space-x-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    onClick={handleNewConversation}
                    data-testid="new-conversation-button"
                  >
                    <span>
                      <PenSquare className="h-4 w-4" />
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {!isConnected ? 'Connect to create new conversations' : 'Create new conversation'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <div className="flex flex-1 flex-col overflow-hidden">
          <ConversationList
            conversations={filteredConversations}
            selectedId$={selectedConversationId$}
            onSelect={onSelectConversation}
            isLoading={isLoading}
            isFetching={isFetching}
            isError={isError}
            error={error}
            onRetry={onRetry}
            fetchNextPage={fetchNextPage}
            hasNextPage={hasNextPage}
          />

          <Collapsible open={!agentsCollapsed} onOpenChange={(open) => setAgentsCollapsed(!open)}>
            <CollapsibleTrigger className="flex h-12 w-full shrink-0 items-center justify-between border-t bg-background px-4 hover:bg-muted/50">
              <div className="flex items-center space-x-2">
                {agentsCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                <h2 className="font-semibold">Agents</h2>
              </div>
              <div className="flex items-center space-x-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowCreateAgentDialog(true);
                        }}
                        data-testid="new-agent-button"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {!isConnected ? 'Connect to create new agents' : 'Create new agent'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden">
              <div className="overflow-hidden" style={{ maxHeight: agentsCollapsed ? 0 : '200px' }}>
                <AgentsList
                  conversations={conversations}
                  handleCreateAgent={() => {
                    setShowCreateAgentDialog(true);
                  }}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible
            open={!workspacesCollapsed}
            onOpenChange={(open) => setWorkspacesCollapsed(!open)}
          >
            <CollapsibleTrigger className="flex h-12 w-full shrink-0 items-center justify-between border-t bg-background px-4 hover:bg-muted/50">
              <div className="flex items-center space-x-2">
                {workspacesCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                <h2 className="font-semibold">Workspaces</h2>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden">
              <div
                className="overflow-scroll"
                style={{ maxHeight: workspacesCollapsed ? 0 : '200px' }}
              >
                <WorkspaceList conversations={conversations} />
              </div>
            </CollapsibleContent>
          </Collapsible>
          <div className="border-t p-2 text-xs text-muted-foreground">
            <div className="flex items-center justify-center space-x-4">
              <a
                href="https://github.com/gptme/gptme"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center hover:text-foreground"
              >
                <ExternalLink className="mr-1 h-3 w-3" />
                gptme
              </a>
              <a
                href="https://github.com/gptme/gptme-webui"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center hover:text-foreground"
              >
                <ExternalLink className="mr-1 h-3 w-3" />
                gptme-webui
              </a>
            </div>
          </div>
        </div>
      </div>

      <CreateAgentDialog
        open={showCreateAgentDialog}
        onOpenChange={setShowCreateAgentDialog}
        onAgentCreated={handleAgentCreated}
      />
    </div>
  );
};
